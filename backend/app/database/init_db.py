import time
import uuid
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database.session import Base, engine
from app.models.user import User
from app.models.plan import Plan
from app.models.project import Project
from app.models.clip import Clip
from app.models.zip_file import ZipFile
from app.models.processing_job import ProcessingJob
from app.models.subscription import Subscription


def ensure_auth_columns() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_key VARCHAR(30) NOT NULL DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_hash VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_sent_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_usage_seconds INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))



def ensure_project_watermark_columns() -> None:
    statements = [
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS watermark_type VARCHAR(20)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS watermark_text VARCHAR(120)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS watermark_position VARCHAR(30)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS watermark_opacity INTEGER NOT NULL DEFAULT 70",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))



def ensure_project_title_overlay_columns() -> None:
    statements = [
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS title_overlay_text VARCHAR(160)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS title_overlay_position VARCHAR(30)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS title_overlay_opacity INTEGER NOT NULL DEFAULT 85",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS title_overlay_font_size INTEGER NOT NULL DEFAULT 64",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))



def ensure_project_image_overlay_columns() -> None:
    statements = [
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_overlay_path TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_overlay_url TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_overlay_position VARCHAR(30)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_overlay_size VARCHAR(20) NOT NULL DEFAULT 'medium'",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_overlay_opacity INTEGER NOT NULL DEFAULT 100",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))



def ensure_project_outro_columns() -> None:
    statements = [
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS outro_path TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS outro_url TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS outro_type VARCHAR(20)",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS outro_duration_seconds INTEGER NOT NULL DEFAULT 3",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))




def ensure_plan_columns() -> None:
    statements = [
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS key VARCHAR(30)",
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS processing_hours INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS download_expiry_hours INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS export_quality VARCHAR(30) NOT NULL DEFAULT '720p'",
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        connection.execute(text("UPDATE plans SET key = 'free' WHERE key IS NULL AND LOWER(name) LIKE 'free%'"))
        connection.execute(text("UPDATE plans SET key = 'starter' WHERE key IS NULL AND LOWER(name) LIKE 'starter%'"))
        connection.execute(text("UPDATE plans SET key = 'creator' WHERE key IS NULL AND LOWER(name) LIKE 'creator%'"))


def seed_plan_rows() -> None:
    from app.core.plans import PLAN_DEFINITIONS

    with engine.begin() as connection:
        for key, plan in PLAN_DEFINITIONS.items():
            exists = connection.execute(text("SELECT id FROM plans WHERE key = :key"), {"key": key}).fetchone()
            if exists:
                connection.execute(
                    text("""
                        UPDATE plans
                        SET name = :name,
                            processing_hours = COALESCE(processing_hours, :processing_hours),
                            max_monthly_seconds = CASE WHEN max_monthly_seconds IS NULL OR max_monthly_seconds = 0 THEN :max_monthly_seconds ELSE max_monthly_seconds END,
                            download_expiry_hours = COALESCE(download_expiry_hours, :download_expiry_hours),
                            export_quality = COALESCE(export_quality, :export_quality)
                        WHERE key = :key
                    """),
                    {
                        "key": key,
                        "name": plan["name"],
                        "processing_hours": plan["processing_hours"],
                        "max_monthly_seconds": plan["max_monthly_seconds"],
                        "download_expiry_hours": plan["download_expiry_hours"],
                        "export_quality": plan["export_quality"],
                    },
                )
            else:
                connection.execute(
                    text("""
                        INSERT INTO plans (id, key, name, price_monthly, price_yearly, max_monthly_seconds, processing_hours, download_expiry_hours, export_quality, watermark_enabled, is_active)
                        VALUES (:id, :key, :name, :price_monthly, 0, :max_monthly_seconds, :processing_hours, :download_expiry_hours, :export_quality, :watermark_enabled, TRUE)
                    """),
                    {
                        "id": str(uuid.uuid4()),
                        "key": key,
                        "name": plan["name"],
                        "price_monthly": plan["price_monthly"],
                        "max_monthly_seconds": plan["max_monthly_seconds"],
                        "processing_hours": plan["processing_hours"],
                        "download_expiry_hours": plan["download_expiry_hours"],
                        "export_quality": plan["export_quality"],
                        "watermark_enabled": bool(plan["features"].get("custom_watermark", False)),
                    },
                )


def init_db(max_retries: int = 10) -> None:
    for attempt in range(1, max_retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            ensure_auth_columns()
            ensure_project_watermark_columns()
            ensure_project_title_overlay_columns()
            ensure_project_image_overlay_columns()
            ensure_project_outro_columns()
            ensure_plan_columns()
            seed_plan_rows()
            return
        except OperationalError:
            if attempt == max_retries:
                raise
            time.sleep(2)
