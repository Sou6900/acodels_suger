const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server: WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const net = require('net');

let BASE_DIR = null;
let jsonData = {};
let erudaEnabled = false;
let consoleType = 'suger'; 
let zoomEnabled = false;
let fileWatcher = null;
let connectedSockets = [];

// --- Port Logic ---
const defaultPort = 1024;
const args = process.argv.slice(2);
let currentPort = args[0] ? parseInt(args[0]) : defaultPort;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port);
  });
}

const sugerScript = `<script src="dt/suger-dev.js"></script>`;

const erudaRealScript = `
<script src="/eruda.min.js"></script>
<script>
    if(typeof eruda !== 'undefined') eruda.init();
</script>
`;

const inspectorScript = `<script src="/inspector.js"></script>`;
const zoomScript = `
<script src="/zoom-handler.js"></script>
<script>try { new ZoomHandler(document.body); } catch (e) {}</script>`;

const webSocketScript = `
<script>
  (function() {
    const wsUrl = 'ws://' + window.location.host;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => { if (event.data === 'reload') window.location.reload(); };
  })();
</script>`;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/check', (req, res) => {
  res.status(200).json({ message: "Ready", key: "AcodeLiveServer_NodeJS", port: currentPort });
});

app.patch('/setup', (req, res) => {
  const data = req.body;
  if (!data.fileName || !data.path) return res.status(400).json({ error: 'Missing fields' });
  
  BASE_DIR = data.path;
  jsonData = data;
  erudaEnabled = data.eruda === true;
  
  if (data.consoleType) {
      consoleType = data.consoleType;
  }
  
  zoomEnabled = data.zoom === true;

  console.log(`Base set to: ${BASE_DIR}`);
  startFileWatcher(res);
});

app.get('/devtool-sw.js', (req, res) => {
    const swPath = path.join(__dirname, 'devtool-sw.js'); 
    if (fs.existsSync(swPath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Service-Worker-Allowed', '/'); 
        res.sendFile(swPath);
    } else res.status(404).send('SW not found');
});

app.get('dt/suger-dev.js', (req, res) => res.sendFile(path.join(__dirname, 'suger-dev.js')));
app.get('/zoom-handler.js', (req, res) => res.sendFile(path.join(__dirname, 'zoom-handler.js')));
app.get('/inspector.js', (req, res) => res.sendFile(path.join(__dirname, 'inspector.js')));

app.get('/eruda.min.js', (req, res) => {
    const erudaPath = path.join(__dirname, 'eruda.min.js');
    if (fs.existsSync(erudaPath)) {
        res.sendFile(erudaPath);
    } else {
        res.status(404).send('Eruda not found on server');
    }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  if (!BASE_DIR || !jsonData.fileName) return res.status(400).send('Not configured.');
  
  const fullPath = path.join(BASE_DIR, jsonData.fileName);
  fs.readFile(fullPath, 'utf8', (err, html_content) => {
    if (err) return res.status(500).send('Error reading file');

    let injectedContent = html_content;
    injectedContent = injectedContent.replace(/(<\/body>)/i, webSocketScript + '$1');

    if (erudaEnabled) {
      if (consoleType === 'eruda') {
          injectedContent = injectedContent.replace(/(<\/body>)/i, erudaRealScript + '\n' + inspectorScript + '$1');
      } else {
          injectedContent = injectedContent.replace(/(<\/body>)/i, sugerScript + '\n' + inspectorScript + '$1');
      }
    }

    if (zoomEnabled) {
      injectedContent = injectedContent.replace(/(<\/body>)/i, zoomScript + '$1');
    }

    res.send(injectedContent);
  });
});

app.use((req, res, next) => {
  if (BASE_DIR) express.static(BASE_DIR)(req, res, next);
  else next();
});

// --- Server Start ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  connectedSockets.push(ws);
  ws.on('close', () => connectedSockets = connectedSockets.filter(s => s !== ws));
});

function broadcastReload() {
  for (const ws of connectedSockets) ws.send('reload');
}

function startFileWatcher(res) {
    if (fileWatcher) fileWatcher.close();

    if (BASE_DIR) {
        fileWatcher = chokidar.watch(BASE_DIR, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        fileWatcher.on("change", () => broadcastReload());
        let responseSent = false;
        fileWatcher.on("ready", () => {
            if (!responseSent) {
                responseSent = true;
                if (res) res.status(201).json({ message: "OK" });
            }
        });

        fileWatcher.on("error", (error) => {
            console.error("Watcher Error:", error.message);
            if (!responseSent) {
                responseSent = true;
                if (res) res.status(500).json({ error: error.message });
            }
        });
    }
}

async function startServer() {
  const isAvailable = await isPortAvailable(currentPort);
  if (!isAvailable) { console.error(`❌ Port ${currentPort} busy!`); process.exit(1); }
  
  server.listen(currentPort, '0.0.0.0', () => {
    console.log(`✅ Server running: http://localhost:${currentPort}`);
  });
}

startServer();
