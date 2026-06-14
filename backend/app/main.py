from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.core.config import settings
from app.database.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.local_storage_path, exist_ok=True)

    # Create required database tables and seed plans on startup.
    # This is needed on first deploy because Render PostgreSQL starts empty.
    init_db()

    yield


app = FastAPI(
    title="ClipForge API",
    version="1.0.0",
    description="YouTube-only long video to reels/short clips SaaS API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"success": True, "message": "ClipForge API is running"}


@app.get("/api/v1/health")
def health_check():
    return {"success": True, "message": "Backend healthy", "environment": settings.app_env}


os.makedirs(settings.local_storage_path, exist_ok=True)
app.mount("/storage", StaticFiles(directory=settings.local_storage_path), name="storage")

app.include_router(api_router, prefix=settings.api_prefix)