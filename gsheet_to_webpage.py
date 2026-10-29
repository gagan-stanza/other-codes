import json
import gspread

CREDENTIALS_FILE = '.json'
SPREADSHEET_ID = '1KHXqh8eXYKF4dWPY51Z7p7N1X60MaHkTNHKmT2TIgRo'
TAB_NAME = 'ResidenceList_VIEW'

def export_sheet_to_json():
    try:
        gc = gspread.service_account(filename=CREDENTIALS_FILE)
        sh = gc.open_by_key(SPREADSHEET_ID)
        worksheet = sh.worksheet(TAB_NAME)
        
        # 1. Fetch raw matrix of all cells as strings
        all_values = worksheet.get_all_values()
        
        if not all_values:
            print("Worksheet is empty.")
            return

        # 2. Extract first row as headers and sanitize duplicates/blank headers
        raw_headers = all_values[0]
        rows = all_values[1:]
        
        headers = []
        seen = {}
        for idx, h in enumerate(raw_headers):
            # Clean spaces or generate fallback name for empty headers
            header_name = h.strip() if h.strip() else f"Column_{idx + 1}"
            
            # Handle duplicate header names by appending _1, _2, etc.
            if header_name in seen:
                seen[header_name] += 1
                header_name = f"{header_name}_{seen[header_name]}"
            else:
                seen[header_name] = 0
                
            headers.append(header_name)

        # 3. Combine row values with sanitized headers into JSON objects
        data = [dict(zip(headers, row)) for row in rows]
        
        # 4. Save output to data.json
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print(f"Successfully exported {len(data)} rows to data.json")

    except Exception as e:
        print(f"An error occurred during export: {e}")

if __name__ == '__main__':
    export_sheet_to_json()