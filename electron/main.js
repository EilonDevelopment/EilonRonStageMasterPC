const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { SerialPort } = require('serialport');

/** @type {Map<string, import('serialport').SerialPort>} */
const openPorts = new Map();
/** @type {Map<string, { baudRate: number }>} */
const openPortMeta = new Map();

let mainWindow = null;
let staticServer = null;

const DEFAULT_BAUD = 115200;
const BUILD_DIR = path.join(__dirname, '..', 'build');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function safeJoinBuild(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  const full = path.normalize(path.join(root, relative));
  if (!full.startsWith(path.normalize(root))) {
    return null;
  }
  return full;
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = req.url && req.url !== '/' ? req.url : '/index.html';
        let filePath = safeJoinBuild(rootDir, urlPath);
        if (!filePath) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(rootDir, 'index.html');
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function createWindow() {
  if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
    throw new Error(`Missing build/index.html. Run "npm run build" from the repo root first.`);
  }

  if (!staticServer) {
    staticServer = await startStaticServer(BUILD_DIR);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f4f5f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(staticServer.url);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('Failed to start Ron Stage Master PC:', error);
    app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => console.error(error));
    }
  });
});

app.on('window-all-closed', () => {
  for (const port of openPorts.values()) {
    try {
      if (port.isOpen) port.close();
    } catch (_) {
      /* ignore */
    }
  }
  openPorts.clear();
  if (staticServer?.server) {
    staticServer.server.close();
    staticServer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('serial:list', async () => {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || '',
    serialNumber: p.serialNumber || '',
    friendlyName: p.friendlyName || p.pnpId || '',
  }));
});

ipcMain.handle('serial:connect', async (_event, { path: portPath, baudRate }) => {
  if (!portPath) {
    return { ok: false, error: 'No port selected' };
  }
  if (openPorts.has(portPath)) {
    return { ok: true };
  }

  const baud = Number(baudRate) || DEFAULT_BAUD;

  return new Promise((resolve) => {
    const port = new SerialPort({ path: portPath, baudRate: baud, autoOpen: false });

    port.open((err) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }

      openPorts.set(portPath, port);
      openPortMeta.set(portPath, { baudRate: baud });

      port.on('data', (chunk) => {
        sendToRenderer('serial:data', {
          path: portPath,
          data: Array.from(chunk),
        });
      });

      port.on('error', (error) => {
        sendToRenderer('serial:error', { path: portPath, message: error.message });
      });

      port.on('close', () => {
        openPorts.delete(portPath);
        openPortMeta.delete(portPath);
        sendToRenderer('serial:disconnected', { path: portPath });
      });

      resolve({ ok: true, baudRate: baud });
    });
  });
});

ipcMain.handle('serial:disconnect', async (_event, { path: portPath }) => {
  const port = openPorts.get(portPath);
  if (!port) {
    return { ok: true };
  }
  return new Promise((resolve) => {
    port.close(() => {
      openPorts.delete(portPath);
      openPortMeta.delete(portPath);
      resolve({ ok: true });
    });
  });
});

ipcMain.handle('serial:write', async (_event, { path: portPath, data }) => {
  const port = openPorts.get(portPath);
  if (!port || !port.isOpen) {
    return { ok: false, error: 'Port not open' };
  }
  const buffer = Buffer.from(Array.isArray(data) ? data : []);
  return new Promise((resolve) => {
    port.write(buffer, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      port.drain((drainErr) => {
        if (drainErr) {
          resolve({ ok: false, error: drainErr.message });
          return;
        }
        resolve({ ok: true, bytes: buffer.length });
      });
    });
  });
});

ipcMain.handle('serial:setBaud', async (_event, { path: portPath, baudRate }) => {
  const port = openPorts.get(portPath);
  if (!port || !port.isOpen) {
    return { ok: false, error: 'Port not open' };
  }
  const baud = Number(baudRate);
  if (!Number.isFinite(baud) || baud <= 0) {
    return { ok: false, error: 'Invalid baud rate' };
  }
  return new Promise((resolve) => {
    port.update({ baudRate: baud }, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      openPortMeta.set(portPath, { baudRate: baud });
      resolve({ ok: true, baudRate: baud });
    });
  });
});

ipcMain.handle('serial:status', async () => {
  const open = [];
  for (const [portPath, port] of openPorts.entries()) {
    open.push({
      path: portPath,
      isOpen: !!port.isOpen,
      baudRate: openPortMeta.get(portPath)?.baudRate ?? DEFAULT_BAUD,
    });
  }
  return { open };
});
