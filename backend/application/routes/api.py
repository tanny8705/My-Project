from __future__ import annotations

import os
from datetime import datetime

import csv
import io

from flask import Blueprint, current_app, jsonify, request, Response
from sqlalchemy import case, func
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from flask_security import hash_password
from flask_security.utils import verify_and_update_password
from werkzeug.utils import secure_filename

from application.database import db
from application.models import (
    Activity,
    CreditSummary,
    Department,
    Faculty,
    Internship,
    Rule,
    Student,
    User,
    UserRoles,
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


def _ensure_user_allowed(user: User):
    if not getattr(user, "active", True):
        return jsonify({"error": "Account disabled"}), 403
    status = getattr(user, "status", "active") or "active"
    if status != "active":
        return jsonify({"error": f"Account {status}", "reason": getattr(user, "status_reason", None)}), 403
    return None


def _get_actor_department_id(user: User) -> int | None:
    fac = Faculty.query.filter_by(user_id=user.id).first()
    if fac:
        if getattr(fac, "department_id", None):
            return fac.department_id
        if getattr(fac, "department", None):
            d = Department.query.filter_by(code=fac.department).first() or Department.query.filter_by(name=fac.department).first()
            return d.id if d else None
    st = Student.query.filter_by(user_id=user.id).first()
    if st:
        if getattr(st, "department_id", None):
            return st.department_id
        if getattr(st, "department", None):
            d = Department.query.filter_by(code=st.department).first() or Department.query.filter_by(name=st.department).first()
            return d.id if d else None
    return None


def _get_actor_division(user: User) -> str | None:
    fac = Faculty.query.filter_by(user_id=user.id).first()
    if fac:
        div = (getattr(fac, "division", None) or "").strip()
        return div or None
    st = Student.query.filter_by(user_id=user.id).first()
    if st:
        div = (getattr(st, "division", None) or "").strip()
        return div or None
    return None


def _apply_student_scope(user: User, q, *, student_model=Student):
    """Apply dept+division scoping for faculty/hod. Admin is handled by callers."""
    roles = set(_user_roles(user))
    if "faculty" in roles or "hod" in roles:
        dept_id = _get_actor_department_id(user)
        div = _get_actor_division(user)
        if dept_id:
            q = q.filter(student_model.department_id == dept_id)
        if div:
            q = q.filter(func.lower(student_model.division) == div.lower())
    return q


def _require_roles(*allowed: str):
    user = _load_user()
    if not user:
        return None, (jsonify({"error": "Unauthorized"}), 401)
    blocked = _ensure_user_allowed(user)
    if blocked:
        return None, blocked
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
        db.session.query(func.coalesce(func.sum(Internship.credit_points), 0.0))
        .filter(Internship.student_id == student_id, Internship.status == "approved")
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
        dept_code = (data.get("department") or "CSE").strip().upper()
        dept = Department.query.filter_by(code=dept_code).first() or Department.query.filter_by(name=dept_code).first()
        student_type = (data.get("student_type") or "regular").strip().lower()
        if student_type not in ("regular", "lateral"):
            return jsonify({"error": "student_type must be regular or lateral"}), 400
        st = Student(
            user_id=user.id,
            name=(data.get("name") or "").strip() or email.split("@")[0],
            prn=(data.get("prn") or "").strip() or f"PRN-{user.id}",
            department_id=dept.id if dept else None,
            department=dept.code if dept else dept_code,
            class_year=(data.get("class_year") or "SE").strip(),
            division=(data.get("division") or "A").strip(),
            roll_no=(data.get("roll_no") or "").strip() or str(user.id),
            tuf_id=(data.get("tuf_id") or "").strip() or None,
            student_type=student_type,
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
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
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
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
    payload = {"id": user.id, "email": user.email, "roles": _user_roles(user)}
    st = Student.query.filter_by(user_id=user.id).first()
    if st:
        dept_name = st.dept.name if getattr(st, "dept", None) else None
        payload["student"] = {
            "id": st.id,
            "name": st.name,
            "prn": st.prn,
            "roll_no": st.roll_no,
            "division": st.division,
            "tuf_id": getattr(st, "tuf_id", None),
            "student_type": getattr(st, "student_type", "regular"),
            "department": dept_name or st.department,
            "class_year": st.class_year,
        }
    fac = Faculty.query.filter_by(user_id=user.id).first()
    if fac:
        dept_name = fac.dept.name if getattr(fac, "dept", None) else None
        payload["faculty"] = {
            "id": fac.id,
            "name": fac.name,
            "department": dept_name or fac.department,
            "designation": fac.designation,
            "division": getattr(fac, "division", None),
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
    # Prevent duplicate entries for the same student/activity payload.
    dup = Activity.query.filter_by(
        student_id=st.id,
        title=title,
        activity_type=activity_type,
        total_hours=total_hours,
        status="pending",
    ).first()
    if dup:
        return jsonify({"error": "Duplicate activity submission already pending"}), 409

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


def _internship_to_dict(i: Internship) -> dict:
    st = i.student
    return {
        "id": i.id,
        "student_id": i.student_id,
        "student_name": st.name if st else None,
        "prn": st.prn if st else None,
        "title": i.title,
        "company_name": i.company_name,
        "internship_type": i.internship_type,
        "duration_days": i.duration_days,
        "total_hours": i.total_hours,
        "academic_year": i.academic_year,
        "report_path": i.report_path,
        "status": i.status,
        "credit_points": i.credit_points,
        "verified_by_hod": i.verified_by_hod,
        "verified_by_tpo": i.verified_by_tpo,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


@api_bp.route("/internship/add", methods=["POST"])
@jwt_required()
def internship_add():
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"error": "Student profile missing"}), 400

    title = request.form.get("title", "").strip()
    company_name = request.form.get("company_name", "").strip()
    internship_type = request.form.get("internship_type", "").strip()  # in_house / out_house
    duration_days = int(request.form.get("duration_days") or 0)
    total_hours = int(request.form.get("total_hours") or 0)
    academic_year = request.form.get("academic_year")
    academic_year = int(academic_year) if academic_year else None

    if internship_type not in ("in_house", "out_house"):
        return jsonify({"error": "internship_type must be in_house or out_house"}), 400
    if not title or not company_name:
        return jsonify({"error": "title and company_name required"}), 400
    if total_hours <= 0:
        return jsonify({"error": "total_hours must be > 0"}), 400

    report_path = None
    f = request.files.get("report")
    if f and f.filename:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_PROOF:
            return jsonify({"error": "Report must be pdf or image"}), 400
        upload_dir = os.path.join(current_app.root_path, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        fname = secure_filename(f"{st.id}_intern_{datetime.utcnow().timestamp()}_{f.filename}")
        path = os.path.join(upload_dir, fname)
        f.save(path)
        report_path = f"uploads/{fname}"

    it = Internship(
        student_id=st.id,
        title=title,
        company_name=company_name,
        internship_type=internship_type,
        duration_days=duration_days or None,
        total_hours=total_hours,
        academic_year=academic_year,
        report_path=report_path,
        status="pending",
        credit_points=None,
        verified_by_hod=False,
        verified_by_tpo=False,
    )
    db.session.add(it)
    db.session.commit()
    return jsonify({"message": "Submitted", "internship": _internship_to_dict(it)}), 201


@api_bp.route("/internship/all", methods=["GET"])
@jwt_required()
def internship_all():
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
    roles = _user_roles(user)
    status_filter = request.args.get("status")

    if "student" in roles:
        st = Student.query.filter_by(user_id=user.id).first()
        if not st:
            return jsonify({"internships": []})
        q = Internship.query.filter_by(student_id=st.id)
        if status_filter:
            q = q.filter(Internship.status == status_filter)
        items = q.order_by(Internship.created_at.desc()).all()
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    if "admin" in roles:
        q = Internship.query
        if status_filter:
            q = q.filter(Internship.status == status_filter)
        items = q.order_by(Internship.created_at.desc()).all()
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    if "tpo" in roles:
        q = Internship.query.filter_by(internship_type="out_house")
        if status_filter:
            q = q.filter(Internship.status == status_filter)
        items = q.order_by(Internship.created_at.desc()).all()
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    if "hod" in roles or "faculty" in roles:
        q = Internship.query.join(Student, Internship.student_id == Student.id)
        q = _apply_student_scope(user, q, student_model=Student)
        if status_filter:
            q = q.filter(Internship.status == status_filter)
        items = q.order_by(Internship.created_at.desc()).all()
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    return jsonify({"error": "Forbidden"}), 403


def _internship_credits_from_hours(total_hours: int) -> float:
    # Spec: (40–45 hrs = 1 credit). We implement a simple conservative rule: 45 hours = 1 credit.
    if total_hours <= 0:
        return 0.0
    return float(total_hours // 45)


@api_bp.route("/internship/queue", methods=["GET"])
@jwt_required()
def internship_queue():
    """Return the current verifier's relevant internship queue.

    - TPO: out_house + pending
    - HOD: in_house + pending, plus out_house + tpo_verified
    - Admin: all internships not approved/rejected (pending + tpo_verified)
    """
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
    roles = set(_user_roles(user))

    if "admin" in roles:
        items = (
            Internship.query.filter(Internship.status.in_(["pending", "tpo_verified"]))
            .order_by(Internship.created_at.desc())
            .all()
        )
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    if "tpo" in roles:
        items = (
            Internship.query.filter_by(internship_type="out_house", status="pending")
            .order_by(Internship.created_at.desc())
            .all()
        )
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    if "hod" in roles:
        q = Internship.query.filter(
                ((Internship.internship_type == "in_house") & (Internship.status == "pending"))
                | ((Internship.internship_type == "out_house") & (Internship.status == "tpo_verified"))
            )
        q = q.join(Student, Internship.student_id == Student.id)
        q = _apply_student_scope(user, q, student_model=Student)
        items = q.order_by(Internship.created_at.desc()).all()
        return jsonify({"internships": [_internship_to_dict(i) for i in items]})

    return jsonify({"error": "Forbidden"}), 403


@api_bp.route("/internship/approve/<int:iid>", methods=["POST"])
@jwt_required()
def internship_approve(iid: int):
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    roles = set(_user_roles(user))

    it = db.session.get(Internship, iid)
    if not it:
        return jsonify({"error": "Not found"}), 404
    # Enforce dept+division scoping (non-admin)
    if "admin" not in roles and ("hod" in roles or "faculty" in roles or "tpo" in roles):
        dept_id = _get_actor_department_id(user)
        div = _get_actor_division(user)
        if (dept_id and it.student and it.student.department_id != dept_id) or (
            div and it.student and (it.student.division or "").lower() != div.lower()
        ):
            return jsonify({"error": "Forbidden for this student scope"}), 403
    # Two-stage for out-house (matches documentation): TPO verifies → HOD final approves.
    if it.internship_type == "in_house":
        if it.status != "pending":
            return jsonify({"error": "In-house internship not pending"}), 400
        if "hod" not in roles and "admin" not in roles:
            return jsonify({"error": "Only HOD/Admin can approve in-house internships"}), 403
        it.verified_by_hod = True
        it.credit_points = _internship_credits_from_hours(int(it.total_hours or 0))
        it.status = "approved"
        _refresh_credit_summary(it.student_id)

    elif it.internship_type == "out_house":
        if "admin" in roles:
            it.verified_by_tpo = True
            it.verified_by_hod = True
            it.credit_points = _internship_credits_from_hours(int(it.total_hours or 0))
            it.status = "approved"
            _refresh_credit_summary(it.student_id)
        elif "tpo" in roles:
            if it.status != "pending":
                return jsonify({"error": "Out-house internship not pending"}), 400
            it.verified_by_tpo = True
            it.status = "tpo_verified"
        elif "hod" in roles:
            if it.status != "tpo_verified":
                return jsonify({"error": "Out-house internship must be TPO-verified first"}), 400
            it.verified_by_hod = True
            it.credit_points = _internship_credits_from_hours(int(it.total_hours or 0))
            it.status = "approved"
            _refresh_credit_summary(it.student_id)
        else:
            return jsonify({"error": "Forbidden"}), 403
    else:
        return jsonify({"error": "Invalid internship type"}), 400

    fac = Faculty.query.filter_by(user_id=user.id).first()
    db.session.add(
        VerificationLog(
            faculty_id=fac.id if fac else None,
            student_id=it.student_id,
            type="internship",
            reference_id=it.id,
            status=it.status,
        )
    )
    db.session.commit()
    return jsonify({"message": "Approved", "internship": _internship_to_dict(it)})


@api_bp.route("/internship/reject/<int:iid>", methods=["POST"])
@jwt_required()
def internship_reject(iid: int):
    user, err = _require_roles("admin", "hod", "tpo")
    if err:
        return err
    it = db.session.get(Internship, iid)
    if not it:
        return jsonify({"error": "Not found"}), 404
    # Enforce dept+division scoping (non-admin)
    if "admin" not in _user_roles(user):
        dept_id = _get_actor_department_id(user)
        div = _get_actor_division(user)
        if (dept_id and it.student and it.student.department_id != dept_id) or (
            div and it.student and (it.student.division or "").lower() != div.lower()
        ):
            return jsonify({"error": "Forbidden for this student scope"}), 403
    if it.status not in ("pending", "tpo_verified"):
        return jsonify({"error": "Internship not pending"}), 400

    it.status = "rejected"
    it.credit_points = 0.0
    it.verified_by_hod = False
    it.verified_by_tpo = False
    _refresh_credit_summary(it.student_id)

    fac = Faculty.query.filter_by(user_id=user.id).first()
    db.session.add(
        VerificationLog(
            faculty_id=fac.id if fac else None,
            student_id=it.student_id,
            type="internship",
            reference_id=it.id,
            status="rejected",
        )
    )
    db.session.commit()
    return jsonify({"message": "Rejected", "internship": _internship_to_dict(it)})


@api_bp.route("/activity/all", methods=["GET"])
@jwt_required()
def activity_all():
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
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

    if "admin" in roles:
        q = Activity.query
        if status_filter:
            q = q.filter(Activity.status == status_filter)
        acts = q.order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})

    if "faculty" in roles or "hod" in roles:
        q = Activity.query.join(Student, Activity.student_id == Student.id)
        q = _apply_student_scope(user, q, student_model=Student)
        if status_filter:
            q = q.filter(Activity.status == status_filter)
        acts = q.order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})

    return jsonify({"error": "Forbidden"}), 403


@api_bp.route("/activity/queue", methods=["GET"])
@jwt_required()
def activity_queue():
    """Verifier queue for activities (currently: faculty/admin see pending)."""
    user = _load_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = _ensure_user_allowed(user)
    if blocked:
        return blocked
    roles = set(_user_roles(user))
    if "admin" in roles:
        acts = Activity.query.filter_by(status="pending").order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})
    if "faculty" in roles or "hod" in roles:
        q = Activity.query.filter_by(status="pending").join(Student, Activity.student_id == Student.id)
        q = _apply_student_scope(user, q, student_model=Student)
        acts = q.order_by(Activity.created_at.desc()).all()
        return jsonify({"activities": [_activity_to_dict(a) for a in acts]})
    return jsonify({"error": "Forbidden"}), 403


@api_bp.route("/admin/departments", methods=["GET"])
@jwt_required()
def admin_departments_list():
    _, err = _require_roles("admin")
    if err:
        return err
    deps = Department.query.order_by(Department.code).all()
    return jsonify({"departments": [{"id": d.id, "code": d.code, "name": d.name} for d in deps]})


@api_bp.route("/admin/departments", methods=["POST"])
@jwt_required()
def admin_departments_add():
    _, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return jsonify({"error": "code and name required"}), 400
    if Department.query.filter_by(code=code).first():
        return jsonify({"error": "Department already exists"}), 409
    d = Department(code=code, name=name)
    db.session.add(d)
    db.session.commit()
    return jsonify({"department": {"id": d.id, "code": d.code, "name": d.name}}), 201


@api_bp.route("/admin/users", methods=["POST"])
@jwt_required()
def admin_create_user():
    """Admin creates any user with role + optional department binding."""
    _, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip().lower()
    dept_code = (data.get("department_code") or "").strip().upper()
    division = (data.get("division") or "").strip()

    if role not in ("student", "faculty", "hod", "tpo", "admin"):
        return jsonify({"error": "invalid role"}), 400
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409

    dept = Department.query.filter_by(code=dept_code).first() if dept_code else None
    if role in ("student", "faculty", "hod") and not dept:
        return jsonify({"error": "department_code required for student/faculty/hod"}), 400
    if role in ("faculty", "hod") and not division:
        return jsonify({"error": "division required for faculty/hod"}), 400

    ds = current_app.security.datastore
    user = ds.create_user(email=email, password=hash_password(password), roles=[role], active=True)
    db.session.flush()

    if role == "student":
        student_type = (data.get("student_type") or "regular").strip().lower()
        if student_type not in ("regular", "lateral"):
            return jsonify({"error": "student_type must be regular or lateral"}), 400
        st = Student(
            user_id=user.id,
            name=(data.get("name") or email.split("@")[0]).strip(),
            prn=(data.get("prn") or f"PRN-{user.id}").strip(),
            department_id=dept.id if dept else None,
            department=dept.code if dept else dept_code,
            class_year=(data.get("class_year") or "SE").strip(),
            division=(data.get("division") or "A").strip(),
            roll_no=(data.get("roll_no") or str(user.id)).strip(),
            tuf_id=(data.get("tuf_id") or "").strip() or None,
            student_type=student_type,
        )
        db.session.add(st)
        db.session.flush()
        db.session.add(CreditSummary(student_id=st.id))

    if role in ("faculty", "hod", "tpo"):
        fac = Faculty(
            user_id=user.id,
            name=(data.get("name") or email.split("@")[0]).strip(),
            department_id=dept.id if dept else None,
            department=dept.code if dept else (dept_code or None),
            division=division or None,
            designation=(data.get("designation") or role.upper()).strip(),
        )
        db.session.add(fac)

    db.session.commit()
    return jsonify({"user": {"id": user.id, "email": user.email, "roles": _user_roles(user)}}), 201


@api_bp.route("/admin/users/<int:uid>/status", methods=["POST"])
@jwt_required()
def admin_set_user_status(uid: int):
    _, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip().lower()
    reason = (data.get("reason") or "").strip() or None
    if status not in ("active", "blocked", "blacklisted"):
        return jsonify({"error": "status must be active/blocked/blacklisted"}), 400
    u = db.session.get(User, uid)
    if not u:
        return jsonify({"error": "Not found"}), 404
    u.status = status
    u.status_reason = reason
    u.active = status == "active"
    db.session.commit()
    return jsonify({"user": {"id": u.id, "email": u.email, "status": u.status, "reason": u.status_reason}})


@api_bp.route("/admin/users/<int:uid>", methods=["PUT"])
@jwt_required()
def admin_update_user(uid: int):
    """Admin updates user + attached student/faculty profile fields."""
    _, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}

    u = db.session.get(User, uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    new_email = (data.get("email") or "").strip().lower() or None
    new_password = data.get("password") or None
    if new_email and new_email != u.email:
        if User.query.filter(User.email == new_email, User.id != u.id).first():
            return jsonify({"error": "Email already exists"}), 409
        u.email = new_email
    if new_password:
        u.password = hash_password(str(new_password))

    dept_code = (data.get("department_code") or "").strip().upper() or None
    dept = Department.query.filter_by(code=dept_code).first() if dept_code else None

    st = Student.query.filter_by(user_id=u.id).first()
    if st:
        if "name" in data:
            st.name = (data.get("name") or "").strip() or None
        if "prn" in data:
            st.prn = (data.get("prn") or "").strip() or None
        if "roll_no" in data:
            st.roll_no = (data.get("roll_no") or "").strip() or None
        if "tuf_id" in data:
            st.tuf_id = (data.get("tuf_id") or "").strip() or None
        if "division" in data:
            st.division = (data.get("division") or "").strip() or None
        if "class_year" in data:
            st.class_year = (data.get("class_year") or "").strip() or None
        if "student_type" in data:
            st_type = (data.get("student_type") or "").strip().lower() or None
            if st_type and st_type not in ("regular", "lateral"):
                return jsonify({"error": "student_type must be regular or lateral"}), 400
            if st_type:
                st.student_type = st_type
        if dept:
            st.department_id = dept.id
            st.department = dept.code

    fac = Faculty.query.filter_by(user_id=u.id).first()
    if fac:
        if "name" in data:
            fac.name = (data.get("name") or "").strip() or None
        if "designation" in data:
            fac.designation = (data.get("designation") or "").strip() or None
        if "division" in data:
            fac.division = (data.get("division") or "").strip() or None
        # department_code optional for TPO (global)
        if dept:
            fac.department_id = dept.id
            fac.department = dept.code
        elif dept_code is not None and dept_code == "":
            fac.department_id = None
            fac.department = None

    db.session.commit()
    return jsonify({"message": "Updated"})


@api_bp.route("/admin/departments/<int:did>", methods=["PUT"])
@jwt_required()
def admin_update_department(did: int):
    _, err = _require_roles("admin")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    d = db.session.get(Department, did)
    if not d:
        return jsonify({"error": "Not found"}), 404
    code = (data.get("code") or "").strip().upper() or None
    name = (data.get("name") or "").strip() or None
    if code and code != d.code:
        if Department.query.filter(Department.code == code, Department.id != d.id).first():
            return jsonify({"error": "Department code already exists"}), 409
        d.code = code
    if name:
        d.name = name
    db.session.commit()
    return jsonify({"department": {"id": d.id, "code": d.code, "name": d.name}})


@api_bp.route("/admin/users", methods=["GET"])
@jwt_required()
def admin_list_users():
    _, err = _require_roles("admin")
    if err:
        return err
    role_filter = (request.args.get("role") or "").strip().lower()
    users = User.query.order_by(User.id.desc()).all()
    rows = []
    for u in users:
        u_roles = _user_roles(u)
        if role_filter and role_filter not in u_roles:
            continue
        fac = Faculty.query.filter_by(user_id=u.id).first()
        stu = Student.query.filter_by(user_id=u.id).first()
        dept = None
        if fac:
            dept = fac.dept.code if getattr(fac, "dept", None) else fac.department
        elif stu:
            dept = stu.dept.code if getattr(stu, "dept", None) else stu.department
        rows.append(
            {
                "id": u.id,
                "email": u.email,
                "roles": u_roles,
                "status": getattr(u, "status", "active") or "active",
                "department": dept,
                "name": stu.name if stu else (fac.name if fac else None),
                "prn": stu.prn if stu else None,
                "roll_no": getattr(stu, "roll_no", None) if stu else None,
                "division": getattr(stu, "division", None) if stu else (getattr(fac, "division", None) if fac else None),
                "tuf_id": getattr(stu, "tuf_id", None) if stu else None,
                "student_type": getattr(stu, "student_type", None) if stu else None,
            }
        )
    return jsonify({"users": rows})


@api_bp.route("/admin/users/<int:uid>", methods=["DELETE"])
@jwt_required()
def admin_delete_user(uid: int):
    _, err = _require_roles("admin")
    if err:
        return err
    u = db.session.get(User, uid)
    if not u:
        return jsonify({"error": "Not found"}), 404
    if "admin" in _user_roles(u):
        return jsonify({"error": "Cannot delete admin via API"}), 400

    stu = Student.query.filter_by(user_id=uid).first()
    fac = Faculty.query.filter_by(user_id=uid).first()
    if stu:
        db.session.query(Activity).filter_by(student_id=stu.id).delete(synchronize_session=False)
        db.session.query(Internship).filter_by(student_id=stu.id).delete(synchronize_session=False)
        db.session.query(CreditSummary).filter_by(student_id=stu.id).delete(synchronize_session=False)
        db.session.query(VerificationLog).filter_by(student_id=stu.id).delete(synchronize_session=False)
        db.session.delete(stu)
    if fac:
        db.session.query(VerificationLog).filter_by(faculty_id=fac.id).delete(synchronize_session=False)
        db.session.delete(fac)

    db.session.query(UserRoles).filter_by(user_id=uid).delete(synchronize_session=False)
    db.session.delete(u)
    db.session.commit()
    return jsonify({"message": "User removed"})


@api_bp.route("/admin/departments/<int:did>", methods=["DELETE"])
@jwt_required()
def admin_delete_department(did: int):
    _, err = _require_roles("admin")
    if err:
        return err
    d = db.session.get(Department, did)
    if not d:
        return jsonify({"error": "Not found"}), 404
    if Student.query.filter_by(department_id=d.id).first() or Faculty.query.filter_by(department_id=d.id).first():
        return jsonify({"error": "Department has assigned users; remove/move them first"}), 400
    db.session.delete(d)
    db.session.commit()
    return jsonify({"message": "Department removed"})


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
    elif "faculty" not in roles and "hod" not in roles and "admin" not in roles:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"activity": _activity_to_dict(a)})


@api_bp.route("/activity/approve/<int:aid>", methods=["POST"])
@jwt_required()
def activity_approve(aid: int):
    user, err = _require_roles("faculty", "hod", "admin")
    if err:
        return err
    a = db.session.get(Activity, aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    if "admin" not in _user_roles(user):
        dept_id = _get_actor_department_id(user)
        div = _get_actor_division(user)
        if (dept_id and a.student and a.student.department_id != dept_id) or (
            div and a.student and (a.student.division or "").lower() != div.lower()
        ):
            return jsonify({"error": "Forbidden for this student scope"}), 403
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
    user, err = _require_roles("faculty", "hod", "admin")
    if err:
        return err
    a = db.session.get(Activity, aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    if "admin" not in _user_roles(user):
        dept_id = _get_actor_department_id(user)
        div = _get_actor_division(user)
        if (dept_id and a.student and a.student.department_id != dept_id) or (
            div and a.student and (a.student.division or "").lower() != div.lower()
        ):
            return jsonify({"error": "Forbidden for this student scope"}), 403
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
    # Prevent duplicate activity type/category names (case-insensitive).
    if Rule.query.filter(func.lower(Rule.category) == cat.lower()).first():
        return jsonify({"error": "Category already exists"}), 409
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
        (db.session.query(func.count(Activity.id)).filter(Activity.status == "pending").scalar() or 0)
        + (db.session.query(func.count(Internship.id)).filter(Internship.status == "pending").scalar() or 0)
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


@api_bp.route("/admin/reports/department-credits", methods=["GET"])
@jwt_required()
def admin_department_credits():
    _, err = _require_roles("admin")
    if err:
        return err
    rows = (
        db.session.query(
            Department.code,
            Department.name,
            func.count(Student.id).label("students"),
            func.coalesce(func.sum(CreditSummary.total_activity_points), 0.0).label("activity_points"),
            func.coalesce(func.sum(CreditSummary.total_internship_points), 0.0).label("internship_points"),
        )
        .select_from(Department)
        .outerjoin(Student, Student.department_id == Department.id)
        .outerjoin(CreditSummary, CreditSummary.student_id == Student.id)
        .group_by(Department.id, Department.code, Department.name)
        .order_by(Department.code)
        .all()
    )
    result = []
    for r in rows:
        ap = float(r.activity_points or 0.0)
        ip = float(r.internship_points or 0.0)
        result.append(
            {
                "code": r.code,
                "name": r.name,
                "students": int(r.students or 0),
                "activity_points": ap,
                "internship_points": ip,
                "grand_total": ap + ip,
            }
        )
    return jsonify({"departments": result})


@api_bp.route("/faculty/reports/student-credits", methods=["GET"])
@jwt_required()
def faculty_student_credits():
    """Branch-wise report for faculty/hod: includes students with zero points."""
    user, err = _require_roles("faculty", "hod")
    if err:
        return err
    dept_id = _get_actor_department_id(user)
    if not dept_id:
        return jsonify({"students": []})

    rows = (
        db.session.query(
            Student.id,
            Student.name,
            Student.prn,
            Student.division,
            func.coalesce(CreditSummary.total_activity_points, 0.0).label("activity_points"),
            func.coalesce(CreditSummary.total_internship_points, 0.0).label("internship_points"),
        )
        .select_from(Student)
        .outerjoin(CreditSummary, CreditSummary.student_id == Student.id)
        .filter(Student.department_id == dept_id)
        .order_by(Student.id)
        .all()
    )
    data = []
    for r in rows:
        actor_div = _get_actor_division(user)
        if actor_div and (r.division or "").lower() != actor_div.lower():
            continue
        ap = float(r.activity_points or 0.0)
        ip = float(r.internship_points or 0.0)
        data.append(
            {
                "student_id": r.id,
                "name": r.name,
                "prn": r.prn,
                "division": r.division,
                "activity_points": ap,
                "internship_points": ip,
                "grand_total": ap + ip,
            }
        )
    return jsonify({"students": data})


def _csv_response(filename: str, rows: list[dict], headers: list[str]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        w.writerow([r.get(h, "") for h in headers])
    body = buf.getvalue()
    return Response(
        body,
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_bp.route("/progress/yearly", methods=["GET"])
@jwt_required()
def yearly_progress():
    """Year-wise progress for student dashboard (approved only)."""
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"years": []})

    activity_rows = (
        db.session.query(
            func.coalesce(func.strftime("%Y", Activity.created_at), "Unknown").label("year"),
            func.coalesce(func.sum(Activity.points_earned), 0.0).label("points"),
        )
        .filter(Activity.student_id == st.id, Activity.status == "approved")
        .group_by("year")
        .all()
    )
    internship_rows = (
        db.session.query(
            func.coalesce(Internship.academic_year, func.strftime("%Y", Internship.created_at)).label("year"),
            func.coalesce(func.sum(Internship.credit_points), 0.0).label("credits"),
        )
        .filter(Internship.student_id == st.id, Internship.status == "approved")
        .group_by("year")
        .all()
    )

    # Normalize keys to strings for UI
    by_year = {}
    for y, pts in activity_rows:
        key = str(y)
        by_year.setdefault(key, {"year": key, "activity_points": 0.0, "internship_credits": 0.0})
        by_year[key]["activity_points"] = float(pts or 0.0)
    for y, creds in internship_rows:
        key = str(y)
        by_year.setdefault(key, {"year": key, "activity_points": 0.0, "internship_credits": 0.0})
        by_year[key]["internship_credits"] = float(creds or 0.0)

    years = sorted(by_year.values(), key=lambda r: r["year"])
    return jsonify({"years": years})


@api_bp.route("/eligibility", methods=["GET"])
@jwt_required()
def eligibility():
    """Final eligibility check for degree based on configured thresholds."""
    user, err = _require_roles("student")
    if err:
        return err
    st = Student.query.filter_by(user_id=user.id).first()
    if not st:
        return jsonify({"eligible": False, "reason": "Student profile missing"}), 400

    cs = CreditSummary.query.filter_by(student_id=st.id).first()
    activity_points = float(cs.total_activity_points) if cs else 0.0
    internship_credits = float(cs.total_internship_points) if cs else 0.0

    st_type = (getattr(st, "student_type", "regular") or "regular").lower()
    default_activity = 75 if st_type == "lateral" else 100
    default_internship = 11 if st_type == "lateral" else 14
    required_activity_points = float(request.args.get("required_activity_points") or default_activity)
    required_internship_credits = float(request.args.get("required_internship_credits") or default_internship)

    ok = (activity_points >= required_activity_points) and (internship_credits >= required_internship_credits)
    return jsonify(
        {
            "eligible": ok,
            "required_activity_points": required_activity_points,
            "required_internship_credits": required_internship_credits,
            "activity_points": activity_points,
            "internship_credits": internship_credits,
            "student_type": st_type,
        }
    )


@api_bp.route("/admin/reports/students.csv", methods=["GET"])
@jwt_required()
def admin_students_csv():
    """Admin CSV: full student details + totals (serial starts at 1)."""
    _, err = _require_roles("admin")
    if err:
        return err

    dept_code = (request.args.get("department_code") or "").strip().upper() or None
    division = (request.args.get("division") or "").strip() or None
    sort_by = (request.args.get("sort_by") or "id").strip().lower()
    sort_dir = (request.args.get("sort_dir") or "asc").strip().lower()

    q = (
        db.session.query(
            Student,
            User.email.label("email"),
            func.coalesce(CreditSummary.total_activity_points, 0.0).label("activity_points"),
            func.coalesce(CreditSummary.total_internship_points, 0.0).label("internship_points"),
            Department.code.label("department_code"),
        )
        .join(User, Student.user_id == User.id, isouter=True)
        .join(Department, Student.department_id == Department.id, isouter=True)
        .join(CreditSummary, CreditSummary.student_id == Student.id, isouter=True)
    )

    if dept_code:
        dept = Department.query.filter_by(code=dept_code).first()
        if dept:
            q = q.filter(Student.department_id == dept.id)
    if division:
        q = q.filter(func.lower(Student.division) == division.lower())

    sort_map = {
        "id": Student.id,
        "name": Student.name,
        "prn": Student.prn,
        "roll_no": Student.roll_no,
        "division": Student.division,
        "email": User.email,
    }
    col = sort_map.get(sort_by, Student.id)
    q = q.order_by(col.desc() if sort_dir == "desc" else col.asc())

    rows = []
    i = 1
    for st, email, ap, ip, dcode in q.all():
        ap = float(ap or 0.0)
        ip = float(ip or 0.0)
        rows.append(
            {
                "serial_no": i,
                "student_id": st.id,
                "name": st.name,
                "email": email,
                "department": dcode or st.department,
                "division": st.division,
                "prn": st.prn,
                "tuf_id": getattr(st, "tuf_id", None),
                "roll_no": getattr(st, "roll_no", None),
                "class_year": getattr(st, "class_year", None),
                "student_type": getattr(st, "student_type", None),
                "activity_points": ap,
                "internship_points": ip,
                "grand_total": ap + ip,
            }
        )
        i += 1

    headers = [
        "serial_no",
        "student_id",
        "name",
        "email",
        "department",
        "division",
        "prn",
        "tuf_id",
        "roll_no",
        "class_year",
        "student_type",
        "activity_points",
        "internship_points",
        "grand_total",
    ]
    return _csv_response("students_report.csv", rows, headers)


@api_bp.route("/reports/students.csv", methods=["GET"])
@jwt_required()
def scoped_students_csv():
    """HOD/TPO/Faculty CSV: internship status counts + totals (scoped for faculty/hod)."""
    user, err = _require_roles("faculty", "hod", "tpo", "admin")
    if err:
        return err
    roles = set(_user_roles(user))

    q = (
        db.session.query(
            Student.id.label("student_id"),
            Student.name.label("name"),
            Student.prn.label("prn"),
            Student.division.label("division"),
            User.email.label("email"),
            Department.code.label("department_code"),
            func.coalesce(CreditSummary.total_activity_points, 0.0).label("activity_points"),
            func.coalesce(CreditSummary.total_internship_points, 0.0).label("internship_points"),
            func.coalesce(func.sum(case((Internship.status == "pending", 1), else_=0)), 0).label("intern_pending"),
            func.coalesce(func.sum(case((Internship.status == "tpo_verified", 1), else_=0)), 0).label("intern_tpo_verified"),
            func.coalesce(func.sum(case((Internship.status == "approved", 1), else_=0)), 0).label("intern_approved"),
            func.coalesce(func.sum(case((Internship.status == "rejected", 1), else_=0)), 0).label("intern_rejected"),
            func.coalesce(func.sum(case((Internship.internship_type == "in_house", 1), else_=0)), 0).label("in_house_total"),
            func.coalesce(func.sum(case((Internship.internship_type == "out_house", 1), else_=0)), 0).label("out_house_total"),
        )
        .select_from(Student)
        .join(User, Student.user_id == User.id, isouter=True)
        .join(Department, Student.department_id == Department.id, isouter=True)
        .join(CreditSummary, CreditSummary.student_id == Student.id, isouter=True)
        .join(Internship, Internship.student_id == Student.id, isouter=True)
        .group_by(Student.id, User.email, Department.code, CreditSummary.total_activity_points, CreditSummary.total_internship_points)
    )

    # Apply scope: faculty/hod are dept+division scoped, TPO/admin see all.
    if "admin" not in roles and "tpo" not in roles:
        q = _apply_student_scope(user, q, student_model=Student)

    rows = []
    serial = 1
    for r in q.order_by(Student.id.asc()).all():
        ap = float(r.activity_points or 0.0)
        ip = float(r.internship_points or 0.0)
        rows.append(
            {
                "serial_no": serial,
                "student_id": int(r.student_id),
                "name": r.name,
                "email": r.email,
                "department": r.department_code,
                "division": r.division,
                "prn": r.prn,
                "internship_in_house_total": int(r.in_house_total or 0),
                "internship_out_house_total": int(r.out_house_total or 0),
                "internship_pending": int(r.intern_pending or 0),
                "internship_tpo_verified": int(r.intern_tpo_verified or 0),
                "internship_approved": int(r.intern_approved or 0),
                "internship_rejected": int(r.intern_rejected or 0),
                "activity_points": ap,
                "internship_points": ip,
                "grand_total": ap + ip,
            }
        )
        serial += 1

    headers = [
        "serial_no",
        "student_id",
        "name",
        "email",
        "department",
        "division",
        "prn",
        "internship_in_house_total",
        "internship_out_house_total",
        "internship_pending",
        "internship_tpo_verified",
        "internship_approved",
        "internship_rejected",
        "activity_points",
        "internship_points",
        "grand_total",
    ]
    return _csv_response("scoped_students_report.csv", rows, headers)


@api_bp.route("/admin/reports/verifications.csv", methods=["GET"])
@jwt_required()
def admin_verifications_csv():
    """Admin CSV: who approved/rejected what, with timestamps + student details."""
    _, err = _require_roles("admin")
    if err:
        return err

    actor_role = (request.args.get("actor_role") or "").strip().lower() or None  # faculty/hod/tpo
    q = (
        db.session.query(
            VerificationLog,
            Faculty.name.label("actor_name"),
            Faculty.designation.label("actor_designation"),
            Faculty.division.label("actor_division"),
            Department.code.label("actor_department"),
            User.email.label("actor_email"),
            Student.name.label("student_name"),
            Student.prn.label("student_prn"),
            Student.division.label("student_division"),
            Department.code.label("student_department"),
        )
        .join(Faculty, VerificationLog.faculty_id == Faculty.id, isouter=True)
        .join(User, Faculty.user_id == User.id, isouter=True)
        .join(Student, VerificationLog.student_id == Student.id, isouter=True)
        .join(Department, Student.department_id == Department.id, isouter=True)
    )

    if actor_role:
        # Best-effort: interpret designation or actual roles.
        if actor_role == "tpo":
            q = q.filter(func.lower(Faculty.designation) == "tpo")
        elif actor_role == "hod":
            q = q.filter(func.lower(Faculty.designation) == "hod")
        elif actor_role == "faculty":
            q = q.filter(func.lower(Faculty.designation) != "hod").filter(func.lower(Faculty.designation) != "tpo")

    rows = []
    serial = 1
    for log, actor_name, actor_desig, actor_div, actor_dept, actor_email, st_name, st_prn, st_div, st_dept in q.order_by(VerificationLog.timestamp.desc()).all():
        rows.append(
            {
                "serial_no": serial,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "action_type": log.type,
                "reference_id": log.reference_id,
                "status": log.status,
                "actor_email": actor_email,
                "actor_name": actor_name,
                "actor_designation": actor_desig,
                "actor_department": actor_dept,
                "actor_division": actor_div,
                "student_name": st_name,
                "student_prn": st_prn,
                "student_department": st_dept,
                "student_division": st_div,
            }
        )
        serial += 1

    headers = [
        "serial_no",
        "timestamp",
        "action_type",
        "reference_id",
        "status",
        "actor_email",
        "actor_name",
        "actor_designation",
        "actor_department",
        "actor_division",
        "student_name",
        "student_prn",
        "student_department",
        "student_division",
    ]
    return _csv_response("verification_audit.csv", rows, headers)


@api_bp.route("/admin/reports/actors.csv", methods=["GET"])
@jwt_required()
def admin_actors_csv():
    """Admin CSV: faculty/hod/tpo details + approval/rejection counts + account status."""
    _, err = _require_roles("admin")
    if err:
        return err

    role = (request.args.get("role") or "").strip().lower()
    if role not in ("faculty", "hod", "tpo"):
        return jsonify({"error": "role must be faculty/hod/tpo"}), 400

    # We treat HOD/TPO as Faculty rows with designation set.
    q = (
        db.session.query(
            Faculty,
            User.email.label("email"),
            User.status.label("status"),
            User.status_reason.label("status_reason"),
            Department.code.label("department_code"),
            func.coalesce(func.sum(case((VerificationLog.status == "approved", 1), else_=0)), 0).label("approved_count"),
            func.coalesce(func.sum(case((VerificationLog.status == "rejected", 1), else_=0)), 0).label("rejected_count"),
        )
        .join(User, Faculty.user_id == User.id, isouter=True)
        .join(Department, Faculty.department_id == Department.id, isouter=True)
        .join(VerificationLog, VerificationLog.faculty_id == Faculty.id, isouter=True)
        .group_by(Faculty.id, User.email, User.status, User.status_reason, Department.code)
    )

    if role == "tpo":
        q = q.filter(func.lower(Faculty.designation) == "tpo")
    elif role == "hod":
        q = q.filter(func.lower(Faculty.designation) == "hod")
    else:
        q = q.filter(func.lower(Faculty.designation) != "hod").filter(func.lower(Faculty.designation) != "tpo")

    rows = []
    serial = 1
    for fac, email, status, status_reason, dept_code, approved_count, rejected_count in q.order_by(Faculty.id.asc()).all():
        rows.append(
            {
                "serial_no": serial,
                "faculty_id": fac.id,
                "email": email,
                "name": fac.name,
                "designation": fac.designation,
                "department": dept_code or fac.department,
                "division": getattr(fac, "division", None),
                "account_status": status or "active",
                "status_reason": status_reason,
                "approved_count": int(approved_count or 0),
                "rejected_count": int(rejected_count or 0),
            }
        )
        serial += 1

    headers = [
        "serial_no",
        "faculty_id",
        "email",
        "name",
        "designation",
        "department",
        "division",
        "account_status",
        "status_reason",
        "approved_count",
        "rejected_count",
    ]
    return _csv_response(f"{role}_report.csv", rows, headers)
