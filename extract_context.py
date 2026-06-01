import os

# Project: Keperra 27-Hole Engine
# Task: Save source to ground_truth.txt for Gemini Ground Truth Audit

TARGET_DIRS = ['src', 'docs']
EXTENSIONS = ('.js', '.md', '.json', '.html', '.css', '.vue')
IGNORE_FILES = ['node_modules', 'dist', '.git', 'firebase-debug.log']
OUTPUT_FILE = "ground_truth.txt"

def extract_code():
    output = []
    output.append("### START_OF_GROUND_TRUTH ###")
    
    for target in TARGET_DIRS:
        if not os.path.exists(target):
            continue
            
        for root, dirs, files in os.walk(target):
            # Prune ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_FILES]
            
            for file in files:
                if file.endswith(EXTENSIONS):
                    file_path = os.path.join(root, file)
                    output.append(f"\n--- FILE: {file_path} ---")
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            output.append(f.read())
                    except Exception as e:
                        output.append(f"Error reading file {file_path}: {e}")

    output.append("\n### END_OF_BACKLOG ###")
    
    # Write to file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(output))
    
    print(f"✅ Success! Context saved to {os.path.abspath(OUTPUT_FILE)}")
    print("👉 Now, just upload 'ground_truth.txt' to this chat.")

if __name__ == "__main__":
    extract_code()