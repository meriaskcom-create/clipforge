from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_verified_user
from app.core.config import settings
from app.database.session import get_db
from app.models.project import Project
from app.models.subscription import Subscription
from app.models.user import User
from app.services.plan_service import get_plan_from_db, list_plans_from_db
from app.services.razorpay_service import create_razorpay_order, verify_razorpay_signature
from app.services.stripe_service import create_stripe_checkout_session, retrieve_stripe_checkout_session
from app.schemas.billing import (
    BillingOverviewData,
    BillingOverviewResponse,
    ChangePlanRequest,
    ChangePlanResponse,
    CreateRazorpayOrderRequest,
    CreateRazorpayOrderResponse,
    CreateStripeCheckoutRequest,
    CreateStripeCheckoutResponse,
    PlanData,
    UsageData,
    VerifyRazorpayPaymentRequest,
    VerifyRazorpayPaymentResponse,
    VerifyStripeCheckoutRequest,
    VerifyStripeCheckoutResponse,
)


router = APIRouter()


def format_hhmmss(total_seconds: int) -> str:
    safe_seconds = max(0, int(total_seconds or 0))
    hours = safe_seconds // 3600
    minutes = (safe_seconds % 3600) // 60
    seconds = safe_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def calculate_user_usage_seconds(db: Session, user: User) -> int:
    total = 0
    rows = (
        db.query(Project.video_duration)
        .filter(Project.user_id == user.id, Project.status == "completed", Project.video_duration.isnot(None))
        .all()
    )
    for (duration,) in rows:
        total += int(duration or 0)
    return total


def build_usage(db: Session, user: User) -> UsageData:
    plan = get_plan_from_db(db, user.plan_key)
    used_seconds = calculate_user_usage_seconds(db, user)
    limit_seconds = int(plan["max_monthly_seconds"])
    remaining_seconds = max(0, limit_seconds - used_seconds)

    user.monthly_usage_seconds = used_seconds
    db.commit()

    return UsageData(
        used_seconds=used_seconds,
        limit_seconds=limit_seconds,
        remaining_seconds=remaining_seconds,
        used_hhmmss=format_hhmmss(used_seconds),
        limit_hhmmss=format_hhmmss(limit_seconds),
        remaining_hhmmss=format_hhmmss(remaining_seconds),
    )


def amount_paise_for_plan(plan: dict) -> int:
    return int(plan["price_monthly"]) * 100


def amount_minor_units_for_stripe(plan: dict) -> int:
    return int(plan["price_monthly"]) * 100


def activate_user_plan(db: Session, user: User, plan_key: str, gateway: str, gateway_reference: str | None = None) -> dict:
    plan = get_plan_from_db(db, plan_key)
    if plan["key"] != plan_key:
        raise HTTPException(status_code=400, detail="Invalid plan")

    user.plan_key = plan_key
    db.add(
        Subscription(
            user_id=user.id,
            plan_key=plan_key,
            status="active",
            gateway=gateway,
            gateway_reference=gateway_reference,
        )
    )
    db.commit()
    db.refresh(user)
    return plan




@router.get("/public-plans")
def public_plans(db: Session = Depends(get_db)):
    return {
        "success": True,
        "data": list_plans_from_db(db),
    }


@router.get("/overview", response_model=BillingOverviewResponse)
def billing_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    return BillingOverviewResponse(
        success=True,
        data=BillingOverviewData(
            current_plan=PlanData(**get_plan_from_db(db, current_user.plan_key)),
            plans=[PlanData(**plan) for plan in list_plans_from_db(db)],
            usage=build_usage(db, current_user),
        ),
    )


@router.post("/change-plan", response_model=ChangePlanResponse)
def change_plan(
    payload: ChangePlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    plan = get_plan_from_db(db, payload.plan_key)
    if plan["key"] != payload.plan_key:
        raise HTTPException(status_code=400, detail="Invalid plan")

    activated_plan = activate_user_plan(
        db=db,
        user=current_user,
        plan_key=payload.plan_key,
        gateway="manual",
        gateway_reference="manual-change",
    )

    return ChangePlanResponse(
        success=True,
        message=f"Plan changed to {activated_plan['name']}",
        current_plan=PlanData(**activated_plan),
    )


@router.post("/razorpay/create-order", response_model=CreateRazorpayOrderResponse)
def razorpay_create_order(
    payload: CreateRazorpayOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    plan = get_plan_from_db(db, payload.plan_key)
    if plan["key"] != payload.plan_key or plan["price_monthly"] <= 0:
        raise HTTPException(status_code=400, detail="Invalid paid plan")

    amount_paise = amount_paise_for_plan(plan)
    receipt = f"{current_user.id}-{payload.plan_key}"

    try:
        order = create_razorpay_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={
                "user_id": str(current_user.id),
                "email": current_user.email,
                "plan_key": payload.plan_key,
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return CreateRazorpayOrderResponse(
        success=True,
        key_id=settings.razorpay_key_id,
        order_id=order["id"],
        amount=int(order["amount"]),
        currency=order.get("currency", settings.razorpay_currency),
        plan=PlanData(**plan),
    )


@router.post("/razorpay/verify", response_model=VerifyRazorpayPaymentResponse)
def razorpay_verify_payment(
    payload: VerifyRazorpayPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    plan = get_plan_from_db(db, payload.plan_key)
    if plan["key"] != payload.plan_key or plan["price_monthly"] <= 0:
        raise HTTPException(status_code=400, detail="Invalid paid plan")

    if not verify_razorpay_signature(
        order_id=payload.razorpay_order_id,
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")

    activated_plan = activate_user_plan(
        db=db,
        user=current_user,
        plan_key=payload.plan_key,
        gateway="razorpay",
        gateway_reference=payload.razorpay_payment_id,
    )

    return VerifyRazorpayPaymentResponse(
        success=True,
        message=f"Payment verified. Plan upgraded to {activated_plan['name']}",
        current_plan=PlanData(**activated_plan),
    )


@router.post("/stripe/create-checkout-session", response_model=CreateStripeCheckoutResponse)
def stripe_create_checkout_session(
    payload: CreateStripeCheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    plan = get_plan_from_db(db, payload.plan_key)
    if plan["key"] != payload.plan_key or plan["price_monthly"] <= 0:
        raise HTTPException(status_code=400, detail="Invalid paid plan")

    success_url = f"{settings.frontend_url}/dashboard/pricing?stripe_session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{settings.frontend_url}/dashboard/pricing?stripe_cancelled=1"

    try:
        session = create_stripe_checkout_session(
            amount=amount_minor_units_for_stripe(plan),
            currency=settings.stripe_currency,
            plan_key=payload.plan_key,
            plan_name=plan["name"],
            user_id=str(current_user.id),
            email=current_user.email,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return CreateStripeCheckoutResponse(
        success=True,
        checkout_url=session["url"],
        session_id=session["id"],
        plan=PlanData(**plan),
    )


@router.post("/stripe/verify-checkout-session", response_model=VerifyStripeCheckoutResponse)
def stripe_verify_checkout_session(
    payload: VerifyStripeCheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_verified_user),
):
    try:
        session = retrieve_stripe_checkout_session(payload.session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    metadata = session.get("metadata") or {}
    plan_key = metadata.get("plan_key")
    user_id = metadata.get("user_id")

    if user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Stripe session does not belong to this user")

    if session.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Stripe payment is not completed")

    plan = get_plan_from_db(db, plan_key)
    if plan["key"] != plan_key or plan["price_monthly"] <= 0:
        raise HTTPException(status_code=400, detail="Invalid paid plan")

    activated_plan = activate_user_plan(
        db=db,
        user=current_user,
        plan_key=plan_key,
        gateway="stripe",
        gateway_reference=payload.session_id,
    )

    return VerifyStripeCheckoutResponse(
        success=True,
        message=f"Stripe payment verified. Plan upgraded to {activated_plan['name']}",
        current_plan=PlanData(**activated_plan),
    )
