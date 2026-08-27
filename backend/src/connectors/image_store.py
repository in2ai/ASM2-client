import re
import shutil
from io import BytesIO
from pathlib import Path

from PIL import Image

from src.config.env import get_env

IMAGES_PATH = Path(get_env("QDRANT_META_PATH", "/app/data/qdrant_meta")) / "images"

# Rasterization resolution
IMAGE_DPI = 150

# Maximum long side of the saved image
IMAGE_MAX_SIDE = 2048

IMAGE_QUALITY = 80
IMAGE_EXT = ".webp"

_FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _safe_file_id(file_id: str) -> str:
    """Validate that the id cannot escape the image directory."""
    if not isinstance(file_id, str) or not _FILE_ID_RE.match(file_id):
        raise ValueError(f"Invalid file identifier: {file_id!r}")

    return file_id


def image_dir(file_id: str) -> Path:
    """Return the directory where a file's images live."""
    return IMAGES_PATH / _safe_file_id(file_id)


def image_path(file_id: str, page: int) -> Path:
    """Return the path of a page's image."""
    return image_dir(file_id) / f"{int(page):04d}{IMAGE_EXT}"


def normalize(data: bytes) -> bytes:
    """Rescale to the maximum long side and recode to WebP."""
    with Image.open(BytesIO(data)) as img:
        img = img.convert("RGB")

        if max(img.size) > IMAGE_MAX_SIDE:
            img.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE))

        buf = BytesIO()
        img.save(buf, format="WEBP", quality=IMAGE_QUALITY)

    return buf.getvalue()


def write_image(file_id: str, page: int, data: bytes) -> bytes:
    """Normalize and save a page image, returning the normalized bytes."""
    normalized = normalize(data)
    path = image_path(file_id, page)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(normalized)

    return normalized


def read_image(file_id: str, page: int) -> bytes | None:
    """Read a page's image, or return None if it does not exist."""
    path = image_path(file_id, page)

    return path.read_bytes() if path.is_file() else None


def delete_images(file_id: str) -> None:
    """Delete all images of a file."""
    shutil.rmtree(image_dir(file_id), ignore_errors=True)


def list_images(file_id: str) -> list[int]:
    """Return the pages that have a saved image, sorted."""
    directory = image_dir(file_id)

    if not directory.is_dir():
        return []

    pages = []

    for path in directory.glob(f"*{IMAGE_EXT}"):
        try:
            pages.append(int(path.stem))
        except ValueError:
            continue

    return sorted(pages)

def has_image(file_id: str, page: int) -> bool:
    """Check whether a page's image exists, without reading it."""
    return image_path(file_id, page).is_file()