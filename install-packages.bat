@echo off
REM Installation script to downgrade pdf-parse to v1.1.1

echo Uninstalling pdf-parse@2.4.5...
call npm uninstall pdf-parse

echo Installing pdf-parse@1.1.1...
call npm install pdf-parse@1.1.1

echo Installing axios...
call npm install axios

echo.
echo Done! Now restart your server.
echo Run: node server.js
pause

