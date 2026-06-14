import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    source_type = Column(String(20), default="youtube", nullable=False)
    youtube_video_id = Column(String(50), nullable=True)
    original_url = Column(Text, nullable=True)
    video_duration = Column(Integer, nullable=True)
    clip_length = Column(Integer, nullable=False)
    output_format = Column(String(20), default="reel", nullable=False)

    # Creator text watermark settings
    watermark_type = Column(String(20), nullable=True)
    watermark_text = Column(String(120), nullable=True)
    watermark_position = Column(String(30), nullable=True)
    watermark_opacity = Column(Integer, default=70, nullable=False)

    # Creator title overlay settings
    title_overlay_text = Column(String(160), nullable=True)
    title_overlay_position = Column(String(30), nullable=True)
    title_overlay_opacity = Column(Integer, default=85, nullable=False)
    title_overlay_font_size = Column(Integer, default=64, nullable=False)

    # Creator image/logo overlay settings
    image_overlay_path = Column(Text, nullable=True)
    image_overlay_url = Column(Text, nullable=True)
    image_overlay_position = Column(String(30), nullable=True)
    image_overlay_size = Column(String(20), default="medium", nullable=False)
    image_overlay_opacity = Column(Integer, default=100, nullable=False)

    # Creator outro/end screen settings
    outro_path = Column(Text, nullable=True)
    outro_url = Column(Text, nullable=True)
    outro_type = Column(String(20), nullable=True)
    outro_duration_seconds = Column(Integer, default=3, nullable=False)

    status = Column(String(50), default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="projects")
    clips = relationship("Clip", back_populates="project", cascade="all, delete-orphan")
    zip_file = relationship("ZipFile", back_populates="project", uselist=False, cascade="all, delete-orphan")
    jobs = relationship("ProcessingJob", back_populates="project", cascade="all, delete-orphan")
