# ClipForge

YouTube-only MVP SaaS starter for converting long YouTube videos into reels/short clips.

## Current Scope

- YouTube URL only
- No direct video upload in MVP
- FastAPI backend
- Next.js frontend
- PostgreSQL models ready
- Redis/Celery processing queue
- FFmpeg split processing
- Local storage now, S3/R2 later
- ZIP + clip download expiry: 24 hours
- Cleanup task ready

## Local URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Health: http://localhost:8000/api/v1/health
- API Docs: http://localhost:8000/docs

## What is implemented now

- Health API
- YouTube URL normalization API
- Project create/list/detail API
- Start processing API
- Project status API
- Clips API
- ZIP API
- PostgreSQL SQLAlchemy models
- Demo local user auto-create
- Celery worker with yt-dlp + FFmpeg processing
- Local storage provider
- Static local download links
- 24 hour expiry fields
- Cleanup worker task
- Frontend dashboard, create page, projects list, project detail page

## Run DB/Redis/Backend/Worker with Docker

```bash
docker compose up --build
```

## Run Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

## Test Flow

1. Open frontend: http://localhost:3000
2. Go to Create Project
3. Paste a public YouTube URL
4. Select clip length and output format
5. Click Create Project
6. Open Project
7. Click Start Processing
8. Wait for progress to reach 100%
9. Download individual clips or ZIP

## Important Notes

- YouTube downloading depends on public/accessibility rules. Private, restricted, or blocked videos may fail.
- API server does not run FFmpeg directly. Worker handles processing.
- Local storage is used for testing. S3/R2 can replace provider later.

## Development Rule

One sprint at a time. Do not add upload, AI, captions, or social publishing in MVP.
