from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, Text, DateTime, Float, UniqueConstraint, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Use an external database (e.g. Postgres on Neon/Supabase) in production;
# the Space's own disk is wiped on every restart. Falls back to local SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./medquizz.db").strip()
# Normalise any Postgres URL variant (postgres://, postgresql+psycopg://, ...) to the installed psycopg2 driver
if DATABASE_URL.startswith(("postgres://", "postgresql")):
    DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL.split("://", 1)[1]

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    university = Column(String)

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text)
    option_a = Column(String)
    option_b = Column(String)
    option_c = Column(String)
    option_d = Column(String)
    correct_answer = Column(String)
    subject = Column(String)
    explanation = Column(Text, nullable=True)

class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    room_code = Column(String, unique=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"))
    subject = Column(String)
    status = Column(String, default="waiting")
    current_question = Column(Integer, default=0)

class SessionPlayer(Base):
    __tablename__ = "session_players"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)

class Answer(Base):
    __tablename__ = "answers"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    question_id = Column(Integer)  # AI-generated questions live in memory, not in the questions table
    user_id = Column(Integer, ForeignKey("users.id"))
    answer = Column(String)

class SavedSession(Base):
    __tablename__ = "saved_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    name = Column(String)
    mode = Column(String)
    questions = Column(Text)  # JSON list of question dicts
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

class EmailOTP(Base):
    __tablename__ = "email_otps"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    purpose = Column(String)  # "register" or "reset"
    code_hash = Column(String)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime)
    expires_at = Column(DateTime)

class SessionResult(Base):
    __tablename__ = "session_results"
    __table_args__ = (UniqueConstraint("user_id", "session_id"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    room_code = Column(String)
    subject = Column(String)
    mode = Column(String)
    difficulty = Column(String)
    earned = Column(Integer)
    total = Column(Integer)
    percentage = Column(Float)
    created_at = Column(DateTime, server_default=func.now())

class AIUsage(Base):
    __tablename__ = "ai_usage"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, index=True)
    feature = Column(String)  # e.g. question_sba, explain_tf
    model = Column(String)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    success = Column(Boolean, default=True)
    error = Column(String, nullable=True)
    # Groq rate-limit headers at the time of the call (requests are per day, tokens per minute)
    limit_requests = Column(Integer, nullable=True)
    remaining_requests = Column(Integer, nullable=True)
    limit_tokens = Column(Integer, nullable=True)
    remaining_tokens = Column(Integer, nullable=True)

class DeactivatedUser(Base):
    __tablename__ = "deactivated_users"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    deactivated_at = Column(DateTime)
    deactivated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    Base.metadata.create_all(bind=engine)