import { Router, Request, Response } from 'express';
import { OrdersService, CreateOrderDto, RevealSecretDto } from '../services/orders.services';

export const userRouter = Router();
const orders = new OrdersService();

// Create order
userRouter.post('/create/orders', async (req: Request, res: Response) => {
  try {
    const dto: CreateOrderDto = req.body;
    const order = await orders.createOrder(dto);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Get order (with bids, escrows, secrets)
userRouter.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const order = await orders.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Reveal secret
userRouter.post('/orders/:id/secret', async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const dto: RevealSecretDto = req.body;
    const secret = await orders.revealSecret(orderId, dto);
    res.status(201).json(secret);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

userRouter.get('/orders', async (_req: Request, res: Response) => {
  const ordersList = await orders.getOrders();
  res.json(ordersList);
});
