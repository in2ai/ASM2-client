import os
from typing import TypeVar


_T = TypeVar("_T")


def _normalize_env_value(value: str | None) -> str | None:
    if value is None:
        return None

    return value.strip().strip('"').strip("'")


def get_env(name: str, default: _T | None = None) -> str | _T | None:
    value = _normalize_env_value(os.getenv(name))

    if value is None or value == "":
        return default

    return value


def get_int_env(name: str, default: int) -> int:
    value = get_env(name)

    if value is None:
        return default

    return int(value)


def get_float_env(name: str, default: float) -> float:
    value = get_env(name)

    if value is None:
        return default

    return float(value)


def get_bool_env(name: str, default: bool = False) -> bool:
    value = get_env(name)

    if value is None:
        return default

    return value.lower() in {"1", "true", "yes", "on"}