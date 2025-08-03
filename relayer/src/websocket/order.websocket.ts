import { WebSocketServer, WebSocket } from 'ws';
import { OrdersService } from '../services/orders.services';
import { eventBus } from '../events';

const ordersService = new OrdersService();

let auctionWss: WebSocketServer | null = null;

export function setupAuctionWebSocket(wss: WebSocketServer) {
  auctionWss = wss;

  eventBus.on('ORDER_CREATED', (order) => {
    broadcast(wss, { type: 'ORDER_CREATED', data: order });
  });

  eventBus.on('BID_PLACED', (payload) => {
    broadcast(wss, { type: 'BID_PLACED', data: payload });
  });

  eventBus.on('AUCTION_CLOSED', (payload) => {
    broadcast(wss, { type: 'AUCTION_CLOSED', data: payload });
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WS client connected to /orders/auction');

    // Immediately send current open orders
    sendOpenOrders(ws);

    ws.on('close', () => {
      console.log('WS client disconnected');
    });
  });
}

async function sendOpenOrders(ws: WebSocket) {
  try {
    const orders = await ordersService.getOpenOrders();
    const msg = JSON.stringify({ type: 'open_orders', data: orders });
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  } catch (err) {
    console.error('Failed to send open orders to new client:', err);
  }
}

function broadcast(wss: WebSocketServer, message: any) {
  const str = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  }
}