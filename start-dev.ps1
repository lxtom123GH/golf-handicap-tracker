# Keperra 27-Hole Engine: Unified Dev Launcher
# [SYDNEY PROTOCOL] - Tier 1 Setup

Write-Host "⛳ Initializing Keperra 27-Hole Engine..." -ForegroundColor Cyan

# 1. Start the Firebase Emulators in a new window
Write-Host "🚀 Launching Firebase Emulators (Auth, DB, Functions)..." -ForegroundColor Yellow
start-process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '--- FIREBASE EMULATORS ---' -ForegroundColor Yellow; firebase emulators:start"

# 2. Wait 3 seconds to let the Emulator Hub warm up
Start-Sleep -Seconds 3

# 3. Start the Vite Dev Server in a new window
Write-Host "⚡ Launching Vite Dev Server (Front-end)..." -ForegroundColor Green
start-process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '--- VITE DEV SERVER ---' -ForegroundColor Green; npm run dev"

Write-Host "✅ Both engines are warming up. Check the new windows for status." -ForegroundColor Cyan
Write-Host "🔗 Local App: http://localhost:5173"
Write-Host "🔗 Emulator UI: http://localhost:4000"