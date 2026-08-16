@echo off
chcp 65001 >nul
title Nova Agent
cd /d "%~dp0"

echo ==========================================
echo   Nova Agent 启动器
echo ==========================================

rem ---------- 1. 检查 Node.js 是否存在 ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [错误] 未检测到 Node.js！
    echo.
    echo   请先安装 Node.js 22.5 或更高版本：
    echo     https://nodejs.org/
    echo.
    echo   安装完成后重新运行本脚本。
    echo.
    pause
    exit /b 1
)

rem ---------- 2. 检查 Node.js 版本（需要 >= 22.5） ----------
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo 检测到 Node.js %NODE_VER%

rem 去掉开头的 v，取主版本号和次版本号
for /f "tokens=1,2 delims=." %%a in ("%NODE_VER:~1%") do (
    set NODE_MAJOR=%%a
    set NODE_MINOR=%%b
)

if %NODE_MAJOR% LSS 22 goto :node_too_old
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 5 goto :node_too_old
goto :node_ok

:node_too_old
echo.
echo [错误] Node.js 版本过低：需要 22.5 或更高版本，当前 %NODE_VER%
echo.
echo   请到 https://nodejs.org/ 下载安装新版后重试。
echo.
pause
exit /b 1

:node_ok
rem ---------- 3. 首次运行自动安装依赖 ----------
if not exist node_modules (
    echo.
    echo 首次运行，正在安装依赖（可能需要几分钟）...
    call npm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

rem ---------- 4. 启动 ----------
echo.
echo 启动 Nova Agent...
echo 启动后浏览器访问 http://localhost:5173
echo 按 Ctrl+C 停止服务。
echo.
call npm run dev
pause
