from datetime import datetime
from pydantic import BaseModel, Field


class PlanData(BaseModel):
    key: str
    name: str
    price_monthly: int
    processing_hours: int
    max_monthly_seconds: int
    download_expiry_hours: int
    export_quality: str
    features: dict[str, bool]
    is_active: bool = True


class UsageData(BaseModel):
    used_seconds: int
    limit_seconds: int
    remaining_seconds: int
    used_hhmmss: str
    limit_hhmmss: str
    remaining_hhmmss: str


class BillingOverviewData(BaseModel):
    current_plan: PlanData
    plans: list[PlanData]
    usage: UsageData


class BillingOverviewResponse(BaseModel):
    success: bool
    data: BillingOverviewData


class ChangePlanRequest(BaseModel):
    plan_key: str = Field(pattern="^(free|starter|creator)$")


class ChangePlanResponse(BaseModel):
    success: bool
    message: str
    current_plan: PlanData


class CreateRazorpayOrderRequest(BaseModel):
    plan_key: str = Field(pattern="^(starter|creator)$")


class CreateRazorpayOrderResponse(BaseModel):
    success: bool
    key_id: str
    order_id: str
    amount: int
    currency: str
    plan: PlanData


class VerifyRazorpayPaymentRequest(BaseModel):
    plan_key: str = Field(pattern="^(starter|creator)$")
    razorpay_order_id: str = Field(min_length=5, max_length=255)
    razorpay_payment_id: str = Field(min_length=5, max_length=255)
    razorpay_signature: str = Field(min_length=10, max_length=500)


class VerifyRazorpayPaymentResponse(BaseModel):
    success: bool
    message: str
    current_plan: PlanData


class CreateStripeCheckoutRequest(BaseModel):
    plan_key: str = Field(pattern="^(starter|creator)$")


class CreateStripeCheckoutResponse(BaseModel):
    success: bool
    checkout_url: str
    session_id: str
    plan: PlanData


class VerifyStripeCheckoutRequest(BaseModel):
    session_id: str = Field(min_length=5, max_length=255)


class VerifyStripeCheckoutResponse(BaseModel):
    success: bool
    message: str
    current_plan: PlanData
