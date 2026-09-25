"""Optional Cognito user provisioning when HR creates / deactivates employees."""

import logging

from ..config import get_settings

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    s = get_settings()
    return s.auth_mode == "cognito" and s.cognito_provision_users and bool(s.cognito_user_pool_id)


def _client():
    import boto3

    return boto3.client("cognito-idp", region_name=get_settings().cognito_region)


def create_user(email: str, first_name: str, last_name: str) -> str | None:
    """Creates the user and lets Cognito email a temporary password. Returns the user's sub."""
    if not _enabled():
        return None
    try:
        resp = _client().admin_create_user(
            UserPoolId=get_settings().cognito_user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "given_name", "Value": first_name},
                {"Name": "family_name", "Value": last_name},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        attrs = {a["Name"]: a["Value"] for a in resp["User"]["Attributes"]}
        return attrs.get("sub")
    except Exception as exc:  # noqa: BLE001
        if exc.__class__.__name__ == "UsernameExistsException":
            return None
        logger.exception("Cognito admin_create_user failed for %s", email)
        return None


def set_enabled(email: str, enabled: bool) -> None:
    if not _enabled():
        return
    try:
        fn = _client().admin_enable_user if enabled else _client().admin_disable_user
        fn(UserPoolId=get_settings().cognito_user_pool_id, Username=email)
    except Exception:  # noqa: BLE001
        logger.exception("Cognito enable/disable failed for %s", email)
