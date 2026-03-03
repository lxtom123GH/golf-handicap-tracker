import os

files_to_read = [
    "src/app-v4.js",
    "src/ui.js",
    "src/admin.js"
]

output_file = "LOGIC_LIFECYCLE.txt"
base_path = r"c:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker"

with open(os.path.join(base_path, output_file), "w", encoding="utf-8") as outfile:
    for filename in files_to_read:
        full_path = os.path.join(base_path, filename)
        outfile.write(f"/* --- START OF FILE: {filename} --- */\n")
        try:
            with open(full_path, "r", encoding="utf-8") as infile:
                outfile.write(infile.read())
        except Exception as e:
            outfile.write(f"ERROR READING FILE {filename}: {str(e)}\n")
        outfile.write(f"\n/* --- END OF FILE: {filename} --- */\n\n")

print(f"Successfully created {output_file}")
