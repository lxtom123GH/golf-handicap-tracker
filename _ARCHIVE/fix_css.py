import os

file_path = r"c:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\src\style.css"

with open(file_path, "rb") as f:
    content = f.read()

# Try to decode as utf-8, ignoring errors
try:
    text = content.decode("utf-8")
except:
    text = content.decode("utf-16", errors="ignore") # Maybe it was utf-16?

# Find the start of the corrupted section
# It seems to start around line 1044 (based on previous view)
# But I want to be surgical.

# My previous echo corrupted the end.
# Let's find the last occurrences of .tab-content

lines = text.splitlines()

# Clean up redundant .tab-content rules and add .hidden
# I'll just rewrite the end of the file from line 1044 onwards.

new_lines = lines[:1043] # Correct lines up to 1043

new_lines.append(".tab-content {")
new_lines.append("    display: none;")
new_lines.append("    opacity: 0;")
new_lines.append("    visibility: hidden;")
new_lines.append("    z-index: 10;")
new_lines.append("}")
new_lines.append("")
new_lines.append(".tab-content.active {")
new_lines.append("    display: block !important;")
new_lines.append("    opacity: 1 !important;")
new_lines.append("    visibility: visible !important;")
new_lines.append("    z-index: 50 !important;")
new_lines.append("}")
new_lines.append("")
new_lines.append(".hidden { display: none !important; visibility: hidden !important; }")

with open(file_path, "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print("style.css repaired and updated.")
