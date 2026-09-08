'''
SQLAlchemy session management module
'''
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.infrastructure.config import settings

class Base(DeclarativeBase):
    pass

engine = create_engine(
    f"postgresql+psycopg2://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}",
    echo=True,
    pool_pre_ping=True,
    pool_size=10,
    # 04 §2.1 时间戳一律 UTC：容器 TZ=Asia/Shanghai 会使 timestamptz 读出 +08:00，
    # 会话级置 UTC 后读出 +00:00（ISO 8601 UTC，与 Z 等价，JS Date 可直接解析）
    connect_args={"options": "-c timezone=UTC"},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    Initialize the database by creating all tables defined in the models.
    """
    from backend.database import models
    Base.metadata.create_all(bind=engine)

def get_db():
    """
    Dependency function to get a database session.
    This function can be used in FastAPI endpoints to provide a session for database operations.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()