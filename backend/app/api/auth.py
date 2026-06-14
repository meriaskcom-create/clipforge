from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.core.config import settings
from app.schemas.auth import (
    AuthResponse,
    BasicResponse,
    CurrentUserResponse,
    LoginRequest,
    SendEmailOtpResponse,
    SignupRequest,
    UserResponseData,
    VerifyEmailOtpRequest,
)
from app.services.auth_security import (
    create_access_token,
    decode_access_token,
    generate_numeric_otp,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)
from app.services.email_service import send_verification_otp_email

router = APIRouter()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> None:
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Valid email address required")


def admin_email_list() -> set[str]:
    raw = getattr(settings, "admin_emails", "") or ""
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def is_admin_user(user: User) -> bool:
    admins = admin_email_list()
    return bool(admins and user.email.lower() in admins)


def create_and_send_email_otp(user: User, db: Session) -> bool:
    otp = generate_numeric_otp(6)
    now = datetime.now(timezone.utc)

    user.email_otp_hash = hash_otp(otp)
    user.email_otp_expires_at = now + timedelta(minutes=settings.email_otp_expire_minutes)
    user.email_otp_sent_at = now
    db.commit()

    return send_verification_otp_email(user.email, otp)


def make_auth_response(user: User, message: str) -> AuthResponse:
    token = create_access_token(str(user.id), {"email": user.email})
    return AuthResponse(
        success=True,
        message=message,
        token=token,
        user=UserResponseData.model_validate(user),
    )


def as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Login required")

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = decode_access_token(token)
        user_id = UUID(str(payload.get("sub")))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired login") from exc

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def require_verified_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Email verification required. Verify OTP before using ClipForge."
        )
    return current_user


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    validate_email(email)
    full_name = payload.full_name.strip() if payload.full_name and payload.full_name.strip() else None

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        if existing_user.is_email_verified:
            raise HTTPException(status_code=409, detail="Email already registered. Please login.")

        # Important recovery flow:
        # User signed up earlier but closed OTP page / did not verify email.
        # Allow the same email to restart signup instead of blocking forever.
        existing_user.full_name = full_name or existing_user.full_name
        existing_user.password_hash = hash_password(payload.password)
        db.commit()
        db.refresh(existing_user)
        email_sent = create_and_send_email_otp(existing_user, db)

        message = (
            "Account already exists but email is not verified. New OTP sent to email."
            if email_sent
            else "Account already exists but email is not verified. New OTP generated. Check backend terminal in dev mode."
        )
        return make_auth_response(existing_user, message)

    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(payload.password),
        plan_key="free",
        is_email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    email_sent = create_and_send_email_otp(user, db)
    message = (
        "Signup successful. Verification OTP sent to email."
        if email_sent
        else "Signup successful. Verification OTP generated. Check backend terminal in dev mode."
    )
    return make_auth_response(user, message)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    validate_email(email)

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_email_verified:
        email_sent = create_and_send_email_otp(user, db)
        message = (
            "Email not verified. New OTP sent to email."
            if email_sent
            else "Email not verified. New OTP generated. Check backend terminal in dev mode."
        )
        return make_auth_response(user, message)

    return make_auth_response(user, "Login successful")


@router.post("/email/send-otp", response_model=SendEmailOtpResponse)
def send_email_otp(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_email_verified:
        return SendEmailOtpResponse(success=True, message="Email already verified", email_sent=False)

    email_sent = create_and_send_email_otp(current_user, db)
    return SendEmailOtpResponse(
        success=True,
        message="Verification OTP sent" if email_sent else "Verification OTP generated. Check backend terminal in dev mode.",
        email_sent=email_sent,
    )


@router.post("/email/verify", response_model=BasicResponse)
def verify_email_otp(
    payload: VerifyEmailOtpRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_email_verified:
        return BasicResponse(success=True, message="Email already verified")

    now = datetime.now(timezone.utc)
    expires_at = as_aware_utc(current_user.email_otp_expires_at)

    if not current_user.email_otp_hash or not expires_at:
        raise HTTPException(status_code=400, detail="OTP not requested")

    if expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired. Please resend OTP.")

    if not verify_otp(payload.otp.strip(), current_user.email_otp_hash):
        raise HTTPException(status_code=400, detail="Invalid OTP")

    current_user.is_email_verified = True
    current_user.email_otp_hash = None
    current_user.email_otp_expires_at = None
    current_user.email_otp_sent_at = None
    db.commit()

    return BasicResponse(success=True, message="Email verified successfully")



@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    user_data = UserResponseData.model_validate(current_user).model_dump(mode="json")
    user_data["is_admin"] = is_admin_user(current_user)
    return {"success": True, "user": user_data}
