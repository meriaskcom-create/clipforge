import json
import shutil
import subprocess
import zipfile
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont

from app.storage.local_storage import LocalStorageProvider


TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920


def run_command(command: list[str]) -> None:
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-3000:] or "FFmpeg command failed")


def ffprobe_duration_seconds(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(video_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:] or "Unable to read video duration")
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def has_audio_stream(video_path: Path) -> bool:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "json",
            str(video_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        return False
    data = json.loads(result.stdout or "{}")
    return bool(data.get("streams"))


def load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "arialbd.ttf",
        "arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def create_text_overlay_png(
    width: int,
    height: int,
    title_text: str | None,
    watermark_text: str | None,
    output_png: Path,
) -> Path:
    output_png.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    title_font = load_font(62)
    watermark_font = load_font(38)

    title = (title_text or "").strip()[:100]
    watermark = (watermark_text or "").strip()[:60]

    if title:
        bbox = draw.textbbox((0, 0), title, font=title_font, stroke_width=5)
        text_width = bbox[2] - bbox[0]
        x = max(30, (width - text_width) // 2)
        y = int(height * 0.78)
        draw.text(
            (x, y),
            title,
            font=title_font,
            fill=(255, 255, 255, 255),
            stroke_width=5,
            stroke_fill=(0, 0, 0, 230),
        )

    if watermark:
        bbox = draw.textbbox((0, 0), watermark, font=watermark_font, stroke_width=3)
        text_width = bbox[2] - bbox[0]
        x = max(30, width - text_width - 35)
        y = 35
        draw.text(
            (x, y),
            watermark,
            font=watermark_font,
            fill=(255, 255, 255, 225),
            stroke_width=3,
            stroke_fill=(0, 0, 0, 210),
        )

    image.save(output_png)
    return output_png


def logo_overlay_expr(position: str | None) -> str:
    margin = "25"
    if position == "top_left":
        return f"{margin}:{margin}"
    if position == "top_right":
        return f"W-w-{margin}:{margin}"
    if position == "bottom_left":
        return f"{margin}:H-h-{margin}"
    if position == "center":
        return "(W-w)/2:(H-h)/2"
    return f"W-w-{margin}:H-h-{margin}"


def logo_width(size: str | None) -> int:
    if size == "small":
        return 140
    if size == "large":
        return 300
    return 200


def base_video_filter() -> str:
    return (
        f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        "setsar=1,format=yuv420p"
    )


def create_outro_video(outro_file: Path, output_outro: Path, duration: int) -> Path:
    output_outro.parent.mkdir(parents=True, exist_ok=True)
    duration = max(1, min(10, int(duration or 3)))

    command = [
        "ffmpeg",
        "-y",
    ]

    suffix = outro_file.suffix.lower()
    if suffix in {".mp4", ".mov", ".mkv"}:
        command += ["-t", str(duration), "-i", str(outro_file)]
    else:
        command += ["-loop", "1", "-t", str(duration), "-i", str(outro_file)]

    # Add silent audio to outro so concat stays stable and final videos keep a valid audio stream.
    command += [
        "-f",
        "lavfi",
        "-t",
        str(duration),
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf",
        base_video_filter(),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(output_outro),
    ]

    run_command(command)
    return output_outro


def render_branded_reel(
    input_video: Path,
    output_video: Path,
    temp_dir: Path,
    title_text: str | None,
    watermark_text: str | None,
    logo_path: Path | None,
    logo_position: str | None,
    logo_size: str | None,
    logo_opacity: int,
) -> Path:
    temp_dir.mkdir(parents=True, exist_ok=True)
    output_video.parent.mkdir(parents=True, exist_ok=True)

    text_overlay_png = temp_dir / f"text_overlay_{input_video.stem}.png"
    create_text_overlay_png(
        width=TARGET_WIDTH,
        height=TARGET_HEIGHT,
        title_text=title_text,
        watermark_text=watermark_text,
        output_png=text_overlay_png,
    )

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_video),
        "-i",
        str(text_overlay_png),
    ]

    has_logo = logo_path is not None and logo_path.exists()
    if has_logo:
        command += ["-i", str(logo_path)]

    filter_complex = (
        "[0:v]"
        f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        "setsar=1[base];"
        "[base][1:v]overlay=0:0[tmp_text];"
    )

    if has_logo:
        opacity = max(30, min(100, int(logo_opacity or 100))) / 100
        pos = logo_overlay_expr(logo_position)
        filter_complex += (
            f"[2:v]scale={logo_width(logo_size)}:-1,format=rgba,"
            f"colorchannelmixer=aa={opacity:.2f}[logo];"
            f"[tmp_text][logo]overlay={pos},format=yuv420p[v]"
        )
    else:
        filter_complex += "[tmp_text]format=yuv420p[v]"

    command += [
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_video),
    ]

    run_command(command)
    return output_video


def normalize_for_concat(input_video: Path, output_video: Path) -> Path:
    output_video.parent.mkdir(parents=True, exist_ok=True)
    duration = max(1, ffprobe_duration_seconds(input_video))

    if has_audio_stream(input_video):
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_video),
            "-vf",
            base_video_filter(),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(output_video),
        ]
    else:
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_video),
            "-f",
            "lavfi",
            "-t",
            str(duration),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-vf",
            base_video_filter(),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_video),
        ]

    run_command(command)
    return output_video


def concat_with_outro(main_video: Path, outro_video: Path, output_file: Path, temp_dir: Path) -> Path:
    output_file.parent.mkdir(parents=True, exist_ok=True)

    converted_main = temp_dir / f"{main_video.stem}_concat_main.mp4"
    converted_outro = temp_dir / f"{main_video.stem}_concat_outro.mp4"
    concat_list = temp_dir / f"concat_{main_video.stem}.txt"

    normalize_for_concat(main_video, converted_main)
    normalize_for_concat(outro_video, converted_outro)

    with concat_list.open("w", encoding="utf-8") as handle:
        handle.write(f"file '{converted_main.resolve().as_posix()}'\n")
        handle.write(f"file '{converted_outro.resolve().as_posix()}'\n")

    run_command(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(output_file),
        ]
    )

    return output_file


def process_single_reel(
    input_video: Path,
    output_video: Path,
    temp_dir: Path,
    title_text: str | None,
    watermark_text: str | None,
    logo_path: Path | None,
    logo_position: str | None,
    logo_size: str | None,
    logo_opacity: int,
    outro_video: Path | None,
) -> Path:
    temp_dir.mkdir(parents=True, exist_ok=True)
    branded_video = temp_dir / f"{input_video.stem}_branded.mp4"

    render_branded_reel(
        input_video=input_video,
        output_video=branded_video,
        temp_dir=temp_dir,
        title_text=title_text,
        watermark_text=watermark_text,
        logo_path=logo_path,
        logo_position=logo_position,
        logo_size=logo_size,
        logo_opacity=logo_opacity,
    )

    if outro_video and outro_video.exists():
        return concat_with_outro(branded_video, outro_video, output_video, temp_dir)

    shutil.copy2(branded_video, output_video)
    return output_video


def create_zip(files: list[Path], zip_path: Path) -> Path:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            zip_file.write(file, arcname=file.name)

    return zip_path


def process_bulk_branding_job(
    user_id: str,
    reels: list[Path],
    title_text: str | None,
    watermark_text: str | None,
    logo_path: Path | None,
    logo_position: str | None,
    logo_size: str | None,
    logo_opacity: int,
    outro_path: Path | None,
    outro_duration: int,
) -> dict:
    storage = LocalStorageProvider()
    job_id = str(uuid4())
    job_dir = storage.base_path / "bulk-branding" / user_id / job_id
    temp_dir = job_dir / "temp"
    input_dir = job_dir / "input"
    output_dir = job_dir / "output"
    asset_dir = job_dir / "assets"
    zip_path = job_dir / "Bulk_Branded_Reels.zip"

    for folder in [temp_dir, input_dir, output_dir, asset_dir]:
        folder.mkdir(parents=True, exist_ok=True)

    local_reels: list[Path] = []
    for index, reel_path in enumerate(reels, start=1):
        suffix = reel_path.suffix or ".mp4"
        target = input_dir / f"reel_{index:03d}{suffix}"
        shutil.copy2(reel_path, target)
        local_reels.append(target)

    local_logo = None
    if logo_path and logo_path.exists():
        local_logo = asset_dir / f"logo{logo_path.suffix or '.png'}"
        shutil.copy2(logo_path, local_logo)

    outro_video = None
    if outro_path and outro_path.exists():
        local_outro = asset_dir / f"outro{outro_path.suffix or '.png'}"
        shutil.copy2(outro_path, local_outro)
        outro_video = temp_dir / "outro_video.mp4"
        create_outro_video(local_outro, outro_video, outro_duration)

    output_files: list[Path] = []
    for index, reel in enumerate(local_reels, start=1):
        output_file = output_dir / f"{index:03d}_{reel.stem}.mp4"
        process_single_reel(
            input_video=reel,
            output_video=output_file,
            temp_dir=temp_dir / f"reel_{index:03d}",
            title_text=title_text,
            watermark_text=watermark_text,
            logo_path=local_logo,
            logo_position=logo_position,
            logo_size=logo_size,
            logo_opacity=logo_opacity,
            outro_video=outro_video,
        )
        output_files.append(output_file)

    create_zip(output_files, zip_path)

    return {
        "job_id": job_id,
        "total_files": len(output_files),
        "zip_path": str(zip_path),
        "zip_url": storage.public_url(zip_path),
        "files": [{"name": file.name, "url": storage.public_url(file)} for file in output_files],
    }
