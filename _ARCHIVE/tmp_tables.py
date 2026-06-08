import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

for i, table in enumerate(re.findall(r'<table.*?</table>', text, re.DOTALL)):
    print(f"Table {i}:")
    for tr in re.findall(r'<tr.*?>.*?</tr>', table, re.DOTALL)[:1]: # Just first row
        ths = re.findall(r'<th.*?>.*?</th>', tr, re.DOTALL)
        print(f"Headers ({len(ths)}):")
        for th in ths:
            print("  -", th.replace('\n', ' ').strip())
