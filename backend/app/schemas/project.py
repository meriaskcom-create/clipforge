from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class ProjectCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    youtube_url: HttpUrl
    clip_length: int = Field(default=30, ge=5, le=600)
    output_format: str = Field(default="reel_fit", pattern="^(original|reel|reel_fit|reel_crop|square_crop)$")

    # Creator-only text watermark fields
    watermark_type: str | None = Field(default=None, pattern="^(text)$")
    watermark_text: str | None = Field(default=None, max_length=80)
    watermark_position: str | None = Field(default=None, pattern="^(top_left|top_right|bottom_left|bottom_right|center)$")
    watermark_opacity: int = Field(default=70, ge=10, le=100)

    # Creator-only title overlay fields
    title_overlay_text: str | None = Field(default=None, max_length=120)
    title_overlay_position: str | None = Field(default=None, pattern="^(top|center|bottom)$")
    title_overlay_opacity: int = Field(default=85, ge=30, le=100)
    title_overlay_font_size: int = Field(default=64, ge=36, le=84)

    # Creator-only image/logo overlay fields
    image_overlay_path: str | None = Field(default=None, max_length=500)
    image_overlay_url: str | None = Field(default=None, max_length=500)
    image_overlay_position: str | None = Field(default=None, pattern="^(top_left|top_right|bottom_left|bottom_right|center)$")
    image_overlay_size: str = Field(default="medium", pattern="^(small|medium|large)$")
    image_overlay_opacity: int = Field(default=100, ge=30, le=100)

    # Creator-only outro/end screen fields
    outro_path: str | None = Field(default=None, max_length=500)
    outro_url: str | None = Field(default=None, max_length=500)
    outro_type: str | None = Field(default=None, pattern="^(image|video)$")
    outro_duration_seconds: int = Field(default=3, ge=1, le=10)


class ProjectResponseData(BaseModel):
    id: UUID
    title: str
    source_type: str
    youtube_video_id: str | None
    original_url: str | None
    video_duration: int | None = None
    clip_length: int
    output_format: str
    watermark_type: str | None = None
    watermark_text: str | None = None
    watermark_position: str | None = None
    watermark_opacity: int | None = 70
    title_overlay_text: str | None = None
    title_overlay_position: str | None = None
    title_overlay_opacity: int | None = 85
    title_overlay_font_size: int | None = 64
    image_overlay_path: str | None = None
    image_overlay_url: str | None = None
    image_overlay_position: str | None = None
    image_overlay_size: str | None = "medium"
    image_overlay_opacity: int | None = 100
    outro_path: str | None = None
    outro_url: str | None = None
    outro_type: str | None = None
    outro_duration_seconds: int | None = 3
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectCreateResponse(BaseModel):
    success: bool
    message: str
    data: ProjectResponseData


class ProjectListResponse(BaseModel):
    success: bool
    data: list[ProjectResponseData]


class ProjectStatusData(BaseModel):
    project_id: UUID
    status: str
    progress_percent: int
    current_stage: str


class ProjectStatusResponse(BaseModel):
    success: bool
    data: ProjectStatusData


class ClipData(BaseModel):
    id: UUID
    clip_number: int
    duration: int | None
    download_url: str | None
    thumbnail_url: str | None
    expires_at: datetime | None
    storage_status: str

    class Config:
        from_attributes = True


class ClipListResponse(BaseModel):
    success: bool
    data: list[ClipData]


class ZipData(BaseModel):
    download_url: str | None
    file_size: int | None
    expires_at: datetime | None
    storage_status: str

    class Config:
        from_attributes = True


class ZipResponse(BaseModel):
    success: bool
    data: ZipData | None
