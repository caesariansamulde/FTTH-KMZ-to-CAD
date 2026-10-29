@echo off
title Telecom Survey Excel Picture Converter - Web Application
cd /d "%~dp0"

echo ======================================================================
echo   Telecom Survey Excel Picture Embedder - Web Application
echo ======================================================================
echo Starting local web server on http://127.0.0.1:8000 ...
echo Opening your web browser automatically...
echo.

start "" "http://127.0.0.1:8000"
python web_app.py

pause
