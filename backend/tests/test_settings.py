import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services import cognito


def test_auth_mode_is_case_insensitive():
    assert Settings(auth_mode=" Cognito ").auth_mode == "cognito"
    assert Settings(auth_mode="DEV").auth_mode == "dev"


def test_unknown_auth_mode_fails_fast():
    with pytest.raises(ValidationError):
        Settings(auth_mode="cognitto")


def test_capitalised_cognito_still_provisions_users(monkeypatch):
    s = Settings(auth_mode="Cognito", cognito_user_pool_id="us-east-1_pool", cognito_provision_users=True)
    monkeypatch.setattr(cognito, "get_settings", lambda: s)
    assert cognito._enabled() is True
