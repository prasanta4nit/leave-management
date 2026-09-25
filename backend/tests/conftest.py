import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["AUTH_MODE"] = "dev"
os.environ["EMAIL_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    seed(reset=True)
    yield


@pytest.fixture
def client():
    return TestClient(app)


def as_user(email: str) -> dict:
    return {"X-Dev-User": email}


ADMIN = as_user("arjun.mehta@acme.example")
HR = as_user("priya.sharma@acme.example")
MANAGER = as_user("vikram.singh@acme.example")  # Tech Lead; manages engineers
EMPLOYEE = as_user("rohan.das@acme.example")  # reports to Vikram
OTHER = as_user("pooja.rao@acme.example")  # sales, unrelated to engineering
