$env:PATH = "C:\Users\lxtom\.local\bin;$env:PATH"
Set-Location "C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker"
New-Item -ItemType Directory -Force -Path "logs" | Out-Null
Get-Content "scheduled_task.md" -Raw | claude -p --model opus --dangerously-skip-permissions 2>&1 | Out-File "logs\output_$(Get-Date -Format 'yyyyMMdd_HHmm').txt"
schtasks /delete /tn "ClaudeNightTask" /f