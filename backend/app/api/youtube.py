from fastapi import APIRouter, HTTPException

from app.schemas.youtube import YouTubeNormalizeRequest, YouTubeNormalizeResponse
from app.services.youtube_normalizer import normalize_youtube_url

router = APIRouter()


@router.post("/normalize", response_model=YouTubeNormalizeResponse)
def normalize_url(payload: YouTubeNormalizeRequest):
    result = normalize_youtube_url(str(payload.url))
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or unsupported YouTube URL")
    return YouTubeNormalizeResponse(success=True, message="YouTube URL normalized", data=result)
