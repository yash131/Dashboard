from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "support_desk"
    CORS_ORIGINS: str = "*"  # Comma-separated origins
    PAGE_SIZE_DEFAULT: int = 20
    PAGE_SIZE_MAX: int = 50

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
