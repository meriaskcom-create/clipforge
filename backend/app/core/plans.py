PLAN_DEFINITIONS = {
    "free": {
        "key": "free",
        "name": "Free Trial",
        "price_monthly": 0,
        "processing_hours": 1,
        "max_monthly_seconds": 3600,
        "download_expiry_hours": 24,
        "export_quality": "720p",
        "features": {
            "basic_clipping": True,
            "output_formats": True,
            "zip_download": True,
            "custom_watermark": False,
            "title_overlay": False,
            "social_icons": False,
            "outro": False,
        },
    },
    "starter": {
        "key": "starter",
        "name": "Starter",
        "price_monthly": 2,
        "processing_hours": 10,
        "max_monthly_seconds": 36000,
        "download_expiry_hours": 24,
        "export_quality": "720p",
        "features": {
            "basic_clipping": True,
            "output_formats": True,
            "zip_download": True,
            "custom_watermark": False,
            "title_overlay": False,
            "social_icons": False,
            "outro": False,
        },
    },
    "creator": {
        "key": "creator",
        "name": "Creator",
        "price_monthly": 1,
        "processing_hours": 50,
        "max_monthly_seconds": 180000,
        "download_expiry_hours": 48,
        "export_quality": "1080p",
        "features": {
            "basic_clipping": True,
            "output_formats": True,
            "zip_download": True,
            "custom_watermark": True,
            "title_overlay": True,
            "social_icons": True,
            "outro": True,
        },
    },
}


def get_plan(plan_key: str | None) -> dict:
    key = (plan_key or "free").strip().lower()
    return PLAN_DEFINITIONS.get(key, PLAN_DEFINITIONS["free"])


def list_plans() -> list[dict]:
    return [PLAN_DEFINITIONS["free"], PLAN_DEFINITIONS["starter"], PLAN_DEFINITIONS["creator"]]


def has_feature(plan_key: str | None, feature_key: str) -> bool:
    return bool(get_plan(plan_key)["features"].get(feature_key, False))
