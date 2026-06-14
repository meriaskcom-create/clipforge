from datetime import datetime, timedelta, timezone
import traceback
import shutil
from pathlib import Path

from app.core.config import settings
from app.database.session import SessionLocal
from app.models.clip import Clip
from app.models.processing_job import ProcessingJob
from app.models.project import Project
from app.models.subscription import Subscription  # required so SQLAlchemy can resolve User.subscriptions in Celery
from app.models.zip_file import ZipFile
from app.services.video_processing import create_zip_from_clips, ffprobe_duration_seconds, safe_delete_path, split_video_into_clips
from app.services.bulk_branding_service import create_outro_video, process_single_reel
from app.services.youtube_fetcher import download_youtube_video
from app.storage.local_storage import LocalStorageProvider
from app.workers.celery_app import celery_app


def clean_stage_message(message: str, max_length: int = 95) -> str:
    """Keep status messages safe for the current DB column length."""
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


@celery_app.task(name="process_youtube_project", bind=True, max_retries=3)
def process_youtube_project(self, project_id: str) -> dict:
    db = SessionLocal()
    storage = LocalStorageProvider()
    source_path: Path | None = None

    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"success": False, "message": "Project not found"}

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

        update_job(db, project, job, "processing", 10, "Downloading YouTube video")
        project_dir = storage.project_path(str(project.user_id), str(project.id))
        source_dir = project_dir / "source"
        clips_dir = project_dir / "clips"
        zips_dir = project_dir / "zips"

        source_path = download_youtube_video(project.original_url, source_dir)
        update_job(db, project, job, "processing", 25, "Metadata extracted")

        duration = ffprobe_duration_seconds(source_path)
        project.video_duration = duration
        db.commit()

        update_job(db, project, job, "processing", 45, "Creating base clips")
        base_clips_dir = clips_dir / "base"
        final_clips_dir = clips_dir / "final"
        branding_temp_dir = clips_dir / "branding-temp"

        base_clips = split_video_into_clips(
            source_path,
            base_clips_dir,
            project.clip_length,
            project.output_format,
        )

        watermark_text = project.watermark_text if project.watermark_type == "text" else None
        title_overlay_text = project.title_overlay_text if project.title_overlay_text else None
        logo_path = Path(project.image_overlay_path) if project.image_overlay_path else None
        outro_path = Path(project.outro_path) if project.outro_path else None
        prepared_outro_video = None

        has_branding = any([
            watermark_text,
            title_overlay_text,
            logo_path and logo_path.exists(),
            outro_path and outro_path.exists(),
        ])

        generated_clips = []
        if has_branding:
            update_job(db, project, job, "processing", 65, "Applying bulk branding engine")
            final_clips_dir.mkdir(parents=True, exist_ok=True)

            if outro_path and outro_path.exists():
                update_job(db, project, job, "processing", 66, "Preparing outro")
                prepared_outro_video = branding_temp_dir / "_outro" / "outro_video.mp4"
                create_outro_video(
                    outro_file=outro_path,
                    output_outro=prepared_outro_video,
                    duration=project.outro_duration_seconds or 3,
                )

            for clip in base_clips:
                source_clip_path = Path(clip["path"])
                final_path = final_clips_dir / source_clip_path.name

                process_single_reel(
                    input_video=source_clip_path,
                    output_video=final_path,
                    temp_dir=branding_temp_dir / source_clip_path.stem,
                    title_text=title_overlay_text,
                    watermark_text=watermark_text,
                    logo_path=logo_path if logo_path and logo_path.exists() else None,
                    logo_position=project.image_overlay_position,
                    logo_size=project.image_overlay_size,
                    logo_opacity=project.image_overlay_opacity,
                    outro_video=prepared_outro_video if prepared_outro_video and prepared_outro_video.exists() else None,
                )

                final_duration = ffprobe_duration_seconds(final_path)
                generated_clips.append({
                    **clip,
                    "path": final_path,
                    "duration": int(final_duration),
                })
        else:
            final_clips_dir.mkdir(parents=True, exist_ok=True)
            for clip in base_clips:
                source_clip_path = Path(clip["path"])
                final_path = final_clips_dir / source_clip_path.name
                shutil.copy2(source_clip_path, final_path)
                generated_clips.append({**clip, "path": final_path})

        update_job(db, project, job, "processing", 78, "Saving final clips")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.download_expiry_hours)

        db.query(Clip).filter(Clip.project_id == project.id).delete()
        for clip in generated_clips:
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

        update_job(db, project, job, "processing", 80, "Creating ZIP file")
        zip_path = zips_dir / f"{project.title.replace(' ', '-').lower()}-clips.zip"
        create_zip_from_clips(generated_clips, zip_path)

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

        if source_dir.exists():
            safe_delete_path(source_dir)

        return {"success": True, "project_id": str(project.id), "clips": len(generated_clips)}

    except Exception as exc:
        print("CLIPFORGE_PROCESSING_ERROR:", repr(exc))
        traceback.print_exc()
        db.rollback()
        project = db.query(Project).filter(Project.id == project_id).first()
        job = None
        if project:
            job = (
                db.query(ProcessingJob)
                .filter(ProcessingJob.project_id == project.id)
                .order_by(ProcessingJob.created_at.desc())
                .first()
            )
        if project and job:
            job.retry_count += 1
            failed_message = user_friendly_error(exc)
            update_job(db, project, job, "failed", job.progress_percent, failed_message)
        return {"success": False, "project_id": project_id, "message": user_friendly_error(exc)}
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
