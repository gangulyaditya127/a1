from app.controllers.iadd import mod_iadd as iadd
from app.controllers.agenticINCFlow import mod_agenticINCFlow as agenticINCFlow
from app.controllers.conversational.agenticConversationalFlow import mod_agenticConversatonalFlow as agenticConversatonalFlow
from app.controllers.admin.admin import admin_bp
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS, cross_origin
import os
from datetime import timedelta
from dotenv import load_dotenv
from .models import ZincPipelineIncidentAdminSettings as AdminSettings
from .db import get_session
from app.controllers.are_maturity_assessment_v3_java import mod_maturityJava as maturityJava
from app.controllers.areProgressTracker.app import mod_areProgressTracker as areProgressTracker
from app.controllers.dq.dqCheck import mod_dqCheck as dqCheck
from app.controllers.areQuickMaturityAssesment.main import mod_AREQuickMaturityAssesment as areQuickMaturityAssesment

from app.controllers.IssueForecaster.generator import mod_issueForecastPaymentLog as issueForecastPaymentLog
from app.controllers.IssueForecaster.forecaster import mod_issueForecast as issueForecast
def fetch_credentials():
    session = get_session()
    try:
        settings = session.query(AdminSettings).filter(AdminSettings.R_ID == 1).first()
        credentials_dict={"LLM_USERNAME":settings.llm_username,
                "LLM_PASSWORD":settings.llm_password,
                "LLM_NAME":settings.llm_name,
                "SN_USERNAME":settings.sn_username,
                "SN_PASSWORD":settings.sn_password,
                "SN_URL":settings.sn_url,
                "ORACLE_USER":settings.oracle_user,
                "ORACLE_PASSWORD":settings.oracle_password,
                "ORACLE_SERVICENAME":settings.oracle_servicename,
                "SPLUNK_USERNAME":settings.splunk_username,
                "SPLUNK_PASSWORD":settings.splunk_password,
                "SPLUNK_URL":settings.splunk_url}
        print(f"{'='*70}")
        print("Settings Credentials Retrieved 🚀")
        print(f"{'='*70}")
        return credentials_dict

    except Exception as e:
        print(f"Error while fetching settings credentials => {e}")
        return {}

def create_app():
    load_dotenv()
    
    app = Flask(__name__, instance_relative_config=True)
    CORS(app)

    app.register_blueprint(admin_bp)
    app.register_blueprint(iadd)
    app.register_blueprint(agenticINCFlow)
    app.register_blueprint(agenticConversatonalFlow)
    app.register_blueprint(maturityJava)
    app.register_blueprint(areProgressTracker)
    app.register_blueprint(dqCheck)
    app.register_blueprint(areQuickMaturityAssesment)
    app.register_blueprint(issueForecastPaymentLog)  
    app.register_blueprint(issueForecast) 
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config.from_pyfile('../app/config.cfg', silent=True)
    with app.app_context():
        app.config["SETTINGS_CREDENTIALS"] = fetch_credentials()

    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass
    return app
