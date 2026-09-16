import os
import unittest
from unittest import mock

from src.config import logto_auth, logto_endpoints


def _env(**values: str):
    return mock.patch.dict(os.environ, values, clear=False)


class LogtoEndpointsTest(unittest.TestCase):
    def test_internal_endpoint_falls_back_to_public(self):
        with _env(LOGTO_ENDPOINT="https://tenant.logto.app/", LOGTO_INTERNAL_ENDPOINT=""):
            self.assertEqual(
                logto_endpoints.get_internal_endpoint(), "https://tenant.logto.app"
            )

    def test_internal_endpoint_overrides_public(self):
        with _env(
            LOGTO_ENDPOINT="http://localhost:3011",
            LOGTO_INTERNAL_ENDPOINT="http://logto:3001/",
        ):
            self.assertEqual(logto_endpoints.get_public_endpoint(), "http://localhost:3011")
            self.assertEqual(logto_endpoints.get_internal_endpoint(), "http://logto:3001")

    def test_discovery_urls_are_moved_onto_the_internal_origin(self):
        with _env(
            LOGTO_ENDPOINT="http://localhost:3011",
            LOGTO_INTERNAL_ENDPOINT="http://logto:3001",
        ):
            self.assertEqual(
                logto_endpoints.to_internal_url("http://localhost:3011/oidc/jwks"),
                "http://logto:3001/oidc/jwks",
            )

    def test_foreign_urls_are_left_alone(self):
        with _env(
            LOGTO_ENDPOINT="http://localhost:3011",
            LOGTO_INTERNAL_ENDPOINT="http://logto:3001",
        ):
            self.assertEqual(
                logto_endpoints.to_internal_url("https://elsewhere.example/jwks"),
                "https://elsewhere.example/jwks",
            )

    def test_urls_are_untouched_without_an_override(self):
        with _env(LOGTO_ENDPOINT="http://localhost:3011", LOGTO_INTERNAL_ENDPOINT=""):
            self.assertEqual(
                logto_endpoints.to_internal_url("http://localhost:3011/oidc/jwks"),
                "http://localhost:3011/oidc/jwks",
            )


class LogtoAuthEndpointTest(unittest.TestCase):
    def setUp(self):
        logto_auth._JWKS_CLIENT = None
        logto_auth._JWKS_ENDPOINT = ""
        logto_auth._OPENID_CONFIG_CACHE = {}
        logto_auth._OPENID_CONFIG_ENDPOINT = ""
        logto_auth._OPENID_CONFIG_EXPIRES_AT = 0.0

    def test_auth_config_keeps_the_public_issuer_and_the_internal_origin(self):
        with _env(
            LOGTO_ENDPOINT="http://localhost:3011",
            LOGTO_INTERNAL_ENDPOINT="http://logto:3001",
            LOGTO_API_RESOURCE="https://api.asm2.local",
        ):
            public, internal, resource = logto_auth._ensure_auth_config()

        self.assertEqual(public, "http://localhost:3011")
        self.assertEqual(internal, "http://logto:3001")
        self.assertEqual(resource, "https://api.asm2.local")

    def test_jwks_client_dials_the_internal_origin(self):
        openid_config = {
            "issuer": "http://localhost:3011/oidc",
            "jwks_uri": "http://localhost:3011/oidc/jwks",
        }

        with _env(
            LOGTO_ENDPOINT="http://localhost:3011",
            LOGTO_INTERNAL_ENDPOINT="http://logto:3001",
        ):
            with mock.patch.object(
                logto_auth, "_get_openid_config", return_value=openid_config
            ):
                with mock.patch.object(logto_auth.jwt, "PyJWKClient") as jwks_client:
                    logto_auth._get_jwks_client("http://logto:3001")

        jwks_client.assert_called_once_with("http://logto:3001/oidc/jwks")

    def test_discovery_is_fetched_from_the_internal_origin(self):
        response = mock.Mock()
        response.json.return_value = {"issuer": "http://localhost:3011/oidc"}

        with mock.patch.object(
            logto_auth.requests, "get", return_value=response
        ) as get:
            logto_auth._get_openid_config("http://logto:3001")

        get.assert_called_once_with(
            "http://logto:3001/oidc/.well-known/openid-configuration", timeout=5
        )


if __name__ == "__main__":
    unittest.main()
