@echo off
cd /d "C:\Users\Ashis_bc67jy2\Desktop\Desktop\Git Uploads\Investment-Advisory"

:: Set the current folder as a source for Python imports
set PYTHONPATH=%PYTHONPATH%;.

echo Starting API...
uvicorn habit_recomendation_api:app --port 8006 --reload

pause
