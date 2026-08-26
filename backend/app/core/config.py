from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # API Settings
    PROJECT_NAME: str = "Space Debris Tracker API"
    API_V1_STR: str = "/api/v1"
    
    # Database (Default to local SQLite, overridden by env var in production)
    DATABASE_URL: str = "sqlite+aiosqlite:///space_debris.db"
    
    @property
    def ASYNC_DATABASE_URL(self) -> str:
        url = self.DATABASE_URL.strip()
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        # asyncpg handles SSL via connect_args rather than query params
        if "?sslmode=" in url:
            url = url.split("?sslmode=")[0]
        elif "&sslmode=" in url:
            url = url.split("&sslmode=")[0]
            
        return url
    
    # CORS Config
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174"
    
    # App Settings
    REFRESH_INTERVAL_HOURS: int = 4
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    ADMIN_API_KEY: str = "dev-secret-key" # fallback for dev

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
