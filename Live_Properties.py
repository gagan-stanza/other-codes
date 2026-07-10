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
TAB_NAME_A = os.getenv("TAB_NAME_A")
TAB_NAME_B = os.getenv("TAB_NAME_B")
KEY_FILE = os.getenv("KEY_FILE")

# ===== SQL QUERY =====
QUERY = """
SELECT
  etmr.status AS "status",
  etmr.bed_count AS "bed_count",
  etmr.room_count AS "room_count",
  etmr.test_house AS "test_house",
  etmr.estate_gender AS "estategender",
  etmr.micromarket_id AS "micromarket_id",
  etmr.residence_name AS "residence_name",
  etmr.residence_type AS "residence_type",
  etmr.core_residence_id AS "core_residence_id",
  etmr.property_deal_type AS "property_deal_type",
  etmr.core_residence_name AS "core_residence_name",
  etmr.property_entity_type AS "property_entit  y_type",
  etmr.__hevo__marked_deleted AS "hevo_marked_deleted",
  etmr.residence_category AS "residence_category",
  etmm.micromarket_name AS "micromarket_name",
  etmc.city_name AS "city_name"
FROM stanza.erp_transformation_master_residences etmr
LEFT JOIN stanza.erp_transformation_master_micromarket etmm
  ON etmm.uuid = etmr.micromarket_id
LEFT JOIN stanza.erp_transformation_master_cities etmc
  ON etmc.uuid = etmm.city_id
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
sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME_B)

# ===== WRITE TO SHEET =====
sheet.clear()
sheet.append_row(headers)
sheet.append_rows(rows)

print("Done! Data written to Google Sheet!")