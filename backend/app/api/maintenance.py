from fastapi import APIRouter

from app.workers.tasks import cleanup_expired_files

router = APIRouter()


@router.post("/cleanup-expired")
def cleanup_expired_downloads():
    task = cleanup_expired_files.delay()
    return {"success": True, "message": "Cleanup queued", "data": {"task_id": task.id}}
