import psycopg2
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import os
import json

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
SELECT
    etmr.*,
    etmm.micromarket_name,
    etmc.city_name
FROM stanza.erp_transformation_master_residences etmr
LEFT JOIN stanza.erp_transformation_master_micromarket etmm
    ON etmm.uuid = etmr.micromarket_id
LEFT JOIN stanza.erp_transformation_master_cities etmc
    ON etmc.uuid = etmm.city_id
WHERE etmr."__hevo__marked_deleted" IS NOT TRUE
  AND EXISTS (
      SELECT 1
      FROM stanza.ims_venta_aggregation_service_residences op
      WHERE op.residence_uuid = etmr.uuid
        AND op.residence_status = 'Booking Enabled'
  )
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

cursor.close()
conn.close()

# ===== CONNECT TO GOOGLE SHEET =====
scopes = ["https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_file(KEY_FILE, scopes=scopes)
client = gspread.authorize(creds)
sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME_B) # ResidenceList_RealTime_JOB

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