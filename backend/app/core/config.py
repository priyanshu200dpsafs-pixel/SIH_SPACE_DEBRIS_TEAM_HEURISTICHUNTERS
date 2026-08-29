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

    # Data Quality Engine Config
    TLE_AGE_GRADE_A_HOURS: float = 24.0
    TLE_AGE_GRADE_B_HOURS: float = 72.0
    TLE_AGE_GRADE_C_HOURS: float = 168.0

    # Multi-Model Consensus Engine Config
    CONSENSUS_ENABLED: bool = True
    CONSENSUS_PC_THRESHOLD: float = 1e-6
    CONSENSUS_MAX_EVENTS_PER_BATCH: int = 50
    CONSENSUS_TCA_TOLERANCE_HIGH_S: float = 3.0
    CONSENSUS_TCA_TOLERANCE_MOD_S: float = 15.0
    CONSENSUS_DIST_TOLERANCE_HIGH_KM: float = 0.25
    CONSENSUS_DIST_TOLERANCE_MOD_KM: float = 1.5

    # Adaptive Temporal Resolution Config
    SCREENING_COARSE_STEP_S: float = 60.0
    SCREENING_FINER_STEP_S: float = 10.0
    SCREENING_VERY_FINE_STEP_S: float = 1.0
    SCREENING_COARSE_THRESHOLD_KM: float = 50.0
    SCREENING_FINER_THRESHOLD_KM: float = 20.0
    SCREENING_VERY_FINE_THRESHOLD_KM: float = 5.0
    SCREENING_STAGE3_HANDOFF_KM: float = 1.0

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
