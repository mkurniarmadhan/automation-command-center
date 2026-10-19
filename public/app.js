const socket = io();

socket.on('log', (msg) => {
    const logDiv = document.getElementById('logs');
    logDiv.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
});

socket.on('wifi-info', (data) => {
    document.getElementById('wifi-interface').innerText = data.interfaceName;
    document.getElementById('wifi-ip').innerText = data.ip;
});

socket.on('device-list', (devices) => {
    document.getElementById('device-count').innerText = devices.length;
    const ul = document.getElementById('device-list');
    ul.innerHTML = '';
    devices.forEach(dev => {
        const li = document.createElement('li');
        li.innerHTML = `<b>${dev.id}</b> - Tipe: <span class="badge">${dev.type}</span> Status: ${dev.status}`;
        ul.appendChild(li);
    });
});

function connectWireless() {
    const ip = document.getElementById('target-ip').value;
    const port = document.getElementById('target-port').value;
    if (ip && port) {
        socket.emit('connect-wireless', { ip, port });
    } else {
        alert('Isi IP dan Port terlebih dahulu!');
    }
}

function refreshDevices() {
    socket.emit('refresh-devices');
}