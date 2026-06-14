import json
import math
import shutil
import subprocess
import zipfile
from pathlib import Path


def run_command(command: list[str]) -> None:
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:] or "Command failed")


def ffprobe_duration_seconds(video_path: Path) -> int:
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
        raise RuntimeError(result.stderr[-2000:] or "Unable to read video metadata")
    data = json.loads(result.stdout)
    return int(float(data["format"]["duration"]))


def escape_drawtext_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", " ")
        .replace("\r", " ")
    )


def watermark_position(position: str | None) -> tuple[str, str]:
    margin = "48"
    if position == "top_left":
        return margin, margin
    if position == "top_right":
        return f"w-text_w-{margin}", margin
    if position == "bottom_left":
        return margin, f"h-text_h-{margin}"
    if position == "center":
        return "(w-text_w)/2", "(h-text_h)/2"
    return f"w-text_w-{margin}", f"h-text_h-{margin}"


def title_position(position: str | None) -> tuple[str, str]:
    if position == "center":
        return "(w-text_w)/2", "(h-text_h)/2"
    if position == "bottom":
        return "(w-text_w)/2", "h-text_h-150"
    return "(w-text_w)/2", "150"


def build_drawtext_filter(
    text: str,
    x_pos: str,
    y_pos: str,
    font_size: int,
    opacity: int,
    box_opacity: float,
) -> str:
    safe_text = escape_drawtext_text(text.strip())
    safe_opacity = max(10, min(100, int(opacity or 70))) / 100
    safe_font_size = max(24, min(96, int(font_size or 44)))
    return (
        "drawtext="
        f"text='{safe_text}':"
        f"fontsize={safe_font_size}:"
        f"fontcolor=white@{safe_opacity:.2f}:"
        "box=1:"
        f"boxcolor=black@{box_opacity:.2f}:"
        "boxborderw=18:"
        f"x={x_pos}:"
        f"y={y_pos}"
    )


def overlay_position(position: str | None) -> tuple[str, str]:
    margin = "48"
    if position == "top_left":
        return margin, margin
    if position == "top_right":
        return f"main_w-overlay_w-{margin}", margin
    if position == "bottom_left":
        return margin, f"main_h-overlay_h-{margin}"
    if position == "center":
        return "(main_w-overlay_w)/2", "(main_h-overlay_h)/2"
    return f"main_w-overlay_w-{margin}", f"main_h-overlay_h-{margin}"


def image_overlay_width(size: str | None) -> int:
    if size == "small":
        return 160
    if size == "large":
        return 360
    return 240


def build_base_video_filter(
    output_format: str,
    watermark_text: str | None = None,
    watermark_position_value: str | None = None,
    watermark_opacity: int | None = 70,
    title_overlay_text: str | None = None,
    title_overlay_position: str | None = None,
    title_overlay_opacity: int | None = 85,
    title_overlay_font_size: int | None = 64,
) -> str | None:
    filters: list[str] = []

    if output_format in {"reel", "reel_fit"}:
        filters.append("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1")
    elif output_format == "reel_crop":
        filters.append("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1")
    elif output_format == "square_crop":
        filters.append("scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,setsar=1")

    if title_overlay_text and title_overlay_text.strip():
        x_pos, y_pos = title_position(title_overlay_position)
        filters.append(
            build_drawtext_filter(
                text=title_overlay_text.strip()[:120],
                x_pos=x_pos,
                y_pos=y_pos,
                font_size=int(title_overlay_font_size or 64),
                opacity=int(title_overlay_opacity or 85),
                box_opacity=0.45,
            )
        )

    if watermark_text and watermark_text.strip():
        x_pos, y_pos = watermark_position(watermark_position_value)
        filters.append(
            build_drawtext_filter(
                text=watermark_text.strip()[:80],
                x_pos=x_pos,
                y_pos=y_pos,
                font_size=44,
                opacity=int(watermark_opacity or 70),
                box_opacity=0.35,
            )
        )

    return ",".join(filters) if filters else None


def build_filter_complex(
    base_filter: str | None,
    image_overlay_width_value: int,
    image_overlay_position_value: str | None,
    image_overlay_opacity: int | None,
) -> str:
    base_chain = f"[0:v]{base_filter}[base]" if base_filter else "[0:v]setsar=1[base]"
    opacity = max(30, min(100, int(image_overlay_opacity or 100))) / 100
    x_pos, y_pos = overlay_position(image_overlay_position_value)
    overlay_chain = (
        f"[1:v]scale={image_overlay_width_value}:-1,format=rgba,"
        f"colorchannelmixer=aa={opacity:.2f}[ov];"
        f"[base][ov]overlay={x_pos}:{y_pos}[v]"
    )
    return f"{base_chain};{overlay_chain}"


def split_video_into_clips(
    input_path: Path,
    clips_dir: Path,
    clip_length: int,
    output_format: str,
    watermark_text: str | None = None,
    watermark_position: str | None = None,
    watermark_opacity: int | None = 70,
    title_overlay_text: str | None = None,
    title_overlay_position: str | None = None,
    title_overlay_opacity: int | None = 85,
    title_overlay_font_size: int | None = 64,
    image_overlay_path: Path | None = None,
    image_overlay_position: str | None = None,
    image_overlay_size: str | None = "medium",
    image_overlay_opacity: int | None = 100,
) -> list[dict]:
    clips_dir.mkdir(parents=True, exist_ok=True)
    duration = ffprobe_duration_seconds(input_path)
    total_clips = max(1, math.ceil(duration / clip_length))
    clips: list[dict] = []

    for index in range(total_clips):
        start = index * clip_length
        remaining = duration - start
        current_duration = min(clip_length, remaining)
        clip_number = index + 1
        output_path = clips_dir / f"clip-{clip_number:03d}.mp4"

        command = [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-t",
            str(current_duration),
            "-i",
            str(input_path),
        ]

        has_image_overlay = image_overlay_path is not None and image_overlay_path.exists()
        if has_image_overlay:
            command += ["-i", str(image_overlay_path)]

        base_filter = build_base_video_filter(
            output_format=output_format,
            watermark_text=watermark_text,
            watermark_position_value=watermark_position,
            watermark_opacity=watermark_opacity,
            title_overlay_text=title_overlay_text,
            title_overlay_position=title_overlay_position,
            title_overlay_opacity=title_overlay_opacity,
            title_overlay_font_size=title_overlay_font_size,
        )

        if has_image_overlay:
            filter_complex = build_filter_complex(
                base_filter=base_filter,
                image_overlay_width_value=image_overlay_width(image_overlay_size),
                image_overlay_position_value=image_overlay_position,
                image_overlay_opacity=image_overlay_opacity,
            )
            command += ["-filter_complex", filter_complex, "-map", "[v]", "-map", "0:a?"]
        elif base_filter:
            command += ["-vf", base_filter]

        command += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        run_command(command)
        clips.append({"clip_number": clip_number, "duration": current_duration, "path": output_path})

    return clips



def create_outro_segment(
    outro_path: Path,
    output_path: Path,
    output_format: str,
    duration_seconds: int,
    outro_type: str | None,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration = max(1, min(10, int(duration_seconds or 3)))

    if output_format in {"reel", "reel_fit", "reel_crop"}:
        vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1"
    elif output_format == "square_crop":
        vf = "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
    else:
        vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1"

    if outro_type == "video":
        command = [
            "ffmpeg", "-y", "-t", str(duration), "-i", str(outro_path),
            "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-pix_fmt", "yuv420p", str(output_path),
        ]
    else:
        command = [
            "ffmpeg", "-y", "-loop", "1", "-t", str(duration), "-i", str(outro_path),
            "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-pix_fmt", "yuv420p", str(output_path),
        ]

    run_command(command)
    return output_path



def apply_creator_overlays_to_clips(
    clips: list[dict],
    branded_dir: Path,
    output_format: str,
    watermark_text: str | None = None,
    watermark_position: str | None = None,
    watermark_opacity: int | None = 70,
    title_overlay_text: str | None = None,
    title_overlay_position: str | None = None,
    title_overlay_opacity: int | None = 85,
    title_overlay_font_size: int | None = 64,
    image_overlay_path: Path | None = None,
    image_overlay_position: str | None = None,
    image_overlay_size: str | None = "medium",
    image_overlay_opacity: int | None = 100,
) -> list[dict]:
    has_text_overlay = bool(
        (watermark_text and watermark_text.strip()) or
        (title_overlay_text and title_overlay_text.strip())
    )
    has_image_overlay = image_overlay_path is not None and image_overlay_path.exists()

    if not has_text_overlay and not has_image_overlay:
        return clips

    branded_dir.mkdir(parents=True, exist_ok=True)
    final_clips: list[dict] = []

    for clip in clips:
        input_clip_path = Path(clip["path"])
        output_path = branded_dir / input_clip_path.name

        command = ["ffmpeg", "-y", "-i", str(input_clip_path)]

        if has_image_overlay:
            command += ["-i", str(image_overlay_path)]

        base_filter = build_base_video_filter(
            output_format="original",
            watermark_text=watermark_text,
            watermark_position_value=watermark_position,
            watermark_opacity=watermark_opacity,
            title_overlay_text=title_overlay_text,
            title_overlay_position=title_overlay_position,
            title_overlay_opacity=title_overlay_opacity,
            title_overlay_font_size=title_overlay_font_size,
        )

        if has_image_overlay:
            filter_complex = build_filter_complex(
                base_filter=base_filter,
                image_overlay_width_value=image_overlay_width(image_overlay_size),
                image_overlay_position_value=image_overlay_position,
                image_overlay_opacity=image_overlay_opacity,
            )
            command += ["-filter_complex", filter_complex, "-map", "[v]", "-map", "0:a?"]
        elif base_filter:
            command += ["-vf", base_filter]

        command += [
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            "-movflags", "+faststart",
            str(output_path),
        ]

        run_command(command)
        final_clips.append({**clip, "path": output_path})

    return final_clips


def append_outro_to_clip(clip_path: Path, outro_segment_path: Path, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "ffmpeg", "-y", "-i", str(clip_path), "-i", str(outro_segment_path),
        "-filter_complex",
        "[0:v]setsar=1[v0];[1:v]setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]",
        "-map", "[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-movflags", "+faststart", str(output_path),
    ]
    run_command(command)
    return output_path


def append_outro_to_clips(
    clips: list[dict],
    outro_path: Path | None,
    output_format: str,
    outro_duration_seconds: int | None,
    outro_type: str | None,
) -> list[dict]:
    if not outro_path or not outro_path.exists() or not clips:
        return clips

    outro_dir = Path(clips[0]["path"]).parent / "_outro"
    final_dir = Path(clips[0]["path"]).parent / "_final"
    outro_segment_path = outro_dir / "outro-segment.mp4"
    outro_duration = max(1, min(10, int(outro_duration_seconds or 3)))

    create_outro_segment(
        outro_path=outro_path,
        output_path=outro_segment_path,
        output_format=output_format,
        duration_seconds=outro_duration,
        outro_type=outro_type,
    )

    final_clips: list[dict] = []
    for clip in clips:
        original_path = Path(clip["path"])
        final_path = final_dir / original_path.name
        append_outro_to_clip(original_path, outro_segment_path, final_path)
        final_clips.append({**clip, "path": final_path, "duration": int(clip.get("duration") or 0) + outro_duration})

    return final_clips


def create_zip_from_clips(clips: list[dict], zip_path: Path) -> Path:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for clip in clips:
            path = Path(clip["path"])
            zip_file.write(path, arcname=path.name)
    return zip_path


def safe_delete_path(path: Path) -> None:
    if path.exists() and path.is_file():
        path.unlink()
    elif path.exists() and path.is_dir():
        shutil.rmtree(path)
