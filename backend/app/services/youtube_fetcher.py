from pathlib import Path

from yt_dlp import YoutubeDL


def download_youtube_video(normalized_url: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / "source.%(ext)s")

    options = {
        "outtmpl": output_template,
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(normalized_url, download=True)
        downloaded = Path(ydl.prepare_filename(info))

    mp4_path = output_dir / "source.mp4"
    if mp4_path.exists():
        return mp4_path
    if downloaded.exists():
        return downloaded

    candidates = list(output_dir.glob("source.*"))
    if candidates:
        return candidates[0]

    raise RuntimeError("YouTube video download failed")
