@echo off
chcp 65001 > nul
title coil-tracker 빌드 및 배포

cd /d "%~dp0"

echo ========================================
echo  GitHub Pages 빌드 및 배포
echo ========================================
echo.

:: .env.local 확인
if not exist .env.local (
  echo [오류] .env.local 파일이 없습니다. install_and_run.bat를 먼저 실행하세요.
  pause
  exit /b 1
)

:: node_modules 확인
if not exist node_modules (
  echo [설치] node_modules 없음. npm install 실행중...
  call npm install
)

echo [1/3] 프로덕션 빌드 중...
call npm run build
if %errorlevel% neq 0 (
  echo [오류] 빌드 실패
  pause
  exit /b 1
)
echo 빌드 완료 - dist/ 폴더 생성됨

echo.
echo [2/3] Git 상태 확인...
git status

echo.
echo [3/3] GitHub에 push...
git add .
git commit -m "deploy: %date% %time%"
git push origin main

echo.
echo ========================================
echo 배포 완료!
echo GitHub Actions가 자동으로 Pages에 배포합니다.
echo 약 2-3분 후 확인하세요.
echo ========================================
pause
