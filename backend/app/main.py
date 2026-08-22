from fastapi import FastAPI
import logging
from app.core.config import settings
from app.api.middleware import setup_middlewares
from app.api.routes import health, objects, conjunctions, cam, admin, copilot, stats, globe, weather
from app.jobs.refresh_pipeline import setup_scheduler

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Setup Middlewares (CORS, Logging)
setup_middlewares(app)

# Include Routers
app.include_router(health.router, prefix=f"{settings.API_V1_STR}/health", tags=["System"])
app.include_router(objects.router, prefix=f"{settings.API_V1_STR}/objects", tags=["Objects"])
app.include_router(conjunctions.router, prefix=f"{settings.API_V1_STR}/conjunctions", tags=["Conjunctions"])
app.include_router(stats.router, prefix=f"{settings.API_V1_STR}/stats", tags=["Stats"])
app.include_router(cam.router, prefix=f"{settings.API_V1_STR}/cam", tags=["Collision Avoidance Maneuver"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(copilot.router, prefix=f"{settings.API_V1_STR}/copilot", tags=["Copilot"])
app.include_router(globe.router, prefix=f"{settings.API_V1_STR}/globe-data", tags=["Globe"])
app.include_router(weather.router, prefix=f"{settings.API_V1_STR}/weather", tags=["Weather"])

scheduler = setup_scheduler()

@app.on_event("startup")
async def startup_event():
    scheduler.start()
    logging.info("Starting up API... APScheduler started.")

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
    logging.info("Shutting down API...")
