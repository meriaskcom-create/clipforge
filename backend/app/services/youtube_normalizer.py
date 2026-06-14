from urllib.parse import urlparse, parse_qs

SUPPORTED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


def _clean_video_id(video_id: str | None) -> str | None:
    if not video_id:
        return None
    video_id = video_id.strip().split("?")[0].split("&")[0].split("/")[0]
    if 6 <= len(video_id) <= 20:
        return video_id
    return None


def normalize_youtube_url(url: str) -> dict | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "www.")

    if host not in SUPPORTED_HOSTS:
        return None

    video_id = None

    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v", [None])[0]
    elif parsed.path.startswith("/embed/"):
        video_id = parsed.path.split("/embed/", 1)[1]
    elif parsed.path.startswith("/shorts/"):
        video_id = parsed.path.split("/shorts/", 1)[1]
    elif parsed.path.startswith("/live/"):
        video_id = parsed.path.split("/live/", 1)[1]

    video_id = _clean_video_id(video_id)
    if not video_id:
        return None

    return {
        "video_id": video_id,
        "normalized_url": f"https://www.youtube.com/watch?v={video_id}",
        "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
    }
