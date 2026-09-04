import psycopg2
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import os
import json
from datetime import date, datetime

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
WITH current_inventory AS (
    SELECT
        io.booking_uuid,
        SUM(io.beds) AS inventory_bed_count,
        MAX(io.residence_uuid) AS residence_uuid
    FROM stanza.ims_booking_service_booking_inventory_occupancy AS io
    WHERE COALESCE(io."__hevo__marked_deleted", false) = false
      AND io.status = 1
      AND io.end_date >= CURRENT_DATE
    GROUP BY
        io.booking_uuid
),

circle_mapping AS (
    SELECT
        city,
        MAX(circle) AS circle_name
    FROM stanza.derived_lead_data
    GROUP BY
        city
)

SELECT
    b.*,

    /* Derived physical move-in status */
    CASE
        WHEN b.move_in_date IS NOT NULL
            THEN 'physically moved in'
        ELSE 'not physically moved in'
    END AS move_in_status,

    /* Booking-level bed count */
    COALESCE(
        ci.inventory_bed_count,
        va.beds
    ) AS bed_count,

    /* Property / residence */
    COALESCE(
        mr_inventory.residence_name,
        mr_venta.residence_name,
        va.residence_name
    ) AS property_name,

    /* Geography */
    mm.micromarket_name,
    mc.city_name,
    cm.circle_name

FROM stanza.ims_booking_service_booking AS b

/* Current inventory assignment */
LEFT JOIN current_inventory AS ci
    ON ci.booking_uuid = b.uuid

/* Residence from the current inventory assignment */
LEFT JOIN stanza.erp_transformation_master_residences AS mr_inventory
    ON mr_inventory.uuid = ci.residence_uuid
   AND COALESCE(mr_inventory."__hevo__marked_deleted", false) = false

/* Fallback booking aggregation source */
LEFT JOIN stanza.ims_venta_aggregation_service_booking_aggregation AS va
    ON va.booking_uuid = b.uuid
   AND COALESCE(va."__hevo__marked_deleted", false) = false
   AND va.status = 1

/* Residence lookup using the fallback residence name */
LEFT JOIN stanza.erp_transformation_master_residences AS mr_venta
    ON LOWER(mr_venta.residence_name) = LOWER(va.residence_name)
   AND COALESCE(mr_venta."__hevo__marked_deleted", false) = false

/* Micromarket lookup */
LEFT JOIN stanza.erp_transformation_master_micromarket AS mm
    ON mm.uuid = COALESCE(
        mr_inventory.micromarket_id,
        mr_venta.micromarket_id
    )
   AND COALESCE(mm."__hevo__marked_deleted", false) = false

/* City lookup */
LEFT JOIN stanza.erp_transformation_master_cities AS mc
    ON (
        mc.uuid = mm.city_id
        OR mc.id = mm.city_id
    )
   AND COALESCE(mc."__hevo__marked_deleted", false) = false

/* Circle lookup */
LEFT JOIN circle_mapping AS cm
    ON LOWER(cm.city) = LOWER(mc.city_name)

WHERE COALESCE(b."__hevo__marked_deleted", false) = false
  AND b.status = 1
  AND b.test_booking = 0
  AND COALESCE(b.booking_type, '') <> 'B2B'
  AND b.booking_status IN (
        'ONBOARDING_COMPLETED',
        'AGREEMENT_PENDING',
        'AGREEMENT_SENT',
        'ONBOARDING_PENDING',
        'ONBOARDING_IN_PROGRESS'
  );
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

excluded_headers = {
    'move_out_date',
    'personal_details_filled',
    'agreement_sent',
    'expected_moveout_date',
    '__hevo__ingested_at',
    '__hevo__loaded_at',
    '__hevo__marked_deleted',
    'audit_completed',
    'test_booking',
    'booking_tag',
    'parent_booking_id',
    'guest_uuid',
    '__hevo__source_modified_at',
    'move_in_date_v2',
    'move_out_date_v2',
    'buddy_code',
    'agreement_signing_service',
}
included_indexes = [
    index for index, header in enumerate(headers)
    if header not in excluded_headers
]
headers = [headers[index] for index in included_indexes]
rows = [tuple(row[index] for index in included_indexes) for row in rows]

def serialize_value(value):
  if isinstance(value, datetime):
    return value.isoformat(sep=' ')
  if isinstance(value, date):
    return value.isoformat()
  return value

rows = [tuple(serialize_value(value) for value in row) for row in rows]

cursor.close()
conn.close()

# ===== CONNECT TO GOOGLE SHEET =====
scopes = ["https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_file(KEY_FILE, scopes=scopes)
client = gspread.authorize(creds)
sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME_C) # LiveBookings_RealTime_JOB

# ===== WRITE TO SHEET =====
sheet.clear()
sheet.append_row(headers)
sheet.append_rows(rows)

row_count = len(rows)
print(f"Done! Data written to Google Sheet! Rows count: {row_count}")