from datetime import datetime

from sqlalchemy.orm import Session

from app.models.processing_job import ProcessingJob
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreateRequest
from app.services.youtube_normalizer import normalize_youtube_url


def create_project_from_youtube(db: Session, payload: ProjectCreateRequest, user: User) -> Project:
    video_data = normalize_youtube_url(str(payload.youtube_url))
    if not video_data:
        raise ValueError("Invalid or unsupported YouTube URL")

    title = payload.title.strip() if payload.title and payload.title.strip() else datetime.utcnow().strftime("Project %Y-%m-%d %H-%M")

    project = Project(
        user_id=user.id,
        title=title,
        source_type="youtube",
        youtube_video_id=video_data["video_id"],
        original_url=video_data["normalized_url"],
        clip_length=payload.clip_length,
        output_format=payload.output_format,
        watermark_type=payload.watermark_type,
        watermark_text=payload.watermark_text.strip() if payload.watermark_text else None,
        watermark_position=payload.watermark_position,
        watermark_opacity=payload.watermark_opacity,
        title_overlay_text=payload.title_overlay_text.strip() if payload.title_overlay_text else None,
        title_overlay_position=payload.title_overlay_position,
        title_overlay_opacity=payload.title_overlay_opacity,
        title_overlay_font_size=payload.title_overlay_font_size,
        image_overlay_path=payload.image_overlay_path,
        image_overlay_url=payload.image_overlay_url,
        image_overlay_position=payload.image_overlay_position,
        image_overlay_size=payload.image_overlay_size,
        image_overlay_opacity=payload.image_overlay_opacity,
        outro_path=payload.outro_path,
        outro_url=payload.outro_url,
        outro_type=payload.outro_type,
        outro_duration_seconds=payload.outro_duration_seconds,
        status="pending",
    )
    db.add(project)
    db.flush()

    job = ProcessingJob(
        project_id=project.id,
        status="pending",
        progress_percent=0,
        current_stage="Project created. Processing not started yet.",
    )
    db.add(job)
    db.commit()
    db.refresh(project)
    return project
