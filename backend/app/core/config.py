from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ClipForge"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    frontend_url: str = "http://localhost:3000"

    database_url: str = "postgresql://clipforge:clipforge@localhost:5432/clipforge"
    redis_url: str = "redis://localhost:6379/0"

    storage_provider: str = "local"
    local_storage_path: str = "../storage"
    download_expiry_hours: int = 24

    jwt_secret_key: str = "clipforge_local_dev_secret_change_me"
    jwt_expire_minutes: int = 43200

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    email_otp_expire_minutes: int = 10

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_currency: str = "INR"

    stripe_secret_key: str = ""
    stripe_currency: str = "usd"

    admin_emails: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
