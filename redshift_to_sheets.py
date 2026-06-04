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
select 
  id as "UUID",
  name as "SCC_Name",
  scholardistributionpercentage as "Scholar%",
  professionaldistributionpercentage as "WP%",
  hydradistributionpercentage as "Hydra%",
  coachingdistributionpercentage as "Coaching%",
  locationtype [0].label::text as "Type",
  location as "City/MM/Residence",
  bookingtype as "BookingType"
from (
  select
    id,
    name,
    professionaldistributionpercentage,
    scholardistributionpercentage,
    coachingdistributionpercentage,
    hydradistributionpercentage,
    locationtype,
    location,
    bookingtype,
    updatedat,
    row_number() over (partition by name order by updatedat desc) as rn_name
  from (
    select
      id,
      name,
      professionaldistributionpercentage,
      scholardistributionpercentage,
      coachingdistributionpercentage,
      hydradistributionpercentage,
      locationtype,
      location,
      bookingtype,
      updatedat,
      row_number() over (partition by location order by updatedat desc) as rn_location
    from bifrost.sales_command_center
    where entitytypeenum = 'ACTIVE'
  ) location_dedup
  where rn_location = 1
) name_dedup
where rn_name = 1
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
sheet.clear()
sheet.append_row(headers)
sheet.append_rows(rows)

print("Done! Data written to Google Sheet!")