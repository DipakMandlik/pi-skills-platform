"""Tests for Sentry integration in apps/api/."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from apps.api.core.config import Settings


class TestSentryConfig:
    def test_sentry_dsn_loaded_from_env(self):
        with patch.dict(os.environ, {"SENTRY_DSN": "https://test@sentry.io/123"}, clear=False):
            settings = Settings(sentry_dsn=os.getenv("SENTRY_DSN", ""))
            assert settings.sentry_dsn == "https://test@sentry.io/123"

    def test_missing_sentry_dsn_warns_not_raises(self):
        settings = Settings(
            app_env="production",
            sentry_dsn="",
            redis_url="redis://localhost:6379",
            postgres_dsn="postgresql+asyncpg://user:pass@localhost/db",
        )
        with patch("apps.api.core.config.logger") as mock_logger:
            from apps.api.core.config import validate_production_settings

            validate_production_settings(settings)
            mock_logger.warning.assert_called_once()

    def test_sentry_dsn_not_required_in_dev(self):
        settings = Settings(app_env="development", sentry_dsn="")
        from apps.api.core.config import validate_production_settings

        validate_production_settings(settings)


class TestSentryContextMiddleware:
    @pytest.mark.asyncio
    async def test_middleware_attaches_request_id_tag(self):
        from apps.api.main import SentryContextMiddleware

        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url.path = "/health"
        mock_request.state.request_id = "test-req-123"
        mock_request.state.user = None

        mock_response = MagicMock()
        mock_call_next = AsyncMock(return_value=mock_response)

        with patch("apps.api.main.sentry_sdk") as mock_sentry:
            mock_scope = MagicMock()
            mock_sentry.new_scope.return_value.__enter__ = MagicMock(return_value=mock_scope)
            mock_sentry.new_scope.return_value.__exit__ = MagicMock(return_value=False)

            middleware = SentryContextMiddleware(MagicMock())
            await middleware.dispatch(mock_request, mock_call_next)

            mock_scope.set_tag.assert_any_call("http.method", "GET")
            mock_scope.set_tag.assert_any_call("http.route", "/health")
            mock_scope.set_tag.assert_any_call("request_id", "test-req-123")

    @pytest.mark.asyncio
    async def test_middleware_attaches_user_context(self):
        from apps.api.main import SentryContextMiddleware

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/auth/me"
        mock_request.state.request_id = None
        mock_user = MagicMock()
        mock_user.user_id = "user-456"
        mock_user.email = "test@example.com"
        mock_request.state.user = mock_user

        mock_response = MagicMock()
        mock_call_next = AsyncMock(return_value=mock_response)

        with patch("apps.api.main.sentry_sdk") as mock_sentry:
            mock_scope = MagicMock()
            mock_sentry.new_scope.return_value.__enter__ = MagicMock(return_value=mock_scope)
            mock_sentry.new_scope.return_value.__exit__ = MagicMock(return_value=False)

            middleware = SentryContextMiddleware(MagicMock())
            await middleware.dispatch(mock_request, mock_call_next)

            mock_scope.set_user.assert_called_once_with(
                {"id": "user-456", "email": "test@example.com"}
            )


class TestSentryInit:
    def test_sentry_init_includes_environment_and_release(self):
        with patch.dict(os.environ, {"GIT_COMMIT_SHA": "abc123"}, clear=False):
            with patch("apps.api.main.sentry_sdk") as mock_sentry:
                settings = Settings(
                    sentry_dsn="https://test@sentry.io/123",
                    app_env="staging",
                )
                mock_sentry.init.reset_mock()

                mock_sentry.init(
                    dsn=settings.sentry_dsn,
                    environment=settings.app_env,
                    release=os.getenv("GIT_COMMIT_SHA", "dev"),
                    traces_sample_rate=0.0,
                    send_default_pii=False,
                )

                mock_sentry.init.assert_called_once()
                call_kwargs = mock_sentry.init.call_args.kwargs
                assert call_kwargs["environment"] == "staging"
                assert call_kwargs["release"] == "abc123"
