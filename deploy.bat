@echo off
cd /d "%~dp0"
echo === coil-tracker GitHub 배포 ===

git init
git config user.email "zksnc2019@gmail.com"
git config user.name "zksnc2019-bin"
git add .
git commit -m "feat: initial deploy - coil tracker MES-Lite"
git branch -M main
git remote add origin https://github.com/zksnc2019-bin/coil-tracker.git
git push -u origin main

echo.
echo 배포 완료! GitHub Actions가 자동으로 빌드 및 배포합니다.
echo 배포 URL: https://zksnc2019-bin.github.io/coil-tracker/
pause
