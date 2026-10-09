import os
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class Settings:
    data_dir: str = "./data"
    mode: str = "live"
    model_name: str = "gpt-6-luna"
    codex_enabled: bool = False
    codex_executable: str = "codex"
    qloo_api_key: str = field(default="", repr=False)
    qloo_base_url: str = "https://hackathon.api.qloo.com"
    public_hosting: bool = False
    model_provider: str = "codex"
    groq_api_key: str = field(default="", repr=False)
    groq_model_name: str = "openai/gpt-oss-20b"
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = field(default="", repr=False)
    cloudflare_model_name: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    remote_db_url: str = ""
    remote_db_auth_token: str = field(default="", repr=False)
    allowed_hosts: tuple[str, ...] = ("*",)
    daily_model_limit: int = 100
    daily_qloo_limit: int = 500
    @classmethod
    def from_env(cls):
        # Hosted secrets come only from the process environment. The optional
        # local file preserves the original local setup without overriding it.
        file=Path(".env")
        if os.getenv("PUBLIC_HOSTING", "false").lower() != "true" and file.is_file():
            for line in file.read_text(encoding="utf-8").splitlines():
                if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                    k,v=line.split("=",1); os.environ.setdefault(k.strip(),v.strip())
        public_hosting = os.getenv("PUBLIC_HOSTING", "false").lower() == "true"
        default_hosts = os.getenv("RENDER_EXTERNAL_HOSTNAME", "" if public_hosting else "*")
        return cls(
            data_dir=os.getenv("DATA_DIR", "./data"),
            mode=os.getenv("APP_MODE", "live"),
            model_name=os.getenv("MODEL_NAME", "gpt-6-luna"),
            codex_enabled=os.getenv("CODEX_ENABLED", "false").lower() == "true",
            codex_executable=os.getenv("CODEX_EXECUTABLE", "codex"),
            qloo_api_key=os.getenv("QLOO_API_KEY", ""),
            qloo_base_url=os.getenv("QLOO_BASE_URL", "https://hackathon.api.qloo.com"),
            public_hosting=public_hosting,
            model_provider=os.getenv("MODEL_PROVIDER", "codex").strip().lower(),
            groq_api_key=os.getenv("GROQ_API_KEY", ""),
            groq_model_name=os.getenv("GROQ_MODEL_NAME", "openai/gpt-oss-20b"),
            cloudflare_account_id=os.getenv("CLOUDFLARE_ACCOUNT_ID", ""),
            cloudflare_api_token=os.getenv("CLOUDFLARE_API_TOKEN", ""),
            cloudflare_model_name=os.getenv("CLOUDFLARE_MODEL_NAME", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
            remote_db_url=os.getenv("REMOTE_DB_URL", ""),
            remote_db_auth_token=os.getenv("REMOTE_DB_AUTH_TOKEN", ""),
            allowed_hosts=tuple(host.strip() for host in os.getenv("ALLOWED_HOSTS", default_hosts).split(",") if host.strip()),
            daily_model_limit=int(os.getenv("DAILY_MODEL_LIMIT", "100")),
            daily_qloo_limit=int(os.getenv("DAILY_QLOO_LIMIT", "500")),
        )
