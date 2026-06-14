from pydantic import BaseModel, HttpUrl


class YouTubeNormalizeRequest(BaseModel):
    url: HttpUrl


class YouTubeVideoData(BaseModel):
    video_id: str
    normalized_url: str
    thumbnail_url: str


class YouTubeNormalizeResponse(BaseModel):
    success: bool
    message: str
    data: YouTubeVideoData
