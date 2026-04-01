import os
#main app 
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager

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


app = create_app()
# celery=celery_init_app(app)
# celery.autodiscover_tasks()
with app.app_context():
    db.create_all()
    ensure_rules_seed()

    # Seed departments (demo)
    if not Department.query.first():
        db.session.add(Department(code="CSE", name="Computer Science and Engineering"))
        db.session.add(Department(code="MECH", name="Mechanical Engineering"))
        db.session.add(Department(code="IT", name="Information Technology"))
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

    if not app.security.datastore.find_user(email="faculty123@gmail.com"):
        fu = app.security.datastore.create_user(
            email="faculty123@gmail.com",
            password=hash_password("faculty@123"),
            roles=["faculty"],
            active=True,
        )
        db.session.flush()
        cse = Department.query.filter_by(code="CSE").first()
        db.session.add(
            Faculty(
                user_id=fu.id,
                name="Demo Faculty",
                department_id=cse.id if cse else None,
                department="CSE",
                designation="Mentor",
            )
        )

    db.session.commit()

    # Demo verifier accounts for internship flow
    if not app.security.datastore.find_user(email="hod123@gmail.com"):
        hu = app.security.datastore.create_user(
            email="hod123@gmail.com",
            password=hash_password("hod@123"),
            roles=["hod"],
            active=True,
        )
        db.session.flush()
        cse = Department.query.filter_by(code="CSE").first()
        db.session.add(
            Faculty(
                user_id=hu.id,
                name="Demo HOD",
                department_id=cse.id if cse else None,
                department="CSE",
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