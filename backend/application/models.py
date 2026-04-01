from .database import db
from datetime import datetime
from flask_security import UserMixin,RoleMixin


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)  # CSE, IT, MECH...
    name = db.Column(db.String(120), nullable=False)

class Role(db.Model,RoleMixin):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    # desciption=db.

class User(db.Model,UserMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    fs_uniquifier= db.Column(db.String(255), nullable=False)
    active=db.Column(db.Boolean, default=True)
    status = db.Column(db.String(20), default="active")  # active / blocked / blacklisted
    status_reason = db.Column(db.String(255))
    # Relationships
    roles = db.relationship("Role", secondary="user_roles", backref="users")

class UserRoles(db.Model):
    __tablename__ = "user_roles"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), primary_key=True)

class Student(db.Model):
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    name = db.Column(db.String(100))
    prn = db.Column(db.String(20), unique=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    department = db.Column(db.String(50))  # legacy display; prefer department_id
    class_year = db.Column(db.String(10))  # FE, SE, TE, BE
    division = db.Column(db.String(10))
    roll_no = db.Column(db.String(20))
    tuf_id = db.Column(db.String(30), unique=True)
    student_type = db.Column(db.String(20), default="regular")  # regular / lateral

    user = db.relationship("User", backref="student_profile")
    dept = db.relationship("Department", backref="students")

class Faculty(db.Model):
    __tablename__ = "faculty"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    name = db.Column(db.String(100))
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    department = db.Column(db.String(50))  # legacy display; prefer department_id
    division = db.Column(db.String(10))  # A/B/C/D (used for scoped access)
    designation = db.Column(db.String(50))  # HOD, Mentor, TPO

    user = db.relationship("User", backref="faculty_profile")
    dept = db.relationship("Department", backref="faculty")

class Rule(db.Model):
    """Dynamic credit rules (category + hours tier → credits). Viva: rules live in DB, not hardcoded."""
    __tablename__ = "rules"

    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(80), nullable=False, index=True)
    hours_required = db.Column(db.Integer, nullable=False, default=0)
    credits_awarded = db.Column(db.Integer, nullable=False)


class Activity(db.Model):
    __tablename__ = "activities"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"))

    title = db.Column(db.String(200))
    description = db.Column(db.Text)
    activity_type = db.Column(db.String(50))
    # Internship / Technical / Cultural / NSS / Sports / Certification

    role = db.Column(db.String(50))
    # Participated / Organized / Volunteered

    contact_hours = db.Column(db.Integer)
    additional_hours = db.Column(db.Integer)
    total_hours = db.Column(db.Integer)

    proof_path = db.Column(db.String(500))
    status = db.Column(db.String(20), default="pending")  # pending / approved / rejected

    points_earned = db.Column(db.Float)

    verified_by_faculty = db.Column(db.Boolean, default=False)
    verified_by_hod = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship("Student", backref="activities")

class Internship(db.Model):
    __tablename__ = "internships"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"))

    title = db.Column(db.String(200))
    company_name = db.Column(db.String(150))

    internship_type = db.Column(db.String(50))  
    # in_house / out_house

    duration_days = db.Column(db.Integer)
    total_hours = db.Column(db.Integer)

    credit_points = db.Column(db.Float)

    report_path = db.Column(db.String(500))
    status = db.Column(db.String(20), default="pending")  # pending / approved / rejected

    academic_year = db.Column(db.Integer)  # e.g. 2024, 2025

    verified_by_hod = db.Column(db.Boolean, default=False)  # for in_house
    verified_by_tpo = db.Column(db.Boolean, default=False)  # for out_house

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship("Student", backref="internships")

class CreditSummary(db.Model):
    __tablename__ = "credit_summary"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"))

    total_activity_points = db.Column(db.Float, default=0)
    total_internship_points = db.Column(db.Float, default=0)

    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship("Student", backref="summary")

class VerificationLog(db.Model):
    __tablename__ = "verification_logs"

    id = db.Column(db.Integer, primary_key=True)

    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"))

    type = db.Column(db.String(50))  
    # activity / internship

    reference_id = db.Column(db.Integer)  # activity_id or internship_id

    status = db.Column(db.String(20))  
    # approved / rejected

    timestamp = db.Column(db.DateTime, default=datetime.utcnow)