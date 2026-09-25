# LeaveDesk — Leave & Employee Management

A leave and employee management system for a 20–25 person company.

```
React + TypeScript + Tailwind ──► S3 + CloudFront ──(/api/*)──► API Gateway (HTTP API)
                                                                     │
                                          EventBridge Scheduler ──► FastAPI on Lambda (Mangum)
                                                                     │        │         │
                                                             RDS MySQL 8.4  Cognito   Amazon SES
```

CloudFront serves the SPA and also forwards `/api/*` to API Gateway, so the browser talks to one origin and never sends CORS requests in production.

## Features

| Module | What's included |
|---|---|
| **Directory / Org chart** | Profiles (designation, department, manager, joining date, contact), grid/list/team views, search and filters, org chart you can collapse and zoom plus an outline view, and a profile page showing leave balance, history and team (manager, peers, reports) |
| **Leave management** | Configurable leave types (Annual, Casual, Sick and Unpaid seeded). Full-day, half-day (1st/2nd half) and hourly leave. Balances show credited, used, pending and available days. Yearly, quarterly or monthly accrual, pro-rated for new joiners, with carry-forward caps. Per-type rules: notice period, maximum consecutive days, backdating and negative balance. Modify or cancel requests |
| **Approval workflow** | Manager approval, manager then HR (two levels), or HR only, configurable separately for leave and WFH. HR/Admin can override any decision and each override is flagged. Pending-approval dashboard. Full history for every request |
| **Holidays & calendar** | Company and optional holidays (employees opt in, up to a set number per year). Weekends are configurable. Weekends, holidays and chosen optional holidays are left out of day counts. Team, department and company calendar views |
| **Employee services** | Work-from-home requests (with a monthly limit). Employees can edit their own profile details |
| **Dashboards** | Employee, Manager (team availability today, pending approvals, next 2 weeks of team leave) and Admin/HR (headcount, who's out, pending requests, leave by month and type, recent activity) |
| **Reports** | Utilization, employee history, department-wise, monthly/yearly. Every report exports to CSV and Excel. Managers only see their own reporting tree |
| **Notifications (SES)** | Emails for applications, decisions, manager→HR escalation, cancellations and WFH, plus scheduled reminders for requests pending too long |
| **Admin** | Employees (creating one also creates their Cognito login), departments, designations, reporting lines (circular reporting is blocked), leave policies, holidays, approval settings, system settings, balance adjustments, audit log |

**Roles:** `EMPLOYEE`, `HR`, `ADMIN` are stored on the employee record. **Managers are not a role.** Anyone with active direct reports is treated as a manager automatically.

**Visibility:** Everyone can see the directory and org chart. Leave balances and history are visible only to the employee, their management chain and HR.

## Repository layout

```
backend/            FastAPI app (app/), tests/, requirements*.txt
  app/models.py     SQLAlchemy models (MySQL; SQLite also works for local dev and tests)
  app/services/     balances & accrual, approvals, working-day maths, SES, Cognito, settings
  app/routers/      employees, catalog, leaves, approvals, services (WFH), calendar,
                    dashboard, reports, admin
  app/seed.py       demo data (22 employees, policies, holidays, sample requests)
  app/bootstrap.py  first-run setup for production (tables + policies + first admin)
frontend/           Vite + React 18 + TypeScript + Tailwind + TanStack Query
infra/template.yaml AWS SAM: Cognito, RDS, Lambda, HTTP API, S3, CloudFront, SES, schedules
scripts/            build / deploy / bootstrap helpers (bash; use Git Bash on Windows)
docs/schema.sql     MySQL DDL (generated: python -m app.db_init --sql)
```

## Run locally

**Backend** (Python 3.12):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env              # AUTH_MODE=dev; choose MySQL (docker compose up -d) or SQLite
python -m app.seed --reset        # tables + demo data
uvicorn app.main:app --reload --port 8001   # http://localhost:8001/api/docs
```

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env.local        # VITE_AUTH_MODE=dev
npm run dev                       # http://localhost:5173 (proxies /api to :8001)
```

In dev auth mode the login screen lists every employee, so you can sign in as anyone. Good accounts to try:
- **Arjun Mehta**: CEO / Admin
- **Priya Sharma**: HR
- **Vikram Singh**: Tech Lead, manages 7 people
- **Rohan Das**: Software Engineer

Dev mode trusts an `X-Dev-User` header. **Never** deploy with `AUTH_MODE=dev`.

**Tests:** `cd backend && pytest`. There are 17 end-to-end tests covering the workflow, balances, accrual, carry-forward, overlaps, half-day and hourly leave, permissions, reports/exports and jobs.

## Deploy to AWS

Prerequisites: AWS CLI, SAM CLI, Node 20+, Python 3.12, and a VPC with **two private subnets that have NAT** (the Lambda calls Secrets Manager, SES, SSM and Cognito).

```bash
# 1. Infrastructure + API (first run asks for parameters and saves them to infra/samconfig.toml)
./scripts/deploy-backend.sh --guided        # stack name: leavedesk

# 2. Frontend (reads Cognito IDs and the bucket from stack outputs)
./scripts/deploy-frontend.sh leavedesk

# 3. One-time: create tables, default leave policies and the first Admin (they get an email invite)
./scripts/bootstrap.sh you@company.com "First" "Last" "Your Company" leavedesk
```

Then sign in as that admin and set up departments, designations, holidays and settings. Add employees under **Admin → Employees**. Each new employee gets a Cognito invite email, and reporting lines decide who approves whose leave.

**SES:** the template creates the SES identity, but you still have to verify it: DNS records for a domain, or the confirmation link for a single email address. New AWS accounts are in the SES sandbox, which only delivers to verified addresses. Request production access before go-live.

**Scheduled jobs** (EventBridge Scheduler → same Lambda with `{"job": ...}`):

| Job | When | What |
|---|---|---|
| `accrual` | daily 00:15 | Creates missing balances and credits any monthly/quarterly accrual that is due. Safe to run repeatedly |
| `reminders` | weekdays 09:30 | Emails approvers about requests pending longer than `reminder_after_hours` |
| `year-end` | 1 Jan 00:30 | Recalculates how much unused leave carries forward from last year |

Admins can also run these from **Admin → Settings**.

**Rough cost** (ap-south-1 / us-east-1, 25 users): RDS db.t4g.micro is about $12–15/month. A NAT gateway is about $32/month if you don't already have one. Lambda, API Gateway, CloudFront, S3, Cognito (under 50k MAU) and SES stay within the free tier or cost a few cents.

## Design notes

- **Balances can't drift.** A balance row stores only credits: allocated, accrued, carried forward and adjustments. Used and pending days are always summed from leave requests, so approving, cancelling, modifying or overriding a request never needs balance bookkeeping.
- **Day counting** (`services/workdays.py`) skips configured weekend days, mandatory holidays and the employee's chosen optional holidays. Hourly leave counts as hours ÷ `work_hours_per_day`. Two half-day requests for different halves of the same day are allowed.
- **Approval routing** (`services/approvals.py`) is shared by leave and WFH requests. Employees without an active manager go to HR. Nobody can approve their own request, except an Admin (usually the CEO), and you can turn on auto-approval for that case.
- **Audit:** every approval action is written to `request_history` (visible in Approvals → History and on each request). Admin changes go to `audit_logs` with before/after values.
- **Schema:** `Base.metadata.create_all` runs from `bootstrap` and `seed`. If the schema starts to change often, add Alembic.
