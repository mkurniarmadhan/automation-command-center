# setup.ps1 - Automated Installer Script for Windows
# Automation Command Center

$ErrorActionPreference = "Stop"
$AppName = "automation-command-center"
$InstallDir = "$env:USERPROFILE\$AppName"
$BinariesDir = "$InstallDir\binaries"
$GitRepoUrl = "https://github.com/your-username/my-automation-app.git"  # Ganti dengan repo aslimu

function Write-Step($step, $message, $color = "Yellow") {
    Write-Host "[$step] $message" -ForegroundColor $color
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    Installing Automation Command Center for Windows       " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 0. Cek Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git tidak ditemukan. Silakan install Git terlebih dahulu:" -ForegroundColor Red
    Write-Host "https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# 1. Cek & Install Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Step "1/5" "Node.js tidak ditemukan. Menginstal Node.js LTS via winget..."
    
    try {
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        Refresh-Path
        Start-Sleep -Seconds 2
        
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Write-Host "Gagal mendeteksi Node.js setelah instalasi. Silakan restart terminal lalu jalankan ulang script." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Gagal menginstal Node.js: $_" -ForegroundColor Red
        Write-Host "Coba install manual dari https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Step "1/5" "Node.js terdeteksi: $(node -v)" "Green"
}

# Cek npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm tidak ditemukan meskipun Node.js ada. Silakan perbaiki instalasi Node.js." -ForegroundColor Red
    exit 1
}

# 2. Clone atau Update Repositori
if (Test-Path $InstallDir) {
    Write-Step "2/5" "Folder sudah ada. Mengupdate kode dari Git..."
    Set-Location $InstallDir
    try {
        git pull origin main
    } catch {
        Write-Host "Gagal pull. Melanjutkan dengan kode yang ada..." -ForegroundColor Yellow
    }
} else {
    Write-Step "2/5" "Mengunduh kode proyek dari Git..."
    git clone $GitRepoUrl $InstallDir
    Set-Location $InstallDir
}

# 3. Unduh Platform-Tools (ADB)
$AdbPath = "$BinariesDir\platform-tools\adb.exe"
if (-not (Test-Path $AdbPath)) {
    Write-Step "3/5" "Mengunduh Android Platform-Tools (Windows)..."
    New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null
    
    $ZipUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
    $ZipPath = "$env:TEMP\platform-tools.zip"
    
    try {
        Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
        Expand-Archive -Path $ZipPath -DestinationPath $BinariesDir -Force
        Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
        Write-Host "     ADB berhasil dipasang di: $AdbPath" -ForegroundColor Green
    } catch {
        Write-Host "Gagal mengunduh Platform-Tools: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Step "3/5" "ADB Windows lokal sudah tersedia." "Green"
}

# 4. Install NPM Dependencies
Write-Step "4/5" "Menginstal dependensi Node.js..."
try {
    npm install
} catch {
    Write-Host "Gagal npm install: $_" -ForegroundColor Red
    exit 1
}

# 5. Selesai
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   Instalasi Selesai!                                      " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Jalankan aplikasi dengan perintah:" -ForegroundColor Cyan
Write-Host "   cd `"$InstallDir`"" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor White
Write-Host ""
Write-Host "   Atau langsung:" -ForegroundColor Cyan
Write-Host "   cd `"$InstallDir`" ; npm start" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green