from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .config import Config

engine = create_engine(
    Config.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_session():
    """Creates a new SQLAlchemy session."""
    return SessionLocal()