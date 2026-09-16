from src.config.env import get_env


def get_public_endpoint() -> str:
    """Browser-facing Logto origin, and the base of the OIDC issuer."""
    return str(get_env("LOGTO_ENDPOINT", "")).rstrip("/")


def get_internal_endpoint() -> str:
    """Origin the backend dials, which falls back to the public one when unset.

    The browser and a containerized backend do not share a network, so the URL
    the SPA redirects to is rarely the URL the backend can reach. Setting
    LOGTO_INTERNAL_ENDPOINT keeps LOGTO_ENDPOINT as the public issuer while the
    backend talks to Logto over the Docker network.
    """
    internal = str(get_env("LOGTO_INTERNAL_ENDPOINT", "")).rstrip("/")

    return internal or get_public_endpoint()


def to_internal_url(url: str) -> str:
    """Move an absolute URL advertised by Logto onto the internal origin.

    Logto builds the URLs in its discovery document from its own ENDPOINT, so
    they point at the public origin even when the document was fetched
    internally. Anything outside that origin is left untouched.
    """
    public = get_public_endpoint()
    internal = get_internal_endpoint()

    if not public or internal == public or not url.startswith(public):
        return url

    return internal + url[len(public) :]
