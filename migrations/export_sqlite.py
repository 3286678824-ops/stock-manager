"""
Export SQLite data to JSON files for Supabase migration.
Run: cd stock-manager-v2 && python migrations/export_sqlite.py
"""
import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'stock_manager', 'instance', 'stocks.db')
OUT_DIR = os.path.join(os.path.dirname(__file__))

def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

def export_table(conn, table, output_file):
    conn.row_factory = dict_factory
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table}")
    rows = cur.fetchall()
    path = os.path.join(OUT_DIR, output_file)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, default=str, indent=2)
    print(f"Exported {len(rows)} rows from {table} -> {output_file}")
    return rows

def main():
    conn = sqlite3.connect(DB_PATH)
    export_table(conn, 'portfolios', 'data_portfolios.json')
    export_table(conn, 'stocks', 'data_stocks.json')
    export_table(conn, 'trade_logs', 'data_trade_logs.json')
    export_table(conn, 'daily_snapshots', 'data_daily_snapshots.json')
    conn.close()
    print("\nDone. JSON files saved to migrations/ directory.")

if __name__ == '__main__':
    main()
