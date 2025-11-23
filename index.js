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
let zoomEnabled = false;
let fileWatcher = null;
let connectedSockets = [];

const portList = [1024];
let currentPort = 0;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port);
  });
}

async function getAvailablePort(ports) {
  for (const port of ports) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return 0; 
}

const erudaScript = `
<script src="dt/suger-dev_1.0.0v.js"></script>`;
const inspectorScript = `
<script src="/inspector.js"></script>
`;
const zoomScript = `
<script src="/zoom-handler.js"></script>
<script>
    try {
        new ZoomHandler(document.body);
    } catch (e) {
        console.error('Failed to load ZoomHandler', e);
    }
</script>`;

const webSocketScript = `
<script>
  (function() {
    const wsUrl = 'ws://' + window.location.host;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('Reloading page...');
        window.location.reload();
      }
    };
    ws.onclose = () => { console.log('Live Server connection closed.'); };
    ws.onerror = (e) => { console.error('Live Server WebSocket error:', e); };
  })();
</script>`;

const app = express();
app.use(cors()); 
app.use(express.json());

app.get('/check', (req, res) => {
  console.log("Successfully Port Identified by the client.");
  res.status(200).json({
    message: "Ready For 'PATCH' request",
    key: "AcodeLiveServer_NodeJS",
    port: currentPort
  });
});

app.patch('/setup', (req, res) => {
  const data = req.body;
  const fileName = data.fileName;
  const path = data.path;

  if (!fileName || !path) {
    return res.status(400).json({ error: 'fileName and path are required' });
  }

  if (!fs.existsSync(path) || !fs.lstatSync(path).isDirectory()) {
    return res.status(400).json({ error: 'Invalid template path' });
  }

  BASE_DIR = path;
  jsonData = data;
  erudaEnabled = data.eruda === true;
  zoomEnabled = data.zoom === true; 

  console.log(`Base directory set to: ${BASE_DIR}`);
  startFileWatcher(res); 
});

app.get('dt/suger-dev_1.0.0v.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'suger-dev_1.0.0v.js'));
});


app.get('/zoom-handler.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'zoom-handler.js'));
});

app.get('/inspector.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'inspector.js'));
});

app.use(express.static(__dirname));


app.get('/', (req, res) => {
  if (!BASE_DIR || !jsonData.fileName) {
    return res.status(400).send('File path not configured.');
  }

  const fullPath = path.join(BASE_DIR, jsonData.fileName);
  fs.readFile(fullPath, 'utf8', (err, html_content) => {
    if (err) {
      console.error(`Error reading HTML file: ${err}`);
      return res.status(500).send('Error reading HTML file');
    }

    let injectedContent = html_content;

    injectedContent = injectedContent.replace(
      /(<\/body>)/i, webSocketScript + '$1'
    );

    if (erudaEnabled) {
      const fullErudaScript = erudaScript + '\n' + inspectorScript;
      injectedContent = injectedContent.replace(
        /(<\/body>)/i, fullErudaScript + '$1'
      );

      console.log('DEVTOOL INJECTED just before </body>');
    }

    if (zoomEnabled) {
      injectedContent = injectedContent.replace(
        /(<\/body>)/i, zoomScript + '$1'
      );
    }

    res.send(injectedContent);
  });
});

app.use((req, res, next) => {
  if (BASE_DIR) {
    express.static(BASE_DIR)(req, res, next);
  } else {
    next();
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected for live reload.');
  connectedSockets.push(ws);
  ws.on('close', () => {
    connectedSockets = connectedSockets.filter(s => s !== ws);
  });
});

function broadcastReload() {
  console.log('File change detected, sending reload signal...');
  for (const ws of connectedSockets) {
    ws.send('reload');
  }
}

function startFileWatcher(setupResponse) {
  if (fileWatcher) {
    fileWatcher.close();
    console.log('Restarting file watcher...');
  }
  
  if (BASE_DIR) {
    fileWatcher = chokidar.watch(BASE_DIR, {
      ignored: /(^|[\/\\])\../, 
      persistent: true,
      ignoreInitial: true,
    });

    fileWatcher.on('change', (filePath) => {
      broadcastReload();
    });
    
    fileWatcher.on('ready', () => {
        console.log(`Watching for file changes in: ${BASE_DIR}`);
        if(setupResponse) {
            setupResponse.status(201).json({ message: 'Base and template path set successfully' });
        }
    });

    fileWatcher.on('error', (error) => {
        console.error(`File watcher error: ${error}`);
        if(setupResponse) {
            setupResponse.status(500).json({ error: 'File watcher failed to start' });
        }
    });
  }
}

async function startServer() {
  const port = await getAvailablePort(portList);
  if (port === 0) {
    console.error('Error: No available port found in the specified list.');
    return;
  }
  
  currentPort = port;
  server.listen(port, '0.0.0.0', () => {
    console.log(`
    ---------------------------------------------------
      Acode Live Server (Node.js)
      Server is running on: http://localhost:${port}
    ---------------------------------------------------
    `);
  });
}

startServer();
