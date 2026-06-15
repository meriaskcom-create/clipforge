import resend
from app.core.config import settings
import os


def _resend_api_key() -> str:
    return os.getenv("RESEND_API_KEY", "").strip()


def _resend_from() -> str:
    return os.getenv("RESEND_FROM", "ClipForge <onboarding@resend.dev>").strip()


def send_email(to_email: str, subject: str, body: str, html_body: str | None = None) -> bool:
    api_key = _resend_api_key()

    if not api_key:
        print("[Resend Email ERROR] RESEND_API_KEY not configured")
        return False

    resend.api_key = api_key

    try:
        resend.Emails.send({
            "from": _resend_from(),
            "to": [to_email],
            "subject": subject,
            "html": html_body or body.replace("\n", "<br>"),
            "text": body,
        })

        print(f"[Resend Email] OTP email sent to {to_email}")
        return True

    except Exception as exc:
        print("\n[Resend Email ERROR]")
        print(f"Could not send email to {to_email}")
        print(f"Error: {repr(exc)}")
        print("[End Resend Email ERROR]\n")
        return False


def send_verification_otp_email(to_email: str, otp: str) -> bool:
    text_body = (
        "Your ClipForge email verification code is:\n\n"
        f"{otp}\n\n"
        f"This code will expire in {settings.email_otp_expire_minutes} minutes.\n"
        "If you did not request this, you can ignore this email."
    )

    html_body = f"""
    <div style="font-family:Arial,sans-serif;background:#eef4ff;padding:24px;">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #e2e8f0;">
        <h2 style="margin:0;color:#0f172a;">Verify your ClipForge account</h2>
        <p style="color:#475569;line-height:1.6;">Use this OTP to verify your email address.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#2563eb;background:#eef4ff;border-radius:16px;padding:18px;text-align:center;margin:20px 0;">
          {otp}
        </div>
        <p style="color:#64748b;font-size:14px;">This code will expire in {settings.email_otp_expire_minutes} minutes.</p>
        <p style="color:#94a3b8;font-size:12px;">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
    """

    return send_email(
        to_email=to_email,
        subject="Your ClipForge verification code",
        body=text_body,
        html_body=html_body,
    )