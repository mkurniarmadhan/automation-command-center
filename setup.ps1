# setup.ps1 - Automated Installer Script for Windows
$ErrorActionPreference = "Stop"

$AppName = "automation-command-center"
$InstallDir = "$env:USERPROFILE\$AppName"
$BinariesDir = "$InstallDir\binaries"
$GitRepoUrl = "https://github.com/your-username/my-automation-app.git"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Installing Automation Command Center for Windows       " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Cek & Install Node.js jika belum ada
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[1/4] Node.js tidak ditemukan. Menginstal Node.js LTS..." -ForegroundColor Yellow
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "[1/4] Node.js terdeteksi: $(node -v)" -ForegroundColor Green
}

# 2. Clone atau Update Repositori Proyek dari Git
if (Test-Path $InstallDir) {
    Write-Host "[2/4] Mengbarui kode proyek dari Git..." -ForegroundColor Yellow
    Set-Location $InstallDir
    git pull origin main
} else {
    Write-Host "[2/4] Mengunduh kode proyek dari Git..." -ForegroundColor Yellow
    git clone $GitRepoUrl $InstallDir
    Set-Location $InstallDir
}

# 3. Unduh Platform-Tools (ADB.exe) Terisolasi
if (-not (Test-Path "$BinariesDir\platform-tools\adb.exe")) {
    Write-Host "[3/4] Mengunduh Android Platform-Tools (Windows)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null
    
    $ZipUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
    $ZipPath = "$env:TEMP\platform-tools.zip"
    
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath $BinariesDir -Force
    Remove-Item $ZipPath -Force
    Write-Host "ADB Windows berhasil dipasang di: $BinariesDir\platform-tools\adb.exe" -ForegroundColor Green
} else {
    Write-Host "[3/4] ADB Windows lokal sudah tersedia." -ForegroundColor Green
}

# 4. Instalasi NPM Dependencies
Write-Host "[4/4] Menginstal dependensi Node.js & Electron..." -ForegroundColor Yellow
npm install

Write-Host "============================================================" -ForegroundColor Green
Write-Host "   Instalasi Selesai!                                      " -ForegroundColor Green
Write-Host "   Jalankan aplikasi dengan perintah:                      " -ForegroundColor Green
Write-Host "   cd $InstallDir ; npm start                              " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green