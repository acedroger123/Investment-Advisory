@echo off
title AI Wealth Ecosystem Launcher

echo 🚀 Clearing old processes...
C:\Windows\System32\taskkill.exe /f /im python.exe
C:\Windows\System32\taskkill.exe /f /im node.exe

echo 📂 Opening Node.js Server...
start "NODE_SERVER" cmd /k "node server.js"

echo 📊 Opening Stability API...
start "STABILITY_API" cmd /k "uvicorn stablility_api:app --port 8000"

echo 🎯 Opening Recommend API...
start "RECOMMEND_API" cmd /k "uvicorn recommend_api:app --port 8001"

echo 🏁 Opening Goal API...
start "GOAL_API" cmd /k "uvicorn goal_api:app --port 8004"

echo 📈 Opening Portfolio Analysis Engine...
start "PORTFOLIO_ANALYSIS" cmd /k "uvicorn portfolio_app:app --port 8005"

echo ✅ All windows opened. Check each for errors.
pause