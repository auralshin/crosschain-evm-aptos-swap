import { prisma } from '../prisma';
import { BidStatus, OrderStatus } from '../generated/prisma';

export class AuctionService {
  async closeAuction(orderId: number) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { bids: true },
    });

    if (order.status !== 'AUCTION_OPEN') {
      throw new Error('Auction not open');
    }

    let remaining = BigInt(order.destinationTokenAmount);

    // 1. Filter valid bids (not expired, status = PLACED)
    const validBids = order.bids
      .filter(b => b.status === 'PLACED' && new Date(b.expiry) > new Date());

    // 2. Sort bids by price ascending (cheapest first)
    const sortedBids = validBids.sort((a, b) => Number(a.bidAmount) - Number(b.bidAmount));

    const winners: any[] = [];
    let clearingPrice: bigint = BigInt(0);

    for (const bid of sortedBids) {
      if (remaining <= BigInt(0)) break;

      const bidAmount = BigInt(bid.bidAmount);
      const fill = bidAmount <= remaining ? bidAmount : remaining;

      remaining -= fill;
      clearingPrice = BigInt(bid.bidAmount); // last price that got filled

      await prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: BidStatus.WON,
          filledAmount: fill.toString(),
        },
      });

      winners.push({ ...bid, filledAmount: fill });
    }

    // 3. Update remaining valid bids as LOST
    await prisma.bid.updateMany({
      where: {
        orderId,
        status: BidStatus.PLACED,
        bidAmount: { gt: clearingPrice.toString() }, // only those priced higher than the clearing price
      },
      data: {
        status: BidStatus.LOST,
        filledAmount: BigInt(0).toString(),
      },
    });

    // 4. Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.AUCTION_CLOSED },
    });

    return {
      clearingPrice: clearingPrice.toString(),
      winners,
    };
  }
}
