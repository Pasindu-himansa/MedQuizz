from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, List
import random
import string
import json
from ai import load_model, explain_question, generate_single_question, generate_tf_question, explain_tf_question

from database import get_db, create_tables, User, Question, Session as GameSession, SessionPlayer, Answer
from auth import hash_password, verify_password, create_token, get_current_user

from ai import load_model, explain_question, generate_single_question, generate_tf_question, explain_tf_question, get_ai_answer, get_ai_tf_answer

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

# ── Auth Routes ───────────────────────────────────────
@app.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=req.name,
        email=req.email,
        password=hash_password(req.password),
        university=req.university
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token({"sub": user.email})
    return {"token": token, "name": user.name}

@app.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

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

    session = GameSession(
        room_code=room_code,
        host_id=current_user.id,
        subject="Custom",
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

    # Store questions as-is — no answers yet
    processed = []
    for i, q in enumerate(req.questions):
        q['id'] = i + 1
        # Mark as custom — AI will determine answers at reveal time
        q['correct_answer'] = None
        if q['mode'] == 'tf':
            for key in ['a','b','c','d','e']:
                q[f'answer_{key}'] = None
        processed.append(q)

    session_questions[room_code] = processed
    session_config[room_code] = {
        'subject': 'Custom',
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

    questions = session_questions.get(room_code, [])
    idx = session.current_question
    q = questions[idx]
    mode = session_config.get(room_code, {}).get('mode', 'sba')
    is_custom = session_config.get(room_code, {}).get('is_custom', False)

    # For custom sessions — AI determines answers at reveal time
    if is_custom:
        if mode == 'sba' and not q.get('correct_answer'):
            print("Custom session: AI determining correct answer...")
            q['correct_answer'] = get_ai_answer(
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
                    q[f'answer_{key}'] = get_ai_tf_answer(
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

    questions = session_questions.get(room_code, [])
    idx = session.current_question
    q = questions[idx]
    mode = session_config.get(room_code, {}).get('mode', 'sba')

    print(f"Generating AI explanation for question {idx+1} ({mode} mode)...")

    if mode == 'tf':
        explanation = explain_tf_question(
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
        explanation = explain_question(
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

    questions = session_questions.get(room_code, [])
    idx = session.current_question
    q = questions[idx]

    print(f"Generating AI explanation for question {idx+1}...")

    # Generate AI explanation using local model
    explanation = explain_question(
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

    # Broadcast explanation to all players
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

    if session.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only host can move next")

    config = session_config.get(room_code, {})
    total = config.get('num_questions', 0)

    session.current_question += 1
    db.commit()

    if session.current_question >= total:
        session.status = "finished"
        db.commit()
        await manager.broadcast(room_code, {"type": "session_finished"})
        return {"status": "finished"}

    await manager.broadcast(room_code, {
        "type": "next_question",
        "question_number": session.current_question + 1
    })

    return {"status": "next", "question_number": session.current_question + 1}

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
            Answer.user_id == current_user.id
        ).first()

        if mode == 'sba':
            total_marks += 1
            correct = q.get('correct_answer', '')
            user_answer = answer.answer if answer else None
            is_correct = user_answer == correct

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

# ── WebSocket ─────────────────────────────────────────
@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            await manager.broadcast(room_code, msg)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)