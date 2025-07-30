import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import { WebSocketServer } from 'ws';

import { userRouter } from './controllers/user.controller';
import { resolverRouter } from './controllers/resolver.controller';
import { setupAuctionWebSocket } from './websocket/order.websocket';

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = req.url?.replace(/\/+$/, '');
  if (pathname === '/orders/auction') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    console.warn(`Rejected WS upgrade on unknown path: ${req.url}`);
    socket.destroy();
  }
});

setupAuctionWebSocket(wss)

app.use(bodyParser.json());
app.use('/user', userRouter);
app.use('/resolver', resolverRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
