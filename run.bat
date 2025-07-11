@echo off
echo 🔄 Activating venv...
call venv\Scripts\activate.bat

echo 🚀 Starting Tornado server on port 7777...
python app\main.py

pause