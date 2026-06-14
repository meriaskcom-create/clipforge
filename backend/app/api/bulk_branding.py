import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.auth import get_current_user
from app.core.plans import has_feature
from app.models.user import User
from app.services.bulk_branding_service import process_bulk_branding_job


router = APIRouter()


def save_upload_to_temp(upload: UploadFile, temp_dir: Path, allowed_suffixes: set[str], max_bytes: int) -> Path:
    original_name = upload.filename or "upload"
    suffix = Path(original_name).suffix.lower()
    if suffix not in allowed_suffixes:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {original_name}")

    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"Empty file: {original_name}")
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large: {original_name}")

    target = temp_dir / original_name
    target.write_bytes(data)
    return target


@router.post("/process")
async def process_bulk_brand_reels(
    reels: list[UploadFile] = File(...),
    title_text: str = Form(""),
    watermark_text: str = Form(""),
    logo_position: str = Form("bottom_right"),
    logo_size: str = Form("medium"),
    logo_opacity: int = Form(100),
    outro_duration: int = Form(3),
    logo: UploadFile | None = File(None),
    outro: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
):
    if not has_feature(current_user.plan_key, "custom_watermark"):
        raise HTTPException(status_code=403, detail="Bulk branding is available in Creator plan.")

    if not reels:
        raise HTTPException(status_code=400, detail="At least one reel is required")

    if len(reels) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 reels allowed in one batch")

    if logo_position not in {"top_left", "top_right", "bottom_left", "bottom_right", "center"}:
        raise HTTPException(status_code=400, detail="Invalid logo position")

    if logo_size not in {"small", "medium", "large"}:
        raise HTTPException(status_code=400, detail="Invalid logo size")

    logo_opacity = max(30, min(100, int(logo_opacity or 100)))
    outro_duration = max(1, min(10, int(outro_duration or 3)))

    with tempfile.TemporaryDirectory(prefix="clipforge_bulk_") as temp_name:
        temp_dir = Path(temp_name)
        reel_paths = [
            save_upload_to_temp(reel, temp_dir, {".mp4", ".mov", ".mkv"}, 300 * 1024 * 1024)
            for reel in reels
        ]

        logo_path = None
        if logo and logo.filename:
            logo_path = save_upload_to_temp(logo, temp_dir, {".png", ".jpg", ".jpeg", ".webp"}, 10 * 1024 * 1024)

        outro_path = None
        if outro and outro.filename:
            outro_path = save_upload_to_temp(outro, temp_dir, {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".mkv"}, 100 * 1024 * 1024)

        try:
            result = process_bulk_branding_job(
                user_id=str(current_user.id),
                reels=reel_paths,
                title_text=title_text,
                watermark_text=watermark_text,
                logo_path=logo_path,
                logo_position=logo_position,
                logo_size=logo_size,
                logo_opacity=logo_opacity,
                outro_path=outro_path,
                outro_duration=outro_duration,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)[-1500:]) from exc

    return {"success": True, "data": result}
