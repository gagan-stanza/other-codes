import psycopg2
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import os

# ===== LOAD CONFIG =====
load_dotenv()

RS_HOST = os.getenv("RS_HOST")
RS_PORT = int(os.getenv("RS_PORT"))
RS_DBNAME = os.getenv("RS_DBNAME")
RS_USER = os.getenv("RS_USER")
RS_PASSWORD = os.getenv("RS_PASSWORD")
SHEET_ID = os.getenv("SHEET_ID")
TAB_NAME = os.getenv("TAB_NAME")
KEY_FILE = os.getenv("KEY_FILE")

# ===== SQL QUERY =====
QUERY = """
SELECT 
  name as "SCC_Name",
  locationtype[0].label::text as "Location_Type",
  location[0].label::text || 
  CASE WHEN location[1].label::text IS NOT NULL THEN ', ' || location[1].label::text ELSE '' END ||
  CASE WHEN location[2].label::text IS NOT NULL THEN ', ' || location[2].label::text ELSE '' END ||
  CASE WHEN location[3].label::text IS NOT NULL THEN ', ' || location[3].label::text ELSE '' END ||
  CASE WHEN location[4].label::text IS NOT NULL THEN ', ' || location[4].label::text ELSE '' END ||
  CASE WHEN location[5].label::text IS NOT NULL THEN ', ' || location[5].label::text ELSE '' END ||
  CASE WHEN location[6].label::text IS NOT NULL THEN ', ' || location[6].label::text ELSE '' END
  as "Location",
  COALESCE(scholardistributionpercentage::text, '-') as "Scholar%",
  COALESCE(professionaldistributionpercentage::text, '-') as "WP%",
  COALESCE(hydradistributionpercentage::text, '-') as "Hydra%",
  COALESCE(coachingdistributionpercentage::text, '-') as "Coaching%"
FROM (
  SELECT *,
  ROW_NUMBER() OVER (PARTITION BY name ORDER BY createdat DESC) as rank
  FROM bifrost.sales_command_center
  WHERE entitytypeenum = 'ACTIVE'
) ranked
WHERE rank = 1
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
sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME)

# ===== WRITE TO SHEET =====
sheet.batch_clear(["A:G"])
sheet.append_row(headers)
sheet.append_rows(rows)

print("Done! Data written to Google Sheet!")