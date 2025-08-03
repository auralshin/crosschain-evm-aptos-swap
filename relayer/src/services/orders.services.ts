import { prisma } from "../prisma";
import { Chain, OrderStatus } from "../generated/prisma";
import { ethers } from "ethers";
import { isAptosAddress } from "../utils/utils";
import { eventBus } from "../events";
import { AuctionService } from "./auction.services";
import { scheduler } from "./scheduler.services";
import { logger } from "../logger";
import { v4 as uuidv4 } from 'uuid';
export interface CreateOrderDto {
  sourceUserAddress: string; // User’s wallet on source chain
  sourceTokenAddress: string; // Token they’re swapping
  destinationTokenAddress: string; // Token they want to receive
  sourceTokenAmount: string; // Amount of source token to swap
  destinationTokenAmount: string; // Amount of destination token to receive
  sourceChain: Chain; // EVM or APTOS
  destinationChain: Chain; // EVM or APTOS
  destinationUserAddress: string; // User’s wallet on dest chain'
  auctionStartTime?: Date; // Optional, if not provided, use current time
  auctionDuration?: number; // Optional, in seconds, default to 3600 (1 hour)
}

export interface RevealSecretDto {
  secret: string;
}

const chainValidators: Record<string, (addr: string) => boolean> = {
  EVM: ethers.isAddress,
  APTOS: isAptosAddress,
};

function getDefaultAuctionPoints(base: number): { price: number, weight: number }[] {
return [0.8, 0.7, 0.6, 0.5, 0.4].map(p => ({
  price: Math.floor(base * p),
  weight: 100,
}));
}
const auctionService = new AuctionService();
export class OrdersService {
  async createOrder(dto: CreateOrderDto) {
    const addrFields: [keyof CreateOrderDto, keyof CreateOrderDto, string][] = [
      ["sourceUserAddress", "sourceChain", "source user address"],
      ["sourceTokenAddress", "sourceChain", "source token address"],
      [
        "destinationTokenAddress",
        "destinationChain",
        "destination token address",
      ],
      [
        "destinationUserAddress",
        "destinationChain",
        "destination user address",
      ],
    ];

    for (const [addrKey, chainKey, label] of addrFields) {
      const chain = dto[chainKey];
      const addr = dto[addrKey] as unknown as string;

      if (typeof chain !== "string" || !(chain in chainValidators)) {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      const validator = chainValidators[chain as string];
      if (!validator(addr)) {
        throw new Error(`Invalid ${label} for ${chain}`);
      }
    }
    const auctionStart = dto.auctionStartTime || new Date(Date.now());
    const auctionDuration = dto.auctionDuration || 3 * 12;
    const orderId = uuidv4();

    logger.info(`Order Created`, {
      orderId,
      details: dto,
    });
    const createdOrder = await prisma.order.create({
      data: {
        id: orderId,
        sourceUserAddress: dto.sourceUserAddress,
        sourceTokenAddress: dto.sourceTokenAddress,
        destinationTokenAddress: dto.destinationTokenAddress,
        sourceTokenAmount: dto.sourceTokenAmount,
        destinationTokenAmount: dto.destinationTokenAmount,
        sourceChain: dto.sourceChain as Chain,
        destinationChain: dto.destinationChain as Chain,
        destinationUserAddress: dto.destinationUserAddress,
        status: OrderStatus.AUCTION_OPEN,
        auctionStartTime: auctionStart,
        auctionDuration,
      },
    });
    eventBus.emit("ORDER_CREATED", createdOrder);
    const start = createdOrder.auctionStartTime;
    const duration = createdOrder.auctionDuration;
    const points = getDefaultAuctionPoints(
      parseInt(createdOrder.destinationTokenAmount, 10)
    );
    scheduler.schedule(createdOrder.id, start, duration, points);
    return createdOrder;
  }

  async getOrder(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: { bids: true, escrows: true, secrets: true },
    });
  }

  async getOrders() {
    return prisma.order.findMany();
  }

  async getOpenOrders() {
    const now = new Date();
    return prisma.order.findMany({
      where: {
        status: OrderStatus.AUCTION_OPEN,
        auctionStartTime: { lte: now },
      },
      include: { bids: true }, // optional
    });
  }

  async revealSecret(orderId: string, dto: RevealSecretDto) {
    // find the DST escrow
    const dst = await prisma.escrow.findFirst({
      where: { orderId, side: "DST" },
    });
    if (!dst) throw new Error("DST escrow not found");

    const secret = await prisma.secret.create({
      data: {
        orderId,
        escrowId: dst.id,
        secret: dto.secret,
      },
    });
    await prisma.escrow.update({
      where: { id: dst.id },
      data: { status: "SECRET_RECEIVED" },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.SECRET_REVEALED },
    });
    eventBus.emit("SECRET_REVEALED", { orderId, secret });
    return secret;
  }
}