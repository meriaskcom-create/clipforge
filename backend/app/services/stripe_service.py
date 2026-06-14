from app.core.config import settings


def is_stripe_configured() -> bool:
    return bool(settings.stripe_secret_key)


def create_stripe_checkout_session(
    *,
    amount: int,
    currency: str,
    plan_key: str,
    plan_name: str,
    user_id: str,
    email: str,
    success_url: str,
    cancel_url: str,
) -> dict:
    if not is_stripe_configured():
        raise RuntimeError("Stripe secret key is not configured")

    try:
        import stripe
    except ImportError as exc:
        raise RuntimeError("Stripe package is not installed. Run: pip install stripe") from exc

    stripe.api_key = settings.stripe_secret_key

    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        customer_email=email,
        line_items=[
            {
                "price_data": {
                    "currency": currency.lower(),
                    "product_data": {
                        "name": f"ClipForge {plan_name} Plan",
                    },
                    "unit_amount": int(amount),
                },
                "quantity": 1,
            }
        ],
        metadata={
            "user_id": user_id,
            "plan_key": plan_key,
        },
        success_url=success_url,
        cancel_url=cancel_url,
    )

    return {
        "id": session.id,
        "url": session.url,
        "payment_status": getattr(session, "payment_status", None),
        "metadata": dict(getattr(session, "metadata", {}) or {}),
    }


def retrieve_stripe_checkout_session(session_id: str) -> dict:
    if not is_stripe_configured():
        raise RuntimeError("Stripe secret key is not configured")

    try:
        import stripe
    except ImportError as exc:
        raise RuntimeError("Stripe package is not installed. Run: pip install stripe") from exc

    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.retrieve(session_id)

    return {
        "id": session.id,
        "url": getattr(session, "url", None),
        "payment_status": getattr(session, "payment_status", None),
        "status": getattr(session, "status", None),
        "metadata": dict(getattr(session, "metadata", {}) or {}),
    }
