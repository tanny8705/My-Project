from application.database import db
from application.models import Rule


def calculate_credits(category: str, hours: int) -> float:
    """Pick the best matching rule tier: highest hours_required that the student still meets."""
    rules = (
        Rule.query.filter_by(category=category)
        .order_by(Rule.hours_required.desc())
        .all()
    )
    for r in rules:
        if hours >= r.hours_required:
            return float(r.credits_awarded)
    return 0.0


def ensure_rules_seed():
    """Idempotent seed for demo; keeps viva story 'rules in database'."""
    if Rule.query.first():
        return
    rows = [
        Rule(category="Internship", hours_required=45, credits_awarded=100),
        Rule(category="Internship", hours_required=30, credits_awarded=70),
        Rule(category="Technical", hours_required=0, credits_awarded=10),
        Rule(category="Cultural", hours_required=0, credits_awarded=8),
        Rule(category="NSS", hours_required=0, credits_awarded=6),
        Rule(category="Sports", hours_required=0, credits_awarded=6),
        Rule(category="Certification", hours_required=0, credits_awarded=15),
    ]
    for row in rows:
        db.session.add(row)
    db.session.commit()
