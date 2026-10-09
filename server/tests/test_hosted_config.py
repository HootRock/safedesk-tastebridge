from hackathon_core.config import Settings


def test_local_defaults_and_new_hosted_defaults_remain_safe():
    config = Settings()
    assert config.model_provider == "codex"
    assert config.model_name == "gpt-6-luna" and config.codex_enabled is False
    assert config.public_hosting is False
    assert config.groq_model_name == "openai/gpt-oss-20b"
    assert config.groq_api_key == "" and config.remote_db_url == "" and config.remote_db_auth_token == ""
    assert config.daily_model_limit == 100 and config.daily_qloo_limit == 500


def test_hosted_settings_are_loaded_from_explicit_environment(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("hackathon_core.config.os.environ", {
        "MODEL_PROVIDER": "groq", "GROQ_API_KEY": "test-key", "GROQ_MODEL_NAME": "openai/gpt-oss-20b",
        "REMOTE_DB_URL": "libsql://test.turso.io", "REMOTE_DB_AUTH_TOKEN": "test-token",
        "ALLOWED_HOSTS": "example.onrender.com, localhost ", "DAILY_MODEL_LIMIT": "80", "DAILY_QLOO_LIMIT": "400",
        "PUBLIC_HOSTING": "true",
    })
    config = Settings.from_env()
    assert config.model_provider == "groq" and config.groq_api_key == "test-key"
    assert config.remote_db_url == "libsql://test.turso.io" and config.remote_db_auth_token == "test-token"
    assert config.allowed_hosts == ("example.onrender.com", "localhost")
    assert config.daily_model_limit == 80 and config.daily_qloo_limit == 400 and config.public_hosting is True


def test_server_credentials_are_not_in_settings_representation():
    config = Settings(groq_api_key="groq-private", qloo_api_key="qloo-private", remote_db_auth_token="db-private")
    for value in ("groq-private", "qloo-private", "db-private"):
        assert value not in repr(config)


def test_render_hostname_is_used_when_allowed_hosts_are_not_explicit(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("hackathon_core.config.os.environ", {"PUBLIC_HOSTING": "true", "RENDER_EXTERNAL_HOSTNAME": "judge-demo.onrender.com"})
    assert Settings.from_env().allowed_hosts == ("judge-demo.onrender.com",)


def test_public_environment_does_not_read_optional_local_env(monkeypatch):
    monkeypatch.setattr("hackathon_core.config.os.environ", {"PUBLIC_HOSTING": "true"})

    def unexpected_read(*args, **kwargs):
        raise AssertionError("Public settings must use only process environment")

    monkeypatch.setattr("hackathon_core.config.Path.is_file", unexpected_read)
    assert Settings.from_env().allowed_hosts == ()


def test_cloudflare_environment_is_explicit_and_token_is_not_in_repr(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("hackathon_core.config.os.environ", {
        "PUBLIC_HOSTING": "true", "MODEL_PROVIDER": "cloudflare",
        "CLOUDFLARE_ACCOUNT_ID": "0123456789abcdef0123456789abcdef",
        "CLOUDFLARE_API_TOKEN": "test-cloudflare-private",
        "CLOUDFLARE_MODEL_NAME": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    })
    config = Settings.from_env()
    assert config.model_provider == "cloudflare"
    assert config.cloudflare_account_id == "0123456789abcdef0123456789abcdef"
    assert config.cloudflare_api_token == "test-cloudflare-private"
    assert config.cloudflare_model_name == "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    assert "test-cloudflare-private" not in repr(config)


def test_cloudflare_defaults_remain_unconfigured_without_affecting_local_codex():
    config = Settings()
    assert config.model_provider == "codex" and config.cloudflare_account_id == ""
    assert config.cloudflare_api_token == ""
    assert config.cloudflare_model_name == "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
