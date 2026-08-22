from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # API Settings
    PROJECT_NAME: str = "Space Debris Tracker API"
    API_V1_STR: str = "/api/v1"
    
    # Database (Default to local SQLite, overridden by env var in production)
    DATABASE_URL: str = "sqlite+aiosqlite:///space_debris.db"
    
    # CORS Config
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # App Settings
    REFRESH_INTERVAL_HOURS: int = 4
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    ADMIN_API_KEY: str = "dev-secret-key" # fallback for dev

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
