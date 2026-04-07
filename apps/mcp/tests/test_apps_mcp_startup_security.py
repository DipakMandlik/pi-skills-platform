from __future__ import annotations

from dataclasses import replace

import apps.mcp.main as main


def _set_test_settings(jwt_secret: str) -> None:
    main.settings = replace(main.settings, jwt_secret=jwt_secret)


def test_apps_mcp_startup_checks_reject_weak_jwt_secret() -> None:
    _set_test_settings("too-short")

    try:
        main._run_startup_checks()
        assert False, "Expected ValueError for weak JWT secret"
    except ValueError as exc:
        assert "JWT_SECRET" in str(exc)


def test_apps_mcp_startup_checks_reject_missing_jwt_secret() -> None:
    _set_test_settings("")

    try:
        main._run_startup_checks()
        assert False, "Expected ValueError for missing JWT secret"
    except ValueError as exc:
        assert "JWT_SECRET" in str(exc)


def test_apps_mcp_startup_checks_reject_placeholder_jwt_secret() -> None:
    _set_test_settings("change-me-in-production-please")

    try:
        main._run_startup_checks()
        assert False, "Expected ValueError for placeholder JWT secret"
    except ValueError as exc:
        assert "JWT_SECRET" in str(exc)


def test_apps_mcp_startup_checks_emit_structured_remediation_messages() -> None:
    for bad_value in ("", "too-short", "change-me-in-production-please"):
        _set_test_settings(bad_value)

        try:
            main._run_startup_checks()
            assert False, "Expected startup preflight validation error"
        except ValueError as exc:
            message = str(exc)
            assert "startup_preflight_failed" in message
            assert "code=JWT_SECRET_" in message
            assert "remediation='Set JWT_SECRET in .env.local" in message