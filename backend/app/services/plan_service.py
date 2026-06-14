from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.plans import PLAN_DEFINITIONS
from app.models.plan import Plan


def normalize_plan_row(row: Plan, fallback: dict) -> dict:
    return {
        **fallback,
        "key": row.key or fallback["key"],
        "name": row.name or fallback["name"],
        "price_monthly": int(row.price_monthly or 0),
        "processing_hours": int(row.processing_hours or max(1, int(row.max_monthly_seconds or 0) // 3600)),
        "max_monthly_seconds": int(row.max_monthly_seconds or fallback["max_monthly_seconds"]),
        "download_expiry_hours": int(row.download_expiry_hours or fallback["download_expiry_hours"]),
        "export_quality": row.export_quality or fallback["export_quality"],
        "is_active": bool(row.is_active),
    }


def seed_default_plans(db: Session) -> None:
    changed = False
    for key, definition in PLAN_DEFINITIONS.items():
        row = db.query(Plan).filter(Plan.key == key).first()
        if not row:
            row = db.query(Plan).filter(Plan.name == definition["name"]).first()

        if not row:
            row = Plan(
                key=key,
                name=definition["name"],
                price_monthly=definition["price_monthly"],
                price_yearly=0,
                max_monthly_seconds=definition["max_monthly_seconds"],
                processing_hours=definition["processing_hours"],
                download_expiry_hours=definition["download_expiry_hours"],
                export_quality=definition["export_quality"],
                watermark_enabled=definition["features"].get("custom_watermark", False),
                is_active=True,
            )
            db.add(row)
            changed = True
        else:
            if not row.key:
                row.key = key
            if not row.processing_hours:
                row.processing_hours = definition["processing_hours"]
            if not row.download_expiry_hours:
                row.download_expiry_hours = definition["download_expiry_hours"]
            if not row.export_quality:
                row.export_quality = definition["export_quality"]
            changed = True

    if changed:
        db.commit()


def get_plan_from_db(db: Session, plan_key: str | None) -> dict:
    key = (plan_key or "free").strip().lower()
    fallback = PLAN_DEFINITIONS.get(key, PLAN_DEFINITIONS["free"])

    row = db.query(Plan).filter(Plan.key == fallback["key"]).first()
    if not row:
        seed_default_plans(db)
        row = db.query(Plan).filter(Plan.key == fallback["key"]).first()

    if not row:
        return fallback

    return normalize_plan_row(row, fallback)


def list_plans_from_db(db: Session, include_inactive: bool = True) -> list[dict]:
    seed_default_plans(db)
    result = []
    for key in ["free", "starter", "creator"]:
        plan = get_plan_from_db(db, key)
        if include_inactive or plan.get("is_active", True):
            result.append(plan)
    return result


def update_plan_in_db(
    db: Session,
    plan_key: str,
    name: str | None = None,
    price_monthly: int | None = None,
    processing_hours: int | None = None,
    download_expiry_hours: int | None = None,
    export_quality: str | None = None,
    is_active: bool | None = None,
) -> dict:
    key = plan_key.strip().lower()
    if key not in PLAN_DEFINITIONS:
        raise ValueError("Invalid plan")

    seed_default_plans(db)
    row = db.query(Plan).filter(Plan.key == key).first()
    if not row:
        raise ValueError("Plan not found")

    if name is not None and name.strip():
        row.name = name.strip()
    if price_monthly is not None:
        row.price_monthly = Decimal(int(price_monthly))
    if processing_hours is not None:
        row.processing_hours = int(processing_hours)
        row.max_monthly_seconds = int(processing_hours) * 3600
    if download_expiry_hours is not None:
        row.download_expiry_hours = int(download_expiry_hours)
    if export_quality is not None and export_quality.strip():
        row.export_quality = export_quality.strip()
    if is_active is not None:
        row.is_active = bool(is_active)

    db.commit()
    db.refresh(row)
    return get_plan_from_db(db, key)


def has_feature_from_db(db: Session, plan_key: str | None, feature_key: str) -> bool:
    # Feature flags still come from plan key to keep admin V1 simple.
    key = (plan_key or "free").strip().lower()
    definition = PLAN_DEFINITIONS.get(key, PLAN_DEFINITIONS["free"])
    return bool(definition["features"].get(feature_key, False))
