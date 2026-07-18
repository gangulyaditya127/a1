
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Fetch logs from Splunk via streaming export API (drop-in replacement for file reads).

- Uses requests.post with HTTPBasicAuth
- Streams line-delimited JSON and extracts a composed log line
- Formats earliest/latest absolute times in IST (UTC+05:30)

Example:
    python splunk_fetch_logs.py --earliest "12/26/2025:13:10:00" --latest "12/26/2025:23:59:59" --sourcetype "issue_forecaster" --service "payment-service"
"""

import os
import sys
import json
import argparse
import warnings
import requests
from datetime import datetime, timezone, timedelta
from requests.auth import HTTPBasicAuth

# Suppress only the InsecureRequestWarning when verify=False
from urllib3.exceptions import InsecureRequestWarning
warnings.filterwarnings("ignore", category=InsecureRequestWarning)

# ------------------------------------------------------------
# Config (env overrides supported)
# ------------------------------------------------------------
SPLUNK_BASE_URL = os.environ.get("SPLUNK_BASE_URL", "https://ismartams.tcsapps.com/api/splunk")
SPLUNK_USER = os.environ.get("SPLUNK_USERNAME", "admin")
SPLUNK_PASS = os.environ.get("SPLUNK_PASSWORD", "ismart123")

# Correct streaming export endpoint
SPLUNK_SEARCH_ENDPOINT = f"{SPLUNK_BASE_URL}/services/search/jobs/export"

IST_TZ = timezone(timedelta(hours=5, minutes=30))

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def to_splunk_absolute(dt: datetime) -> str:
    """
    Format datetime to Splunk's absolute time format: MM/DD/YYYY:HH:MM:SS
    We keep IST tz behavior (UTC+05:30).
    """
    local_dt = dt.astimezone(IST_TZ)
    return local_dt.strftime("%m/%d/%Y:%H:%M:%S")


def validate_abs_time_str(s: str) -> str:
    """
    Validate 'MM/DD/YYYY:HH:MM:SS' format.
    Raises argparse error if invalid.
    """
    try:
        datetime.strptime(s, "%m/%d/%Y:%H:%M:%S")
        return s
    except Exception:
        raise argparse.ArgumentTypeError(
            f"Time '{s}' is not in required format MM/DD/YYYY:HH:MM:SS"
        )


def build_search_query(sourcetype: str, service: str, earliest_abs: str, latest_abs: str) -> str:
    """
    Build a Splunk search string.
    We constrain by sourcetype, literal 'ERROR', and service, and produce a clean single-line output.

    You can customize the `eval` to match your log format. Here:
    - We strip leading timestamp if present and prepend a normalized _time.
    - We output a single field 'logline' to simplify parsing.
    """
    search = (
        f'search sourcetype="{sourcetype}" "ERROR" service={service} '
        f'earliest="{earliest_abs}" latest="{latest_abs}" '
        # Clean up and compose a canonical single line per result:
        '| eval raw_cleaned=replace(_raw, "^[0-9-]{10} [0-9:]{8}[,0-9]*\\s*", "") '
        '| eval logline=strftime(_time,"%Y-%m-%d %H:%M:%S") . " " . raw_cleaned '
        '| table logline'
    )
    return search


def fetch_splunk_logs_stream(search_query: str, timeout=(10, 60)) -> list[str]:
    """
    Execute a streaming export request to Splunk and return a list of log lines (strings).

    Payload uses:
        - "search": <search_query>
        - "output_mode": "json"

    The API returns line-delimited JSON objects; we parse each line and extract result.logline.
    """
    payload = {
        "search": search_query,
        "output_mode": "json"
    }

    logs = []

    try:
        with requests.post(
            SPLUNK_SEARCH_ENDPOINT,
            data=payload,  # Splunk accepts form-encoded
            auth=HTTPBasicAuth(SPLUNK_USER, SPLUNK_PASS),
            verify=False,        # per your instruction
            stream=True,
            timeout=timeout,
        ) as response:

            if response.status_code != 200:
                print(f"❌ Failed to fetch logs: {response.status_code} - {response.text}", file=sys.stderr)
                return []

            # Read the line-delimited JSON stream
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode("utf-8"))
                except Exception:
                    # Some proxies may deliver non-JSON framing lines; ignore safely
                    continue

                # Typical shape: {"result": {"logline": "..."}}
                result = obj.get("result") or {}
                logline = result.get("logline")
                if logline:
                    logs.append(logline)

        return logs

    except requests.RequestException as e:
        print(f"❌ Network error: {e}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return []


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(description="Fetch logs from Splunk via streaming export API.")
    parser.add_argument("--earliest", required=True, type=validate_abs_time_str,
                        help='Earliest absolute time in format MM/DD/YYYY:HH:MM:SS (IST)')
    parser.add_argument("--latest", required=True, type=validate_abs_time_str,
                        help='Latest absolute time in format MM/DD/YYYY:HH:MM:SS (IST)')
    parser.add_argument("--sourcetype", default="issue_forecaster",
                        help='Splunk sourcetype (default: issue_forecaster)')
    parser.add_argument("--service", default="payment-service",
                        help='Service filter value (default: payment-service)')
    parser.add_argument("--out", default=None,
                        help='Optional file to save logs (one per line)')
    return parser.parse_args()


def main():
    args = parse_args()

    search_query = build_search_query(
        sourcetype=args.sourcetype,
        service=args.service,
        earliest_abs=args.earliest,
        latest_abs=args.latest
    )

    print("🔎 Executing Splunk search...")
    print(f"URL: {SPLUNK_SEARCH_ENDPOINT}")
    print(f"User: {SPLUNK_USER}")
    print(f"Query: {search_query}")

    logs = fetch_splunk_logs_stream(search_query)

    if not logs:
        print("⚠️ No logs returned.")
        return

    print(f"✅ Retrieved {len(logs)} log(s).")

    # Print to console
    for line in logs[:10]:  # show first few
        print(line)
    if len(logs) > 10:
        print(f"... (and {len(logs) - 10} more)")

    # Optionally write to file
    if args.out:
        try:
            with open(args.out, "w", encoding="utf-8") as f:
                for line in logs:
                    f.write(line + "\n")
            print(f"💾 Saved logs to: {args.out}")
        except Exception as e:
            print(f"❌ Failed to write logs to {args.out}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()

#python sp.py --earliest "12/26/2025:15:41:00" --latest "12/26/2025:15:43:59" --sourcetype "issue_forecaster" --service "payment-service"