import { prisma } from "../prisma";
import { BidStatus, OrderStatus } from "../generated/prisma";
import { AuctionService } from "./auction.services";
import { eventBus } from "../events";

export interface CreateBidDto {
  resolver: string;
  bidAmount: string;
  expiry: Date | string;
}

export class BidsService {
  private auctionSvc = new AuctionService();

  private generateAuctionPoints(startPrice: bigint): { price: bigint; weight: number }[] {
    const steps = 5;
    const weight = 100;
    const points: { price: bigint; weight: number }[] = [];

    for (let i = 0; i < steps; i++) {
      const decayFactor = BigInt(100 - i * 15); // e.g., 100%, 85%, ...
      const price = (startPrice * decayFactor) / 100n;
      points.push({ price, weight });
    }

    return points;
  }

  private getExchangeRate(orderId: string): bigint {
    // Placeholder for oracle logic
    return BigInt(Math.floor(0.95 * 1000)) + 1n; // Random exchange rate for demo
  }

  async placeBid(orderId: string, dto: CreateBidDto) {
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
    const startTime = Math.floor(order.auctionStartTime.getTime() / 1000);
    const endTime = startTime + order.auctionDuration;

    if (now >= endTime) {
      throw new Error("Auction has already ended");
    }

    const expiry = new Date(dto.expiry);
    if (expiry.getTime() <= Date.now()) {
      throw new Error("Bid expiry must be in the future");
    }

    const exchangeRate = this.getExchangeRate(orderId); // Here if needed to adjust
    const startPrice = BigInt(order.destinationTokenAmount) * BigInt(exchangeRate);

    const auctionPoints = this.generateAuctionPoints(startPrice);
    const currentPrice = this.auctionSvc.getPriceAtTime(startTime, order.auctionDuration, auctionPoints, now);

    const bidAmount = BigInt(dto.bidAmount);

    const bid = await prisma.bid.create({
      data: {
        orderId,
        resolver: dto.resolver,
        bidAmount: dto.bidAmount,
        expiry: expiry,
        status: BidStatus.PLACED,
        filledAmount: "0", // Filled later in closeAuction
      },
    });

    eventBus.emit("BID_PLACED", bid);
    return bid;
  }
}
