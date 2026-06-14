from pathlib import Path
from urllib.parse import quote

from app.core.config import settings


class LocalStorageProvider:
    """Local development storage provider.

    Production later can replace this with S3/R2 without changing processing code.
    """

    def __init__(self) -> None:
        self.base_path = Path(settings.local_storage_path).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def project_path(self, user_id: str, project_id: str) -> Path:
        path = self.base_path / "projects" / user_id / project_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def public_url(self, file_path: str | Path) -> str:
        path = Path(file_path).resolve()
        relative = path.relative_to(self.base_path).as_posix()
        return f"/storage/{quote(relative)}"

    def delete_file(self, file_path: str) -> bool:
        path = Path(file_path)
        if path.exists() and path.is_file():
            path.unlink()
            return True
        return False
