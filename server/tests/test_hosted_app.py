"""Offline public wiring checks; no hosted credentials or external requests."""
import pytest
from fastapi.testclient import TestClient
from hackathon_api import main
from hackathon_core.config import Settings
from hackathon_core.database import Database, DatabaseError
from hackathon_core.hosted import GroqGateway


def public_settings(tmp_path, **changes):
    values = dict(data_dir=str(tmp_path), public_hosting=True, model_provider="groq",
                  groq_api_key="test-not-a-real-key", remote_db_url="libsql://demo-test.turso.io",
                  remote_db_auth_token="test-token", allowed_hosts=("demo.example.test",))
    values.update(changes)
    return Settings(**values)


@pytest.fixture
def local_database_for_public_wiring(monkeypatch):
    # A persistent temporary SQLite db replaces only the remote network boundary.
    monkeypatch.setattr(main, "Database", lambda path, **kwargs: Database(path))


def test_public_codex_is_rejected_at_startup(tmp_path):
    with pytest.raises(ValueError, match="public_provider_required"):
        main.create_app(Settings(data_dir=str(tmp_path), public_hosting=True, codex_enabled=True))


@pytest.mark.parametrize("hosts", [(), ("*",), ("demo.example.test", "*.example.test")])
def test_public_host_allowlist_fails_closed(tmp_path, hosts):
    with pytest.raises(ValueError, match="public_host_required"):
        main.create_app(public_settings(tmp_path, allowed_hosts=hosts))


def test_public_missing_remote_database_fails_closed(tmp_path):
    with pytest.raises(DatabaseError, match="invalid_remote_config"):
        main.create_app(public_settings(tmp_path, remote_db_url="", remote_db_auth_token=""))


def test_public_health_session_cookie_and_host_guard(tmp_path, local_database_for_public_wiring):
    app = main.create_app(public_settings(tmp_path))
    assert isinstance(app.state.model, GroqGateway)
    assert app.state.qloo.quota is app.state.quota
    with TestClient(app, base_url="https://demo.example.test") as client:
        health = client.get("/api/health").json()
        assert health["model"] == "groq" and health["model_enabled"]
        assert health["public_hosting"]
        assert "test-not-a-real-key" not in str(health)
        response = client.get("/api/session")
        assert response.json()["model_name"] == "openai/gpt-oss-20b"
        assert "Secure" in response.headers["set-cookie"]
        assert "HttpOnly" in response.headers["set-cookie"]
        assert client.get("/api/health", headers={"Host": "attacker.example"}).status_code == 400


def test_public_origin_checks_do_not_depend_on_proxy_scheme(tmp_path, local_database_for_public_wiring):
    app = main.create_app(public_settings(tmp_path))
    with TestClient(app, base_url="http://demo.example.test") as client:
        token = client.get("/api/session").json()["action_token"]
        cookie = "hackathon_session=" + client.cookies.get("hackathon_session")
        body = {"members": [{"member_id":name,"nickname":name,"entity_ids":["not-confirmed"]} for name in ("a","b")]}
        # Render terminates browser TLS before the internal HTTP request. A valid
        # body lets the route's origin check run; the secure cookie is injected
        # only to model that proxy boundary in this offline test.
        bad = client.post("/api/tastebridge/groups", json=body,
                          headers={"Cookie":cookie,"X-Action-Token": token, "Origin": "https://attacker.example"})
        assert bad.status_code == 403
        same = client.post("/api/tastebridge/groups", json=body,
                           headers={"Cookie":cookie,"X-Action-Token": token, "Origin": "https://demo.example.test"})
        assert same.status_code == 400 and same.json()["detail"]=="unconfirmed_entity"


def test_unknown_model_provider_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="invalid_model_provider"):
        main.create_app(Settings(data_dir=str(tmp_path), model_provider="unknown"))


@pytest.mark.parametrize("token,account,ready", [
    ("test-cloudflare-token", "0123456789abcdef0123456789abcdef", True),
    ("", "0123456789abcdef0123456789abcdef", False),
    ("test-cloudflare-token", "../unvalidated-account", False),
])
def test_cloudflare_public_health_and_session_are_truthful_without_exposing_credentials(tmp_path, local_database_for_public_wiring, token, account, ready):
    from hackathon_core.hosted import CloudflareGateway
    config = public_settings(tmp_path, model_provider="cloudflare", cloudflare_api_token=token,
                             cloudflare_account_id=account)
    app = main.create_app(config)
    assert isinstance(app.state.model, CloudflareGateway)
    with TestClient(app, base_url="https://demo.example.test") as client:
        for endpoint in ("/api/health", "/api/session"):
            data = client.get(endpoint).json()
            assert data["model"] == "cloudflare" and data["cloudflare_ready"] is ready
            assert data["model_enabled"] is ready and data["public_hosting"]
            assert data["model_name"] == "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
            assert "test-cloudflare-token" not in str(data) and account not in str(data)
            assert "cloudflare_api_token" not in data and "cloudflare_account_id" not in data
