from uuid import UUID

from pydantic import BaseModel, Field


class UserResponseData(BaseModel):
    id: UUID
    email: str
    full_name: str | None = None
    plan_key: str
    is_email_verified: bool

    class Config:
        from_attributes = True


class SignupRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=100)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=100)


class AuthResponse(BaseModel):
    success: bool
    message: str
    token: str
    user: UserResponseData


class CurrentUserResponse(BaseModel):
    success: bool
    user: UserResponseData


class SendEmailOtpResponse(BaseModel):
    success: bool
    message: str
    email_sent: bool


class VerifyEmailOtpRequest(BaseModel):
    otp: str = Field(min_length=4, max_length=10)


class BasicResponse(BaseModel):
    success: bool
    message: str
