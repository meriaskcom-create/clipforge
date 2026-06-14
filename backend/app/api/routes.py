from fastapi import APIRouter

from app.api import admin, auth, billing, bulk_branding, maintenance, projects, youtube

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(youtube.router, prefix="/youtube", tags=["YouTube"])
router.include_router(projects.router, prefix="/projects", tags=["Projects"])
router.include_router(billing.router, prefix="/billing", tags=["Billing"])
router.include_router(bulk_branding.router, prefix="/bulk-branding", tags=["Bulk Branding"])
router.include_router(maintenance.router, prefix="/maintenance", tags=["Maintenance"])
router.include_router(admin.router, prefix="/admin", tags=["Admin"])
