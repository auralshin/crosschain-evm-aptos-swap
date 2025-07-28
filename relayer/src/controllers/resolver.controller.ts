import { Router, Request, Response } from 'express';
import { BidsService, CreateBidDto } from '../services/bids.services';
import { EscrowDto, EscrowsService } from '../services/escrow.services';
import { AuctionService } from '../services/auction.services';

export const resolverRouter = Router();
const bids = new BidsService();
const escrows = new EscrowsService();
const auction = new AuctionService();

// Place a bid
resolverRouter.post('/orders/:id/bids', async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const dto: CreateBidDto = req.body;
    const bid = await bids.placeBid(orderId, dto);
    res.status(201).json(bid);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

resolverRouter.post('/orders/:id/source-escrow', async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const dto: EscrowDto = req.body;
    const escrow = await escrows.createSourceEscrow(orderId, dto);
    res.status(201).json(escrow);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Record destination escrow creation
resolverRouter.post('/orders/:id/destination-escrow', async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const dto: EscrowDto = req.body;
    const escrow = await escrows.createDestinationEscrow(orderId, dto);
    res.status(201).json(escrow);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

resolverRouter.post('/orders/:id/close-auction', async (req, res) => {
  try {
    const winners = await auction.closeAuction(Number(req.params.id));
    res.json(winners);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
