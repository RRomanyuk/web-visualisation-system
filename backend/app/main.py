from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.errors import AppError, app_error_handler, unhandled_error_handler
from app.routers import datasets, health, jobs, recipes

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Система візуалізації даних з відкритих джерел",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

app.include_router(health.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
