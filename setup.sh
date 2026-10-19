#!/bin/bash

set -e

APP_NAME="automation-command-center"
INSTALL_DIR="$HOME/$APP_NAME"
GIT_REPO_URL="https://github.com/your-username/my-automation-app.git" # Sesuaikan URL Git Anda
BINARIES_DIR="$INSTALL_DIR/binaries"

echo "============================================================"
echo "    Installing Automation Command Center & Dependencies    "
echo "============================================================"

# 1. Update paket sistem & install dependensi dasar
echo "[1/5] Memeriksa & menginstal paket sistem dasar..."
sudo apt update && sudo apt install -y \
    curl \
    wget \
    git \
    unzip \
    build-essential \
    openjdk-21-jdk \
    net-tools \
    libfuse2t64

# 2. Cek & Install Node.js LTS (v20) jika belum ada
if ! command -v node &> /dev/null; then
    echo "[2/5] Node.js tidak ditemukan. Menginstal Node.js v20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "[2/5] Node.js terdeteksi: $(node -v)"
fi

# 3. Clone atau Update Repositori Proyek
if [ -d "$INSTALL_DIR" ]; then
    echo "[3/5] Mengbarui kode proyek dari Git..."
    cd "$INSTALL_DIR"
    git pull origin main || true
else
    echo "[3/5] Mengunduh kode proyek dari Git..."
    git clone "$GIT_REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 4. Unduh Platform-Tools (ADB) Terisolasi
mkdir -p "$BINARIES_DIR"
ADB_PATH="$BINARIES_DIR/platform-tools/adb"

if [ ! -f "$ADB_PATH" ]; then
    echo "[4/5] Mengunduh Android Platform-Tools (ADB)..."
    ZIP_URL="https://dl.google.com/android/repository/platform-tools-latest-linux.zip"
    wget -q "$ZIP_URL" -O /tmp/platform-tools.zip
    unzip -q /tmp/platform-tools.zip -d "$BINARIES_DIR/"
    rm -f /tmp/platform-tools.zip
    chmod +x "$ADB_PATH"
    echo "ADB lokal berhasil dipasang di: $ADB_PATH"
else
    echo "[4/5] ADB lokal sudah tersedia."
fi

# 5. Instalasi NPM Dependencies
echo "[5/5] Menginstal dependensi Node.js & Electron..."
npm install

echo "============================================================"
echo "   Instalasi Selesai!                                      "
echo "   Untuk menjalankan aplikasi:                              "
echo "   cd $INSTALL_DIR && npm start                             "
echo "============================================================"