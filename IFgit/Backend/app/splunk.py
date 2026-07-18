import os
from dotenv import load_dotenv
import json
import requests
from requests.auth import HTTPBasicAuth

load_dotenv()
# Replace with your actual values
splunk_base_url = os.getenv("SPLUNK_BASE_URL")
username = os.getenv("SPLUNK_USERNAME")
password = os.getenv("SPLUNK_PASSWORD")
search_query = r'''search index="main" sourcetype="ARE_DEMO" "ERROR" "ORA-28000" earliest=@y latest=now | eval raw_cleaned=replace(_raw, "^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ", "") | eval logline = strftime(_time,"%Y-%m-%d %H:%M:%S") . " " . raw_cleaned | table logline'''
# Create the full URL to the export endpoint
url = f"{splunk_base_url}/services/search/jobs/export"
# Form data
payload = {
   "search": search_query,
   "output_mode": "json"
}
output_file = "ARE_application_error.log"
# Make the request
# Call Splunk and save output
with requests.post(url, data=payload, auth=HTTPBasicAuth(username, password), verify=False, stream=True) as response:
   if response.status_code == 200:
       with open(output_file, "w", encoding="utf-8") as f:
           for line in response.iter_lines():
               if line:
                   data = json.loads(line.decode("utf-8"))
                   log = data.get("result", {}).get("logline")
                   if log:
                       f.write(log + "\n")
       print(f"✅ Logs saved to: {output_file}")
       print("trying 2")
   else:
       print(f"❌ Failed to fetch logs: {response.status_code} - {response.text}")