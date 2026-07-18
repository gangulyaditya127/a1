# ============================================================
# ISSUE FORECASTER — PAYMENT SERVICE (FINAL REWRITE)
# ============================================================

import os
import json
import re
import warnings
import urllib.request
import urllib3
import statistics
import psycopg
from datetime import datetime, timezone, timedelta
from typing import List, Tuple, Dict, Any, Optional
from dotenv import load_dotenv

from flask import Flask, jsonify, request, Blueprint
from flask_cors import CORS
from langchain_tcs_bfsi_genai import APIClient, Auth, TCSChatModel
from urllib3.exceptions import InsecureRequestWarning
from ..promptloader import invoke, embed__texts, old_invoke

load_dotenv()
# ============================================================
# CONFIGURATION
# ============================================================

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "payment_logs.log")

# This will be updated dynamically by /update-threshold-payment-service
ERROR_THRESHOLD = 15

# Dynamic threshold configuration
ROLLING_WINDOWS = 17
THRESHOLD_MULTIPLIER = 1.5
MIN_DYNAMIC_THRESHOLD = 5

LLM_USER_DEFAULT = os.environ.get("LLM_USER_DEFAULT")
LLM_PASS_DEFAULT = os.environ.get("LLM_PASS_DEFAULT")
LLM_MODEL = os.environ.get("LLM_MODEL")

PROXY_URL = "http://proxy.tcs.com:8080"

# Proxy suppression / settings
warnings.filterwarnings("ignore")
urllib3.disable_warnings(InsecureRequestWarning)

is_proxy_enable = urllib.request.getproxies()
if is_proxy_enable != {}:
    ips = os.getenv("NO_PROXY_IPS", "").split(",")
    os.environ["http_proxy"] = PROXY_URL
    os.environ["https_proxy"] = PROXY_URL
    os.environ["no_proxy"] = ",".join(ips)


# ============================================================
# LLM SETUP
# ============================================================

client = APIClient()
auth = Auth(client)
auth.login(
    os.environ.get("LLM_USER", LLM_USER_DEFAULT),
    os.environ.get("LLM_PASS", LLM_PASS_DEFAULT),
)
llm = TCSChatModel(client=client, model_name=LLM_MODEL)

# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)

mod_issueForecast = Blueprint('are-issue-forecast', __name__, url_prefix='/forecast')

CORS(app, origins=[
    "http://localhost:5173",
    "http://localhost:5175",
    "http://localhost:5176"
])


# ============================================================
# REGEX HELPERS
# ============================================================

_TS_RE = re.compile(r'^\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s*')
_LEVEL_RE = re.compile(r'^\s*(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL)\s*', re.IGNORECASE)
_KV_RE = re.compile(r'(\w+)=("[^"]*"|\'[^\']*\'|\S+)')



# ============================================================
# TIME HELPERS
# ============================================================

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime_param(dt_string: str) -> datetime:
    if not dt_string:
        raise ValueError("Empty datetime string")
    dt_string = dt_string.strip()

    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S%z",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(dt_string, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
            return dt
        except Exception:
            pass

    raise ValueError(f"Unable to parse datetime: {dt_string}")


def parse_log_timestamp(line: str) -> Optional[datetime]:
    m = _TS_RE.match(line)
    if not m:
        return None
    try:
        dt = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S,%f")
        return dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
    except Exception:
        return None


# ============================================================
# LOG FIELD PARSERS
# ============================================================

def strip_leading_timestamp(line: str) -> Tuple[str, Optional[str]]:
    m = _TS_RE.match(line)
    if not m:
        return line.strip(), None
    ts = m.group(1)
    remainder = line[m.end():].lstrip()
    return remainder, ts


def strip_leading_level(text: str) -> Tuple[str, Optional[str]]:
    m = _LEVEL_RE.match(text)
    if not m:
        return text, None
    lvl = m.group(1).upper()
    remainder = text[m.end():].lstrip()
    return remainder, lvl


def parse_kv_fields(text: str) -> Dict[str, str]:
    fields = {}
    used_spans = []

    for m in _KV_RE.finditer(text):
        key = m.group(1)
        val = m.group(2)
        if ((val.startswith('"') and val.endswith('"')) or
            (val.startswith("'") and val.endswith("'"))):
            val = val[1:-1]

        fields[key] = val
        used_spans.append((m.start(), m.end()))

    # leftover text
    if not used_spans:
        leftover = text.strip()
        if leftover:
            fields["message"] = leftover
        return fields

    leftovers = []
    last = 0
    for s, e in used_spans:
        if s > last:
            leftovers.append(text[last:s])
        last = e
    if last < len(text):
        leftovers.append(text[last:])

    leftover_text = " ".join(x.strip() for x in leftovers).strip()
    if leftover_text:
        fields["message"] = leftover_text

    return fields


# ============================================================
# STRUCTURED COLLATION
# ============================================================

def fields_to_key(fields: Dict[str, str]) -> str:
    return json.dumps(sorted(fields.items(), key=lambda x: x[0]),
                      separators=(",", ":"), ensure_ascii=False)

def update_first_last_seen(group, iso_ts):
    if not iso_ts:
        return

    try:
        dt_new = datetime.fromisoformat(iso_ts)

        if group["first_seen"]:
            dt_first = datetime.fromisoformat(group["first_seen"])
            if dt_new < dt_first:
                group["first_seen"] = iso_ts

        if group["last_seen"]:
            dt_last = datetime.fromisoformat(group["last_seen"])
            if dt_new > dt_last:
                group["last_seen"] = iso_ts

    except Exception:
        pass


def initialize_group(groups, key, fields, orig, iso_ts):
    if key not in groups:
        groups[key] = {
            "fields": fields,
            "count": 0,
            "example_log": orig,
            "first_seen": iso_ts,
            "last_seen": iso_ts,
        }


def build_result(groups):
    result = []
    for _, info in groups.items():
        result.append({
            "fields": info["fields"],
            "example_log": info["example_log"],
            "count": info["count"],
            "first_seen": info["first_seen"],
            "last_seen": info["last_seen"],
        })

    result.sort(
        key=lambda x: (
            -x["count"],
            json.dumps(x["fields"], sort_keys=True)
        )
    )
    return result

def collate_structured(log_entries: List[Tuple[str, Optional[str]]]):
    groups: Dict[str, Dict[str, Any]] = {}

    for orig, iso_ts in log_entries:
        remainder, _ = strip_leading_timestamp(orig)
        after_level, level = strip_leading_level(remainder)

        fields = parse_kv_fields(after_level)
        if level:
            fields["level"] = level

        key = fields_to_key(fields)

        initialize_group(groups, key, fields, orig, iso_ts)

        groups[key]["count"] += 1

        update_first_last_seen(groups[key], iso_ts)

    return build_result(groups)


# ============================================================
# LOG READER
# ============================================================

def get_logs_for_time_range(start_time: datetime, end_time: datetime):
    if not os.path.exists(LOG_FILE):
        return [], 0, []

    error_logs = []
    error_count = 0

    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                ts = parse_log_timestamp(line)
                if ts is None:
                    continue

                if not (start_time <= ts < end_time):
                    continue

                if " ERROR " in line or re.search(r"\bERROR\b", line):
                    error_count += 1
                    error_logs.append(line.rstrip("\n"))

    except Exception as e:
        print("Error reading file:", e)
        return [], 0, []

    return error_logs, error_count, error_logs


# ============================================================
# DYNAMIC THRESHOLD HELPERS
# ============================================================

def get_previous_window_counts(now: datetime, window_seconds: float, windows: int) -> List[int]:
    counts = []
    for i in range(windows, 0, -1):
        end = now - timedelta(seconds=window_seconds * (i - 1))
        start = end - timedelta(seconds=window_seconds)
        print(start, end)
        _, cnt, _ = get_logs_for_time_range(start, end) #--for log file extract

        counts.append(cnt)
    return counts


def compute_dynamic_threshold(counts: List[int]):
    if counts:
        rolling_mean = statistics.mean(counts)
    else:
        rolling_mean = 0.0

    dyn = max(MIN_DYNAMIC_THRESHOLD,
              int(round(rolling_mean * THRESHOLD_MULTIPLIER)))

    return {
        "dynamic_threshold": dyn,
        "rolling_mean": rolling_mean,
        "rolling_counts": counts
    }


# ============================================================
# LLM UTILITIES
# ============================================================

def build_llm_prompt(error_count, start_time, end_time, collated_logs):
    #for chromadb reference data
    kedb_matches = retrieve_kedb_context(collated_logs, top_k=3)
    kedb_section = "\n\n".join([
                f"""
        [KEDB MATCH | similarity={m['similarity']}]
        {m['content']}
        """.strip()
                for m in kedb_matches
            ]) if kedb_matches else "No relevant historical KEDB found."

    return f"""
You are an Issue Forecaster SRE assistant. Your job is to forecast possible outage based on the highly frequent error logs.

Window Start: {start_time.isoformat()}
Window End: {end_time.isoformat()}
Errors: {error_count}
Threshold: {ERROR_THRESHOLD}

Collated Logs with frequency of their individual occurances(last 50):
{collated_logs}

Relevant Historical Knowledge (KEDB):
{kedb_section}

Return ONLY JSON:
{{
  "issue_summary": "",
  "reasoning": "",
  "recommended_actions": []
}}
""".strip()


def parse_llm_response(raw: str):
    raw = raw.strip()
    if "```" in raw:
        raw = re.sub(r"```(?:json)?", "", raw)
        raw = raw.replace("```", "")

    try:
        return json.loads(raw)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return None


# ============================================================
# RISK CALCULATION
# ============================================================

def calculate_risk_below_threshold(count):
    if count > 0.7 * ERROR_THRESHOLD:
        return "Medium"
    return "Low"


def calculate_risk_threshold_breached(count):
    pct = (count / ERROR_THRESHOLD) * 100.0
    if pct > 150:
        return "Very High"
    return "High"

#-------

# ============================================================
# FOR SPLUNK LOG EXTRACTIONS (fixed)
# ============================================================
import os
import json
import requests
from datetime import datetime, timezone, timedelta
from requests.auth import HTTPBasicAuth

SPLUNK_BASE_URL = os.environ.get("SPLUNK_BASE_URL", "https://ismartams.tcsapps.com/api/splunk")
SPLUNK_USER = os.environ.get("SPLUNK_USERNAME", "admin")
SPLUNK_PASS = os.environ.get("SPLUNK_PASSWORD", "ismart123")

# Streaming export endpoint
SPLUNK_SEARCH_ENDPOINT = f"{SPLUNK_BASE_URL}/services/search/jobs/export"

def to_splunk_absolute(dt: datetime) -> str:
    """Format datetime to Splunk's absolute time format: MM/DD/YYYY:HH:MM:SS (IST)."""
    local_dt = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
    return local_dt.strftime("%m/%d/%Y:%H:%M:%S")

def get_splunk_logs_for_time_range(start_time: datetime, end_time: datetime):
    """
    Fetch ERROR logs for payment-service from Splunk within [start_time, end_time).
    Returns (error_logs, error_count, error_logs_dup)
    """
    earliest = to_splunk_absolute(start_time)
    latest = to_splunk_absolute(end_time)

    # Option A: return raw log lines (preferred if your logs already have timestamps)
    search_query = (
        f'search sourcetype="issue_forecaster" "ERROR" service=payment-service '
        f'earliest="{earliest}" latest="{latest}" '
        f'| table _raw'
    )

    # Option B: compose a normalized line; uncomment if you want a synthesized logline
    # search_query = (
    #     f'search sourcetype="issue_forecaster" "ERROR" service=payment-service '
    #     f'earliest="{earliest}" latest="{latest}" '
    #     '| eval raw_cleaned=replace(_raw, "^[0-9-]{10} [0-9:]{8}[,0-9]*\\s*", "") '
    #     '| eval logline=strftime(_time,"%Y-%m-%d %H:%M:%S") . " " . raw_cleaned '
    #     '| table logline'
    # )

    payload = {
        "search": search_query,     # IMPORTANT: Splunk expects "search"
        "output_mode": "json"       # line-delimited JSON objects
    }

    error_logs = []
    proxies = {
    "http": PROXY_URL,
    "https": PROXY_URL,
    }
    try:
        with requests.post(
            SPLUNK_SEARCH_ENDPOINT,
            data=payload,                        # IMPORTANT: form-encoded, not JSON
            auth=HTTPBasicAuth(SPLUNK_USER, SPLUNK_PASS),
            verify=False,                        # per your environment
            stream=True,
            timeout=(10, 60),
            proxies = proxies
        ) as resp:

            if resp.status_code != 200:
                print(f"[SPLUNK] HTTP {resp.status_code}: {resp.text}")
                return [], 0, []

            # Stream and parse line-delimited JSON
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8"))
                except Exception:
                    continue

                result = obj.get("result") or {}

                # Option A parsing (table _raw)
                raw = result.get("_raw")
                if raw:
                    error_logs.append(str(raw).rstrip("\n"))
                    continue

                # Option B parsing (table logline)
                logline = result.get("logline")
                if logline:
                    error_logs.append(str(logline).rstrip("\n"))

        error_count = len(error_logs)
        return error_logs, error_count, error_logs

    except requests.RequestException as e:
        print(f"[SPLUNK] Network error: {e}")
        return [], 0, []
    except Exception as e:
        print(f"[SPLUNK] Search/parse failed: {e}")
        return [], 0, []


# ============================================================
# HELPER METHODS
# ============================================================
def parse_request_params():
    start_param = request.args.get("start")
    end_param = request.args.get("end")

    if not start_param or not end_param:
        raise ValueError("Missing start and end parameters")

    start_time = parse_datetime_param(start_param)
    end_time = parse_datetime_param(end_param)

    if start_time >= end_time:
        raise ValueError("start must be < end")

    return start_time, end_time


def build_entries(lines):
    entries = []
    for line in lines:
        _, ts = strip_leading_timestamp(line)
        iso_ts = None
        if ts:
            try:
                dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S,%f")
                iso_ts = dt.replace(tzinfo=timezone.utc).isoformat()
            except Exception as e:
                print("error: ", e)
        entries.append((line, iso_ts))
    return entries


def handle_below_threshold(result, error_count):
    result["status"] = "normal"
    result["risk_level"] = calculate_risk_below_threshold(error_count)
    result["message"] = (
        f"Error count ({error_count}) below threshold ({ERROR_THRESHOLD})"
    )
    return jsonify(result)


def invoke_llm_and_update_result(
    result, error_count, start_time, end_time, collated_logs
):
    prompt = build_llm_prompt(
        error_count,
        start_time,
        end_time,
        collated_logs
    )

    print(f".......Prompt is {prompt}")

    try:
        response = old_invoke(
            prompt,
            LLM_USER_DEFAULT,
            LLM_PASS_DEFAULT,
            LLM_MODEL
        )
        raw = str(response.content if hasattr(response, "content") else response)
        parsed = parse_llm_response(raw)

        if parsed:
            result["llm_response"] = parsed
        else:
            result["llm_response"] = {"raw": raw, "parse_error": True}

    except Exception as e:
        result["llm_response"] = {"error": str(e)}


# ============================================================
# MAIN ISSUE FORECASTER API
# ============================================================
@mod_issueForecast.route("/issue-forecaster-payment", methods=["GET"])
def issue_forecaster():
    try:
        start_time, end_time = parse_request_params()
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    duration_seconds = (end_time - start_time).total_seconds()

    # Load logs
    error_logs, error_count, _ = get_logs_for_time_range(start_time, end_time) #--log file extract

    error_entries = build_entries(error_logs)
    collated_logs = collate_structured(error_entries)

    result = {
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_seconds": duration_seconds,
        "error_count": error_count,
        "error_threshold": ERROR_THRESHOLD,
        "logs": error_logs,
        "collated_logs": collated_logs,
        "forecast_triggered": False,
        "llm_response": None,
        "risk_level": None,
    }

    if error_count < ERROR_THRESHOLD:
        return handle_below_threshold(result, error_count)

    # Threshold breached
    result["forecast_triggered"] = True
    result["status"] = "alert"
    result["risk_level"] = calculate_risk_threshold_breached(error_count)

    invoke_llm_and_update_result(
        result,
        error_count,
        start_time,
        end_time,
        collated_logs
    )

    return jsonify(result)

#----For 5 day threshold
def get_hour_slot(dt: datetime) -> int:
    return dt.hour



def get_postgres_conn():
    PG_DSN = os.environ.get("POSTGRES_DSN")
    PG_USER = os.environ.get("POSTGRES_USERNAME")
    PG_PASS = os.environ.get("POSTGRES_PASSWORD")

    if not PG_DSN:
        raise RuntimeError("Missing POSTGRES_DSN (or DATABASE_URL) environment variable")

    conn = psycopg.connect(
        PG_DSN,
        user=PG_USER,
        password=PG_PASS,
        autocommit=False,
    )
    return conn

def fetch_last_5_days_hourly_avg(service: str, hour_slot: int) -> float:
    conn = None
    cur = None

    try:
        conn = get_postgres_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT threshold_values
            FROM payment_error_threshold_hourly
            WHERE service_name = %(service)s
              AND hour_slot = %(hour)s
              AND created_at >= CURRENT_TIMESTAMP - INTERVAL '5 days'
        """, {"service": service, "hour": hour_slot})

        all_values = []

        for row in cur.fetchall():
            raw = row[0]

            try:
                # Convert Oracle LOB → string
                if hasattr(raw, "read"):
                    raw = raw.read()

                # Optional debug
                print("RAW:", raw, type(raw))

                values = json.loads(raw)

                if isinstance(values, list):
                    all_values.extend(values)

            except Exception as e:
                print(f"Invalid JSON in threshold_values column: {e}")

        if not all_values:
            return 0.0

        return sum(all_values) / len(all_values)

    except Exception as e:
        print(f"Failed fetching 5-day hourly average: {e}")
        return 0.0

    finally:
        try:
            if cur:
                cur.close()
            if conn:
                conn.close()
        except Exception:
            pass

def upsert_hourly_threshold(service: str, hour_slot: int, new_threshold: int):
    conn = None
    cur = None

    try:
        conn = get_postgres_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT id, threshold_values
            FROM payment_error_threshold_hourly
            WHERE service_name = %(service)s
              AND hour_slot = %(hour)s
        """, {"service": service, "hour": hour_slot})

        row = cur.fetchone()

        if row:
            record_id, raw_values = row
            try:
                if hasattr(raw_values, "read"):
                    raw_values = raw_values.read()

                values = json.loads(raw_values)

                if not isinstance(values, list):
                    values = []
            except Exception as e:
                print(f"Invalid existing threshold JSON: {e}")

            values.append(new_threshold)
            
            cur.execute("""
                UPDATE payment_error_threshold_hourly
                SET threshold_values = %(vals)s,
                    created_at = CURRENT_TIMESTAMP
                WHERE id = %(id)s
            """, {"vals": json.dumps(values), "id": record_id})

        else:
            # First entry for this service + hour            
            cur.execute("""
                INSERT INTO payment_error_threshold_hourly
                    (service_name, hour_slot, threshold_values, created_at)
                VALUES
                    (%(service)s, %(hour)s, %(vals)s, CURRENT_TIMESTAMP)
            """, {
                "service": service,
                "hour": hour_slot,
                "vals": json.dumps([new_threshold])
            })

        conn.commit()

    except Exception as e:
        if conn:
            conn.rollback()
        # print("Failed to upsert hourly threshold", exc_info=True)
        print("Failed to upsert hourly threshold: ", e)

    finally:
        try:
            if cur:
                cur.close()
            if conn:
                conn.close()
        except Exception:
            pass

def calculate_final_threshold(now, rolling_threshold):
    hour_slot = get_hour_slot(now)

    last_5_day_avg = fetch_last_5_days_hourly_avg(
        service="PAYMENT_SERVICE",
        hour_slot=hour_slot
    )

    final_threshold = round((rolling_threshold + int(round(last_5_day_avg))) / 2)
    return {
        "rolling_threshold": rolling_threshold,
        "hourly_5day_avg": last_5_day_avg,
        "final_threshold": final_threshold
    }

"""
Db table creation command for threshold storing
CREATE TABLE PAYMENT_ERROR_THRESHOLD_HOURLY (
    ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    SERVICE_NAME VARCHAR2(50),
    HOUR_SLOT NUMBER(2),               -- 0–23
    THRESHOLD_VALUES CLOB,             -- JSON array
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP
);
"""

# ============================================================
# UPDATE THRESHOLD API
# ============================================================

class MissingRequestBodyException(Exception):
    pass

@mod_issueForecast.route("/update-threshold-payment-service", methods=["POST"])
def update_threshold():

    global ERROR_THRESHOLD

    try:
        now = datetime.now(timezone(timedelta(hours=5, minutes=30)))

        req_body = request.get_json()
        print(req_body)

        if req_body is None:
            raise MissingRequestBodyException("Request Body is missing")
        
        window_seconds = float(req_body.get("refresh_window_seconds", 60))
        
        counts = get_previous_window_counts(now, window_seconds, ROLLING_WINDOWS)
        dyn_info = compute_dynamic_threshold(counts)

        decision = calculate_final_threshold(
            now,
            dyn_info["dynamic_threshold"]
        )

        ERROR_THRESHOLD = decision["final_threshold"]

        upsert_hourly_threshold(
            service="PAYMENT_SERVICE",
            hour_slot=now.hour,
            new_threshold=dyn_info["dynamic_threshold"]
        )

        return jsonify({
            "status": "success",
            "rolling_window_threshold": dyn_info["dynamic_threshold"],
            "hourly_5day_avg": decision["hourly_5day_avg"],
            "new_threshold": ERROR_THRESHOLD,
            "rolling_counts": counts,
            "updated_at": now.isoformat()
        })

    except Exception as e:
        print("Error : Threshold update API failed")
        return jsonify({
            "status": "error",
            "message": "Threshold update failed",
            "error": str(e)
        }), 500

# ============================================================
# HEALTHCHECK
# ============================================================

@mod_issueForecast.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "timestamp": get_utc_now().isoformat(),
        "log_file_exists": os.path.exists(LOG_FILE)
    })


from flask import current_app
import pandas as pd
from werkzeug.utils import secure_filename
def get_llm_credentials():
    SETTINGS_CREDENTIALS = current_app.config.get("SETTINGS_CREDENTIALS", None)

    if SETTINGS_CREDENTIALS is None:
        return LLM_USER_DEFAULT, LLM_PASS_DEFAULT, LLM_MODEL
    
    if SETTINGS_CREDENTIALS is not None and not isinstance(SETTINGS_CREDENTIALS, dict):
        return LLM_USER_DEFAULT, LLM_PASS_DEFAULT, LLM_MODEL

    llm_username = SETTINGS_CREDENTIALS.get('LLM_USERNAME','')
    llm_password = SETTINGS_CREDENTIALS.get('LLM_PASSWORD','')
    llm_model = SETTINGS_CREDENTIALS.get('LLM_NAME','')

    return llm_username, llm_password, llm_model

import chromadb
# ============================================================
# VECTOR DB (Chroma) SETUP — USING TCS EMBEDDINGS
# ============================================================

CHROMA_PERSIST_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "chromadb_payment_kedb"
)

chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

kdb_collection = chroma_client.get_or_create_collection(
    name="payment_service_kedb"
)

@mod_issueForecast.route("/upload-kedb", methods=["POST"])
def upload_kedb_excel():

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    filename = secure_filename(file.filename)

    if not filename.endswith((".xlsx", ".xls")):
        return jsonify({"error": "Only Excel files allowed"}), 400

    try:
        df = pd.read_excel(file)

        required_cols = {
            "error_pattern",
            "issue_summary",
            "reasoning",
            "recommended_actions"
        }

        if not required_cols.issubset(df.columns):
            return jsonify({
                "error": f"Required columns missing: {required_cols}"
            }), 400

        documents = []
        ids = []
        metadatas = []

        for idx, row in df.iterrows():
            doc_text = f"""
                        Error Pattern:
                        {row['error_pattern']}

                        Issue Summary:
                        {row['issue_summary']}

                        Reasoning:
                        {row['reasoning']}

                        Recommended Actions:
                        {row['recommended_actions']}
                        """.strip()

            documents.append(doc_text)
            ids.append(f"kedb_payment_{idx}")
            metadatas.append({
                "source": "KEDB",
                "row_index": int(idx)
            })

        # 🔑 Generate embeddings using your existing method
        username, password, _ = get_llm_credentials()
        embeddings = embed__texts(documents, username, password)

        kdb_collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )

        return jsonify({
            "status": "success",
            "records_uploaded": len(documents)
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# ============================================================
# RAG RETRIEVAL (TCS EMBEDDINGS + CHROMA)
# ============================================================

def retrieve_kedb_context(collated_logs, top_k: int = 3):

    if not collated_logs:
        return []

    # Build query from top recurring log patterns
    query_parts = []
    for item in collated_logs[:5]:
        fields = item.get("fields", {})
        msg = fields.get("message", "")
        level = fields.get("level", "")
        query_parts.append(f"{level} {msg}".strip())

    query_text = "\n".join(query_parts)

    # Generate embedding for query
    username, password, _ = get_llm_credentials()
    query_embedding = embed__texts([query_text], username, password)[0]

    results = kdb_collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"]
    )

    retrieved_context = []

    for i in range(len(results["documents"][0])):
        retrieved_context.append({
            "content": results["documents"][0][i],
            "similarity": round(1 - results["distances"][0][i], 3),
            **results["metadatas"][0][i]
        })

    return retrieved_context
