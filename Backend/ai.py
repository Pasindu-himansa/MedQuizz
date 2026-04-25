from groq import Groq
import re
import json
import os

# ── Groq API Key ──────────────────────────────────────

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")




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

    try:
        client = Groq(api_key=GROQ_API_KEY)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a medical exam question generator. Always return valid JSON only. No other text."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.8,
            max_tokens=600
        )

        text = response.choices[0].message.content.strip()
        print(f"Groq generated question {index+1}: {text[:80]}...")

        json_match = re.search(r'\{.*?\}', text, re.DOTALL)
        if json_match:
            q_data = json.loads(json_match.group())
            return {
                "id": index + 1,
                "question": q_data.get("question", ""),
                "option_a": q_data.get("option_a", ""),
                "option_b": q_data.get("option_b", ""),
                "option_c": q_data.get("option_c", ""),
                "option_d": q_data.get("option_d", ""),
                "option_e": q_data.get("option_e", ""),
                "correct_answer": q_data.get("correct_answer", "a").lower(),
                "subject": subject,
                "explanation": q_data.get("explanation", "")
            }
        else:
            print("No JSON found in Groq response")

    except Exception as e:
        print(f"Groq question generation error: {e}")

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

    try:
        client = Groq(api_key=GROQ_API_KEY)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a medical exam question generator. Always return valid JSON only. No other text."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.8,
            max_tokens=800
        )

        text = response.choices[0].message.content.strip()
        print(f"Groq generated T/F question {index+1}: {text[:80]}...")

        json_match = re.search(r'\{.*?\}', text, re.DOTALL)
        if json_match:
            q_data = json.loads(json_match.group())
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

    except Exception as e:
        print(f"Groq T/F generation error: {e}")

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
        client = Groq(api_key=GROQ_API_KEY)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert medical educator helping final year MBBS students in Sri Lanka prepare for exams."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.5,
            max_tokens=1000
        )

        return response.choices[0].message.content.strip()

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
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a medical expert. Reply with only a single letter."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=5
        )
        answer = response.choices[0].message.content.strip().lower()
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
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a medical expert. Reply with only true or false."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=5
        )
        answer = response.choices[0].message.content.strip().lower()
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
        client = Groq(api_key=GROQ_API_KEY)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert medical educator helping final year MBBS students in Sri Lanka prepare for exams. Give clear, detailed, clinically accurate explanations."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.5,
            max_tokens=800
        )

        return response.choices[0].message.content.strip()

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