"""Email notifications via Amazon SES.

Builders return plain `Email` objects (no ORM state) so they can be dispatched from a
FastAPI BackgroundTask after the DB transaction has committed.
"""

import html
import logging
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Employee, LeaveType, RequestKind, RequestStatus, utcnow
from . import approvals, settings_service

logger = logging.getLogger(__name__)

KIND_LABEL = {
    RequestKind.LEAVE.value: "Leave request",
    RequestKind.WFH.value: "Work-from-home request",
}
KIND_PATH = {
    RequestKind.LEAVE.value: "/leaves",
    RequestKind.WFH.value: "/wfh",
}


@dataclass
class Email:
    to: list[str]
    subject: str
    html: str
    text: str
    cc: list[str] = field(default_factory=list)


def _fmt_days(d) -> str:
    v = float(d)
    return f"{v:g} day" + ("" if v == 1 else "s")


def _render(company: str, title: str, intro: str, rows: list[tuple[str, str]], cta_label: str, cta_path: str) -> tuple[str, str]:
    url = get_settings().app_url().rstrip("/") + cta_path
    row_html = "".join(
        f'<tr><td style="padding:6px 12px;color:#64748b;white-space:nowrap">{html.escape(k)}</td>'
        f'<td style="padding:6px 12px;color:#0f172a">{html.escape(v)}</td></tr>'
        for k, v in rows
    )
    body = f"""<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4f46e5;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">{html.escape(company)} · LeaveDesk</td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 8px;color:#0f172a;font-size:20px">{html.escape(title)}</h2>
<p style="margin:0 0 16px;color:#334155;line-height:1.5">{html.escape(intro)}</p>
<table cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;width:100%">{row_html}</table>
<p style="margin:24px 0 0"><a href="{url}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">{html.escape(cta_label)}</a></p>
</td></tr>
<tr><td style="padding:16px 24px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0">This is an automated message from LeaveDesk. Please do not reply.</td></tr>
</table></td></tr></table></body></html>"""
    text = f"{title}\n\n{intro}\n\n" + "\n".join(f"{k}: {v}" for k, v in rows) + f"\n\n{cta_label}: {url}\n"
    return body, text


def _describe(db: Session, kind: str, req) -> list[tuple[str, str]]:
    emp = db.get(Employee, req.employee_id)
    rows = [("Employee", f"{emp.full_name} ({emp.employee_code})")]
    if kind == RequestKind.LEAVE.value:
        lt = db.get(LeaveType, req.leave_type_id)
        dates = req.start_date.strftime("%a, %d %b %Y")
        if req.end_date != req.start_date:
            dates += " – " + req.end_date.strftime("%a, %d %b %Y")
        duration = _fmt_days(req.total_days)
        if req.duration_type == "HALF_DAY":
            duration += f" ({(req.half_day_session or '').replace('_', ' ').title()})"
        rows += [("Leave type", lt.name), ("Dates", dates), ("Duration", duration)]
    else:
        dates = req.start_date.strftime("%a, %d %b %Y")
        if req.end_date != req.start_date:
            dates += " – " + req.end_date.strftime("%a, %d %b %Y")
        rows += [("Dates", dates), ("Working days", _fmt_days(req.total_days))]
    if req.reason:
        rows.append(("Reason", req.reason))
    return rows


def _company(db: Session) -> str:
    return settings_service.get(db, "company_name")


def _request_cc(kind: str, req, exclude: list[str]) -> list[str]:
    """People the applicant chose to copy (leave only), minus anyone already addressed."""
    if kind != RequestKind.LEAVE.value:
        return []
    skip = {e.lower() for e in exclude}
    return [e for e in (req.cc_emails or []) if e.lower() not in skip]


def request_submitted(db: Session, kind: str, req, modified: bool = False, include_request_cc: bool = True) -> list[Email]:
    approvers = approvals.approvers_for(db, req)
    if not approvers:
        return []
    emp = db.get(Employee, req.employee_id)
    label = KIND_LABEL[kind]
    verb = "updated" if modified else "submitted"
    title = f"{label} {verb} by {emp.full_name}"
    intro = f"{emp.full_name} has {verb} a {label.lower()} that needs your approval."
    body, text = _render(_company(db), title, intro, _describe(db, kind, req), "Review request", "/approvals")
    to = [a.email for a in approvers]
    cc: list[str] = []
    if kind == RequestKind.LEAVE.value and settings_service.get(db, "notify_hr_on_leave"):
        cc = [h.email for h in approvals.hr_approvers(db, exclude_id=emp.id) if h not in approvers]
    if include_request_cc:
        cc += _request_cc(kind, req, exclude=to + cc + [emp.email])
    return [Email(to=to, cc=cc, subject=f"[Action required] {title}", html=body, text=text)]


def request_decided(db: Session, kind: str, req, outcome: str, actor: Employee) -> list[Email]:
    emp = db.get(Employee, req.employee_id)
    label = KIND_LABEL[kind]
    rows = _describe(db, kind, req)
    emails: list[Email] = []
    if outcome == "ESCALATED":
        rows.append(("Manager approval", actor.full_name))
        # HR's "please approve" email: CC'd colleagues hear about the outcome below instead.
        emails += request_submitted(db, kind, req, include_request_cc=False)
        title = f"Your {label.lower()} was approved by your manager"
        intro = f"{actor.full_name} approved your request. It is now awaiting final approval from HR."
    else:
        word = "approved" if outcome == RequestStatus.APPROVED.value else "rejected"
        title = f"Your {label.lower()} was {word}"
        intro = f"{actor.full_name} has {word} your {label.lower()}."
        if req.decision_comment:
            rows.append(("Comment", req.decision_comment))
    body, text = _render(_company(db), title, intro, rows, "View request", KIND_PATH[kind])
    emails.append(Email(to=[emp.email], cc=_request_cc(kind, req, exclude=[emp.email]), subject=title, html=body, text=text))
    return emails


def request_cancelled(db: Session, kind: str, req, actor: Employee, notify: list[Employee]) -> list[Email]:
    emp = db.get(Employee, req.employee_id)
    label = KIND_LABEL[kind]
    rows = _describe(db, kind, req)
    if req.cancel_reason:
        rows.append(("Cancellation reason", req.cancel_reason))
    emails: list[Email] = []
    recipients = sorted({e.email for e in notify if e and e.id != actor.id})
    cc = _request_cc(kind, req, exclude=recipients + [emp.email, actor.email])
    if recipients:
        title = f"{label} cancelled by {actor.full_name}"
        intro = f"The following {label.lower()} for {emp.full_name} has been cancelled."
        body, text = _render(_company(db), title, intro, rows, "Open LeaveDesk", "/approvals")
        emails.append(Email(to=recipients, cc=cc, subject=title, html=body, text=text))
        cc = []  # copied once
    if actor.id != emp.id:
        title = f"Your {label.lower()} was cancelled"
        body, text = _render(_company(db), title, f"{actor.full_name} cancelled your request.", rows, "View request", KIND_PATH[kind])
        emails.append(Email(to=[emp.email], cc=cc, subject=title, html=body, text=text))
    elif cc:
        # Employee cancelled with no approver left to tell: still let the CC'd people know.
        title = f"{label} cancelled by {emp.full_name}"
        body, text = _render(_company(db), title, f"{emp.full_name} cancelled this {label.lower()}.", rows, "Open LeaveDesk", "/")
        emails.append(Email(to=cc, subject=title, html=body, text=text))
    return emails


def send(emails: list[Email]) -> None:
    settings = get_settings()
    if not emails:
        return
    if not settings.email_enabled:
        for e in emails:
            logger.info("[email disabled] to=%s cc=%s subject=%s", e.to, e.cc, e.subject)
        return
    import boto3

    client = boto3.client("ses", region_name=settings.ses_region)
    for e in emails:
        try:
            dest = {"ToAddresses": e.to}
            if e.cc:
                dest["CcAddresses"] = e.cc
            client.send_email(
                Source=settings.ses_sender,
                Destination=dest,
                Message={
                    "Subject": {"Data": e.subject, "Charset": "UTF-8"},
                    "Body": {"Html": {"Data": e.html, "Charset": "UTF-8"}, "Text": {"Data": e.text, "Charset": "UTF-8"}},
                },
            )
        except Exception:  # noqa: BLE001 - never fail a request because an email bounced
            logger.exception("Failed to send email to %s", e.to)


def send_reminders(db: Session) -> int:
    """Remind approvers about requests pending longer than `reminder_after_hours`."""
    hours = int(settings_service.get(db, "reminder_after_hours") or 24)
    cutoff = utcnow() - timedelta(hours=hours)
    emails: list[Email] = []
    count = 0
    for kind, model in approvals.MODELS.items():
        pending = db.scalars(
            select(model).where(
                model.status == RequestStatus.PENDING.value,
                model.applied_at <= cutoff,
                or_(model.reminder_sent_at.is_(None), model.reminder_sent_at <= cutoff),
            )
        ).all()
        for req in pending:
            approvers = approvals.approvers_for(db, req)
            if not approvers:
                continue
            emp = db.get(Employee, req.employee_id)
            waiting = int((utcnow() - req.applied_at).total_seconds() // 3600)
            title = f"Reminder: {KIND_LABEL[kind].lower()} from {emp.full_name} awaiting approval"
            intro = f"This request has been pending for {waiting} hours."
            body, text = _render(_company(db), title, intro, _describe(db, kind, req), "Review now", "/approvals")
            emails.append(Email(to=[a.email for a in approvers], subject=title, html=body, text=text))
            req.reminder_sent_at = utcnow()
            count += 1
    db.commit()
    send(emails)
    return count
