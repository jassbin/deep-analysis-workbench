@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 https://nodejs.org
  pause
  exit /b 1
)
echo ============================================
echo   深度分析工作台 正在启动...
echo   关闭此窗口即停止服务
echo ============================================
start "" http://127.0.0.1:8931/
node app/server.js
pause
