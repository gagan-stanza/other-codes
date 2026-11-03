import os
import json
import gspread
from dotenv import load_dotenv

load_dotenv()

CREDENTIALS_FILE = 'gagan-automation-key.json'
SPREADSHEET_ID = os.getenv("SHEET_ID")
TAB_NAME = os.getenv("TAB_NAME_D")

def export_sheet_to_json():
    if not SPREADSHEET_ID or not TAB_NAME:
        raise ValueError("Missing SHEET_ID or TAB_NAME_D in environment variables.")

    try:
        gc = gspread.service_account(filename=CREDENTIALS_FILE)
        sh = gc.open_by_key(SPREADSHEET_ID)
        worksheet = sh.worksheet(TAB_NAME)
        
        all_values = worksheet.get_all_values()
        if not all_values:
            print("Worksheet is empty.")
            return

        # Row 1 strictly as headers, Row 2+ as raw data rows
        headers = [h.strip() if h.strip() else f"Column_{idx+1}" for idx, h in enumerate(all_values[0])]
        data_rows = all_values[1:]

        # Map each row directly to a JSON object using Row 1 headers
        data = [dict(zip(headers, row)) for row in data_rows]

        # Write exact raw data to data.json
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"Successfully exported {len(data)} rows from '{TAB_NAME}' to data.json")

    except Exception as e:
        print(f"An error occurred during export: {e}")

if __name__ == '__main__':
    export_sheet_to_json()