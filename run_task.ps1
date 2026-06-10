$env:PATH = "C:\Users\lxtom\.local\bin;$env:PATH"
Set-Location "C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker"

try {
    New-Item -ItemType Directory -Force -Path "logs" | Out-Null
    $logPath = "logs\output_$(Get-Date -Format 'yyyyMMdd_HHmm').txt"

    # 1. Execute the CLI
    Get-Content "scheduled_task.md" -Raw | claude -p --model fable --dangerously-skip-permissions 2>&1 | Out-File $logPath -Encoding utf8
    
    # 2. Force a terminating error if the CLI failed
    if ($LASTEXITCODE -ne 0) {
        throw "CLI failed with exit code $LASTEXITCODE"
    }
}
catch {
    # 3. Push a proactive notification if anything in the try block fails
    Invoke-RestMethod -Uri "https://ntfy.sh/keperra-27-engine-sync-99" -Method Post -Body "[PROJECT_ANCHOR]: ClaudeNightTask Failed - Check Logs"
}
finally {
    # 4. Guaranteed self-destruct, regardless of success or failure
    schtasks /delete /tn "ClaudeNightTask" /f
}