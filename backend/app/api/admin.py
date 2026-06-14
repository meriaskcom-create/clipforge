from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.database.session import get_db
from app.models.project import Project
from app.models.processing_job import ProcessingJob
from app.models.subscription import Subscription
from app.models.user import User
from app.services.plan_service import get_plan_from_db, list_plans_from_db, update_plan_in_db


router = APIRouter()


def format_hhmmss(total_seconds: int) -> str:
    safe_seconds = max(0, int(total_seconds or 0))
    hours = safe_seconds // 3600
    minutes = (safe_seconds % 3600) // 60
    seconds = safe_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def admin_email_list() -> set[str]:
    raw = getattr(settings, "admin_emails", "") or ""
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    admins = admin_email_list()
    if not admins or current_user.email.lower() not in admins:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def project_public_dict(project: Project, include_user: bool = False) -> dict:
    latest_job = None
    if getattr(project, "jobs", None):
        latest_job = sorted(project.jobs, key=lambda job: job.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[0]

    row = {
        "id": str(project.id),
        "title": project.title,
        "status": project.status,
        "user_id": str(project.user_id),
        "video_duration": project.video_duration,
        "clip_length": project.clip_length,
        "output_format": project.output_format,
        "youtube_video_id": project.youtube_video_id,
        "original_url": project.original_url,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "latest_job": None,
    }
    if latest_job:
        row["latest_job"] = {
            "id": str(latest_job.id),
            "status": latest_job.status,
            "progress_percent": latest_job.progress_percent,
            "current_stage": latest_job.current_stage,
            "retry_count": latest_job.retry_count,
            "created_at": latest_job.created_at.isoformat() if latest_job.created_at else None,
            "started_at": latest_job.started_at.isoformat() if latest_job.started_at else None,
            "completed_at": latest_job.completed_at.isoformat() if latest_job.completed_at else None,
        }
    if include_user and project.user:
        row["user"] = {
            "id": str(project.user.id),
            "email": project.user.email,
            "full_name": project.user.full_name,
        }
    return row


def calculate_usage_seconds(db: Session, user_id) -> int:
    total = 0
    rows = (
        db.query(Project.video_duration)
        .filter(Project.user_id == user_id, Project.status == "completed", Project.video_duration.isnot(None))
        .all()
    )
    for (duration,) in rows:
        total += int(duration or 0)
    return total


def user_summary(db: Session, user: User) -> dict:
    plan = get_plan_from_db(db, user.plan_key)
    used_seconds = calculate_usage_seconds(db, user.id)
    limit_seconds = int(plan["max_monthly_seconds"])
    project_count = db.query(Project).filter(Project.user_id == user.id).count()
    completed_count = db.query(Project).filter(Project.user_id == user.id, Project.status == "completed").count()
    active_subscription = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id)
        .order_by(Subscription.created_at.desc())
        .first()
    )

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "plan_key": user.plan_key,
        "plan_name": plan["name"],
        "is_email_verified": user.is_email_verified,
        "used_seconds": used_seconds,
        "limit_seconds": limit_seconds,
        "remaining_seconds": max(0, limit_seconds - used_seconds),
        "used_hhmmss": format_hhmmss(used_seconds),
        "limit_hhmmss": format_hhmmss(limit_seconds),
        "remaining_hhmmss": format_hhmmss(max(0, limit_seconds - used_seconds)),
        "projects": project_count,
        "completed_projects": completed_count,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "subscription_status": active_subscription.status if active_subscription else "free",
        "subscription_gateway": active_subscription.gateway if active_subscription else "manual",
    }


class AdminChangePlanRequest(BaseModel):
    plan_key: str = Field(pattern="^(free|starter|creator)$")


class AdminAdjustHoursRequest(BaseModel):
    hours: int = Field(ge=-10000, le=10000)
    note: str | None = Field(default=None, max_length=255)


class AdminVerifyEmailRequest(BaseModel):
    is_email_verified: bool = True


class AdminUpdatePlanRequest(BaseModel):
    name: str | None = Field(default=None, max_length=50)
    price_monthly: int | None = Field(default=None, ge=0, le=1000000)
    processing_hours: int | None = Field(default=None, ge=0, le=10000)
    download_expiry_hours: int | None = Field(default=None, ge=1, le=720)
    export_quality: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None




@router.get("/plans")
def admin_list_plans(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return {"success": True, "data": list_plans_from_db(db, include_inactive=True)}


@router.put("/plans/{plan_key}")
def admin_update_plan(
    plan_key: str,
    payload: AdminUpdatePlanRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    try:
        plan = update_plan_in_db(
            db=db,
            plan_key=plan_key,
            name=payload.name,
            price_monthly=payload.price_monthly,
            processing_hours=payload.processing_hours,
            download_expiry_hours=payload.download_expiry_hours,
            export_quality=payload.export_quality,
            is_active=payload.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"success": True, "message": f"{plan['name']} plan updated", "data": plan}


@router.get("/dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    total_users = db.query(User).count()
    verified_users = db.query(User).filter(User.is_email_verified == True).count()
    total_projects = db.query(Project).count()
    completed_projects = db.query(Project).filter(Project.status == "completed").count()
    failed_projects = db.query(Project).filter(Project.status == "failed").count()
    processing_projects = db.query(Project).filter(Project.status.in_(["pending", "processing"])).count()

    plan_rows = db.query(User.plan_key, func.count(User.id)).group_by(User.plan_key).all()
    plan_distribution = {plan: count for plan, count in plan_rows}

    total_processing_seconds = 0
    for (duration,) in db.query(Project.video_duration).filter(Project.status == "completed", Project.video_duration.isnot(None)).all():
        total_processing_seconds += int(duration or 0)

    recent_users = db.query(User).order_by(User.created_at.desc()).limit(5).all()
    recent_projects = db.query(Project).order_by(Project.created_at.desc()).limit(8).all()
    latest_subscriptions = db.query(Subscription).order_by(Subscription.created_at.desc()).limit(8).all()

    return {
        "success": True,
        "data": {
            "stats": {
                "total_users": total_users,
                "verified_users": verified_users,
                "paid_users": db.query(User).filter(User.plan_key.in_(["starter", "creator"])).count(),
                "total_projects": total_projects,
                "completed_projects": completed_projects,
                "processing_projects": processing_projects,
                "failed_projects": failed_projects,
                "total_processing_seconds": total_processing_seconds,
                "total_processing_hhmmss": format_hhmmss(total_processing_seconds),
                "active_subscriptions": db.query(Subscription).filter(Subscription.status == "active").count(),
            },
            "plan_distribution": plan_distribution,
            "recent_users": [user_summary(db, user) for user in recent_users],
            "recent_projects": [project_public_dict(project, include_user=True) for project in recent_projects],
            "latest_subscriptions": [
                {
                    "id": str(sub.id),
                    "user_id": str(sub.user_id),
                    "plan_key": sub.plan_key,
                    "status": sub.status,
                    "gateway": sub.gateway,
                    "gateway_reference": sub.gateway_reference,
                    "created_at": sub.created_at.isoformat() if sub.created_at else None,
                }
                for sub in latest_subscriptions
            ],
            "plans": list_plans_from_db(db),
        },
    }


@router.get("/users")
def admin_users(
    q: str | None = None,
    plan: str | None = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    query = db.query(User)
    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(User.email).like(search))
    if plan and plan != "all":
        query = query.filter(User.plan_key == plan)

    users = query.order_by(User.created_at.desc()).limit(200).all()
    return {"success": True, "data": [user_summary(db, user) for user in users]}


@router.get("/users/{user_id}")
def admin_user_detail(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    projects = db.query(Project).filter(Project.user_id == user.id).order_by(Project.created_at.desc()).limit(20).all()
    subscriptions = db.query(Subscription).filter(Subscription.user_id == user.id).order_by(Subscription.created_at.desc()).limit(20).all()

    return {
        "success": True,
        "data": {
            "user": user_summary(db, user),
            "projects": [project_public_dict(project) for project in projects],
            "subscriptions": [
                {
                    "id": str(sub.id),
                    "plan_key": sub.plan_key,
                    "status": sub.status,
                    "gateway": sub.gateway,
                    "gateway_reference": sub.gateway_reference,
                    "created_at": sub.created_at.isoformat() if sub.created_at else None,
                }
                for sub in subscriptions
            ],
        },
    }


@router.post("/users/{user_id}/plan")
def admin_change_user_plan(
    user_id: UUID,
    payload: AdminChangePlanRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    plan = get_plan_from_db(db, payload.plan_key)
    user.plan_key = payload.plan_key
    db.add(
        Subscription(
            user_id=user.id,
            plan_key=payload.plan_key,
            status="active",
            gateway="admin",
            gateway_reference=f"admin:{admin_user.email}",
        )
    )
    db.commit()
    db.refresh(user)

    return {"success": True, "message": f"Plan changed to {plan['name']}", "data": user_summary(db, user)}


@router.post("/users/{user_id}/hours")
def admin_adjust_user_hours(
    user_id: UUID,
    payload: AdminAdjustHoursRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Current billing computes usage from completed projects. For manual admin adjustment,
    # we keep a lightweight admin subscription note and update monthly_usage_seconds for visibility.
    delta_seconds = int(payload.hours) * 3600
    user.monthly_usage_seconds = max(0, int(user.monthly_usage_seconds or 0) - delta_seconds)
    db.add(
        Subscription(
            user_id=user.id,
            plan_key=user.plan_key,
            status="active",
            gateway="admin-hours",
            gateway_reference=f"{payload.hours:+d}h by {admin_user.email}" + (f" | {payload.note}" if payload.note else ""),
        )
    )
    db.commit()
    db.refresh(user)

    return {"success": True, "message": f"Hours adjustment noted: {payload.hours:+d}h", "data": user_summary(db, user)}



@router.post("/users/{user_id}/verify-email")
def admin_verify_user_email(
    user_id: UUID,
    payload: AdminVerifyEmailRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_email_verified = payload.is_email_verified
    if payload.is_email_verified:
        user.email_otp_hash = None
        user.email_otp_expires_at = None
    db.commit()
    db.refresh(user)

    status = "verified" if payload.is_email_verified else "unverified"
    return {"success": True, "message": f"User email marked as {status}", "data": user_summary(db, user)}


@router.get("/payments")
def admin_payments(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    subscriptions = db.query(Subscription).order_by(Subscription.created_at.desc()).limit(200).all()
    users_by_id = {user.id: user for user in db.query(User).all()}

    rows = []
    for sub in subscriptions:
        plan = get_plan_from_db(db, sub.plan_key)
        user = users_by_id.get(sub.user_id)
        rows.append(
            {
                "id": str(sub.id),
                "user_id": str(sub.user_id),
                "email": user.email if user else "-",
                "plan_key": sub.plan_key,
                "plan_name": plan["name"],
                "amount": plan["price_monthly"],
                "status": sub.status,
                "gateway": sub.gateway,
                "gateway_reference": sub.gateway_reference,
                "created_at": sub.created_at.isoformat() if sub.created_at else None,
            }
        )

    return {"success": True, "data": rows}


@router.get("/queue")
def admin_queue(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    rows = db.query(ProcessingJob.status, func.count(ProcessingJob.id)).group_by(ProcessingJob.status).all()
    recent_jobs = db.query(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(50).all()
    return {
        "success": True,
        "data": {
            "status_counts": {status: count for status, count in rows},
            "recent_jobs": [
                {
                    "id": str(job.id),
                    "project_id": str(job.project_id),
                    "project_title": job.project.title if job.project else None,
                    "user_id": str(job.project.user_id) if job.project else None,
                    "user_email": job.project.user.email if job.project and job.project.user else None,
                    "status": job.status,
                    "progress_percent": job.progress_percent,
                    "current_stage": job.current_stage,
                    "retry_count": job.retry_count,
                    "created_at": job.created_at.isoformat() if job.created_at else None,
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                }
                for job in recent_jobs
            ],
        },
    }


@router.get("/projects")
def admin_projects(
    status: str | None = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    query = db.query(Project)
    if status and status != "all":
        query = query.filter(Project.status == status)
    projects = query.order_by(Project.created_at.desc()).limit(200).all()
    return {"success": True, "data": [project_public_dict(project, include_user=True) for project in projects]}


@router.post("/projects/{project_id}/mark-failed")
def admin_mark_project_failed(
    project_id: UUID,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.status = "failed"
    latest_job = db.query(ProcessingJob).filter(ProcessingJob.project_id == project.id).order_by(ProcessingJob.created_at.desc()).first()
    if latest_job:
        latest_job.status = "failed"
        latest_job.current_stage = "Marked failed by admin"
        latest_job.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(project)
    return {"success": True, "message": "Project marked as failed", "data": project_public_dict(project, include_user=True)}


@router.post("/projects/{project_id}/reset")
def admin_reset_project_to_pending(
    project_id: UUID,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.status = "pending"
    latest_job = db.query(ProcessingJob).filter(ProcessingJob.project_id == project.id).order_by(ProcessingJob.created_at.desc()).first()
    if latest_job:
        latest_job.status = "pending"
        latest_job.progress_percent = 0
        latest_job.current_stage = "Reset to pending by admin"
        latest_job.completed_at = None

    db.commit()
    db.refresh(project)
    return {"success": True, "message": "Project reset to pending", "data": project_public_dict(project, include_user=True)}
