from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func
import os
import random
import string
import json
import secrets
import time
from collections import deque
import hashlib
import hmac
import re
from ai import load_model, explain_question, generate_single_question, generate_tf_question, explain_tf_question

from database import get_db, create_tables, User, Question, Session as GameSession, SessionPlayer, Answer, SavedSession, EmailOTP, SessionResult, AIUsage, DeactivatedUser
from mailer import send_otp_email
from auth import hash_password, verify_password, create_token, get_current_user

from ai import load_model, explain_question, generate_single_question, generate_tf_question, explain_tf_question, get_ai_answer, get_ai_tf_answer, GROQ_MODEL

app = FastAPI(title="MedQuizz API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connection manager ──────────────────────
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.rooms:
            self.rooms[room_code] = []
        self.rooms[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.rooms:
            self.rooms[room_code].remove(websocket)

    async def broadcast(self, room_code: str, message: dict):
        if room_code in self.rooms:
            for ws in self.rooms[room_code]:
                try:
                    await ws.send_json(message)
                except:
                    pass

manager = ConnectionManager()

# ── Pydantic models ───────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    university: str
    otp: str

class OTPRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    name: str
    university: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateSessionRequest(BaseModel):
    subject: str
    difficulty: str
    num_questions: int
    mode: str

class CustomSessionRequest(BaseModel):
    questions: list
    mode: str
    name: Optional[str] = None

class SavedSessionRequest(BaseModel):
    name: str
    mode: str
    questions: list

class AnswerRequest(BaseModel):
    room_code: str
    question_id: int
    answer: str

class TFAnswerRequest(BaseModel):
    room_code: str
    question_id: int
    answers: dict  # {"a": True, "b": False, "c": True, "d": False, "e": True}

# ── In-memory session storage ─────────────────────────
session_questions: Dict[str, List] = {}
session_config: Dict[str, dict] = {}
session_generating: Dict[str, bool] = {}
session_revealed: Dict[str, set] = {}  # question indexes whose answers were revealed

OPTION_KEYS = ['a', 'b', 'c', 'd', 'e']

def clean_custom_questions(questions: list, mode: str) -> list:
    """Keep only known fields; user-supplied answers are kept, blanks become None (AI decides at reveal)."""
    if mode not in ('sba', 'tf'):
        raise HTTPException(status_code=400, detail="Mode must be 'sba' or 'tf'")
    if not questions:
        raise HTTPException(status_code=400, detail="Add at least one question")
    if len(questions) > 200:
        raise HTTPException(status_code=400, detail="Too many questions (max 200)")

    cleaned = []
    for q in questions:
        if not isinstance(q, dict):
            raise HTTPException(status_code=400, detail="Invalid question format")
        if mode == 'sba':
            item = {f: str(q.get(f) or '').strip() for f in ['question'] + [f'option_{k}' for k in OPTION_KEYS]}
            if not item['question']:
                raise HTTPException(status_code=400, detail="Every question needs text")
            correct = str(q.get('correct_answer') or '').strip().lower()
            item['correct_answer'] = correct if correct in OPTION_KEYS else None
        else:
            item = {f: str(q.get(f) or '').strip() for f in ['stem'] + [f'statement_{k}' for k in OPTION_KEYS]}
            if not item['stem']:
                raise HTTPException(status_code=400, detail="Every question needs a stem")
            for k in OPTION_KEYS:
                value = q.get(f'answer_{k}')
                item[f'answer_{k}'] = value if isinstance(value, bool) else None
        item['mode'] = mode
        cleaned.append(item)
    return cleaned

def current_question_or_error(room_code: str, session: GameSession) -> dict:
    questions = session_questions.get(room_code, [])
    idx = session.current_question
    if idx >= len(questions):
        raise HTTPException(
            status_code=409,
            detail="This question isn't available yet (it may still be generating, or the server restarted)"
        )
    return questions[idx]

def iso_utc(dt):
    """DB timestamps are stored as naive UTC; mark them so browsers convert to local time."""
    if not dt:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")

def check_answering_open(room_code: str, session: GameSession, question_id: int):
    idx = question_id - 1  # question ids are 1-based positions
    if idx != session.current_question or idx in session_revealed.get(room_code, set()):
        raise HTTPException(status_code=400, detail="Answers are closed for this question")

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def background_generate_questions(room_code: str):
    config = session_config[room_code]
    subject = config['subject']
    difficulty = config['difficulty']
    total = config['num_questions']
    mode = config.get('mode', 'sba')

    print(f"Starting background generation ({mode}) for room {room_code}...")

    for i in range(total):
        if room_code not in session_questions:
            break

        if mode == 'tf':
            q = generate_tf_question(
                subject=subject,
                difficulty=difficulty,
                index=i,
                total=total
            )
        else:
            q = generate_single_question(
                subject=subject,
                difficulty=difficulty,
                index=i,
                total=total
            )

        session_questions[room_code].append(q)
        print(f"✅ Room {room_code}: Generated question {i+1}/{total}")

    session_generating[room_code] = False
    print(f"✅ All {total} questions generated for room {room_code}!")

# ── Startup ───────────────────────────────────────────
@app.on_event("startup")
async def startup():
    create_tables()
    load_model()

# ── Email OTP helpers ─────────────────────────────────
OTP_MINUTES_VALID = 10
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_PEPPER = os.environ.get("OTP_PEPPER") or os.environ.get("JWT_SECRET", "medquizz-otp")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    return email

def check_password_strength(password: str):
    if len(password or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

def find_user_by_email(db: Session, email: str):
    return db.query(User).filter(func.lower(User.email) == email).first()

def is_deactivated(db: Session, user_id: int) -> bool:
    return db.query(DeactivatedUser).filter(DeactivatedUser.user_id == user_id).first() is not None

ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

def is_admin(user: User) -> bool:
    return (user.email or "").lower() in ADMIN_EMAILS

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access only")
    return current_user

def hash_otp(email: str, purpose: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{purpose}:{code}:{OTP_PEPPER}".encode()).hexdigest()

OTP_REQUESTS_PER_IP = 5            # per client, per window below
OTP_IP_WINDOW_SECONDS = 15 * 60
OTP_DAILY_EMAIL_CAP = int(os.environ.get("OTP_DAILY_EMAIL_CAP", "300"))  # Gmail allows ~500 sends/day
_otp_requests_by_ip: Dict[str, deque] = {}
_otp_emails_sent = {"day": None, "count": 0}

def client_ip(request: Request) -> str:
    # Hugging Face's proxy appends the real client IP as the LAST x-forwarded-for entry;
    # earlier entries come from the client and can be faked.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[-1].strip() if forwarded else (request.client.host if request.client else "unknown")

def check_otp_ip_limit(request: Request):
    now = time.time()
    hits = _otp_requests_by_ip.setdefault(client_ip(request), deque())
    while hits and now - hits[0] > OTP_IP_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= OTP_REQUESTS_PER_IP:
        print(f"OTP rate limit hit for {client_ip(request)} (x-forwarded-for: {request.headers.get('x-forwarded-for')})")
        raise HTTPException(status_code=429, detail="Too many code requests. Please try again in a few minutes.")
    hits.append(now)

def reserve_daily_email_slot():
    today = datetime.utcnow().date()
    if _otp_emails_sent["day"] != today:
        _otp_emails_sent.update(day=today, count=0)
    if _otp_emails_sent["count"] >= OTP_DAILY_EMAIL_CAP:
        print(f"OTP daily email cap ({OTP_DAILY_EMAIL_CAP}) reached - refusing to send more today")
        raise HTTPException(status_code=503, detail="Email verification is busy right now. Please try again later.")
    _otp_emails_sent["count"] += 1

def issue_otp(db: Session, email: str, purpose: str):
    now = datetime.utcnow()
    latest = db.query(EmailOTP).filter(
        EmailOTP.email == email, EmailOTP.purpose == purpose
    ).order_by(EmailOTP.created_at.desc()).first()
    if latest and latest.created_at and (now - latest.created_at).total_seconds() < OTP_RESEND_SECONDS:
        wait = OTP_RESEND_SECONDS - int((now - latest.created_at).total_seconds())
        raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting another code")

    reserve_daily_email_slot()
    db.query(EmailOTP).filter(EmailOTP.email == email, EmailOTP.purpose == purpose).delete()
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = EmailOTP(
        email=email,
        purpose=purpose,
        code_hash=hash_otp(email, purpose, code),
        attempts=0,
        created_at=now,
        expires_at=now + timedelta(minutes=OTP_MINUTES_VALID)
    )
    db.add(otp)
    db.commit()

    try:
        send_otp_email(email, code, purpose, OTP_MINUTES_VALID)
    except Exception as e:
        print(f"OTP email error: {e}")
        db.delete(otp)
        db.commit()
        raise HTTPException(status_code=502, detail="Could not send the verification email. Please try again later.")

def verify_otp(db: Session, email: str, purpose: str, code: str):
    otp = db.query(EmailOTP).filter(
        EmailOTP.email == email, EmailOTP.purpose == purpose
    ).order_by(EmailOTP.created_at.desc()).first()
    if not otp or otp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Code expired or not found. Please request a new one.")
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request a new code.")
    if not hmac.compare_digest(otp.code_hash, hash_otp(email, purpose, (code or "").strip())):
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect code")
    db.delete(otp)
    db.commit()

# ── Auth Routes ───────────────────────────────────────
@app.post("/auth/register/request-otp")
def request_register_otp(req: OTPRequest, request: Request, db: Session = Depends(get_db)):
    check_otp_ip_limit(request)
    email = normalize_email(req.email)
    if find_user_by_email(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    issue_otp(db, email, "register")
    return {"status": "sent"}

@app.post("/auth/password/request-otp")
def request_reset_otp(req: OTPRequest, request: Request, db: Session = Depends(get_db)):
    check_otp_ip_limit(request)
    email = normalize_email(req.email)
    # Same response whether or not the account exists, so emails can't be probed
    user = find_user_by_email(db, email)
    if user and not is_deactivated(db, user.id):
        issue_otp(db, email, "reset")
    return {"status": "sent"}

@app.post("/auth/password/reset")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    email = normalize_email(req.email)
    check_password_strength(req.new_password)
    user = find_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=400, detail="Code expired or not found. Please request a new one.")
    verify_otp(db, email, "reset", req.otp)
    user.password = hash_password(req.new_password)
    db.commit()
    return {"status": "reset"}

@app.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(req.email)
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Please enter your name")
    check_password_strength(req.password)
    if find_user_by_email(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    verify_otp(db, email, "register", req.otp)

    user = User(
        name=req.name.strip(),
        email=email,
        password=hash_password(req.password),
        university=req.university.strip()
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token({"sub": user.email})
    return {"token": token, "name": user.name}

@app.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = find_user_by_email(db, (req.email or "").strip().lower())
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if is_deactivated(db, user.id):
        raise HTTPException(status_code=403, detail="This account has been deactivated")

    token = create_token({"sub": user.email})
    return {"token": token, "name": user.name}

# ── Session Routes ────────────────────────────────────
@app.post("/session/create")
def create_session(
    req: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room_code = generate_room_code()

    session = GameSession(
        room_code=room_code,
        host_id=current_user.id,
        subject=req.subject,
        status="waiting"
    )
    db.add(session)
    db.commit()

    # Add host as player
    player = SessionPlayer(
        session_id=session.id,
        user_id=current_user.id,
        name=current_user.name
    )
    db.add(player)
    db.commit()

    # Store session config
    session_config[room_code] = {
        'subject': req.subject,
        'difficulty': req.difficulty,
        'num_questions': req.num_questions,
        'mode': req.mode
    }
    session_questions[room_code] = []
    session_generating[room_code] = True

    # Start generating questions in background
    background_tasks.add_task(background_generate_questions, room_code)

    return {
        "room_code": room_code,
        "subject": req.subject,
        "difficulty": req.difficulty,
        "num_questions": req.num_questions
    }
@app.get("/session/{room_code}/status")
def get_session_status(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "status": session.status,
        "current_question": session.current_question
    }

@app.post("/session/{room_code}/start")
async def start_session(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only host can start")

    session.status = "active"
    db.commit()

    await manager.broadcast(room_code, {"type": "session_started"})

    return {"status": "started"}

@app.post("/session/custom")
def create_custom_session(
    req: CustomSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room_code = generate_room_code()
    session_name = (req.name or "").strip()[:100] or "Custom"

    session = GameSession(
        room_code=room_code,
        host_id=current_user.id,
        subject=session_name,
        status="waiting"
    )
    db.add(session)
    db.commit()

    # Add host as player
    player = SessionPlayer(
        session_id=session.id,
        user_id=current_user.id,
        name=current_user.name
    )
    db.add(player)
    db.commit()

    # Keep answers the user supplied; blanks stay None and AI determines them at reveal time
    processed = clean_custom_questions(req.questions, req.mode)
    for i, q in enumerate(processed):
        q['id'] = i + 1

    session_questions[room_code] = processed
    session_config[room_code] = {
        'subject': session_name,
        'difficulty': 'custom',
        'num_questions': len(processed),
        'mode': req.mode,
        'is_custom': True
    }
    session_generating[room_code] = False

    return {
        "room_code": room_code,
        "num_questions": len(processed)
    }

# ── Saved custom sessions ─────────────────────────────
def saved_session_to_dict(saved: SavedSession) -> dict:
    questions = json.loads(saved.questions or "[]")
    return {
        "id": saved.id,
        "name": saved.name,
        "mode": saved.mode,
        "num_questions": len(questions),
        "questions": questions,
        "updated_at": iso_utc(saved.updated_at)
    }

def clean_saved_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please give the session a name")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Name is too long (max 100 characters)")
    return name

def get_own_saved_session(saved_id: int, db: Session, current_user: User) -> SavedSession:
    saved = db.query(SavedSession).filter(
        SavedSession.id == saved_id,
        SavedSession.user_id == current_user.id
    ).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved session not found")
    return saved

@app.get("/saved-sessions")
def list_saved_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    saved = db.query(SavedSession).filter(
        SavedSession.user_id == current_user.id
    ).order_by(SavedSession.updated_at.desc(), SavedSession.id.desc()).all()
    return [saved_session_to_dict(s) for s in saved]

@app.post("/saved-sessions")
def create_saved_session(
    req: SavedSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    saved = SavedSession(
        user_id=current_user.id,
        name=clean_saved_name(req.name),
        mode=req.mode,
        questions=json.dumps(clean_custom_questions(req.questions, req.mode))
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved_session_to_dict(saved)

@app.put("/saved-sessions/{saved_id}")
def update_saved_session(
    saved_id: int,
    req: SavedSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    saved = get_own_saved_session(saved_id, db, current_user)
    saved.name = clean_saved_name(req.name)
    saved.mode = req.mode
    saved.questions = json.dumps(clean_custom_questions(req.questions, req.mode))
    db.commit()
    db.refresh(saved)
    return saved_session_to_dict(saved)

@app.delete("/saved-sessions/{saved_id}")
def delete_saved_session(
    saved_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    saved = get_own_saved_session(saved_id, db, current_user)
    db.delete(saved)
    db.commit()
    return {"status": "deleted"}

@app.post("/session/join/{room_code}")
def join_session(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if already joined
    existing = db.query(SessionPlayer).filter(
        SessionPlayer.session_id == session.id,
        SessionPlayer.user_id == current_user.id
    ).first()

    if not existing:
        player = SessionPlayer(
            session_id=session.id,
            user_id=current_user.id,
            name=current_user.name
        )
        db.add(player)
        db.commit()

    players = db.query(SessionPlayer).filter(
        SessionPlayer.session_id == session.id
    ).all()

    return {
        "room_code": room_code,
        "subject": session.subject,
        "host_id": session.host_id,
        "your_id": current_user.id,
        "players": [{"id": p.user_id, "name": p.name} for p in players]
    }

@app.get("/session/{room_code}/question")
def get_current_question(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    idx = session.current_question
    questions = session_questions.get(room_code, [])

    # Wait for current question to be generated
    if idx >= len(questions):
        if session_generating.get(room_code, False):
            return {"status": "generating"}
        return {"status": "finished"}

    q = questions[idx]

    return {
    "status": "active",
    "question_number": idx + 1,
    "total_questions": session_config.get(room_code, {}).get('num_questions', 0),
    "generating": session_generating.get(room_code, False),
    "mode": session_config.get(room_code, {}).get('mode', 'sba'),
    "question": q
}

@app.post("/session/{room_code}/answer")
async def submit_answer(
    room_code: str,
    req: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_answering_open(room_code, session, req.question_id)

    # Update answer if exists, otherwise create new
    existing = db.query(Answer).filter(
    Answer.session_id == session.id,
    Answer.question_id == req.question_id,
    Answer.user_id == current_user.id
    ).first()

    if existing:
        existing.answer = req.answer
        db.commit()
    else:
        answer = Answer(
        session_id=session.id,
        question_id=req.question_id,
        user_id=current_user.id,
        answer=req.answer
        )
        db.add(answer)
        db.commit()
    

    total_players = db.query(SessionPlayer).filter(
        SessionPlayer.session_id == session.id
    ).count()

    answered = db.query(Answer).filter(
        Answer.session_id == session.id,
        Answer.question_id == req.question_id
    ).count()

    await manager.broadcast(room_code, {
        "type": "answer_update",
        "answered": answered,
        "total": total_players
    })

    return {"answered": answered, "total": total_players}

@app.post("/session/{room_code}/reveal")
async def reveal_answer(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only host can reveal")

    q = current_question_or_error(room_code, session)
    idx = session.current_question
    mode = session_config.get(room_code, {}).get('mode', 'sba')
    is_custom = session_config.get(room_code, {}).get('is_custom', False)
    # Close answering for this question before anything else (see submit_answer)
    session_revealed.setdefault(room_code, set()).add(idx)

    # For custom sessions — AI determines answers at reveal time
    if is_custom:
        if mode == 'sba' and not q.get('correct_answer'):
            print("Custom session: AI determining correct answer...")
            q['correct_answer'] = await run_in_threadpool(
                get_ai_answer,
                question=q['question'],
                options={
                    'a': q['option_a'],
                    'b': q['option_b'],
                    'c': q['option_c'],
                    'd': q['option_d'],
                    'e': q['option_e']
                }
            )
            session_questions[room_code][idx] = q

        if mode == 'tf':
            print("Custom session: AI determining T/F answers...")
            for key in ['a','b','c','d','e']:
                if q.get(f'answer_{key}') is None:
                    q[f'answer_{key}'] = await run_in_threadpool(
                        get_ai_tf_answer,
                        stem=q['stem'],
                        statement=q[f'statement_{key}']
                    )
            session_questions[room_code][idx] = q

    # Get answer summary
    answers = db.query(Answer).filter(
        Answer.session_id == session.id,
        Answer.question_id == q["id"]
    ).all()

    answer_summary = {}
    for a in answers:
        user = db.query(User).filter(User.id == a.user_id).first()
        answer_summary[user.name] = a.answer

    if mode == 'tf':
        await manager.broadcast(room_code, {
            "type": "reveal_tf",
            "correct_answers": {
                "a": q["answer_a"],
                "b": q["answer_b"],
                "c": q["answer_c"],
                "d": q["answer_d"],
                "e": q["answer_e"]
            },
            "answer_summary": answer_summary
        })
    else:
        await manager.broadcast(room_code, {
            "type": "reveal",
            "correct_answer": q["correct_answer"],
            "explanation": None,
            "answer_summary": answer_summary
        })

    return {"status": "revealed"}

@app.post("/session/{room_code}/answer_tf")
async def submit_tf_answer(
    room_code: str,
    req: TFAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_answering_open(room_code, session, req.question_id)

    # Store T/F answers as JSON string
    existing = db.query(Answer).filter(
        Answer.session_id == session.id,
        Answer.question_id == req.question_id,
        Answer.user_id == current_user.id
    ).first()

    answers_json = json.dumps(req.answers)

    if existing:
        existing.answer = answers_json
        db.commit()
    else:
        answer = Answer(
            session_id=session.id,
            question_id=req.question_id,
            user_id=current_user.id,
            answer=answers_json
        )
        db.add(answer)
        db.commit()

    total_players = db.query(SessionPlayer).filter(
        SessionPlayer.session_id == session.id
    ).count()

    # Count players who answered ALL 5 statements
    answered = db.query(Answer).filter(
        Answer.session_id == session.id,
        Answer.question_id == req.question_id
    ).count()

    await manager.broadcast(room_code, {
        "type": "answer_update",
        "answered": answered,
        "total": total_players
    })

    return {"answered": answered, "total": total_players}

@app.post("/session/{room_code}/explain")
async def explain_answer(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only host can explain")

    q = current_question_or_error(room_code, session)
    idx = session.current_question
    mode = session_config.get(room_code, {}).get('mode', 'sba')

    print(f"Generating AI explanation for question {idx+1} ({mode} mode)...")

    if mode == 'tf':
        explanation = await run_in_threadpool(
            explain_tf_question,
            stem=q["stem"],
            statements={
                "a": q["statement_a"],
                "b": q["statement_b"],
                "c": q["statement_c"],
                "d": q["statement_d"],
                "e": q["statement_e"]
            },
            answers={
                "a": q["answer_a"],
                "b": q["answer_b"],
                "c": q["answer_c"],
                "d": q["answer_d"],
                "e": q["answer_e"]
            }
        )
    else:
        explanation = await run_in_threadpool(
            explain_question,
            question=q["question"],
            options={
                "a": q["option_a"],
                "b": q["option_b"],
                "c": q["option_c"],
                "d": q["option_d"],
                "e": q["option_e"]
            },
            correct_answer=q["correct_answer"]
        )

    await manager.broadcast(room_code, {
        "type": "explanation",
        "explanation": explanation
    })

    return {"status": "explained"}

@app.post("/session/{room_code}/next")
async def next_question(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only host can move next")

    config = session_config.get(room_code, {})
    total = config.get('num_questions', 0)

    session.current_question += 1
    db.commit()

    if session.current_question >= total:
        session.status = "finished"
        db.commit()
        # Store every player's result so it survives restarts and shows on their account page
        players = db.query(SessionPlayer).filter(SessionPlayer.session_id == session.id).all()
        for p in players:
            save_session_result(db, session, p.user_id, calculate_score(room_code, session, p.user_id, db))
        await manager.broadcast(room_code, {"type": "session_finished"})
        return {"status": "finished"}

    await manager.broadcast(room_code, {
        "type": "next_question",
        "question_number": session.current_question + 1
    })

    return {"status": "next", "question_number": session.current_question + 1}

def save_session_result(db: Session, session: GameSession, user_id: int, score: dict):
    if score["total"] == 0:
        return
    config = session_config.get(session.room_code, {})
    result = db.query(SessionResult).filter(
        SessionResult.user_id == user_id,
        SessionResult.session_id == session.id
    ).first()
    if not result:
        result = SessionResult(user_id=user_id, session_id=session.id, room_code=session.room_code)
        db.add(result)
    result.subject = session.subject
    result.mode = score["mode"]
    result.difficulty = config.get("difficulty")
    result.earned = score["earned"]
    result.total = score["total"]
    result.percentage = score["percentage"]
    db.commit()

@app.get("/session/{room_code}/score")
def get_score(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(GameSession).filter(
        GameSession.room_code == room_code
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if room_code in session_questions:
        score = calculate_score(room_code, session, current_user.id, db)
        if session.status == "finished":
            save_session_result(db, session, current_user.id, score)
        return score

    # Questions are gone from memory (server restarted) - fall back to the stored summary
    stored = db.query(SessionResult).filter(
        SessionResult.user_id == current_user.id,
        SessionResult.session_id == session.id
    ).first()
    if not stored:
        raise HTTPException(status_code=404, detail="Score is no longer available for this session")
    return {
        "earned": stored.earned,
        "total": stored.total,
        "percentage": stored.percentage,
        "mode": stored.mode,
        "question_results": []
    }

def calculate_score(room_code: str, session: GameSession, user_id: int, db: Session) -> dict:
    questions = session_questions.get(room_code, [])
    mode = session_config.get(room_code, {}).get('mode', 'sba')
    total_marks = 0
    earned_marks = 0
    question_results = []

    for q in questions:
        # Get user's answer for this question
        answer = db.query(Answer).filter(
            Answer.session_id == session.id,
            Answer.question_id == q["id"],
            Answer.user_id == user_id
        ).first()

        if mode == 'sba':
            total_marks += 1
            correct = q.get('correct_answer', '')
            user_answer = answer.answer if answer else None
            is_correct = user_answer is not None and user_answer == correct

            if is_correct:
                earned_marks += 1

            question_results.append({
                "question_number": q["id"],
                "question": q.get("question", ""),
                "correct_answer": correct,
                "user_answer": user_answer,
                "is_correct": is_correct,
                "marks_earned": 1 if is_correct else 0,
                "marks_possible": 1
            })

        elif mode == 'tf':
            total_marks += 5
            q_earned = 0
            statement_results = []

            try:
                user_answers = json.loads(answer.answer) if answer else {}
            except:
                user_answers = {}

            for key in ['a', 'b', 'c', 'd', 'e']:
                correct = q.get(f'answer_{key}')
                user_ans = user_answers.get(key)

                # Convert to bool safely
                if isinstance(user_ans, str):
                    user_ans = user_ans.lower() == 'true'

                is_correct = user_ans == correct if correct is not None else False
                if is_correct:
                    q_earned += 1

                statement_results.append({
                    "statement": key.upper(),
                    "text": q.get(f'statement_{key}', ''),
                    "correct_answer": correct,
                    "user_answer": user_ans,
                    "is_correct": is_correct
                })

            earned_marks += q_earned
            question_results.append({
                "question_number": q["id"],
                "stem": q.get("stem", ""),
                "statements": statement_results,
                "marks_earned": q_earned,
                "marks_possible": 5
            })

    return {
        "earned": earned_marks,
        "total": total_marks,
        "percentage": round((earned_marks / total_marks * 100) if total_marks > 0 else 0, 1),
        "mode": mode,
        "question_results": question_results
    }

# ── My Account ────────────────────────────────────────
def user_to_dict(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "university": user.university, "is_admin": is_admin(user)}

@app.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return user_to_dict(current_user)

@app.put("/me")
def update_me(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if len(name) > 100 or len(req.university.strip()) > 100:
        raise HTTPException(status_code=400, detail="Name and batch must be 100 characters or less")
    current_user.name = name
    current_user.university = req.university.strip()
    db.commit()
    return user_to_dict(current_user)

@app.post("/me/password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(req.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    check_password_strength(req.new_password)
    current_user.password = hash_password(req.new_password)
    db.commit()
    return {"status": "changed"}

@app.get("/me/progress")
def get_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    results = db.query(SessionResult).filter(
        SessionResult.user_id == current_user.id
    ).order_by(SessionResult.created_at.asc(), SessionResult.id.asc()).all()

    sessions_joined = db.query(SessionPlayer).filter(SessionPlayer.user_id == current_user.id).count()
    sessions_hosted = db.query(GameSession).filter(GameSession.host_id == current_user.id).count()
    questions_answered = db.query(Answer).filter(Answer.user_id == current_user.id).count()

    total_earned = sum(r.earned for r in results)
    total_possible = sum(r.total for r in results)

    by_subject = {}
    for r in results:
        key = r.subject or "Other"
        s = by_subject.setdefault(key, {"subject": key, "sessions": 0, "earned": 0, "total": 0})
        s["sessions"] += 1
        s["earned"] += r.earned
        s["total"] += r.total
    subjects = sorted(
        [{**s, "percentage": round(s["earned"] / s["total"] * 100, 1) if s["total"] else 0} for s in by_subject.values()],
        key=lambda s: s["sessions"], reverse=True
    )

    return {
        "sessions_joined": sessions_joined,
        "sessions_hosted": sessions_hosted,
        "sessions_completed": len(results),
        "questions_answered": questions_answered,
        "overall_percentage": round(total_earned / total_possible * 100, 1) if total_possible else None,
        "best_percentage": max((r.percentage for r in results), default=None),
        "subjects": subjects,
        "results": [{
            "room_code": r.room_code,
            "subject": r.subject,
            "mode": r.mode,
            "difficulty": r.difficulty,
            "earned": r.earned,
            "total": r.total,
            "percentage": r.percentage,
            "date": iso_utc(r.created_at)
        } for r in results]
    }

# ── Admin ─────────────────────────────────────────────
GROQ_DAILY_TOKEN_LIMIT = int(os.environ.get("GROQ_DAILY_TOKEN_LIMIT", "200000"))  # free tier TPD for gpt-oss-120b

@app.get("/admin/users")
def admin_list_users(
    search: str = "",
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    deactivated = {d.user_id: d for d in db.query(DeactivatedUser).all()}
    total_users = db.query(User).count()

    query = db.query(User)
    term = search.strip().lower()
    if term:
        like = f"%{term}%"
        query = query.filter(
            func.lower(User.name).like(like) | func.lower(User.email).like(like) | func.lower(User.university).like(like)
        )
    users = query.order_by(User.id.desc()).all()

    joined = dict(db.query(SessionPlayer.user_id, func.count(SessionPlayer.id)).group_by(SessionPlayer.user_id).all())
    hosted = dict(db.query(GameSession.host_id, func.count(GameSession.id)).group_by(GameSession.host_id).all())
    saved = dict(db.query(SavedSession.user_id, func.count(SavedSession.id)).group_by(SavedSession.user_id).all())
    results = {
        uid: (count, earned or 0, total or 0)
        for uid, count, earned, total in db.query(
            SessionResult.user_id, func.count(SessionResult.id), func.sum(SessionResult.earned), func.sum(SessionResult.total)
        ).group_by(SessionResult.user_id).all()
    }

    rows = []
    for u in users:
        completed, earned, total = results.get(u.id, (0, 0, 0))
        d = deactivated.get(u.id)
        rows.append({
            **user_to_dict(u),
            "active": d is None,
            "deactivated_at": iso_utc(d.deactivated_at) if d else None,
            "sessions_joined": joined.get(u.id, 0),
            "sessions_hosted": hosted.get(u.id, 0),
            "sessions_completed": completed,
            "overall_percentage": round(earned / total * 100, 1) if total else None,
            "saved_sessions": saved.get(u.id, 0),
        })

    return {
        "summary": {
            "total": total_users,
            "deactivated": len(deactivated),
            "active": total_users - len(deactivated),
        },
        "users": rows
    }

@app.post("/admin/users/{user_id}/deactivate")
def admin_deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_admin(user):
        raise HTTPException(status_code=400, detail="Admin accounts can't be deactivated")
    if not is_deactivated(db, user.id):
        db.add(DeactivatedUser(user_id=user.id, deactivated_at=datetime.utcnow(), deactivated_by=admin.id))
        db.commit()
    return {"status": "deactivated"}

@app.post("/admin/users/{user_id}/activate")
def admin_activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    db.query(DeactivatedUser).filter(DeactivatedUser.user_id == user_id).delete()
    db.commit()
    return {"status": "active"}

@app.get("/admin/saved-sessions")
def admin_list_saved_sessions(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    rows = db.query(SavedSession, User).outerjoin(User, User.id == SavedSession.user_id).order_by(
        SavedSession.updated_at.desc(), SavedSession.id.desc()
    ).all()
    return [{
        **{k: v for k, v in saved_session_to_dict(saved).items() if k != "questions"},
        "owner": {"id": owner.id, "name": owner.name, "email": owner.email} if owner else None
    } for saved, owner in rows]

@app.delete("/admin/saved-sessions/{saved_id}")
def admin_delete_saved_session(
    saved_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    saved = db.query(SavedSession).filter(SavedSession.id == saved_id).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved session not found")
    db.delete(saved)
    db.commit()
    return {"status": "deleted"}

@app.get("/admin/usage")
def admin_usage(
    days: int = 14,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    days = max(1, min(days, 90))
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    window_start = today_start - timedelta(days=days - 1)

    rows = db.query(
        AIUsage.created_at, AIUsage.feature, AIUsage.total_tokens, AIUsage.success
    ).filter(AIUsage.created_at >= window_start).all()

    per_day = {(window_start + timedelta(days=i)).date().isoformat(): {"tokens": 0, "calls": 0, "errors": 0} for i in range(days)}
    by_feature = {}
    today = {"tokens": 0, "calls": 0, "errors": 0}
    for created_at, feature, tokens, success in rows:
        day = per_day.get(created_at.date().isoformat())
        if day is None:
            continue
        day["calls"] += 1
        day["tokens"] += tokens or 0
        if not success:
            day["errors"] += 1
        if created_at >= today_start:
            today["calls"] += 1
            today["tokens"] += tokens or 0
            if not success:
                today["errors"] += 1
            f = by_feature.setdefault(feature, {"feature": feature, "tokens": 0, "calls": 0, "errors": 0})
            f["calls"] += 1
            f["tokens"] += tokens or 0
            if not success:
                f["errors"] += 1

    latest = db.query(AIUsage).filter(AIUsage.remaining_requests.isnot(None)).order_by(AIUsage.id.desc()).first()
    all_time = db.query(func.coalesce(func.sum(AIUsage.total_tokens), 0), func.count(AIUsage.id)).one()

    return {
        "model": GROQ_MODEL,
        "daily_token_limit": GROQ_DAILY_TOKEN_LIMIT,
        "today": {**today, "remaining": max(GROQ_DAILY_TOKEN_LIMIT - today["tokens"], 0)},
        "resets_at": iso_utc(today_start + timedelta(days=1)),
        "groq_limits": {
            "requests_limit_per_day": latest.limit_requests,
            "requests_remaining_today": latest.remaining_requests,
            "tokens_limit_per_minute": latest.limit_tokens,
            "tokens_remaining_this_minute": latest.remaining_tokens,
            "as_of": iso_utc(latest.created_at),
        } if latest else None,
        "by_feature": sorted(by_feature.values(), key=lambda f: f["tokens"], reverse=True),
        "daily": [{"date": d, **v} for d, v in per_day.items()],
        "all_time": {"tokens": all_time[0], "calls": all_time[1]},
    }

# ── WebSocket ─────────────────────────────────────────
@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        # Clients only listen. Every event comes from an authenticated HTTP endpoint,
        # so anything a client sends here is ignored rather than broadcast to the room.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)