import pandas as pd

file_path = "temp_indexes.xlsx"

try:
    print(f"Reading {file_path}")
    dfs = pd.read_excel(file_path, sheet_name=None)
    for sheet_name, df in dfs.items():
        print(f"--- Sheet: {sheet_name} ---")
        pd.set_option('display.max_columns', None)
        pd.set_option('display.max_rows', None)
        pd.set_option('display.width', 1000)
        print(df)
        print("\n")
except Exception as e:
    print(f"Error reading Excel file: {e}")
