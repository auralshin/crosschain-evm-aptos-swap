import { WebSocketServer, WebSocket } from 'ws';
import { BidsService } from '../services/bids.services';

const bids = new BidsService();

export function setupAuctionWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    console.log('WS client connected to /orders/auction');

    // Immediately send current open orders
    sendOpenOrders(ws);

    ws.on('close', () => {
      console.log('WS client disconnected');
    });
  });
}

// Broadcast open orders to all clients
export async function broadcastOpenOrders(wss: WebSocketServer) {
  try {
    const orders = await bids.listOpenOrders();
    const msg = JSON.stringify({ type: 'open_orders', data: orders });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  } catch (err) {
    console.error('Failed to broadcast open orders:', err);
  }
}

// Optional: send just to one client on connect
async function sendOpenOrders(ws: WebSocket) {
  try {
    const orders = await bids.listOpenOrders();
    const msg = JSON.stringify({ type: 'open_orders', data: orders });
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  } catch (err) {
    console.error('Failed to send open orders to new client:', err);
  }
}
