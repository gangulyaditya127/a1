from flask import Flask, request, jsonify, render_template
from flask_cors import CORS, cross_origin
import os
from datetime import timedelta
from dotenv import load_dotenv
from .models import ZincPipelineIncidentAdminSettings as AdminSettings
from .db import get_session

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

    app.register_blueprint(issueForecastPaymentLog)  
    app.register_blueprint(issueForecast) 
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config.from_pyfile('../app/config.cfg', silent=True)
    
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass
    return app
