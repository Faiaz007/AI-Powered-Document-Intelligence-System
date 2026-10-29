"""Application configuration loaded from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/docintel"
)
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6380/0")
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "data/uploads")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
APP_ENV: str = os.getenv("APP_ENV", "development")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")
