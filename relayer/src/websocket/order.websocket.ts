import { WebSocketServer, WebSocket } from 'ws';
import { OrdersService } from '../services/orders.services';

const orderService = new OrdersService();

let auctionWss: WebSocketServer | null = null;

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

export async function broadcastOpenOrders() {
  if (!auctionWss) return;
  try {
    const orders = await orderService.getOpenOrders();
    const msg = JSON.stringify({ type: 'open_orders', data: orders });

    for (const client of auctionWss.clients) {
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
    const orders = await orderService.getOpenOrders();
    const msg = JSON.stringify({ type: 'open_orders', data: orders });
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  } catch (err) {
    console.error('Failed to send open orders to new client:', err);
  }
}
