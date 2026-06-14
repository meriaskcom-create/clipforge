from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "clipforge_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_queues=(
        Queue("download_queue"),
        Queue("clip_queue"),
        Queue("branding_queue"),
        Queue("zip_queue"),
        Queue("celery"),
    ),
    task_routes={
        "process_youtube_project": {"queue": "download_queue"},
        "generate_base_clips_task": {"queue": "clip_queue"},
        "brand_clips_task": {"queue": "branding_queue"},
        "create_project_zip_task": {"queue": "zip_queue"},
        "cleanup_expired_files": {"queue": "celery"},
    },
)
