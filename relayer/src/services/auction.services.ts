import { prisma } from "../prisma";
import { BidStatus, OrderStatus } from "../generated/prisma";
import { ethers } from "ethers";
import { broadcastOpenOrders } from "../websocket/order.websocket";
type AuctionPoint = { price: bigint; weight: number };
export class AuctionService {
  /**
   * Build an `auctionPoints`:
   * @param points  Array of { price, weight } entries.
   *   - price  must fit in 24 bits (0 .. 0xFFFFFF)
   *   - weight must fit in 16 bits (0 .. 0xFFFF)
   */
  //   const pts = [
  //   { price: 800_000, weight: 100 },
  //   { price: 700_000, weight: 100 },
  //   { price: 600_000, weight: 100 },
  //   { price: 500_000, weight: 100 },
  //   { price: 400_000, weight: 100 },
  // ];

  // const auctionPointsHex = buildAuctionPoints(pts);
  buildAuctionPoints(points: Array<{ price: number; weight: number }>): string {
    const types: Array<string> = ["uint8"];
    const values: Array<number> = [points.length];

    for (const { price, weight } of points) {
      if (price < 0 || price > 0xffffff) {
        throw new Error(`Price ${price} out of range`);
      }
      if (weight < 0 || weight > 0xffff) {
        throw new Error(`Weight ${weight} out of range`);
      }
      types.push("uint24", "uint16");
      values.push(price, weight);
    }

    return ethers.solidityPacked(types, values);
  }

  getPriceAtTime(
    startTime: number,
    duration: number,
    points: AuctionPoint[],
    atTime = Math.floor(Date.now() / 1000)
  ): bigint {
    const elapsed = Math.min(Math.max(atTime - startTime, 0), duration);
    const totalWeight = points.reduce((sum, p) => sum + p.weight, 0);
    const target = (elapsed / duration) * totalWeight;

    let acc = 0;
    for (const { price, weight } of points) {
      acc += weight;
      if (target <= acc) {
        return price;
      }
    }
    // fallback to last price
    return points[points.length - 1].price;
  }

  /**
   * Close a Dutch-style auction:
   *
   * @param orderId         ID of the order in your database
   * @param auctionStart    Unix seconds when the auction began
   * @param auctionDuration Total length (secs) of the auction
   * @param pointsInput       Array of { price, weight } matching your Solidity schedule
   */
  async closeAuction(
    orderId: number,
    auctionStart: number,
    auctionDuration: number,
    pointsInput: Array<{ price: number; weight: number }>
  ) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { bids: true },
    });

    if (order.status !== OrderStatus.AUCTION_OPEN) {
      throw new Error("Auction not open");
    }

    const points: AuctionPoint[] = pointsInput.map(({ price, weight }) => {
      if (price < 0 || price > 0xffffff) {
        throw new Error(`Price ${price} out of uint24 range`);
      }
      if (weight < 0 || weight > 0xffff) {
        throw new Error(`Weight ${weight} out of uint16 range`);
      }
      return { price: BigInt(price), weight };
    });

    const currentTime = Math.floor(Date.now() / 1000);
    const clearingPrice = this.getPriceAtTime(
      auctionStart,
      auctionDuration,
      points,
      currentTime
    );

    let remaining = BigInt(order.destinationTokenAmount);

    const now = Date.now();
    const validBids = order.bids.filter(
      (b) =>
        b.status === BidStatus.PLACED &&
        new Date(b.expiry).getTime() > now &&
        BigInt(b.bidAmount) >= clearingPrice
    );

    const sortedBids = validBids.sort((a, b) =>
      BigInt(a.bidAmount) < BigInt(b.bidAmount) ? -1 : 1
    );

    const winners: Array<{ id: number; filledAmount: bigint }> = [];

    for (const bid of sortedBids) {
      if (remaining === 0n) break;

      const bidAmt = BigInt(bid.bidAmount);
      const fill = bidAmt <= remaining ? bidAmt : remaining;
      remaining -= fill;

      await prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: BidStatus.WON,
          filledAmount: fill.toString(),
        },
      });

      winners.push({ id: bid.id, filledAmount: fill });
    }
    if (winners.length === 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.AUCTION_CLOSED },
      });
      await broadcastOpenOrders();
      return { clearingPrice: clearingPrice.toString(), winners: [] };
    }

    const winnerIds = new Set(winners.map((w) => w.id));
    await prisma.bid.updateMany({
      where: {
        orderId,
        status: BidStatus.PLACED,
        id: {
          notIn: [...winnerIds],
        },
      },
      data: {
        status: BidStatus.LOST,
        filledAmount: "0",
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.AUCTION_CLOSED },
    });
    await broadcastOpenOrders();

    return {
      clearingPrice: clearingPrice.toString(),
      winners,
    };
  }
}
