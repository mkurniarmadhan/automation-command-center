const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Path binaries terisolasi dalam folder proyek
const BIN_DIR = path.join(__dirname, 'binaries');
const ADB_PATH = process.platform === 'win32'
    ? path.join(BIN_DIR, 'platform-tools', 'adb.exe')
    : path.join(BIN_DIR, 'platform-tools', 'adb');

if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));

// Exec Helper untuk ADB
function execAdb(command) {
    return new Promise((resolve, reject) => {
        exec(`"${ADB_PATH}" ${command}`, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            resolve(stdout.trim());
        });
    });
}

// Cek & Download ADB secara otomatis
async function ensureDependencies(socket) {
    if (fs.existsSync(ADB_PATH)) {
        socket.emit('log', 'Platform-Tools (ADB) terdeteksi di lokasi lokal.');
        return;
    }

    socket.emit('log', 'ADB tidak ditemukan. Mengunduh SDK Platform-Tools resmi...');
    let url = 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip';
    if (process.platform === 'win32') {
        url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
    } else if (process.platform === 'darwin') {
        url = 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip';
    }

    const zipPath = path.join(BIN_DIR, 'platform-tools.zip');
    const file = fs.createWriteStream(zipPath);

    await new Promise((resolve, reject) => {
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', reject);
    });

    socket.emit('log', 'Mengekstrak Platform-Tools ke folder binaries...');
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: BIN_DIR })).promise();
    fs.unlinkSync(zipPath);

    if (process.platform !== 'win32') {
        fs.chmodSync(ADB_PATH, '755');
    }
    socket.emit('log', 'Pemasangan ADB lokal selesai!');
}

// Deteksi WiFi / IP Lokal Komputer
function getWifiInfo() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return { interfaceName: name, ip: net.address };
            }
        }
    }
    return { interfaceName: 'Disconnected', ip: '0.0.0.0' };
}

// Mendapatkan daftar perangkat ADB yang terhubung
async function getConnectedDevices() {
    try {
        const output = await execAdb('devices -l');
        const lines = output.split('\n').slice(1);
        const devices = [];
        for (const line of lines) {
            if (line.trim() && line.includes('device')) {
                const parts = line.trim().split(/\s+/);
                const id = parts[0];
                devices.push({
                    id: id,
                    type: id.includes(':') ? 'WIRELESS' : 'USB',
                    status: parts[1]
                });
            }
        }
        return devices;
    } catch (e) {
        return [];
    }
}

// Socket.IO Connection Event Listener
io.on('connection', async (socket) => {
    socket.emit('log', 'Sistem terhubung ke Socket.IO Server.');

    // 1. Verifikasi dan unduh dependensi jika belum ada
    await ensureDependencies(socket);

    // 2. Kirim informasi WiFi & daftar perangkat
    socket.emit('wifi-info', getWifiInfo());
    socket.emit('device-list', await getConnectedDevices());

    // 3. Event handler: Connect Wireless ADB
    socket.on('connect-wireless', async (data) => {
        const { ip, port } = data;
        socket.emit('log', `Menghubungkan ke ADB Wireless ${ip}:${port}...`);
        try {
            const result = await execAdb(`connect ${ip}:${port}`);
            socket.emit('log', `ADB Output: ${result}`);
            
            const updatedDevices = await getConnectedDevices();
            io.emit('device-list', updatedDevices);
        } catch (err) {
            socket.emit('log', `Gagal terhubung ke Wireless ADB: ${err}`);
        }
    });

    // 4. Event handler: Refresh list
    socket.on('refresh-devices', async () => {
        const updatedDevices = await getConnectedDevices();
        socket.emit('device-list', updatedDevices);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Socket.IO Server berjalan pada http://localhost:${PORT}`);
});