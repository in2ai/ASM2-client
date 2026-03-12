import base64
import logging
import os
import time

import requests


logger = logging.getLogger(__name__)

_DEFAULT_MANAGEMENT_API_RESOURCE = "https://default.logto.app/api"
_MANAGEMENT_ACCESS_TOKEN = ""
_MANAGEMENT_ACCESS_TOKEN_EXPIRES_AT = 0.0
_MANAGEMENT_ACCESS_TOKEN_RESOURCE = ""
_MANAGEMENT_ACCESS_TOKEN_ENDPOINT = ""


def _get_management_config() -> tuple[str, str, str, str, str] | None:
    logto_endpoint = (os.getenv("LOGTO_ENDPOINT") or "").rstrip("/")
    management_app_id = (os.getenv("LOGTO_MANAGEMENT_APP_ID") or "").strip()
    management_app_secret = (os.getenv("LOGTO_MANAGEMENT_APP_SECRET") or "").strip()
    default_user_role_id = (os.getenv("LOGTO_DEFAULT_USER_ROLE_ID") or "").strip()
    management_api_resource = (
        os.getenv("LOGTO_MANAGEMENT_API_RESOURCE") or _DEFAULT_MANAGEMENT_API_RESOURCE
    ).strip()

    if not logto_endpoint:
        raise RuntimeError("LOGTO_ENDPOINT is required for Logto management access")

    if not management_app_id or not management_app_secret or not default_user_role_id:
        return None

    return (
        logto_endpoint,
        management_app_id,
        management_app_secret,
        default_user_role_id,
        management_api_resource,
    )


def is_default_role_bootstrap_enabled() -> bool:
    return _get_management_config() is not None


def _get_management_access_token(
    logto_endpoint: str,
    management_app_id: str,
    management_app_secret: str,
    management_api_resource: str,
    *,
    force_refresh: bool = False,
) -> str:
    global _MANAGEMENT_ACCESS_TOKEN
    global _MANAGEMENT_ACCESS_TOKEN_EXPIRES_AT
    global _MANAGEMENT_ACCESS_TOKEN_RESOURCE
    global _MANAGEMENT_ACCESS_TOKEN_ENDPOINT

    now = time.time()
    if (
        not force_refresh
        and _MANAGEMENT_ACCESS_TOKEN
        and now < _MANAGEMENT_ACCESS_TOKEN_EXPIRES_AT
        and _MANAGEMENT_ACCESS_TOKEN_RESOURCE == management_api_resource
        and _MANAGEMENT_ACCESS_TOKEN_ENDPOINT == logto_endpoint
    ):
        return _MANAGEMENT_ACCESS_TOKEN

    basic_auth = base64.b64encode(
        f"{management_app_id}:{management_app_secret}".encode("utf-8")
    ).decode("utf-8")
    response = requests.post(
        f"{logto_endpoint}/oidc/token",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {basic_auth}",
        },
        data={
            "grant_type": "client_credentials",
            "resource": management_api_resource,
            "scope": "all",
        },
        timeout=10,
    )
    response.raise_for_status()

    payload = response.json()
    access_token = payload.get("access_token")
    expires_in = int(payload.get("expires_in") or 3600)

    if not isinstance(access_token, str) or not access_token:
        raise RuntimeError("Logto management API token response is missing access_token")

    _MANAGEMENT_ACCESS_TOKEN = access_token
    _MANAGEMENT_ACCESS_TOKEN_EXPIRES_AT = now + max(expires_in - 60, 60)
    _MANAGEMENT_ACCESS_TOKEN_RESOURCE = management_api_resource
    _MANAGEMENT_ACCESS_TOKEN_ENDPOINT = logto_endpoint
    return _MANAGEMENT_ACCESS_TOKEN


def _management_request(
    method: str,
    path: str,
    *,
    json: dict[str, object] | None = None,
) -> requests.Response:
    config = _get_management_config()
    if config is None:
        raise RuntimeError("Logto default role bootstrap is not configured")

    (
        logto_endpoint,
        management_app_id,
        management_app_secret,
        _,
        management_api_resource,
    ) = config

    access_token = _get_management_access_token(
        logto_endpoint,
        management_app_id,
        management_app_secret,
        management_api_resource,
    )

    response = requests.request(
        method,
        f"{logto_endpoint}{path}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=json,
        timeout=10,
    )

    if response.status_code == 401:
        access_token = _get_management_access_token(
            logto_endpoint,
            management_app_id,
            management_app_secret,
            management_api_resource,
            force_refresh=True,
        )
        response = requests.request(
            method,
            f"{logto_endpoint}{path}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=json,
            timeout=10,
        )

    response.raise_for_status()
    return response


def ensure_default_role_assigned(user_id: str) -> dict[str, bool]:
    config = _get_management_config()
    if config is None:
        return {
            "enabled": False,
            "assigned": False,
            "refresh_required": False,
        }

    (_, _, _, default_user_role_id, _) = config

    response = _management_request("GET", f"/api/users/{user_id}/roles")
    roles = response.json()

    if any(role.get("id") == default_user_role_id for role in roles if isinstance(role, dict)):
        return {
            "enabled": True,
            "assigned": False,
            "refresh_required": False,
        }

    logger.info("Assigning default Logto role %s to user %s", default_user_role_id, user_id)
    _management_request(
        "POST",
        f"/api/users/{user_id}/roles",
        json={"roleIds": [default_user_role_id]},
    )
    return {
        "enabled": True,
        "assigned": True,
        "refresh_required": True,
    }