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
TAB_NAME = os.getenv("TAB_NAME")
KEY_FILE = os.getenv("KEY_FILE")

# ===== SQL QUERY =====
QUERY = """
select 
  id as "uuid",
  name as "scc_Name",
  scholardistributionpercentage as "scholar%",
  professionaldistributionpercentage as "wp%",
  hydradistributionpercentage as "hydra%",
  coachingdistributionpercentage as "coaching%",
  locationtype [0].label::text as "location_type",
  location as "location_name",
  bookingtype as "booking_type"
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

def extract_label_list(value):
    """Extract label values from JSON/list structures."""
    if value is None:
        return []

    try:
        if isinstance(value, str):
            data = json.loads(value)
        else:
            data = value
    except (json.JSONDecodeError, TypeError):
        return []

    labels = []

    def collect(item):
        if isinstance(item, dict):
            label = item.get('label')
            if label is not None:
                labels.append(str(label))
        elif isinstance(item, str):
            labels.append(item)
        elif isinstance(item, list):
            for inner in item:
                collect(inner)

    collect(data)
    return labels


def extract_labels_from_json(value):
    return ', '.join(extract_label_list(value))

location_name_index = headers.index('location_name')
booking_type_index = headers.index('booking_type')

EXCLUDE_SCC_NAMES_City = {
    'Bangalore',
    'Delhi',
    'Gujarat - All MMs'
}

EXCLUDE_SCC_NAMES_MM = {
    'Anik 17 nov',
    'Aziznagar Gandi Maisamma Narsingi',
    'Gandhinagar',
    'Gota and Navrangpura',
    'Himayatnagar Ameerpet',
    'Indore - Geeta Bhawan & Bhawar Kua',
    'KA2',
    'Karve Nagar Wakad',
    'Kochi Kakkanad',
    'Kota',
    'Loni Kalbhor Wagholi Kothrud',
    'MH: Suits',
    'Mogilev House',
    'Phase 1 Live - Suits',
    'Senapati Bapat Road Shivajinagar',
    'Vadgaon Akurdi',
    'Vastrapur & Thaltej and Bopal & Shilaj'
}

EXCLUDE_SCC_NAMES_Residence = {
    'Avinashi road (Property)',
    'Avinashi road (Property) ',
    'Boston House',
    'Burbank House',
    'Canberra House',
    'Cordoba & Granada',
    'Evanston House',
    'Giza & Kenitra',
    'IND',
    'koramangala hybrid',
    'Kormangala WP',
    'Mogilev House',
    'Ripon & Manisa',
    'Shanghai : No AMC ',
    'Shanghai House',
    'Suits: No AMC Property Level',
    'Vijay Nagar (Less Mahalaxmi Main)',
    'Vijay Nagar (Mahalaxmi)'
}

EXCLUDE_SCC_NAMES = EXCLUDE_SCC_NAMES_City | EXCLUDE_SCC_NAMES_MM | EXCLUDE_SCC_NAMES_Residence

name_index = headers.index('scc_name')
rows = [row for row in rows if row[name_index] not in EXCLUDE_SCC_NAMES]

# ===== EXTRACT LABELS FROM JSON ARRAYS =====
processed_rows = []
for row in rows:
    row_list = list(row)
    row_list[location_name_index] = extract_labels_from_json(row_list[location_name_index])
    booking_labels = extract_label_list(row_list[booking_type_index])
    row_list[booking_type_index] = ', '.join(booking_labels)

    booking_labels_set = set(booking_labels)

    s21_value = '100%' if 'S21' in booking_labels_set else '-'
    scholar_value = row_list[headers.index('scholar%')] if 'Scholar' in booking_labels_set else '-'
    working_professional_value = row_list[headers.index('wp%')] if 'Working Professional' in booking_labels_set else '-'
    hydra_value = row_list[headers.index('hydra%')] if 'Hydra' in booking_labels_set else '-'
    coaching_value = row_list[headers.index('coaching%')] if 'Coaching' in booking_labels_set else '-'

    final_values = [
        s21_value,
        scholar_value,
        working_professional_value,
        hydra_value,
        coaching_value,
    ]

    location_parts = [part.strip() for part in row_list[location_name_index].split(',') if part.strip()]
    if not location_parts:
        location_parts = ['']

    for location_value in location_parts:
        expanded_row = list(row_list)
        expanded_row[location_name_index] = location_value
        expanded_row.extend(final_values)
        processed_rows.append(tuple(expanded_row))

rows = processed_rows
headers.extend(['S21', 'Scholar', 'Working Professional', 'Hydra', 'Coaching'])

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