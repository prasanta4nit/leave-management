"""Authentication (Cognito JWT) and role-based authorization dependencies."""

from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import Employee, EmployeeStatus


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    s = get_settings()
    url = f"https://cognito-idp.{s.cognito_region}.amazonaws.com/{s.cognito_user_pool_id}/.well-known/jwks.json"
    return jwt.PyJWKClient(url, cache_keys=True)


def verify_cognito_token(token: str) -> dict:
    s = get_settings()
    issuer = f"https://cognito-idp.{s.cognito_region}.amazonaws.com/{s.cognito_user_pool_id}"
    try:
        key = _jwks_client().get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=issuer, options={"verify_aud": False})
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    token_use = claims.get("token_use")
    if token_use == "id":
        if claims.get("aud") != s.cognito_app_client_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token audience mismatch")
    elif token_use == "access":
        if claims.get("client_id") != s.cognito_app_client_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token client mismatch")
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unsupported token")
    return claims


def get_current_user(request: Request, db: Session = Depends(get_db)) -> Employee:
    s = get_settings()
    emp: Employee | None = None

    if s.auth_mode == "dev":
        email = request.headers.get("X-Dev-User")
        if not email:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing X-Dev-User header (dev auth mode)")
        emp = db.scalar(select(Employee).where(func.lower(Employee.email) == email.lower()))
    else:
        header = request.headers.get("Authorization", "")
        if not header.lower().startswith("bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
        claims = verify_cognito_token(header[7:].strip())
        sub = claims.get("sub")
        emp = db.scalar(select(Employee).where(Employee.cognito_sub == sub))
        if emp is None and claims.get("email"):
            # First login: link the Cognito identity to the employee record by email.
            emp = db.scalar(select(Employee).where(func.lower(Employee.email) == claims["email"].lower()))
            if emp is not None and emp.cognito_sub is None:
                emp.cognito_sub = sub
                db.commit()

    if emp is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No employee profile is linked to this account")
    if emp.status != EmployeeStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is inactive")
    return emp


def require_hr(user: Employee = Depends(get_current_user)) -> Employee:
    if not user.is_hr:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "HR or Admin access required")
    return user


def require_admin(user: Employee = Depends(get_current_user)) -> Employee:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def subordinate_ids(db: Session, manager_id: int) -> set[int]:
    """All direct and indirect reports of a manager."""
    rows = db.execute(select(Employee.id, Employee.manager_id)).all()
    children: dict[int, list[int]] = {}
    for eid, mid in rows:
        if mid is not None:
            children.setdefault(mid, []).append(eid)
    result: set[int] = set()
    stack = list(children.get(manager_id, []))
    while stack:
        eid = stack.pop()
        if eid in result:
            continue
        result.add(eid)
        stack.extend(children.get(eid, []))
    return result


def is_manager(db: Session, emp: Employee) -> bool:
    return db.scalar(
        select(func.count()).select_from(Employee).where(
            Employee.manager_id == emp.id, Employee.status == EmployeeStatus.ACTIVE.value
        )
    ) > 0


def can_view_private(db: Session, viewer: Employee, target_id: int) -> bool:
    """Leave balances / history are visible to self, the management chain and HR."""
    return viewer.id == target_id or viewer.is_hr or target_id in subordinate_ids(db, viewer.id)
