import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import unzipper from 'unzipper';
import mDnsSd from 'node-dns-sd';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server);

const BIN_DIR = path.join(__dirname, 'binaries');
const PLATFORM = process.platform;
const ADB_BIN = PLATFORM === 'win32' ? 'adb.exe' : 'adb';
const ADB_PATH = path.join(BIN_DIR, 'platform-tools', ADB_BIN);

// Pastikan folder binaries ada
if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));

// ====================== ADB HELPER ======================

async function adb(args = [], timeout = 20000) {
    try {
        const { stdout, stderr } = await execFileAsync(ADB_PATH, args, {
            timeout,
            windowsHide: true,
        });
        return (stdout || stderr || '').trim();
    } catch (err) {
        throw new Error(err.stderr || err.message || 'ADB error');
    }
}

// ====================== DOWNLOAD PLATFORM-TOOLS ======================

async function ensureAdb(socket) {
    if (fs.existsSync(ADB_PATH)) {
        socket.emit('log', 'ADB lokal sudah tersedia.');
        return true;
    }

    socket.emit('log', 'Mengunduh Platform-Tools resmi...');

    const urls = {
        win32: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
        darwin: 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
        linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
    };

    const url = urls[PLATFORM] || urls.linux;
    const zipPath = path.join(BIN_DIR, 'platform-tools.zip');

    try {
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(zipPath);
            https.get(url, (res) => {
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', reject);
        });

        socket.emit('log', 'Mengekstrak Platform-Tools...');
        await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: BIN_DIR }))
            .promise();

        fs.unlinkSync(zipPath);

        if (PLATFORM !== 'win32') {
            fs.chmodSync(ADB_PATH, 0o755);
        }

        socket.emit('log', 'ADB berhasil dipasang.');
        return true;
    } catch (err) {
        socket.emit('log', `Gagal mengunduh ADB: ${err.message}`);
        return false;
    }
}

// ====================== NETWORK ======================

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return { name, ip: iface.address };
            }
        }
    }
    return { name: 'Disconnected', ip: '0.0.0.0' };
}

async function getDevices() {
    try {
        const output = await adb(['devices', '-l']);
        return output
            .split('\n')
            .slice(1)
            .filter(line => line.trim() && line.includes('device'))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                const id = parts[0];
                return {
                    id,
                    type: id.includes(':') ? 'WIRELESS' : 'USB',
                    status: parts[1] || 'device',
                };
            });
    } catch {
        return [];
    }
}

// ====================== mDNS ======================

async function discoverMdns(timeout = 4000) {
    try {
        const [pairing, connect] = await Promise.all([
            mDnsSd.discover({ name: '_adb-tls-pairing._tcp.local', timeout }).catch(() => []),
            mDnsSd.discover({ name: '_adb-tls-connect._tcp.local', timeout }).catch(() => []),
        ]);

        const results = [];

        for (const item of pairing) {
            results.push({
                ip: item.address,
                port: item.service?.port ?? null,
                type: 'PAIRING',
                name: item.service?.name || item.name || 'ADB Device',
            });
        }

        for (const item of connect) {
            results.push({
                ip: item.address,
                port: item.service?.port ?? null,
                type: 'CONNECT',
                name: item.service?.name || item.name || 'ADB Device',
            });
        }

        return results;
    } catch {
        return [];
    }
}

// ====================== PORT CHECK ======================

function checkPort(ip, port, timeout = 250) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let done = false;

        const finish = (result) => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeout);
        socket.once('connect', () => finish({ ip, port }));
        socket.once('timeout', () => finish(null));
        socket.once('error', () => finish(null));
        socket.connect(port, ip);
    });
}

// ====================== SOCKET.IO ======================

io.on('connection', async (socket) => {
    socket.emit('log', 'Terhubung ke server.');

    await ensureAdb(socket);
    await adb(['start-server']).catch(() => { });

    socket.emit('wifi-info', getLocalIp());
    socket.emit('device-list', await getDevices());

    // ----- QR Pairing -----
    socket.on('generate-qr', async () => {
        const { ip } = getLocalIp();
        if (ip === '0.0.0.0') {
            socket.emit('log', 'Tidak terhubung ke jaringan.');
            return;
        }

        const name = 'cc-' + Math.random().toString(36).slice(2, 12);
        const password = String(Math.floor(100000 + Math.random() * 900000));
        const payload = `WIFI:T:ADB;S:${name};P:${password};;`;

        try {
            const qr = await QRCode.toDataURL(payload, { width: 260, margin: 2 });
            socket.emit('qr-generated', { qr, ip, pin: password, name });
            socket.emit('log', `QR dibuat → PIN: ${password}`);

            // Coba auto-pair selama ~30 detik
            socket.emit('log', 'Menunggu scan QR dari HP...');
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const services = await discoverMdns(2000);
                const match = services.find(s => s.type === 'PAIRING' && s.name.includes(name));

                if (match?.ip && match?.port) {
                    socket.emit('log', `Ditemukan ${match.ip}:${match.port}, mencoba pair...`);
                    try {
                        await adb(['kill-server']).catch(() => { });
                        const result = await adb(['pair', `${match.ip}:${match.port}`, password], 15000);
                        socket.emit('log', result);
                        if (result.toLowerCase().includes('successfully')) {
                            socket.emit('log', 'Pairing berhasil!');
                            io.emit('device-list', await getDevices());
                        }
                    } catch (err) {
                        socket.emit('log', `Auto-pair gagal: ${err.message}`);
                    }
                    return;
                }
            }
            socket.emit('log', 'Timeout menunggu scan. Gunakan pair manual.');
        } catch (err) {
            socket.emit('log', `Gagal buat QR: ${err.message}`);
        }
    });

    // ----- mDNS Discovery -----
    socket.on('discover-mdns', async () => {
        socket.emit('log', 'Mencari perangkat via mDNS...');
        const results = await discoverMdns(5000);
        socket.emit('mdns-results', results);
        socket.emit('log', `Ditemukan ${results.length} layanan.`);
    });

    // ----- Manual Pair -----
    socket.on('pair', async ({ ip, port, code }) => {
        if (!ip || !port || !code) return;
        socket.emit('log', `Pairing ${ip}:${port}...`);
        try {
            await adb(['kill-server']).catch(() => { });
            const result = await adb(['pair', `${ip}:${port}`, code], 18000);
            socket.emit('log', result);
            if (result.toLowerCase().includes('successfully')) {
                socket.emit('log', 'Pairing berhasil!');
            }
        } catch (err) {
            socket.emit('log', `Gagal: ${err.message}`);
        }
    });

    // ----- Connect -----
    socket.on('connect-device', async ({ ip, port }) => {
        if (!ip || !port) return;
        socket.emit('log', `Connecting ${ip}:${port}...`);
        try {
            const result = await adb(['connect', `${ip}:${port}`]);
            socket.emit('log', result);
            io.emit('device-list', await getDevices());
        } catch (err) {
            socket.emit('log', `Gagal: ${err.message}`);
        }
    });

    // ----- Refresh Devices -----
    socket.on('refresh-devices', async () => {
        socket.emit('device-list', await getDevices());
    });

    // ----- Run ADB Command -----
    socket.on('run-command', async ({ deviceId, command }) => {
        const args = deviceId ? ['-s', deviceId, ...command.split(' ')] : command.split(' ');
        socket.emit('log', `adb ${args.join(' ')}`);
        try {
            const output = await adb(args);
            socket.emit('command-result', { command: `adb ${args.join(' ')}`, output: output || '(no output)' });
        } catch (err) {
            socket.emit('command-result', { command: `adb ${args.join(' ')}`, output: `ERROR: ${err.message}` });
        }
    });

    // ----- Simple Port Scan (hanya port umum) -----
    socket.on('scan-ports', async () => {
        const { ip } = getLocalIp();
        if (ip === '0.0.0.0') {
            socket.emit('log', 'Tidak terhubung ke jaringan.');
            return;
        }

        const subnet = ip.split('.').slice(0, 3).join('.');
        const ports = [5555, 37000, 37100, 37200, 37300, 38000, 39000, 40000, 41000, 42000, 43000];
        socket.emit('log', `Scanning ${subnet}.x ...`);

        const found = [];
        const tasks = [];

        for (let i = 1; i <= 254; i++) {
            const target = `${subnet}.${i}`;
            for (const port of ports) {
                tasks.push(
                    checkPort(target, port).then(res => {
                        if (res) {
                            found.push(res);
                            socket.emit('log', `Found ${res.ip}:${res.port}`);
                        }
                    })
                );
            }
        }

        // Batasi concurrency agar tidak overload
        const concurrency = 50;
        for (let i = 0; i < tasks.length; i += concurrency) {
            await Promise.all(tasks.slice(i, i + concurrency));
        }

        socket.emit('scan-results', found);
        socket.emit('log', `Scan selesai. Ditemukan ${found.length} port.`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\nAutomation Command Center → http://localhost:${PORT}\n`);
});