import smtplib
from email.message import EmailMessage

from app.core.config import settings


def _smtp_user() -> str:
    return (settings.smtp_user or settings.smtp_username or "").strip()


def _smtp_pass() -> str:
    return (settings.smtp_pass or settings.smtp_password or "").strip()


def _smtp_from() -> str:
    return (settings.smtp_from or _smtp_user()).strip()


def is_smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_port and _smtp_user() and _smtp_pass())


def send_email(to_email: str, subject: str, body: str, html_body: str | None = None) -> bool:
    if not is_smtp_configured():
        print("\n[ClipForge Email DEV MODE - SMTP not configured]")
        print("Add SMTP_USER + SMTP_PASS in backend/.env to send Gmail OTP.")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(body)
        print("[End Email]\n")
        return False

    from_email = _smtp_from()

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port), timeout=30) as smtp:
            smtp.ehlo()
            if settings.smtp_use_tls:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(_smtp_user(), _smtp_pass())
            smtp.send_message(message)
        print(f"[ClipForge Email] OTP email sent to {to_email}")
        return True
    except Exception as exc:
        print("\n[ClipForge Email ERROR]")
        print(f"Could not send email to {to_email}")
        print(f"Error: {exc}")
        print("Check Gmail App Password, SMTP_USER, SMTP_PASS, and 2-Step Verification.")
        print("[End Email ERROR]\n")
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
