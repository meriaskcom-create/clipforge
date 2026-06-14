# ClipForge Local Windows Run

## Terminal 1: Backend
```powershell
cd C:\Users\hp\Downloads\clipforge\backend
venv\Scripts\activate
python -m uvicorn app.main:app --reload
```

## Terminal 2: Celery Worker
```powershell
cd C:\Users\hp\Downloads\clipforge\backend
venv\Scripts\activate
celery -A app.workers.celery_app worker --loglevel=info --pool=solo
```

Worker start hone par task list me `process_youtube_project` dikhna chahiye.

## Terminal 3: Frontend
```powershell
cd C:\Users\hp\Downloads\clipforge\frontend
npm run dev
```

## Required local services
- PostgreSQL running on localhost:5432
- Database: clipforge
- Memurai/Redis running on localhost:6379

## Health URL
http://localhost:8000/api/v1/health
