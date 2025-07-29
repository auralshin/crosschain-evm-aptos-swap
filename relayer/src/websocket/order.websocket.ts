import { WebSocketServer, WebSocket } from 'ws';
import { BidsService } from '../services/bids.services';

const bids = new BidsService();

export function setupAuctionWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('WebSocket connected to /orders/auction');

    let lastOrdersJson = '';

    const sendOpenOrders = async () => {
      try {
        const orders = await bids.listOpenOrders();
        const currentJson = JSON.stringify(orders);

        if (currentJson !== lastOrdersJson && ws.readyState === ws.OPEN) {
          lastOrdersJson = currentJson;
          ws.send(JSON.stringify({ type: 'open_orders', data: orders }));
        }
      } catch (err) {
        console.error('Failed to send open orders:', err);
      }
    };

    sendOpenOrders();

    const interval = setInterval(sendOpenOrders, 5000);

    ws.on('close', () => {
      clearInterval(interval);
      console.log('WebSocket client disconnected');
    });
  });
}
