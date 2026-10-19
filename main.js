const { app, BrowserWindow } = require('electron');
const path = require('path');

// Menjalankan Socket.IO Backend Server lokal
require('./server.js');

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'Automation Command Center',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadURL('http://localhost:3000');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});