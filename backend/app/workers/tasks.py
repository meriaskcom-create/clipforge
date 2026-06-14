from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
import shutil
import traceback

from app.core.config import settings
from app.database.session import SessionLocal
from app.models.clip import Clip
from app.models.processing_job import ProcessingJob
from app.models.project import Project
from app.models.subscription import Subscription  # required so SQLAlchemy can resolve User.subscriptions in Celery
from app.models.zip_file import ZipFile
from app.services.bulk_branding_service import create_outro_video, process_single_reel
from app.services.video_processing import create_zip_from_clips, ffprobe_duration_seconds, safe_delete_path, split_video_into_clips
from app.services.youtube_fetcher import download_youtube_video
from app.storage.local_storage import LocalStorageProvider
from app.workers.celery_app import celery_app


DOWNLOAD_QUEUE = "download_queue"
CLIP_QUEUE = "clip_queue"
BRANDING_QUEUE = "branding_queue"
ZIP_QUEUE = "zip_queue"


def clean_stage_message(message: str, max_length: int = 95) -> str:
    text = (message or "").replace("\n", " ").replace("\r", " ").strip()
    return text[:max_length]


def user_friendly_error(exc: Exception) -> str:
    raw = str(exc).lower()
    if "private video" in raw:
        return "Failed: Private video cannot be processed"
    if "sign in" in raw or "age" in raw:
        return "Failed: Restricted video cannot be processed"
    if "unavailable" in raw or "video unavailable" in raw:
        return "Failed: Video unavailable"
    if "not found" in raw:
        return "Failed: Video not found"
    detail = str(exc).replace("\n", " ").replace("\r", " ").strip()
    if detail:
        return f"Failed: {detail[:240]}"
    return "Failed: Unable to process this video"


def get_project_and_job(db, project_id: str) -> tuple[Project | None, ProcessingJob | None]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None, None

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.project_id == project.id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    if not job:
        job = ProcessingJob(project_id=project.id)
        db.add(job)
        db.commit()
        db.refresh(job)
    return project, job


def update_job(db, project: Project, job: ProcessingJob, status: str, progress: int, stage: str) -> None:
    project.status = status
    job.status = status
    job.progress_percent = progress
    job.current_stage = clean_stage_message(stage)
    if status == "processing" and job.started_at is None:
        job.started_at = datetime.now(timezone.utc)
    if status in {"completed", "failed"}:
        job.completed_at = datetime.now(timezone.utc)
    db.commit()


def fail_project(db, project_id: str, exc: Exception) -> dict:
    print("CLIPFORGE_PROCESSING_ERROR:", repr(exc))
    traceback.print_exc()
    db.rollback()

    project, job = get_project_and_job(db, project_id)
    if project and job:
        job.retry_count += 1
        update_job(db, project, job, "failed", job.progress_percent or 0, user_friendly_error(exc))
    return {"success": False, "project_id": str(project_id), "message": user_friendly_error(exc)}


def get_paths(project: Project) -> dict[str, Path]:
    storage = LocalStorageProvider()
    project_dir = storage.project_path(str(project.user_id), str(project.id))
    clips_dir = project_dir / "clips"
    return {
        "project_dir": project_dir,
        "source_dir": project_dir / "source",
        "source_file": project_dir / "source" / "source.mp4",
        "base_clips_dir": clips_dir / "base",
        "final_clips_dir": clips_dir / "final",
        "branding_temp_dir": clips_dir / "branding-temp",
        "zips_dir": project_dir / "zips",
    }


def next_download(project_id: str):
    return process_youtube_project.apply_async(args=[project_id], queue=DOWNLOAD_QUEUE)


def next_clip(project_id: str):
    return generate_base_clips_task.apply_async(args=[project_id], queue=CLIP_QUEUE)


def next_branding(project_id: str):
    return brand_clips_task.apply_async(args=[project_id], queue=BRANDING_QUEUE)


def next_zip(project_id: str):
    return create_project_zip_task.apply_async(args=[project_id], queue=ZIP_QUEUE)


def get_parallel_branding_workers(plan_key: str | None, total_clips: int) -> int:
    if total_clips <= 1:
        return 1

    plan = (plan_key or "free").lower()
    if plan == "creator":
        max_workers = 4
    elif plan == "starter":
        max_workers = 2
    else:
        max_workers = 1

    return max(1, min(max_workers, total_clips))


def clip_number_from_path(path: Path) -> int:
    stem = path.stem
    try:
        return int(stem.split("-")[-1])
    except Exception:
        return 0


def list_clip_files(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(folder.glob("*.mp4"), key=clip_number_from_path)


def has_creator_branding(project: Project) -> bool:
    logo_path = Path(project.image_overlay_path) if project.image_overlay_path else None
    outro_path = Path(project.outro_path) if project.outro_path else None
    return any(
        [
            project.watermark_type == "text" and project.watermark_text,
            project.title_overlay_text,
            logo_path and logo_path.exists(),
            outro_path and outro_path.exists(),
        ]
    )


def brand_single_clip(
    clip_path: Path,
    final_clips_dir: Path,
    branding_temp_dir: Path,
    title_overlay_text: str | None,
    watermark_text: str | None,
    logo_path: Path | None,
    image_overlay_position: str | None,
    image_overlay_size: str | None,
    image_overlay_opacity: int | None,
    prepared_outro_video: Path | None,
) -> dict:
    final_path = final_clips_dir / clip_path.name
    process_single_reel(
        input_video=clip_path,
        output_video=final_path,
        temp_dir=branding_temp_dir / clip_path.stem,
        title_text=title_overlay_text,
        watermark_text=watermark_text,
        logo_path=logo_path if logo_path and logo_path.exists() else None,
        logo_position=image_overlay_position,
        logo_size=image_overlay_size,
        logo_opacity=image_overlay_opacity or 100,
        outro_video=prepared_outro_video if prepared_outro_video and prepared_outro_video.exists() else None,
    )
    return {
        "clip_number": clip_number_from_path(clip_path),
        "duration": int(ffprobe_duration_seconds(final_path)),
        "path": final_path,
    }


@celery_app.task(name="process_youtube_project", bind=True, max_retries=3)
def process_youtube_project(self, project_id: str) -> dict:
    """Stage 1: download YouTube video, save metadata, enqueue clip generation."""
    db = SessionLocal()
    try:
        project, job = get_project_and_job(db, project_id)
        if not project or not job:
            return {"success": False, "message": "Project not found"}

        paths = get_paths(project)
        update_job(db, project, job, "processing", 10, "Stage 1/4: Downloading YouTube video")

        source_path = download_youtube_video(project.original_url, paths["source_dir"])

        # Normalize downloaded source path for the next stage.
        paths["source_file"].parent.mkdir(parents=True, exist_ok=True)
        if Path(source_path).resolve() != paths["source_file"].resolve():
            shutil.copy2(source_path, paths["source_file"])

        duration = ffprobe_duration_seconds(paths["source_file"])
        project.video_duration = duration
        db.commit()

        update_job(db, project, job, "processing", 25, "Stage 1/4 complete. Queued clip generation")
        task = next_clip(str(project.id))
        return {"success": True, "project_id": str(project.id), "next_task_id": task.id, "stage": "download"}
    except Exception as exc:
        return fail_project(db, project_id, exc)
    finally:
        db.close()


@celery_app.task(name="generate_base_clips_task", bind=True, max_retries=3)
def generate_base_clips_task(self, project_id: str) -> dict:
    """Stage 2: create base clips only, enqueue branding or zip."""
    db = SessionLocal()
    try:
        project, job = get_project_and_job(db, project_id)
        if not project or not job:
            return {"success": False, "message": "Project not found"}

        paths = get_paths(project)
        if not paths["source_file"].exists():
            raise FileNotFoundError("Downloaded source file missing")

        update_job(db, project, job, "processing", 40, "Stage 2/4: Creating base clips")
        base_clips = split_video_into_clips(
            paths["source_file"],
            paths["base_clips_dir"],
            project.clip_length,
            project.output_format,
        )

        if not base_clips:
            raise RuntimeError("No base clips generated")

        if has_creator_branding(project):
            update_job(db, project, job, "processing", 55, "Stage 2/4 complete. Queued branding")
            task = next_branding(str(project.id))
            next_stage = "branding"
        else:
            update_job(db, project, job, "processing", 55, "Stage 2/4 complete. Queued ZIP")
            task = next_zip(str(project.id))
            next_stage = "zip"

        return {"success": True, "project_id": str(project.id), "clips": len(base_clips), "next_task_id": task.id, "next_stage": next_stage}
    except Exception as exc:
        return fail_project(db, project_id, exc)
    finally:
        db.close()


@celery_app.task(name="brand_clips_task", bind=True, max_retries=3)
def brand_clips_task(self, project_id: str) -> dict:
    """Stage 3: apply title/watermark/logo/outro using stable bulk branding engine, enqueue ZIP."""
    db = SessionLocal()
    try:
        project, job = get_project_and_job(db, project_id)
        if not project or not job:
            return {"success": False, "message": "Project not found"}

        paths = get_paths(project)
        base_clip_paths = list_clip_files(paths["base_clips_dir"])
        if not base_clip_paths:
            raise FileNotFoundError("Base clips missing")

        update_job(db, project, job, "processing", 65, "Stage 3/4: Applying branding")
        paths["final_clips_dir"].mkdir(parents=True, exist_ok=True)

        watermark_text = project.watermark_text if project.watermark_type == "text" else None
        title_overlay_text = project.title_overlay_text if project.title_overlay_text else None
        logo_path = Path(project.image_overlay_path) if project.image_overlay_path else None
        outro_path = Path(project.outro_path) if project.outro_path else None
        prepared_outro_video = None

        if outro_path and outro_path.exists():
            update_job(db, project, job, "processing", 66, "Stage 3/4: Preparing outro")
            prepared_outro_video = paths["branding_temp_dir"] / "_outro" / "outro_video.mp4"
            create_outro_video(
                outro_file=outro_path,
                output_outro=prepared_outro_video,
                duration=project.outro_duration_seconds or 3,
            )

        workers = get_parallel_branding_workers(project.user.plan_key if project.user else None, len(base_clip_paths))
        update_job(db, project, job, "processing", 68, f"Stage 3/4: Branding clips with {workers} worker(s)")

        if workers == 1:
            for clip_path in base_clip_paths:
                brand_single_clip(
                    clip_path,
                    paths["final_clips_dir"],
                    paths["branding_temp_dir"],
                    title_overlay_text,
                    watermark_text,
                    logo_path,
                    project.image_overlay_position,
                    project.image_overlay_size,
                    project.image_overlay_opacity,
                    prepared_outro_video,
                )
        else:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [
                    executor.submit(
                        brand_single_clip,
                        clip_path,
                        paths["final_clips_dir"],
                        paths["branding_temp_dir"],
                        title_overlay_text,
                        watermark_text,
                        logo_path,
                        project.image_overlay_position,
                        project.image_overlay_size,
                        project.image_overlay_opacity,
                        prepared_outro_video,
                    )
                    for clip_path in base_clip_paths
                ]
                for future in as_completed(futures):
                    future.result()

        update_job(db, project, job, "processing", 76, "Stage 3/4 complete. Queued ZIP")
        task = next_zip(str(project.id))
        return {"success": True, "project_id": str(project.id), "next_task_id": task.id, "stage": "branding"}
    except Exception as exc:
        return fail_project(db, project_id, exc)
    finally:
        db.close()


@celery_app.task(name="create_project_zip_task", bind=True, max_retries=3)
def create_project_zip_task(self, project_id: str) -> dict:
    """Stage 4: save final clips in DB, create ZIP, complete project."""
    db = SessionLocal()
    storage = LocalStorageProvider()
    try:
        project, job = get_project_and_job(db, project_id)
        if not project or not job:
            return {"success": False, "message": "Project not found"}

        paths = get_paths(project)
        final_clip_paths = list_clip_files(paths["final_clips_dir"])

        # If no branding was applied, final folder may be empty; copy base clips to final.
        if not final_clip_paths:
            base_clip_paths = list_clip_files(paths["base_clips_dir"])
            if not base_clip_paths:
                raise FileNotFoundError("No clips available for ZIP")
            paths["final_clips_dir"].mkdir(parents=True, exist_ok=True)
            for base_path in base_clip_paths:
                final_path = paths["final_clips_dir"] / base_path.name
                shutil.copy2(base_path, final_path)
            final_clip_paths = list_clip_files(paths["final_clips_dir"])

        update_job(db, project, job, "processing", 82, "Stage 4/4: Saving final clips")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.download_expiry_hours)

        db.query(Clip).filter(Clip.project_id == project.id).delete()
        generated_clips = []
        for clip_path in final_clip_paths:
            clip_number = clip_number_from_path(clip_path)
            duration = int(ffprobe_duration_seconds(clip_path))
            generated_clips.append({"clip_number": clip_number, "duration": duration, "path": clip_path})

        for clip in sorted(generated_clips, key=lambda item: item["clip_number"]):
            db.add(
                Clip(
                    project_id=project.id,
                    clip_number=clip["clip_number"],
                    duration=clip["duration"],
                    storage_path=str(clip["path"]),
                    download_url=storage.public_url(clip["path"]),
                    expires_at=expires_at,
                    storage_status="active",
                )
            )
        db.commit()

        update_job(db, project, job, "processing", 90, "Stage 4/4: Creating ZIP file")
        paths["zips_dir"].mkdir(parents=True, exist_ok=True)
        zip_path = paths["zips_dir"] / f"{project.title.replace(' ', '-').lower()}-clips.zip"
        create_zip_from_clips(sorted(generated_clips, key=lambda item: item["clip_number"]), zip_path)

        old_zip = db.query(ZipFile).filter(ZipFile.project_id == project.id).first()
        if old_zip:
            db.delete(old_zip)
            db.commit()

        db.add(
            ZipFile(
                project_id=project.id,
                storage_path=str(zip_path),
                download_url=storage.public_url(zip_path),
                file_size=zip_path.stat().st_size,
                expires_at=expires_at,
                storage_status="active",
            )
        )
        db.commit()

        update_job(db, project, job, "completed", 100, "Completed. Download links valid for 24 hours")

        if paths["source_dir"].exists():
            safe_delete_path(paths["source_dir"])

        return {"success": True, "project_id": str(project.id), "clips": len(generated_clips), "stage": "zip"}
    except Exception as exc:
        return fail_project(db, project_id, exc)
    finally:
        db.close()


@celery_app.task(name="cleanup_expired_files")
def cleanup_expired_files() -> dict:
    db = SessionLocal()
    storage = LocalStorageProvider()
    now = datetime.now(timezone.utc)
    deleted = 0

    try:
        expired_clips = db.query(Clip).filter(Clip.expires_at <= now, Clip.storage_status == "active").all()
        for clip in expired_clips:
            if clip.storage_path and storage.delete_file(clip.storage_path):
                deleted += 1
            clip.storage_status = "deleted"
            clip.deleted_at = now
            clip.download_url = None

        expired_zips = db.query(ZipFile).filter(ZipFile.expires_at <= now, ZipFile.storage_status == "active").all()
        for zip_file in expired_zips:
            if zip_file.storage_path and storage.delete_file(zip_file.storage_path):
                deleted += 1
            zip_file.storage_status = "deleted"
            zip_file.deleted_at = now
            zip_file.download_url = None

        db.commit()
        return {"success": True, "deleted_files": deleted}
    finally:
        db.close()

