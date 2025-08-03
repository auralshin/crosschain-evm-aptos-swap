import { prisma } from "../prisma";
import { BidStatus, OrderStatus } from "../generated/prisma";
import { AuctionService } from "./auction.services";
import { broadcastOpenOrders } from "../websocket/order.websocket";

export interface CreateBidDto {
  resolver: string;
  bidAmount: string;
  expiry: Date;
}

export class BidsService {
  private auctionSvc = new AuctionService();

  /**
   * Generate Dutch auction decay curve from initial price (e.g., destinationTokenAmount).
   * You can customize steps, weights, and decay rate as needed.
   */
  private generateAuctionPoints(startPrice: bigint): { price: bigint; weight: number }[] {
    const steps = 5;
    const weight = 100;
    const points: { price: bigint; weight: number }[] = [];

    for (let i = 0; i < steps; i++) {
      const decayFactor = BigInt(100 - i * 15); // e.g., 100%, 85%, 70%, 55%, 40%
      const price = (startPrice * decayFactor) / 100n;
      points.push({ price, weight });
    }

    return points;
  }

  /**
   * Place a new bid during auction
   */
  async placeBid(orderId: number, dto: CreateBidDto) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        auctionStartTime: true,
        auctionDuration: true,
        destinationTokenAmount: true,
      },
    });

    if (order.status !== OrderStatus.AUCTION_OPEN) {
      throw new Error("Auction is not open");
    }

    const now = Math.floor(Date.now() / 1000);
    const endTime = order.auctionStartTime.getTime() / 1000 + order.auctionDuration;

    if (now >= endTime) {
      throw new Error("Auction has already ended");
    }

    if (dto.expiry.getTime() <= Date.now()) {
      throw new Error("Bid expiry must be in the future");
    }

    const startPrice = BigInt(order.destinationTokenAmount);
    const auctionPoints = this.generateAuctionPoints(startPrice);

    const currentPrice = this.auctionSvc.getPriceAtTime(
      order.auctionStartTime.getTime() / 1000,
      order.auctionDuration,
      auctionPoints,
      now
    );

    const bidAmount = BigInt(dto.bidAmount);
    if (bidAmount < currentPrice) {
      throw new Error(`Bid too low. Current auction price is ${currentPrice.toString()}`);
    }

    const bid = await prisma.bid.create({
      data: {
        orderId,
        resolver: dto.resolver,
        bidAmount: dto.bidAmount,
        expiry: dto.expiry,
        status: BidStatus.PLACED,
        filledAmount: "0",
      },
    });

    await broadcastOpenOrders();

    return bid;
  }
}
