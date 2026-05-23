@echo off
echo ============================================
echo   DigitBox Tailwind Manual Setup Script
echo ============================================
echo.

REM Ensure we are in the project folder
echo Checking project folder...
cd /d "%~dp0"

REM Create tailwind.config.js
echo Creating tailwind.config.js...
(
echo /** @type {import('tailwindcss').Config} */
echo module.exports = {
echo   content: [
echo     "./app/**/*.{js,ts,jsx,tsx}",
echo     "./components/**/*.{js,ts,jsx,tsx}",
echo     "./lib/**/*.{js,ts,jsx,tsx}",
echo   ],
echo   theme: {
echo     extend: {},
echo   },
echo   plugins: [],
echo };
) > tailwind.config.js

REM Create postcss.config.js
echo Creating postcss.config.js...
(
echo module.exports = {
echo   plugins: {
echo     tailwindcss: {},
echo     autoprefixer: {},
echo   },
echo };
) > postcss.config.js

REM Ensure app folder exists
if not exist app (
    echo Creating app folder...
    mkdir app
)

REM Ensure globals.css exists
if not exist app\globals.css (
    echo Creating globals.css...
    (
    echo @tailwind base;
    echo @tailwind components;
    echo @tailwind utilities;
    ) > app\globals.css
) else (
    echo Adding Tailwind imports to existing globals.css...
    echo @tailwind base;> app\globals_temp.css
    echo @tailwind components;>> app\globals_temp.css
    echo @tailwind utilities;>> app\globals_temp.css
    type app\globals.css >> app\globals_temp.css
    move /y app\globals_temp.css app\globals.css >nul
)

REM Install Tailwind packages
echo Installing Tailwind packages...
npm install tailwindcss @tailwindcss/postcss postcss autoprefixer

echo.
echo ============================================
echo   Tailwind setup complete!
echo   You can now run the shadcn preset:
echo   npx shadcn@latest add @supabase/supabase-client-nextjs
echo ============================================
pause
