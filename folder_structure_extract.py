import os

# Project: Keperra 27-Hole Engine
# Task: Extract 3-level folder structure for Ground Truth alignment

OUTPUT_FILE = "folder_structure.txt"
IGNORE_DIRS = {'node_modules', '.git', 'dist', 'firebase-debug.log', '.firebase'}

def get_structure(startpath, max_depth=3):
    output = ["### PROJECT DIRECTORY STRUCTURE (3 LEVELS) ###\n"]
    startpath = os.path.abspath(startpath)
    
    for root, dirs, files in os.walk(startpath):
        # Prune ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        # Calculate current depth relative to startpath
        depth = root[len(startpath):].count(os.sep)
        
        if depth < max_depth:
            level = depth
            indent = ' ' * 4 * (level)
            output.append(f"{indent}{os.path.basename(root)}/")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                output.append(f"{subindent}{f}")
        
        if depth >= max_depth:
            # Prevent going deeper than specified
            dirs[:] = []

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(output))
    
    print(f"✅ Structure saved to {os.path.abspath(OUTPUT_FILE)}")

if __name__ == "__main__":
    get_structure(".")