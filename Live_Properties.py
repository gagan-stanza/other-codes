import psycopg2
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import os
import json
import math
from datetime import date, datetime
from decimal import Decimal

# ===== LOAD CONFIG =====
load_dotenv()

RS_HOST = os.getenv("RS_HOST")
RS_PORT = int(os.getenv("RS_PORT"))
RS_DBNAME = os.getenv("RS_DBNAME")
RS_USER = os.getenv("RS_USER")
RS_PASSWORD = os.getenv("RS_PASSWORD")
SHEET_ID = os.getenv("SHEET_ID")
TAB_NAME_A = os.getenv("TAB_NAME_A")  # SCC_RealTime_JOB
TAB_NAME_B = os.getenv("TAB_NAME_B")  # ResidenceList_RealTime_JOB
TAB_NAME_C = os.getenv("TAB_NAME_C")  # LiveBookings_RealTime_JOB
KEY_FILE = os.getenv("KEY_FILE")

# ===== SQL QUERY =====
QUERY = """
WITH enabled_res AS (
    SELECT residence_uuid
    FROM stanza.ims_venta_aggregation_service_residences
    WHERE residence_status = 'Booking Enabled'
      AND "__hevo__marked_deleted" IS NOT TRUE
    GROUP BY residence_uuid
)
SELECT
    etmr.*,
    etmm.micromarket_name,
    etmc.city_name
FROM stanza.erp_transformation_master_residences etmr
INNER JOIN enabled_res
    ON enabled_res.residence_uuid = etmr.uuid
LEFT JOIN stanza.erp_transformation_master_micromarket etmm
    ON etmm.uuid = etmr.micromarket_id
LEFT JOIN stanza.erp_transformation_master_cities etmc
    ON etmc.uuid = etmm.city_id
WHERE etmr."__hevo__marked_deleted" IS NOT TRUE
ORDER BY
    etmc.city_name,
    etmm.micromarket_name,
    etmr.residence_name;
"""

# ===== CONNECT TO REDSHIFT =====
conn = psycopg2.connect(
    host=RS_HOST,
    port=RS_PORT,
    dbname=RS_DBNAME,
    user=RS_USER,
    password=RS_PASSWORD
)
cursor = conn.cursor()
cursor.execute(QUERY)
rows = cursor.fetchall()
headers = [desc[0] for desc in cursor.description]

def serialize_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        val = float(value)
        return "" if (math.isnan(val) or math.isinf(val)) else val
    if isinstance(value, float):
        return "" if (math.isnan(value) or math.isinf(value)) else value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value

rows = [tuple(serialize_value(value) for value in row) for row in rows]

cursor.close()
conn.close()

# ===== CONNECT TO GOOGLE SHEET =====
scopes = ["https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_file(KEY_FILE, scopes=scopes)
client = gspread.authorize(creds)
sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME_B)  # ResidenceList_RealTime_JOB

# ===== WRITE TO SHEET =====
sheet.clear()
sheet.append_row(headers)
sheet.append_rows(rows)

header_count = len(headers)
row_count = len(rows)

print(
    f"Done! Data written to Google Sheet!\n"
    f"Headers Count: {header_count}\n"
    f"Rows Count: {row_count}"
)