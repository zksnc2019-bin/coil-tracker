@echo off
chcp 65001 > nul
title coil-tracker 설치 및 실행

echo ========================================
echo  coil-tracker 설치 시작
echo ========================================
echo.

:: 현재 폴더로 이동
cd /d "%~dp0"

:: node_modules 정리 후 재설치
if exist node_modules (
  echo [1/4] 기존 node_modules 제거중...
  rmdir /s /q node_modules
)

echo [2/4] 패키지 설치중 (수분 소요)...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo [오류] npm install 실패. Node.js가 설치되어 있는지 확인하세요.
  echo 다운로드: https://nodejs.org
  pause
  exit /b 1
)

echo.
echo [3/4] .env.local 파일 확인...
if not exist .env.local (
  echo .
  echo [필수] Supabase 설정이 필요합니다.
  echo.
  set /p SUPABASE_URL="Supabase Project URL 입력 (예: https://xxxx.supabase.co): "
  set /p SUPABASE_KEY="Supabase anon key 입력: "
  (
    echo VITE_SUPABASE_URL=%SUPABASE_URL%
    echo VITE_SUPABASE_ANON_KEY=%SUPABASE_KEY%
  ) > .env.local
  echo .env.local 생성 완료
) else (
  echo .env.local 이미 존재합니다.
)

echo.
echo [4/4] 개발 서버 시작...
echo 브라우저에서 http://localhost:5173 접속하세요.
echo 종료: Ctrl+C
echo.
call npm run dev

pause
