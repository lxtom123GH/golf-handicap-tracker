import os

def list_files(startpath):
    for root, dirs, files in os.walk(startpath):
        # Skip hidden folders and node_modules
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        if '.vscode' in dirs: dirs.remove('.vscode')
        
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            print(f'{subindent}{f}')

print("--- PROJECT STRUCTURE ---")
list_files('src')
print("\n--- DOCUMENTATION ---")
list_files('docs')