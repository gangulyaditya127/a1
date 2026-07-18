# app.py
import os
import time
import random
import threading
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify, Blueprint
import logging
from logging.handlers import RotatingFileHandler


# ============================================================
# FLASK APP + LOGGING SETUP
# ============================================================

mod_issueForecastPaymentLog = Blueprint('are-issue-forecast-log', __name__, url_prefix='/forecast-log')
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "payment_logs.log")
print(LOG_FILE)
logger = logging.getLogger("payment_logger")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=3)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


@mod_issueForecastPaymentLog.route("/ingest-log", methods=["POST"])
def ingest_log():
    data = request.get_json(silent=True) or {}
    print(data)
    message = data.get("message")
    if not message:
        return jsonify({"status": "error", "error": "Missing 'message'"}), 400

    service = data.get("service", "payment-service")
    level = data.get("level", "ERROR").upper()
    error_code = data.get("error_code", "GENERIC_ERROR")
    provider = data.get("provider", "gateway-x")

    log_line = f'service={service} provider={provider} code={error_code} msg="{message}"'

    if level == "ERROR":
        logger.error(log_line)
    elif level in ("WARN", "WARNING"):
        logger.warning(log_line)
    else:
        logger.info(log_line)

    return jsonify({"status": "ok", "written_at": datetime.now().isoformat()}), 200


# ============================================================
# GENERATOR CONFIG (from generator_window.py)
# ============================================================

WINDOW_SECONDS = 120
NORMAL_WINDOWS = 4
CYCLE_LENGTH = NORMAL_WINDOWS + 1   # 4 normal + 1 outage

NORMAL_MIN_LOGS = 1
NORMAL_MAX_LOGS = 4
OUTAGE_MIN_LOGS = 20
OUTAGE_MAX_LOGS = 30

SERVICE_NAME = "payment-service"
PROVIDER_NAME = "gateway-x"

BUFFER_SECONDS = max(5, WINDOW_SECONDS * 0.1)

# Errors
NORMAL_ERRORS = [
    {"error_code": "PAYMENT_DECLINED", "message": "Payment declined by issuer"},
    {"error_code": "INSUFFICIENT_FUNDS", "message": "Insufficient funds in customer account"},
    {"error_code": "CARD_EXPIRED", "message": "Card expired"},
]

OUTAGE_ERRORS = [
    {"error_code": "PAYMENT_PROVIDER_UNAVAILABLE", "message": "Payment provider unreachable"},
    {"error_code": "PAYMENT_GATEWAY_TIMEOUT", "message": "Timeout while calling payment provider"},
    {"error_code": "HTTP_502_UPSTREAM", "message": "Received 502 Bad Gateway from payment provider"},
]


# ============================================================
# BACKGROUND GENERATOR LOGIC
# ============================================================

def utc_now():
    return datetime.now(timezone.utc)


def get_window_start():
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    now = utc_now()
    elapsed = (now - epoch).total_seconds()
    window_start_seconds = (elapsed // WINDOW_SECONDS) * WINDOW_SECONDS
    return epoch + timedelta(seconds=window_start_seconds)


def write_log(error_def):
    """Write a structured log directly to log file."""
    log_line = (
        f'service={SERVICE_NAME} provider={PROVIDER_NAME} '
        f'code={error_def["error_code"]} msg="{error_def["message"]}"'
    )
    logger.error(log_line)


def generate_window_logs(window_index):
    """Generate log entries for one window."""

    is_outage = (window_index == CYCLE_LENGTH)

    if is_outage:
        log_count = random.randint(OUTAGE_MIN_LOGS, OUTAGE_MAX_LOGS)
        pool = OUTAGE_ERRORS
    else:
        log_count = random.randint(NORMAL_MIN_LOGS, NORMAL_MAX_LOGS)
        pool = NORMAL_ERRORS

    spread_seconds = WINDOW_SECONDS - BUFFER_SECONDS
    interval = spread_seconds / max(log_count, 1)

    for i in range(log_count):
        write_log(random.choice(pool))

        if i < log_count - 1:
            time.sleep(interval)


# ============================================================
# THREAD CONTROL
# ============================================================

log_thread = None
stop_flag = False


def background_worker():
    """Main loop generating logs window-by-window."""
    global stop_flag

    window_index = 1

    while not stop_flag:
        window_start = get_window_start()

        generate_window_logs(window_index)

        # Sleep until window end
        now = utc_now()
        window_end = window_start + timedelta(seconds=WINDOW_SECONDS)
        sleep_time = (window_end - now).total_seconds()

        if sleep_time > 0:
            time.sleep(sleep_time)

        window_index += 1
        if window_index > CYCLE_LENGTH:
            window_index = 1


# ============================================================
# START / STOP APIs
# ============================================================

@mod_issueForecastPaymentLog.route("/start-payment-logging", methods=["POST"])
def start_payment_logging():
    global log_thread, stop_flag

    if log_thread and log_thread.is_alive():
        return jsonify({"status": "already_running"}), 200

    stop_flag = False
    log_thread = threading.Thread(target=background_worker, daemon=True)
    log_thread.start()

    return jsonify({"status": "started"}), 200


@mod_issueForecastPaymentLog.route("/stop-payment-logging", methods=["POST"])
def stop_payment_logging():
    global stop_flag, log_thread

    stop_flag = True

    if log_thread:
        log_thread.join(timeout=1)

    return jsonify({"status": "stopped"}), 200


