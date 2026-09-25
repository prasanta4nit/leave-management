from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, subordinate_ids
from ..database import get_db
from ..models import ApprovalStage, Employee, LeaveRequest, RequestHistory, RequestStatus
from ..schemas import Decision
from ..services import approvals, notifications

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _load(model):
    opts = [
        selectinload(model.employee).selectinload(Employee.designation),
        selectinload(model.employee).selectinload(Employee.department),
        selectinload(model.current_approver),
        selectinload(model.decided_by),
    ]
    if model is LeaveRequest:
        opts.append(selectinload(LeaveRequest.leave_type))
    return opts


def pending_for(db: Session, user: Employee) -> list[dict]:
    items: list[dict] = []
    for kind, model in approvals.MODELS.items():
        stmt = select(model).options(*_load(model)).where(model.status == RequestStatus.PENDING.value)
        # HR sees everything pending; items still at manager stage are flagged so HR can override.
        if not user.is_hr:
            stmt = stmt.where(model.approval_stage == ApprovalStage.MANAGER.value, model.current_approver_id == user.id)
        for r in db.scalars(stmt):
            if r.employee_id == user.id and not user.is_admin:
                continue
            allowed, override = approvals.can_act(user, r)
            items.append({**S.any_request(kind, r), "can_override": override, "awaiting_me": allowed and not override})
    items.sort(key=lambda x: x["applied_at"])
    return items


@router.get("/pending")
def pending(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    return pending_for(db, user)


@router.post("/{kind}/{request_id}/{action}")
def decide(
    kind: str,
    request_id: int,
    action: str,
    body: Decision,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    kind = kind.upper().replace("-", "_")
    if kind not in approvals.MODELS or action not in ("approve", "reject"):
        raise HTTPException(404, "Unknown approval action")
    if action == "reject" and not (body.comment and body.comment.strip()):
        raise HTTPException(400, "Please provide a reason for rejection")
    model = approvals.MODELS[kind]
    req = db.scalar(select(model).options(*_load(model)).where(model.id == request_id))
    if req is None:
        raise HTTPException(404, "Request not found")
    try:
        outcome = approvals.decide(db, kind, req, user, action == "approve", body.comment)
    except approvals.ApprovalError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, str(exc)) from exc
    db.commit()
    background.add_task(notifications.send, notifications.request_decided(db, kind, req, outcome, user))
    return {"outcome": outcome, "request": S.any_request(kind, req)}


@router.get("/history")
def approval_history(
    kind: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Audit trail. HR sees all; managers see actions on their team's requests and their own actions."""
    stmt = select(RequestHistory).options(selectinload(RequestHistory.actor)).order_by(RequestHistory.created_at.desc())
    if kind:
        stmt = stmt.where(RequestHistory.request_kind == kind.upper())
    rows = db.scalars(stmt.limit(min(limit, 1000) * (1 if user.is_hr else 5))).all()

    # Resolve request owners for display & visibility filtering.
    owners: dict[tuple[str, int], object] = {}
    for k, model in approvals.MODELS.items():
        ids = {h.request_id for h in rows if h.request_kind == k}
        if ids:
            for r in db.scalars(select(model).options(*_load(model)).where(model.id.in_(ids))):
                owners[(k, r.id)] = r
    visible = None if user.is_hr else subordinate_ids(db, user.id) | {user.id}

    result = []
    for h in rows:
        req = owners.get((h.request_kind, h.request_id))
        if req is None:
            continue
        if visible is not None and req.employee_id not in visible and h.actor_id != user.id:
            continue
        result.append({**S.history(h), "request": S.any_request(h.request_kind, req)})
        if len(result) >= limit:
            break
    return result

