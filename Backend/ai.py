import groq
from groq import Groq
from datetime import datetime
import re
import json
import os
import time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── Groq API Key ──────────────────────────────────────

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = "openai/gpt-oss-120b"




# ── Groq call + usage tracking ────────────────────────
def _header_int(headers, name):
    try:
        return int(float(headers.get(name)))
    except (TypeError, ValueError, AttributeError):
        return None


def _record_usage(feature: str, usage=None, headers=None, error: str = None):
    """Log every Groq call (tokens + rate-limit headers) for the admin usage meter."""
    try:
        from database import SessionLocal, AIUsage
        h = headers or {}
        db = SessionLocal()
        try:
            db.add(AIUsage(
                created_at=datetime.utcnow(),
                feature=feature,
                model=GROQ_MODEL,
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                total_tokens=getattr(usage, "total_tokens", 0) or 0,
                success=error is None,
                error=error,
                limit_requests=_header_int(h, "x-ratelimit-limit-requests"),
                remaining_requests=_header_int(h, "x-ratelimit-remaining-requests"),
                limit_tokens=_header_int(h, "x-ratelimit-limit-tokens"),
                remaining_tokens=_header_int(h, "x-ratelimit-remaining-tokens"),
            ))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"Usage logging error: {e}")


def _chat(feature: str, messages: list, temperature: float, max_tokens: int) -> str:
    client = Groq(api_key=GROQ_API_KEY)
    try:
        raw = client.chat.completions.with_raw_response.create(
            model=GROQ_MODEL,
            reasoning_effort="low",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )
    except groq.APIStatusError as e:
        _record_usage(feature, headers=e.response.headers, error=f"HTTP {e.status_code}")
        raise
    except Exception as e:
        _record_usage(feature, error=type(e).__name__)
        raise
    response = raw.parse()
    _record_usage(feature, response.usage, raw.headers)
    return (response.choices[0].message.content or "").strip()


# ── Helpers: call Groq with retries & parse JSON robustly ──
def _extract_json(text: str):
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _generate_json(feature: str, prompt: str, max_tokens: int, attempts: int = 3):
    for attempt in range(attempts):
        try:
            text = _chat(feature, [
                {"role": "system", "content": "You are a medical exam question generator. Always return valid JSON only. No other text."},
                {"role": "user", "content": prompt}
            ], temperature=0.8, max_tokens=max_tokens)
            data = _extract_json(text)
            if data:
                return data
            print(f"Attempt {attempt+1}: no valid JSON in Groq response")
        except Exception as e:
            print(f"Attempt {attempt+1}: Groq error: {e}")
        if attempt < attempts - 1:
            time.sleep(1.5 * (attempt + 1))
    return None


# ── Dummy load function ───────────────────────────────
def load_model():
    print("✅ Using Groq API for all AI features!")


# ── Generate single question using Groq ───────────────
def generate_single_question(subject: str, difficulty: str, index: int, total: int) -> dict:

    difficulty_context = {
        "easy": "basic undergraduate medical student level",
        "medium": "intermediate clinical year student level",
        "hard": "advanced final year MBBS student level",
        "Pro": "final year MBBS student preparing for professional examinations, including complex clinical scenarios, drug interactions, and integrated medicine"
    }

    question_types = [
        "a clinical case scenario",
        "a pharmacology drug question",
        "an anatomy or pathology question",
        "a diagnosis or investigation question",
        "a treatment or management question"
    ]

    q_type = question_types[index % len(question_types)]
    level = difficulty_context.get(difficulty, 'final year MBBS')

    # Sri Lanka specific context
    sri_lanka_context = ""
    if "Sri Lanka" in subject or subject in ["Community Medicine", "Family Medicine"]:
        sri_lanka_context = """
Important Sri Lanka specific context:
- Follow Ministry of Health Sri Lanka guidelines
- Consider diseases prevalent in Sri Lanka: dengue fever, leptospirosis, typhoid, malaria (northern regions), filariasis, rabies, scrub typhus
- Reference local healthcare system: MOH clinics, divisional hospitals, base hospitals, teaching hospitals (Colombo, Kandy, Galle)
- Consider local drug availability and Essential Medicines List Sri Lanka
- Community medicine questions should reflect Sri Lankan demographics, health statistics and national health programs
- Include tropical disease management where relevant
- Reference Sri Lanka specific screening programs and vaccination schedules
"""

    prompt = f"""Generate a {q_type} about {subject} for {level}.
{sri_lanka_context}
Return ONLY a JSON object in this exact format with no other text:
{{
  "question": "the full question text here",
  "option_a": "first option text",
  "option_b": "second option text",
  "option_c": "third option text",
  "option_d": "fourth option text",
  "option_e": "fifth option text",
  "correct_answer": "a",
  "explanation": "brief explanation of why this is correct"
}}

Make the question clinically accurate and challenging for {level}."""

    q_data = _generate_json("question_sba", prompt, 600)
    if q_data and q_data.get("question"):
        return {
            "id": index + 1,
            "question": q_data.get("question", ""),
            "option_a": q_data.get("option_a", ""),
            "option_b": q_data.get("option_b", ""),
            "option_c": q_data.get("option_c", ""),
            "option_d": q_data.get("option_d", ""),
            "option_e": q_data.get("option_e", ""),
            "correct_answer": str(q_data.get("correct_answer", "a")).strip().lower()[:1],
            "subject": subject,
            "explanation": q_data.get("explanation", "")
        }

    return _fallback_question(subject, index)


#T/F question generation

def generate_tf_question(subject: str, difficulty: str, index: int, total: int) -> dict:
    """Generate a True/False question with 5 statements"""

    difficulty_context = {
        "easy": "basic undergraduate medical student level",
        "medium": "intermediate clinical year student level",
        "hard": "advanced final year MBBS student level",
        "final_year": "final year MBBS student preparing for professional examinations"
    }

    level = difficulty_context.get(difficulty, 'final year MBBS')

    # Sri Lanka specific context
    sri_lanka_context = ""
    if "Sri Lanka" in subject or subject in ["Community Medicine", "Family Medicine"]:
        sri_lanka_context = """
Important Sri Lanka specific context:
- Follow Ministry of Health Sri Lanka guidelines
- Consider diseases prevalent in Sri Lanka: dengue, leptospirosis, typhoid, malaria, filariasis
- Reference local healthcare system and protocols
"""

    prompt = f"""Generate a True/False question about {subject} for {level}.
{sri_lanka_context}
The question should have a stem followed by exactly 5 statements.
Each statement is independently either True or False.
Mix of true and false statements — not all true or all false.

Return ONLY a JSON object in this exact format with no other text:
{{
  "stem": "Regarding [topic], which of the following statements are true?",
  "statement_a": "first statement here",
  "statement_b": "second statement here",
  "statement_c": "third statement here",
  "statement_d": "fourth statement here",
  "statement_e": "fifth statement here",
  "answer_a": true,
  "answer_b": false,
  "answer_c": true,
  "answer_d": false,
  "answer_e": true,
  "explanation_a": "brief reason why A is true/false",
  "explanation_b": "brief reason why B is true/false",
  "explanation_c": "brief reason why C is true/false",
  "explanation_d": "brief reason why D is true/false",
  "explanation_e": "brief reason why E is true/false"
}}

Make statements clinically accurate and challenging for {level}."""

    q_data = _generate_json("question_tf", prompt, 800)
    if q_data and q_data.get("stem"):
        return {
            "id": index + 1,
            "type": "tf",
            "stem": q_data.get("stem", ""),
            "statement_a": q_data.get("statement_a", ""),
            "statement_b": q_data.get("statement_b", ""),
            "statement_c": q_data.get("statement_c", ""),
            "statement_d": q_data.get("statement_d", ""),
            "statement_e": q_data.get("statement_e", ""),
            "answer_a": q_data.get("answer_a", True),
            "answer_b": q_data.get("answer_b", False),
            "answer_c": q_data.get("answer_c", True),
            "answer_d": q_data.get("answer_d", False),
            "answer_e": q_data.get("answer_e", True),
            "explanation_a": q_data.get("explanation_a", ""),
            "explanation_b": q_data.get("explanation_b", ""),
            "explanation_c": q_data.get("explanation_c", ""),
            "explanation_d": q_data.get("explanation_d", ""),
            "explanation_e": q_data.get("explanation_e", ""),
            "subject": subject
        }

    return _fallback_tf_question(subject, index)


def _fallback_tf_question(subject: str, index: int) -> dict:
    return {
        "id": index + 1,
        "type": "tf",
        "stem": f"Regarding {subject} — AI generation failed, please skip.",
        "statement_a": "Statement A",
        "statement_b": "Statement B",
        "statement_c": "Statement C",
        "statement_d": "Statement D",
        "statement_e": "Statement E",
        "answer_a": True,
        "answer_b": False,
        "answer_c": True,
        "answer_d": False,
        "answer_e": True,
        "explanation_a": "",
        "explanation_b": "",
        "explanation_c": "",
        "explanation_d": "",
        "explanation_e": "",
        "subject": subject
    }


def explain_tf_question(stem: str, statements: dict, answers: dict) -> str:
    """Generate explanation for T/F question using Groq"""

    statements_text = "\n".join([
        f"{k.upper()}) {v} → {'TRUE' if answers[k] else 'FALSE'}"
        for k, v in statements.items()
    ])

    prompt = f"""You are a medical education AI helping final year MBBS students in Sri Lanka.
Explain this True/False question in detail.

Question stem: {stem}

Statements and correct answers:
{statements_text}

For each statement explain:
- Why it is TRUE or FALSE
- The clinical/scientific reasoning
- Key points the examiner expects

Also add a clinical pearl at the end."""

    try:
        text = _chat("explain_tf", [
                {
                    "role": "system",
                    "content": "You are an expert medical educator helping final year MBBS students in Sri Lanka prepare for exams."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ], temperature=0.5, max_tokens=1000)

        return text

    except Exception as e:
        print(f"Groq T/F explanation error: {e}")
        return "Explanation unavailable. Please refer to your textbook."

def get_ai_answer(question: str, options: dict) -> str:
    """Ask AI which option is correct"""
    prompt = f"""You are a medical expert. For this MCQ question, identify the single best answer.

Question: {question}

A) {options['a']}
B) {options['b']}
C) {options['c']}
D) {options['d']}
E) {options['e']}

Reply with ONLY a single letter: a, b, c, d, or e"""

    try:
        text = _chat("answer_sba", [
                {"role": "system", "content": "You are a medical expert. Reply with only a single letter."},
                {"role": "user", "content": prompt}
            ], temperature=0.1, max_tokens=300)
        answer = text.lower()
        if answer in ['a','b','c','d','e']:
            return answer
    except Exception as e:
        print(f"AI answer error: {e}")
    return 'a'


def get_ai_tf_answer(stem: str, statement: str) -> bool:
    """Ask AI if a statement is true or false"""
    prompt = f"""You are a medical expert.

Context: {stem}
Statement: {statement}

Is this statement TRUE or FALSE medically?
Reply with ONLY the word: true or false"""

    try:
        text = _chat("answer_tf", [
                {"role": "system", "content": "You are a medical expert. Reply with only true or false."},
                {"role": "user", "content": prompt}
            ], temperature=0.1, max_tokens=300)
        answer = text.lower()
        return answer == 'true'
    except Exception as e:
        print(f"AI T/F answer error: {e}")
    return True

# ── Explain question using Groq ───────────────────────
def explain_question(question: str, options: dict, correct_answer: str) -> str:

    # Add Sri Lanka context if relevant
    sri_lanka_note = ""
    if any(term in question.lower() for term in [
        'dengue', 'leptospirosis', 'typhoid', 'malaria',
        'filariasis', 'community', 'family medicine',
        'sri lanka', 'colombo', 'kandy', 'moh'
    ]):
        sri_lanka_note = "\nNote: Apply Sri Lanka specific guidelines, MOH protocols, and local disease prevalence in your explanation."

    prompt = f"""You are a medical education AI helping final year MBBS students in Sri Lanka.
Provide a detailed explanation for this MCQ question.
{sri_lanka_note}

Question: {question}

Options:
A) {options['a']}
B) {options['b']}
C) {options['c']}
D) {options['d']}
E) {options['e']}

Correct Answer: {correct_answer.upper()}

Please explain:
1. ✅ Why the correct answer is right (mechanism, pathophysiology, guidelines)
2. 🎯 Key points the examiner expects you to know
3. ❌ Why each wrong option is incorrect
4. 💡 Clinical pearl to remember
5. 📚 What to read more about"""

    try:
        text = _chat("explain_sba", [
                {
                    "role": "system",
                    "content": "You are an expert medical educator helping final year MBBS students in Sri Lanka prepare for exams. Give clear, detailed, clinically accurate explanations."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ], temperature=0.5, max_tokens=800)

        return text

    except Exception as e:
        print(f"Groq explanation error: {e}")
        return "Explanation unavailable. Please refer to your textbook."


# ── Fallback question ─────────────────────────────────
def _fallback_question(subject: str, index: int) -> dict:
    return {
        "id": index + 1,
        "question": f"Sample {subject} question {index+1} — AI generation failed, please skip.",
        "option_a": "Option A",
        "option_b": "Option B",
        "option_c": "Option C",
        "option_d": "Option D",
        "option_e": "Option E",
        "correct_answer": "a",
        "subject": subject,
        "explanation": "Please refer to your textbook for this topic."
    }