import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    ORACLE_USER     = os.getenv("ORACLE_USERNAME")
    ORACLE_PASSWORD = os.getenv("ORACLE_PASSWORD")
    ORACLE_HOST     = os.getenv("ORACLE_HOST")
    ORACLE_PORT     = os.getenv("ORACLE_PORT")
    ORACLE_SERVICE  = os.getenv("ORACLE_SERVICE_NAME")

    PG_USERNAME = os.getenv("PG_USERNAME")
    PG_PASSWORD = os.getenv("PG_PASSWORD")
    PG_HOST = os.getenv("PG_HOST")
    PG_PORT = os.getenv("PG_PORT")
    PG_DB = os.getenv("PG_DB")
    PG_SCHEMA = os.getenv("PG_SCHEMA")

    SQLALCHEMY_DATABASE_URI = (
        f"oracle+oracledb://{ORACLE_USER}:{ORACLE_PASSWORD}"
        f"@{ORACLE_HOST}:{ORACLE_PORT}/?service_name={ORACLE_SERVICE}"
    )

    SQLALCHEMY_ECHO = False
