import os

# Configuration: What to include and what to ignore
INCLUDE_EXTENSIONS = {'.js', '.css', '.html', '.json', '.ps1', '.md', '.env', '.rules'}
IGNORE_DIRS = {'node_modules', 'dist', '.git', '.firebase', 'functions/node_modules', 'GRAVEYARD'}
IGNORE_FILES = {'package-lock.json', 'firestore-debug.log', 'extract_truth.py', 'ground_truth.txt'}

def extract_project_state(output_file="ground_truth.txt"):
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("⛳ KEPERRA 27-HOLE ENGINE: MASTER GROUND TRUTH\n")
        f.write("="*60 + "\n\n")

        for root, dirs, files in os.walk("."):
            # Skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not any(g in root for g in IGNORE_DIRS)]
            
            for file in files:
                if any(file.endswith(ext) for ext in INCLUDE_EXTENSIONS) and file not in IGNORE_FILES:
                    file_path = os.path.join(root, file)
                    f.write(f"\n--- FILE: {file_path} ---\n")
                    try:
                        with open(file_path, "r", encoding="utf-8") as source_file:
                            f.write(source_file.read())
                            f.write("\n")
                    except Exception as e:
                        f.write(f"Error reading {file_path}: {e}\n")
    
    print(f"✅ Ground truth extracted to {output_file}")

if __name__ == "__main__":
    extract_project_state()