import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.plans import has_feature
from app.services.plan_service import get_plan_from_db
from app.api.auth import get_current_user, require_verified_user
from app.models.clip import Clip
from app.models.processing_job import ProcessingJob
from app.models.project import Project
from app.models.user import User
from app.models.zip_file import ZipFile
from app.schemas.project import (
    ClipData,
    ClipListResponse,
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectListResponse,
    ProjectResponseData,
    ProjectStatusData,
    ProjectStatusResponse,
    ZipData,
    ZipResponse,
)
from app.services.project_service import create_project_from_youtube
from app.services.video_processing import safe_delete_path
from app.storage.local_storage import LocalStorageProvider
from app.workers.tasks import process_youtube_project

router = APIRouter()


def payload_uses_creator_features(payload: ProjectCreateRequest) -> bool:
    return any(
        [
            getattr(payload, "watermark_type", None),
            getattr(payload, "watermark_text", None),
            getattr(payload, "watermark_position", None),
            getattr(payload, "watermark_opacity", None) if getattr(payload, "watermark_type", None) else None,
            getattr(payload, "title_overlay_text", None),
            getattr(payload, "title_overlay_position", None),
            getattr(payload, "title_overlay_opacity", None) if getattr(payload, "title_overlay_text", None) else None,
            getattr(payload, "title_overlay_font_size", None) if getattr(payload, "title_overlay_text", None) else None,
            getattr(payload, "image_overlay_path", None),
            getattr(payload, "image_overlay_url", None),
            getattr(payload, "image_overlay_position", None),
            getattr(payload, "image_overlay_size", None) if getattr(payload, "image_overlay_path", None) else None,
            getattr(payload, "image_overlay_opacity", None) if getattr(payload, "image_overlay_path", None) else None,
            getattr(payload, "outro_path", None),
            getattr(payload, "outro_url", None),
            getattr(payload, "outro_type", None),
            getattr(payload, "outro_duration_seconds", None) if getattr(payload, "outro_path", None) else None,
            getattr(payload, "social_icon", None),
            getattr(payload, "social_icon_position", None),
            getattr(payload, "outro_enabled", False),
            getattr(payload, "outro_duration_seconds", None),
        ]
    )


def calculate_user_completed_seconds(db: Session, user: User) -> int:
    total = 0
    rows = (
        db.query(Project.video_duration)
        .filter(Project.user_id == user.id, Project.status == "completed", Project.video_duration.isnot(None))
        .all()
    )
    for (duration,) in rows:
        total += int(duration or 0)
    return total





@router.post("/overlay-image")
async def upload_overlay_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_verified_user),
):
    if not has_feature(current_user.plan_key, "custom_watermark"):
        raise HTTPException(status_code=403, detail="Image overlay is available in Creator plan.")

    allowed_content_types = {"image/png", "image/jpeg", "image/webp"}
    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Only PNG, JPG or WEBP overlay images are allowed")

    original_name = file.filename or "overlay.png"
    extension = Path(original_name).suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        extension = ".png"

    storage = LocalStorageProvider()
    overlays_dir = storage.base_path / "overlays" / str(current_user.id)
    overlays_dir.mkdir(parents=True, exist_ok=True)

    output_path = overlays_dir / f"{uuid.uuid4()}{extension}"
    content = await file.read()
    max_size = 5 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Overlay image max size is 5MB")

    output_path.write_bytes(content)

    return {
        "success": True,
        "data": {
            "storage_path": str(output_path),
            "download_url": storage.public_url(output_path),
        },
    }




@router.post("/outro-file")
async def upload_outro_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_verified_user),
):
    if not has_feature(current_user.plan_key, "outro"):
        raise HTTPException(status_code=403, detail="Outro is available in Creator plan.")

    allowed_content_types = {"image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"}
    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, WEBP, MP4 or MOV outro files are allowed")

    original_name = file.filename or "outro.png"
    extension = Path(original_name).suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov"}:
        extension = ".png" if file.content_type.startswith("image/") else ".mp4"

    outro_type = "image" if file.content_type.startswith("image/") else "video"

    storage = LocalStorageProvider()
    outros_dir = storage.base_path / "outros" / str(current_user.id)
    outros_dir.mkdir(parents=True, exist_ok=True)

    output_path = outros_dir / f"{uuid.uuid4()}{extension}"
    content = await file.read()
    max_size = 50 * 1024 * 1024 if outro_type == "video" else 5 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Outro file is too large")

    output_path.write_bytes(content)

    return {
        "success": True,
        "data": {
            "storage_path": str(output_path),
            "download_url": storage.public_url(output_path),
            "outro_type": outro_type,
        },
    }


@router.post("", response_model=ProjectCreateResponse, status_code=201)
def create_project(payload: ProjectCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    plan = get_plan_from_db(db, current_user.plan_key)
    used_seconds = calculate_user_completed_seconds(db, current_user)
    if used_seconds >= int(plan["max_monthly_seconds"]):
        raise HTTPException(status_code=403, detail="Your monthly processing hours are finished. Please upgrade your plan.")

    if payload_uses_creator_features(payload) and not has_feature(current_user.plan_key, "custom_watermark"):
        raise HTTPException(status_code=403, detail="Branding features are available in Creator plan.")

    try:
        project = create_project_from_youtube(db, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ProjectCreateResponse(success=True, message="Project created", data=ProjectResponseData.model_validate(project))


@router.get("", response_model=ProjectListResponse)
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    projects = db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()
    return ProjectListResponse(success=True, data=[ProjectResponseData.model_validate(project) for project in projects])



@router.get("/stats/summary")
def get_project_stats(db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    total_projects = db.query(Project).filter(Project.user_id == current_user.id).count()
    pending_projects = db.query(Project).filter(Project.user_id == current_user.id, Project.status == "pending").count()
    processing_projects = db.query(Project).filter(Project.user_id == current_user.id, Project.status == "processing").count()
    completed_projects = db.query(Project).filter(Project.user_id == current_user.id, Project.status == "completed").count()
    failed_projects = db.query(Project).filter(Project.user_id == current_user.id, Project.status == "failed").count()
    total_clips = db.query(Clip).join(Project).filter(Project.user_id == current_user.id).count()
    total_zips = db.query(ZipFile).join(Project).filter(Project.user_id == current_user.id).count()
    total_duration_seconds = sum(
        duration or 0
        for (duration,) in db.query(Project.video_duration).filter(Project.user_id == current_user.id, Project.video_duration.isnot(None)).all()
    )

    return {
        "success": True,
        "data": {
            "total_projects": total_projects,
            "pending_projects": pending_projects,
            "processing_projects": processing_projects,
            "completed_projects": completed_projects,
            "failed_projects": failed_projects,
            "total_clips": total_clips,
            "total_zips": total_zips,
            "total_duration_seconds": total_duration_seconds,
        },
    }


@router.get("/{project_id}", response_model=ProjectCreateResponse)
def get_project(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectCreateResponse(success=True, message="Project found", data=ProjectResponseData.model_validate(project))


@router.delete("/{project_id}")
def delete_project(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    storage = LocalStorageProvider()
    project_dir = storage.project_path(str(project.user_id), str(project.id))

    # Delete generated files from local storage first. DB rows are removed by cascade.
    if project_dir.exists():
        safe_delete_path(project_dir)

    db.delete(project)
    db.commit()

    return {
        "success": True,
        "message": "Project deleted",
        "data": {"project_id": str(project_id)},
    }


@router.post("/{project_id}/process")
def start_processing(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status == "processing":
        raise HTTPException(status_code=409, detail="Project already processing")
    if project.status == "completed":
        raise HTTPException(status_code=409, detail="Project already completed")

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.project_id == project_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )

    if job and job.status == "processing":
        raise HTTPException(status_code=409, detail="Project already processing")
    if job and job.status == "pending" and job.current_stage == "Queued for processing":
        raise HTTPException(status_code=409, detail="Processing already queued")
    if job:
        job.status = "pending"
        job.progress_percent = 0
        job.current_stage = "Queued for processing"
    project.status = "pending"
    db.commit()

    task = process_youtube_project.apply_async(args=[str(project_id)], queue="download_queue")
    return {"success": True, "message": "Processing queued", "data": {"task_id": task.id, "project_id": str(project_id)}}


@router.get("/{project_id}/status", response_model=ProjectStatusResponse)
def get_project_status(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.project_id == project_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    return ProjectStatusResponse(
        success=True,
        data=ProjectStatusData(
            project_id=project.id,
            status=project.status,
            progress_percent=job.progress_percent if job else 0,
            current_stage=job.current_stage if job else "No processing job found",
        ),
    )


@router.get("/{project_id}/clips", response_model=ClipListResponse)
def list_project_clips(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    clips = db.query(Clip).filter(Clip.project_id == project_id).order_by(Clip.clip_number.asc()).all()
    return ClipListResponse(success=True, data=[ClipData.model_validate(clip) for clip in clips])


@router.get("/{project_id}/zip", response_model=ZipResponse)
def get_project_zip(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(require_verified_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    zip_file = db.query(ZipFile).filter(ZipFile.project_id == project_id).first()
    return ZipResponse(success=True, data=ZipData.model_validate(zip_file) if zip_file else None)
