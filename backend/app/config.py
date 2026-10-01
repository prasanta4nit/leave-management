import json
from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LeaveDesk"
    environment: str = "dev"

    # Either a full SQLAlchemy URL, or a Secrets Manager ARN holding
    # {"username","password","host","port","dbname"} (RDS-managed secret format).
    database_url: str = "mysql+pymysql://leave:leave@localhost:3306/leave_mgmt"
    db_secret_arn: str = ""
    db_host: str = ""
    db_port: int = 3306
    db_name: str = "leave_mgmt"

    # "cognito" verifies Cognito JWTs; "dev" trusts the X-Dev-User header (local only!).
    auth_mode: str = "cognito"
    cognito_region: str = "us-east-1"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    cognito_provision_users: bool = True

    @field_validator("auth_mode")
    @classmethod
    def _auth_mode(cls, v: str) -> str:
        # "Cognito" in a .env must not silently turn off user provisioning (which checks == "cognito").
        mode = v.strip().lower()
        if mode not in ("cognito", "dev"):
            raise ValueError(f"AUTH_MODE must be 'cognito' or 'dev', got {v!r}")
        return mode

    email_enabled: bool = False
    ses_region: str = "us-east-1"
    ses_sender: str = "LeaveDesk <noreply@example.com>"

    frontend_url: str = "http://localhost:5173"
    # When set, the app URL is read from this SSM parameter (avoids a CloudFormation cycle).
    frontend_url_param: str = ""
    cors_origins: str = "http://localhost:5173"

    def app_url(self) -> str:
        if self.frontend_url_param:
            return _ssm_value(self.frontend_url_param)
        return self.frontend_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def resolved_database_url(self) -> str:
        if not self.db_secret_arn:
            return self.database_url
        import boto3

        secret = boto3.client("secretsmanager").get_secret_value(SecretId=self.db_secret_arn)
        s = json.loads(secret["SecretString"])
        # RDS-managed master secrets only hold username/password; host comes from DB_HOST.
        user, password = quote_plus(s["username"]), quote_plus(s["password"])
        host = s.get("host") or self.db_host
        port = s.get("port") or self.db_port
        name = s.get("dbname") or self.db_name
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"


@lru_cache
def _ssm_value(name: str) -> str:
    import boto3

    return boto3.client("ssm").get_parameter(Name=name)["Parameter"]["Value"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
