# Installation Guide

## Requirements

- Docker Desktop
- Node.js 20+
- FFmpeg is already installed inside backend Docker image
- Python is not required if using Docker for backend/worker

## Step 1: Start backend stack

From project root:

```bash
docker compose up --build
```

Check:

```text
http://localhost:8000/api/v1/health
```

Open API docs:

```text
http://localhost:8000/docs
```

## Step 2: Start frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Step 3: Test processing

1. Open `/dashboard/create`
2. Paste public YouTube URL
3. Create project
4. Open project
5. Click Start Processing
6. Wait for progress
7. Download ZIP/clips

## Storage cleanup rule

Generated clips and ZIP are valid for 24 hours. Cleanup can be queued from:

```text
POST /api/v1/maintenance/cleanup-expired
```

## MVP Notes

- Upload feature intentionally removed.
- API server never processes video directly.
- Worker handles yt-dlp + FFmpeg.
- Generated ZIP/clips expire after 24 hours.
