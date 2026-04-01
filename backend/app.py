import os
#main app 
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy import text

from application.database import db
from application.models import (  # noqa: F401 — register all tables
    Activity,
    CreditSummary,
    Department,
    Faculty,
    Internship,
    Role,
    Rule,
    Student,
    User,
    UserRoles,
    VerificationLog,
)
from application.config import local_development_config
from application.routes.api import api_bp
from application.routes.home import home_bp
from application.utils.credits import ensure_rules_seed
from flask_security import Security, SQLAlchemyUserDatastore, hash_password


def create_app():
    app = Flask(__name__)
    app.config.from_object(local_development_config)
    db.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": ["http://127.0.0.1:5173", "http://localhost:5173"]}},
        supports_credentials=True,
    )
    app.register_blueprint(home_bp)
    app.register_blueprint(api_bp)
    datastore = SQLAlchemyUserDatastore(db, User, Role)
    app.security = Security(app, datastore)
    JWTManager(app)

    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(os.path.join(app.root_path, "uploads"), filename)

    app.app_context().push()
    return app


def _ensure_sqlite_columns():
    """Best-effort lightweight migration for local sqlite during development."""
    def has_col(table_name: str, col: str) -> bool:
        rows = db.session.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        return any(r[1] == col for r in rows)

    # users
    if not has_col("users", "status"):
        db.session.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'"))
    if not has_col("users", "status_reason"):
        db.session.execute(text("ALTER TABLE users ADD COLUMN status_reason VARCHAR(255)"))

    # students
    if not has_col("students", "department_id"):
        db.session.execute(text("ALTER TABLE students ADD COLUMN department_id INTEGER"))
    if not has_col("students", "tuf_id"):
        db.session.execute(text("ALTER TABLE students ADD COLUMN tuf_id VARCHAR(30)"))
    if not has_col("students", "student_type"):
        db.session.execute(text("ALTER TABLE students ADD COLUMN student_type VARCHAR(20) DEFAULT 'regular'"))

    # faculty
    if not has_col("faculty", "department_id"):
        db.session.execute(text("ALTER TABLE faculty ADD COLUMN department_id INTEGER"))
    if not has_col("faculty", "division"):
        db.session.execute(text("ALTER TABLE faculty ADD COLUMN division VARCHAR(10)"))

    db.session.commit()


app = create_app()
# celery=celery_init_app(app)
# celery.autodiscover_tasks()
with app.app_context():
    db.create_all()
    _ensure_sqlite_columns()
    ensure_rules_seed()

    # Seed departments (demo)
    department_seed = [
        ("COMPUTER", "Computer Engineering"),
        ("IT", "Information Technology"),
        ("MECHANICAL", "Mechanical Engineering"),
        ("CIVIL", "Civil Engineering"),
        ("AIDS", "Artificial Intelligence and Data Science"),
        ("EXTC", "Electronics and Telecommunication"),
        ("MECHATRONICS", "Mechatronics Engineering"),
    ]
    for code, name in department_seed:
        if not Department.query.filter_by(code=code).first():
            db.session.add(Department(code=code, name=name))
    db.session.commit()

    app.security.datastore.find_or_create_role(
        name="student"
    )

    app.security.datastore.find_or_create_role(
        name="faculty"
    )

    app.security.datastore.find_or_create_role(
        name="admin"
    )

    app.security.datastore.find_or_create_role(
        name="hod"
    )

    app.security.datastore.find_or_create_role(
        name="tpo"
    )

    db.session.commit()

    if not app.security.datastore.find_user(email="admin123@gmail.com"):
        app.security.datastore.create_user(
            email="admin123@gmail.com",
            password=hash_password("admin@123"),
            roles=["admin"],
            active=True,
        )

    # Demo faculty accounts (one per branch)
    for code, _ in department_seed:
        email = f"{code.lower()}_faculty@gmail.com"
        if not app.security.datastore.find_user(email=email):
            fu = app.security.datastore.create_user(
                email=email,
                password=hash_password("faculty@123"),
                roles=["faculty"],
                active=True,
            )
            db.session.flush()
            d = Department.query.filter_by(code=code).first()
            db.session.add(
                Faculty(
                    user_id=fu.id,
                    name=f"{code} Faculty",
                    department_id=d.id if d else None,
                    department=code,
                    division="A",
                    designation="Mentor",
                )
            )
    db.session.commit()

    # Demo verifier accounts for internship flow
    # Demo HOD accounts (one per branch)
    for code, _ in department_seed:
        email = f"{code.lower()}_hod@gmail.com"
        if not app.security.datastore.find_user(email=email):
            hu = app.security.datastore.create_user(
                email=email,
                password=hash_password("hod@123"),
                roles=["hod"],
                active=True,
            )
            db.session.flush()
            d = Department.query.filter_by(code=code).first()
            db.session.add(
                Faculty(
                    user_id=hu.id,
                    name=f"{code} HOD",
                    department_id=d.id if d else None,
                    department=code,
                    division="A",
                    designation="HOD",
                )
            )

    if not app.security.datastore.find_user(email="tpo123@gmail.com"):
        tu = app.security.datastore.create_user(
            email="tpo123@gmail.com",
            password=hash_password("tpo@123"),
            roles=["tpo"],
            active=True,
        )
        db.session.flush()
        # TPO is global; department_id left NULL
        db.session.add(
            Faculty(
                user_id=tu.id,
                name="Demo TPO",
                department_id=None,
                department=None,
                division=None,
                designation="TPO",
            )
        )

    db.session.commit()
    

# from application.routes import *

# @celery.on_after_finalize.connect
# def setup_perodic_tasks(sender,**kwargs):
#     sender.add_periodic_task(
#         crontab(minute="*/1"),
#         monthly_report.s())

#     sender.add_periodic_task(
#         # crontab(hour=16, minute=7),
#         crontab(minute="*/1"),
#         appointment_update.s())
    
if __name__ == "__main__":
    app.run(debug=False)