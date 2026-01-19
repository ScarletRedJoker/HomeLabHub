import express, { Request, Response } from 'express';
import next from 'next';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { createServer } from 'http';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '5000', 10);
const terminalPort = parseInt(process.env.TERMINAL_PORT || '3001', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const wsProxyOptions: Options = {
  target: `http://localhost:${terminalPort}`,
  ws: true,
  changeOrigin: true,
  pathRewrite: {
    '^/terminal-ws': '',
  },
  on: {
    error: (err, _req, res) => {
      console.error('[WS Proxy Error]', err.message);
      if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Terminal server unavailable');
      }
    },
  },
};

app.prepare().then(() => {
  const server = express();

  const wsProxy = createProxyMiddleware(wsProxyOptions);
  server.use('/terminal-ws', wsProxy);

  server.all('/{*path}', (req: Request, res: Response) => {
    return handle(req, res);
  });

  const httpServer = createServer(server);

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/terminal-ws')) {
      (wsProxy as any).upgrade(req, socket, head);
    }
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Terminal WebSocket proxy enabled at /terminal-ws -> localhost:${terminalPort}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
