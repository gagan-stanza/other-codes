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
        if len(all_values) < 3:
            print("Worksheet does not have enough rows (requires at least 2 header rows + data).")
            return

        row1 = all_values[0]  # Top header row (contains horizontal merged cells)
        row2 = all_values[1]  # Bottom header row (sub-headers or identical strings)
        data_rows = all_values[2:]  # Data starts at Row 3

        # 1. Forward-fill empty values in Row 1 caused by merged cells
        filled_row1 = []
        last_top = ""
        for cell in row1:
            val = cell.strip()
            if val:
                last_top = val
            filled_row1.append(last_top)

        # 2. Build single combined header array
        headers = []
        for idx in range(len(filled_row1)):
            top = filled_row1[idx]
            bottom = row2[idx].strip() if idx < len(row2) else ""

            # Case A: Identical values in Row 1 and Row 2 (e.g., Property Name / Property Name)
            if top == bottom:
                headers.append(top if top else f"Column_{idx + 1}")
            
            # Case B: Top merged category + distinct bottom sub-header (e.g., SCHOLAR BEDS SOLD + "=6")
            elif top and bottom:
                headers.append(f"{top} - {bottom}")
            
            # Case C: Single header present in only one row
            elif top:
                headers.append(top)
            elif bottom:
                headers.append(bottom)
            else:
                headers.append(f"Column_{idx + 1}")

        # 3. Disambiguate any duplicate headers if they occur
        unique_headers = []
        seen = {}
        for h in headers:
            if h in seen:
                seen[h] += 1
                unique_headers.append(f"{h}_{seen[h]}")
            else:
                seen[h] = 0
                unique_headers.append(h)

        # 4. Zip sanitized headers with row values starting from Row 3
        data = [dict(zip(unique_headers, row)) for row in data_rows]

        # 5. Save output directly to data.json
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"Successfully exported {len(data)} rows to data.json")

    except Exception as e:
        print(f"An error occurred during export: {e}")

if __name__ == '__main__':
    export_sheet_to_json()