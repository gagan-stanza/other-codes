import os
import json
import gspread
from dotenv import load_dotenv

# Load environment variables from .env file
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

        # Extract headers and sanitize blank or duplicate names
        raw_headers = all_values[0]
        rows = all_values[1:]
        
        headers = []
        seen = {}
        for idx, h in enumerate(raw_headers):
            header_name = h.strip() if h.strip() else f"Column_{idx + 1}"
            if header_name in seen:
                seen[header_name] += 1
                header_name = f"{header_name}_{seen[header_name]}"
            else:
                seen[header_name] = 0
            headers.append(header_name)

        data = [dict(zip(headers, row)) for row in rows]
        
        # Write exclusively to data.json
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print(f"Successfully exported {len(data)} rows to data.json")

    except Exception as e:
        print(f"An error occurred during export: {e}")

if __name__ == '__main__':
    export_sheet_to_json()