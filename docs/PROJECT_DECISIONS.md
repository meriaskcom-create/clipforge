# Project Decisions

## MVP Scope

ClipForge MVP will only support YouTube links.

Direct upload is intentionally removed from MVP to avoid:

- Large file upload failures
- Presigned URL complexity
- High bandwidth cost
- User internet dependency
- Storage abuse

## Architecture Rule

API server must never process videos directly.

Correct flow:

User -> API -> PostgreSQL -> Redis Queue -> Celery Worker -> FFmpeg -> Storage -> Download

## Cleanup Rule

- Download files expire after 24 hours
- Cleanup worker should run every 1 hour
- Original downloaded YouTube source file should be deleted immediately after processing
- ZIP + generated clips should be deleted after expiry

## Storage Provider

Current:

- LocalStorageProvider

Future:

- S3StorageProvider
- R2StorageProvider
