import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from .config import get_settings
from .database import SessionLocal
from .routers import admin, approvals, calendar, catalog, dashboard, employees, leaves, reports, services

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=f"{settings.app_name} API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for r in (admin, employees, catalog, leaves, approvals, services, calendar, dashboard, reports):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "environment": settings.environment}


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


_asgi_handler = Mangum(app, lifespan="off")


def handler(event, context):
    """Lambda entry point: API Gateway events go to FastAPI; EventBridge events carry {"job": ...}."""
    if isinstance(event, dict) and "job" in event:
        if event["job"] == "bootstrap":
            from .bootstrap import bootstrap

            return bootstrap(event)
        db = SessionLocal()
        try:
            result = admin.run_named_job(db, event["job"], event.get("year"))
            logger.info("Scheduled job result: %s", result)
            return result
        finally:
            db.close()
    return _asgi_handler(event, context)
