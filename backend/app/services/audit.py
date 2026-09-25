import json
from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog


def log(db: Session, actor_id: int | None, entity: str, entity_id: Any, action: str, details: dict | None = None) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            entity=entity,
            entity_id=None if entity_id is None else str(entity_id),
            action=action,
            details=json.dumps(details, default=str) if details else None,
        )
    )
