import zipfile, xml.etree.ElementTree as ET, re

path = r'C:\Users\lxtom\OneDrive\Documents\myscores.xlsx'

# Read xlsx as zip (it's just XML inside)
with zipfile.ZipFile(path, 'r') as z:
    # Get shared strings
    shared_strings = []
    try:
        with z.open('xl/sharedStrings.xml') as f:
            tree = ET.parse(f)
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in tree.findall('.//ns:si', ns):
                text = ''.join(t.text or '' for t in si.findall('.//ns:t', ns))
                shared_strings.append(text)
    except:
        pass
    
    # Get sheet1
    with z.open('xl/worksheets/sheet1.xml') as f:
        tree = ET.parse(f)
        ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        rows = {}
        for row in tree.findall('.//ns:row', ns):
            r_idx = int(row.get('r', 0))
            cells = {}
            for cell in row.findall('ns:c', ns):
                ref = cell.get('r', '')
                col_letters = re.match(r'([A-Z]+)', ref).group(1)
                col = 0
                for ch in col_letters:
                    col = col * 26 + (ord(ch) - ord('A') + 1)
                
                t = cell.get('t', '')
                v_el = cell.find('ns:v', ns)
                val = ''
                if v_el is not None and v_el.text is not None:
                    if t == 's':
                        idx = int(v_el.text)
                        val = shared_strings[idx] if idx < len(shared_strings) else ''
                    else:
                        val = v_el.text
                cells[col] = val
            rows[r_idx] = cells
        
        max_row = max(rows.keys()) if rows else 0
        max_col = max((max(c.keys()) for c in rows.values() if c), default=0)
        print(f"Rows: {max_row}, Cols: {max_col}")
        print("--- DATA ---")
        for r in range(1, min(max_row+1, 80)):
            row_data = rows.get(r, {})
            parts = [row_data.get(c, '') for c in range(1, max_col+1)]
            print('|'.join(parts))
