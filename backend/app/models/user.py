import uuid
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Kept nullable for backward compatibility with older local demo users.
    clerk_user_id = Column(String(255), unique=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    plan_key = Column(String(30), default="free", nullable=False)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    email_otp_hash = Column(String(255), nullable=True)
    email_otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    email_otp_sent_at = Column(DateTime(timezone=True), nullable=True)
    monthly_usage_seconds = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
