"""
Import JSON data into Supabase.
Run: cd stock-manager-v2 && python migrations/import_to_supabase.py
"""
import json
import os
import requests

SUPABASE_URL = "https://isflesboadlylhgdntdd.supabase.co"
ANON_KEY = "sb_publishable_9HCszS2iQwtPP16R92gZbA_8bvfgMzT"
HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

MIG_DIR = os.path.dirname(__file__)

def load_json(filename):
    path = os.path.join(MIG_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def clear_table(table):
    """Delete all rows from a table (child tables first)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?limit=0"
    # Delete one by one via select+delete since we don't have service role
    # Actually, RLS allows all operations, so we can use the REST API
    resp = requests.delete(url, headers={**HEADERS, "Prefer": "return=minimal"})
    print(f"  Cleared {table}: {resp.status_code}")

def convert_dates(row, date_cols):
    """Convert SQLite datetime strings to ISO 8601 with timezone for PostgreSQL TIMESTAMPTZ."""
    for col in date_cols:
        if col in row and row[col] and isinstance(row[col], str):
            # "2026-05-18 18:44:42.255918" -> "2026-05-18T18:44:42.255918+00:00"
            v = row[col].replace(" ", "T")
            if "+" not in v and "Z" not in v:
                v += "+00:00"
            row[col] = v

def insert_rows(table, rows, date_cols=None):
    """Insert rows in batches of 50."""
    if date_cols is None:
        date_cols = []
    if not rows:
        print(f"  {table}: 0 rows (skipped)")
        return

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    batch_size = 50
    inserted = 0
    errors = []

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        clean_batch = []
        for row in batch:
            clean = {}
            for k, v in row.items():
                if v is None:
                    clean[k] = v
                elif isinstance(v, str) and v == 'None':
                    clean[k] = None
                else:
                    clean[k] = v
            convert_dates(clean, date_cols)
            clean_batch.append(clean)

        resp = requests.post(url, headers=HEADERS, json=clean_batch)
        if resp.status_code in (200, 201, 204):
            inserted += len(batch)
        else:
            errors.append(f"Batch {i}: {resp.status_code} {resp.text[:300]}")

    print(f"  {table}: {inserted}/{len(rows)} rows inserted")
    if errors:
        for e in errors:
            print(f"    Error: {e}")

def main():
    print("Importing data to Supabase...\n")

    # FK order: portfolios -> stocks -> trade_logs -> daily_snapshots
    insert_rows("portfolios", load_json("data_portfolios.json"), ["created_at"])
    insert_rows("stocks", load_json("data_stocks.json"), ["created_at", "updated_at"])
    insert_rows("trade_logs", load_json("data_trade_logs.json"), ["created_at"])
    # daily_snapshots: date is a DATE type, no conversion needed
    insert_rows("daily_snapshots", load_json("data_daily_snapshots.json"))

    print("\nImport complete!")

if __name__ == '__main__':
    main()
