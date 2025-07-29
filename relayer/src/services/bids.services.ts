import { prisma } from '../prisma';
import { BidStatus, OrderStatus } from '../generated/prisma';

export interface CreateBidDto {
  resolver: string;
  bidAmount: string;
  expiry: Date;
}

export class BidsService {
  async listOpenOrders() {
    return prisma.order.findMany({
      where: { status: OrderStatus.AUCTION_OPEN },
    });
  }

  async placeBid(orderId: number, dto: CreateBidDto) {
    return prisma.bid.create({
      data: {
        orderId,
        resolver: dto.resolver,
        bidAmount: dto.bidAmount,
        expiry: dto.expiry,
        status: BidStatus.PLACED,
        filledAmount: '0', // Initialize filled amount to 0
      },
    });
  }
}
