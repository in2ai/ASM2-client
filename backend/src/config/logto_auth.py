import os
import time
from dataclasses import dataclass
from typing import Any

import jwt
import requests
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


_OPENID_CONFIG_TTL_SECONDS = 3600
_OPENID_CONFIG_CACHE: dict[str, Any] = {}
_OPENID_CONFIG_EXPIRES_AT = 0.0
_OPENID_CONFIG_ENDPOINT = ""
_JWKS_CLIENT: jwt.PyJWKClient | None = None
_JWKS_ENDPOINT = ""

security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthInfo:
    sub: str
    role: str
    scopes: list[str]
    audience: list[str]


def _ensure_auth_config() -> tuple[str, str]:
    logto_endpoint = (os.getenv("LOGTO_ENDPOINT") or "").rstrip("/")
    logto_api_resource = (os.getenv("LOGTO_API_RESOURCE") or "").strip()

    if not logto_endpoint:
        raise RuntimeError("LOGTO_ENDPOINT is required for strict auth")

    if not logto_api_resource:
        raise RuntimeError("LOGTO_API_RESOURCE is required for strict auth")

    return logto_endpoint, logto_api_resource


def _get_openid_config(logto_endpoint: str) -> dict[str, Any]:
    global _OPENID_CONFIG_CACHE
    global _OPENID_CONFIG_EXPIRES_AT
    global _OPENID_CONFIG_ENDPOINT

    now = time.time()
    if (
        _OPENID_CONFIG_CACHE
        and now < _OPENID_CONFIG_EXPIRES_AT
        and _OPENID_CONFIG_ENDPOINT == logto_endpoint
    ):
        return _OPENID_CONFIG_CACHE

    well_known_url = f"{logto_endpoint}/oidc/.well-known/openid-configuration"
    response = requests.get(well_known_url, timeout=5)
    response.raise_for_status()

    _OPENID_CONFIG_CACHE = response.json()
    _OPENID_CONFIG_ENDPOINT = logto_endpoint
    _OPENID_CONFIG_EXPIRES_AT = now + _OPENID_CONFIG_TTL_SECONDS
    return _OPENID_CONFIG_CACHE


def _get_jwks_client(logto_endpoint: str) -> jwt.PyJWKClient:
    global _JWKS_CLIENT
    global _JWKS_ENDPOINT

    if _JWKS_CLIENT is not None and _JWKS_ENDPOINT == logto_endpoint:
        return _JWKS_CLIENT

    openid_config = _get_openid_config(logto_endpoint)
    jwks_uri = openid_config.get("jwks_uri")
    if not jwks_uri:
        jwks_uri = f"{logto_endpoint}/oidc/jwks"

    _JWKS_CLIENT = jwt.PyJWKClient(jwks_uri)
    _JWKS_ENDPOINT = logto_endpoint
    return _JWKS_CLIENT


def _extract_role(payload: dict[str, Any]) -> str:
    organization_roles = payload.get("organization_roles")

    if isinstance(organization_roles, list) and organization_roles:
        first_role = organization_roles[0]
        if isinstance(first_role, str) and ":" in first_role:
            return first_role.split(":", 1)[1]

    return "user"


def validate_token(token: str) -> AuthInfo:
    try:
        logto_endpoint, logto_api_resource = _ensure_auth_config()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    openid_config = _get_openid_config(logto_endpoint)
    issuer = str(openid_config.get("issuer") or f"{logto_endpoint}/oidc")

    try:
        signing_key = _get_jwks_client(logto_endpoint).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            audience=logto_api_resource,
            options={"require": ["exp", "iss", "sub"]},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve Logto OpenID configuration",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Token validation failed: {exc}",
        ) from exc

    raw_scopes = payload.get("scope")
    if isinstance(raw_scopes, str) and raw_scopes.strip():
        scopes = raw_scopes.split()
    else:
        scopes = []

    raw_aud = payload.get("aud", [])
    if isinstance(raw_aud, str):
        audience = [raw_aud]
    elif isinstance(raw_aud, list):
        audience = [str(aud) for aud in raw_aud]
    else:
        audience = []

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(status_code=401, detail="Token subject is missing")

    return AuthInfo(
        sub=sub,
        role=_extract_role(payload),
        scopes=scopes,
        audience=audience,
    )


def require_scopes(required_scopes: list[str]):
    async def _dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(security),
    ) -> AuthInfo:
        if not credentials or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Missing bearer token")

        auth_info = validate_token(credentials.credentials)
        missing_scopes = [
            scope for scope in required_scopes if scope not in auth_info.scopes
        ]
        if missing_scopes:
            raise HTTPException(
                status_code=403,
                detail=f"Missing required scopes: {', '.join(missing_scopes)}",
            )

        return auth_info

    return _dependency
