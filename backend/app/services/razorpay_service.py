import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from app.core.config import settings


def is_razorpay_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def create_razorpay_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    if not is_razorpay_configured():
        raise RuntimeError("Razorpay keys are not configured")

    payload = {
        "amount": int(amount_paise),
        "currency": settings.razorpay_currency,
        "receipt": receipt[:40],
        "payment_capture": 1,
        "notes": notes or {},
    }

    auth_raw = f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}".encode("utf-8")
    auth_header = base64.b64encode(auth_raw).decode("utf-8")

    request = urllib.request.Request(
        "https://api.razorpay.com/v1/orders",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(body or "Razorpay order creation failed") from exc


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not settings.razorpay_key_secret:
        return False

    body = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
