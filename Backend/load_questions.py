from database import create_tables, SessionLocal, Question
from datasets import load_from_disk
import os

print("Loading MedMCQA dataset...")
dataset = load_from_disk("../../data/medmcqa")

db = SessionLocal()
create_tables()

# Check if questions already loaded
existing = db.query(Question).count()
if existing > 0:
    print(f"Already have {existing} questions in database!")
    db.close()
    exit()

print("Loading questions into database...")
count = 0

for item in dataset['train']:
    try:
        question = Question(
            question=item['question'],
            option_a=item['opa'],
            option_b=item['opb'],
            option_c=item['opc'],
            option_d=item['opd'],
            correct_answer=['a','b','c','d'][item['cop']],
            subject=item.get('subject_name', 'General Medicine'),
            explanation=item.get('exp', '')
        )
        db.add(question)
        count += 1

        # Commit every 1000 questions
        if count % 1000 == 0:
            db.commit()
            print(f"Loaded {count} questions...")

    except Exception as e:
        continue

db.commit()
db.close()
print(f"✅ Done! Loaded {count} questions into database!")