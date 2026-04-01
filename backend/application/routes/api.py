from __future__ import annotations

import os
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import case, func
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from flask_security import hash_password
from flask_security.utils import verify_and_update_password
from werkzeug.utils import secure_filename

from application.database import db
from application.models import (
    Activity,
    CreditSummary,
    Faculty,
    Rule,
    Student,
    User,
    VerificationLog,
)
from application.utils.credits import calculate_credits

api_bp = Blueprint("api", __name__, url_prefix="/api")

ALLOWED_PROOF = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}


def _user_roles(user: User) -> list[str]:
    return [r.name for r in user.roles]


def _load_user() -> User | None:
    uid = get_jwt_identity()
    if uid is None:
        return None
    return db.session.get(User, int(uid))


def _require_roles(*allowed: str):
    user = _load_user()
    if not user:
        return None, (jsonify({"error": "Unauthorized"}), 401)
    roles = set(_user_roles(user))
    if not roles.intersection(set(allowed)):
        return None, (jsonify({"error": "Forbidden"}), 403)
    return user, None


def _activity_to_dict(a: Activity) -> dict:
    st = a.student
    return {
        "id": a.id,
        "student_id": a.student_id,
        "student_name": st.name if st else None,
        "prn": st.prn if st else None,
        "title": a.title,
        "description": a.description,
        "activity_type": a.activity_type,
        "role": a.role,
        "contact_hours": a.contact_hours,
        "additional_hours": a.additional_hours,
        "total_hours": a.total_hours,
        "proof_path": a.proof_path,
        "status": a.status,
        "points_earned": a.points_earned,
        "verified_by_faculty": a.verified_by_faculty,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _refresh_credit_summary(student_id: int) -> None:
    # Keep "activity" and "internship" totals separate for dashboard clarity.
    total_activity = (
        db.session.query(func.coalesce(func.sum(Activity.points_earned), 0.0))
        .filter(
            Activity.student_id == student_id,
            Activity.status == "approved",
            Activity.activity_type != "Internship",
        )
        .scalar()
    )
    total_internship = (
        db.session.query(func.coalesce(func.sum(Activity.points_earned), 0.0))
        .filter(
            Activity.student_id == student_id,
            Activity.status == "approved",
            Activity.activity_type == "Internship",
        )
        .scalar()
    )
    cs = CreditSummary.query.filter_by(student_id=student_id).first()
    if not cs:
        cs = CreditSummary(student_id=student_id)
        db.session.add(cs)
    cs.total_activity_points = float(total_activity or 0)
    cs.total_internship_points = float(total_internship or 0)
    cs.last_updated = datetime.utcnow()


@api_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "student").strip().lower()
    if role not in ("student", "faculty"):
        return jsonify({"error": "role must be student or faculty"}), 400
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    ds = current_app.security.datastore
    user = ds.create_user(
        email=email,
        password=hash_password(password),
        roles=[role],
        active=True,
    )
    db.session.commit()

    if role == "student":
        st = Student(
            user_id=user.id,
            name=(data.get("name") or "").strip() or email.split("@")[0],
            prn=(data.get("prn") or "").strip() or f"PRN-{user.id}",
            department=(data.get("department") or "CS").strip(),
            class_year=(data.get("class_year") or "SE").strip(),
            division=(data.get("division") or "A").strip(),
            roll_no=(data.get("roll_no") or "").strip() or str(user.id),
        )
        db.session.add(st)
        db.session.flush()
        db.session.add(CreditSummary(student_id=st.id))
    else:
        fac = Faculty(
            user_id=user.id,
            name=(data.get("name") or "").strip() or email.split("@")[0],
            department=(data.get("department") or "CS").strip(),
            designation=(data.get("designation") or "Mentor").strip(),
        )
        db.session.add(fac)

    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify(
        {
            "access_token": token,
            "user": {"id": user.id, "email": user.email, "roles": _user_roles(user)},
        }
    ), 201


@api_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not verify_and_update_password(password, user):
        return jsonify({"error": "Invalid credentials"}), 401
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify(
        {
            "access_token": token,
            "user": {"id": user.id, "email": user.email, "roles": _user_roles(user)},
        }
    )


@api_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    payload = {"id": user.id, "email": user.email, "roles": _user_roles(user)}
    st = Student.query.filter_by(user_id=user.id).first()
    if st:
        payload["student"] = {
            "id": st.id,
            "name": st.name,
            "prn": st.prn,
            "department": st.department,
            "class_year": st.class_year,
        }
    fac = Faculty.query.filter_by(user_id=user.id).first()
    if fac:
        payload["faculty"] = {
            "id": fac.id,
            "name": fac.name,
            "department": fac.department,
            "designation": fac.designation,
        }
    return jsonify(payload)


@api_bp.route("/activity/add", methods=["POST"])
@jwt_required()
def activity_add():
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"error": "Student profile missing"}), 400

    title = request.form.get("title", "").strip()
    activity_type = request.form.get("activity_type", "").strip()
    description = request.form.get("description", "").strip()
    role = request.form.get("role", "Participated").strip()
    contact_hours = int(request.form.get("contact_hours") or 0)
    additional_hours = int(request.form.get("additional_hours") or 0)
    total_hours = int(request.form.get("total_hours") or (contact_hours + additional_hours))

    if not title or not activity_type:
        return jsonify({"error": "title and activity_type required"}), 400

    proof_path = None
    f = request.files.get("proof")
    if f and f.filename:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_PROOF:
            return jsonify({"error": "Proof must be pdf or image"}), 400
        upload_dir = os.path.join(current_app.root_path, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        fname = secure_filename(f"{st.id}_{datetime.utcnow().timestamp()}_{f.filename}")
        path = os.path.join(upload_dir, fname)
        f.save(path)
        proof_path = f"uploads/{fname}"

    act = Activity(
        student_id=st.id,
        title=title,
        description=description or None,
        activity_type=activity_type,
        role=role,
        contact_hours=contact_hours,
        additional_hours=additional_hours,
        total_hours=total_hours,
        proof_path=proof_path,
        status="pending",
        points_earned=None,
    )
    db.session.add(act)
    db.session.commit()
    return jsonify({"message": "Submitted", "activity": _activity_to_dict(act)}), 201


@api_bp.route("/activity/all", methods=["GET"])
@jwt_required()
def activity_all():
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    roles = _user_roles(user)
    status_filter = request.args.get("status")

    if "student" in roles:
        st = Student.query.filter_by(user_id=user.id).first()
        if not st:
            return jsonify({"activities": []})
        q = Activity.query.filter_by(student_id=st.id)
        if status_filter:
            q = q.filter(Activity.status == status_filter)
        acts = q.order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})

    if "faculty" in roles or "admin" in roles:
        q = Activity.query
        if status_filter:
            q = q.filter(Activity.status == status_filter)
        acts = q.order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})

    return jsonify({"error": "Forbidden"}), 403


@api_bp.route("/activity/<int:aid>", methods=["GET"])
@jwt_required()
def activity_one(aid: int):
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    a = db.session.get(Activity, aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    roles = _user_roles(user)
    if "student" in roles:
        st = Student.query.filter_by(user_id=user.id).first()
        if not st or a.student_id != st.id:
            return jsonify({"error": "Forbidden"}), 403
    elif "faculty" not in roles and "admin" not in roles:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"activity": _activity_to_dict(a)})


@api_bp.route("/activity/approve/<int:aid>", methods=["POST"])
@jwt_required()
def activity_approve(aid: int):
    user, err = _require_roles("faculty", "admin")
    if err:
        return err
    a = db.session.get(Activity, aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    if a.status != "pending":
        return jsonify({"error": "Activity not pending"}), 400

    hours = int(a.total_hours or 0)
    cat = (a.activity_type or "").strip()
    pts = calculate_credits(cat, hours)
    a.points_earned = pts
    a.status = "approved"
    a.verified_by_faculty = True
    _refresh_credit_summary(a.student_id)

    fac = Faculty.query.filter_by(user_id=user.id).first()
    log = VerificationLog(
        faculty_id=fac.id if fac else None,
        student_id=a.student_id,
        type="activity",
        reference_id=a.id,
        status="approved",
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Approved", "activity": _activity_to_dict(a)})


@api_bp.route("/activity/reject/<int:aid>", methods=["POST"])
@jwt_required()
def activity_reject(aid: int):
    user, err = _require_roles("faculty", "admin")
    if err:
        return err
    a = db.session.get(Activity, aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    if a.status != "pending":
        return jsonify({"error": "Activity not pending"}), 400

    data = request.get_json(silent=True) or {}
    a.points_earned = 0
    a.status = "rejected"
    a.verified_by_faculty = False
    _refresh_credit_summary(a.student_id)

    fac = Faculty.query.filter_by(user_id=user.id).first()
    log = VerificationLog(
        faculty_id=fac.id if fac else None,
        student_id=a.student_id,
        type="activity",
        reference_id=a.id,
        status="rejected",
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Rejected", "activity": _activity_to_dict(a)})


@api_bp.route("/credits/total", methods=["GET"])
@jwt_required()
def credits_total():
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"total": 0, "target": 200})
    cs = CreditSummary.query.filter_by(student_id=st.id).first()
    total = float(cs.total_activity_points) if cs else 0.0
    intern = float(cs.total_internship_points) if cs else 0.0
    return jsonify(
        {
            "total_activity_points": total,
            "total_internship_points": intern,
            "grand_total": total + intern,
            "target": 200,
        }
    )


@api_bp.route("/credits/breakdown", methods=["GET"])
@jwt_required()
def credits_breakdown():
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"breakdown": []})
    rows = (
        db.session.query(
            Activity.activity_type,
            func.coalesce(func.sum(Activity.points_earned), 0.0),
        )
        .filter(Activity.student_id == st.id, Activity.status == "approved")
        .group_by(Activity.activity_type)
        .all()
    )
    breakdown = [{"category": r[0] or "Unknown", "points": float(r[1])} for r in rows]
    return jsonify({"breakdown": breakdown})


@api_bp.route("/rules", methods=["GET"])
def rules_list():
    """Public read so viva can show 'rules from database'."""
    rules = Rule.query.order_by(Rule.category, Rule.hours_required.desc()).all()
    return jsonify(
        {
            "rules": [
                {
                    "id": r.id,
                    "category": r.category,
                    "hours_required": r.hours_required,
                    "credits_awarded": r.credits_awarded,
                }
                for r in rules
            ]
        }
    )


@api_bp.route("/rules", methods=["POST"])
@jwt_required()
def rules_add():
    user, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    cat = (data.get("category") or "").strip()
    try:
        hrs = int(data.get("hours_required", 0))
        cred = int(data.get("credits_awarded", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid numbers"}), 400
    if not cat:
        return jsonify({"error": "category required"}), 400
    r = Rule(category=cat, hours_required=hrs, credits_awarded=cred)
    db.session.add(r)
    db.session.commit()
    return jsonify({"rule": {"id": r.id, "category": r.category, "hours_required": hrs, "credits_awarded": cred}}), 201


@api_bp.route("/admin/stats", methods=["GET"])
@jwt_required()
def admin_stats():
    """Admin dashboard metrics: total students, pending requests, and total approved credits."""
    _, err = _require_roles("admin")
    if err:
        return err

    total_students = int(db.session.query(func.count(Student.id)).scalar() or 0)
    pending_requests = int(
        db.session.query(func.count(Activity.id)).filter(Activity.status == "pending").scalar() or 0
    )
    approved_credits = float(
        db.session.query(func.coalesce(func.sum(Activity.points_earned), 0.0))
        .filter(Activity.status == "approved")
        .scalar()
        or 0.0
    )

    return jsonify(
        {
            "total_students": total_students,
            "pending_requests": pending_requests,
            "approved_credits": approved_credits,
        }
    )


@api_bp.route("/admin/reports/student-credits", methods=["GET"])
@jwt_required()
def admin_student_credits():
    """Student-wise credits report for export (approved activities only)."""
    _, err = _require_roles("admin")
    if err:
        return err

    # Outer join so students with zero approved credits still show up.
    join_cond = (Activity.student_id == Student.id) & (Activity.status == "approved")
    rows = (
        db.session.query(
            Student.id,
            Student.name,
            Student.prn,
            func.coalesce(
                func.sum(
                    case(
                        (Activity.activity_type == "Internship", func.coalesce(Activity.points_earned, 0.0)),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("internship_points"),
            func.coalesce(
                func.sum(
                    case(
                        (Activity.activity_type != "Internship", func.coalesce(Activity.points_earned, 0.0)),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("activity_points"),
        )
        .select_from(Student)
        .outerjoin(Activity, join_cond)
        .group_by(Student.id, Student.name, Student.prn)
        .order_by(Student.id)
        .all()
    )

    report = []
    for r in rows:
        activity_points = float(r.activity_points or 0.0)
        internship_points = float(r.internship_points or 0.0)
        report.append(
            {
                "student_id": r.id,
                "name": r.name,
                "prn": r.prn,
                "activity_points": activity_points,
                "internship_points": internship_points,
                "grand_total": activity_points + internship_points,
            }
        )

    return jsonify({"students": report})
