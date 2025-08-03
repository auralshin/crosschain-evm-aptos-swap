import { prisma } from "../prisma";
import { Chain, OrderStatus } from "../generated/prisma";
import { ethers } from "ethers";
import { isAptosAddress } from "../utils/utils";
import { broadcastOpenOrders } from "../websocket/order.websocket";

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
    console.log("Order created with data:", dto);

    const createdOrder =  prisma.order.create({
      data: {
        sourceUserAddress: dto.sourceUserAddress,
        sourceTokenAddress: dto.sourceTokenAddress,
        destinationTokenAddress: dto.destinationTokenAddress,
        sourceTokenAmount: dto.sourceTokenAmount,
        destinationTokenAmount: dto.destinationTokenAmount,
        sourceChain: dto.sourceChain,
        destinationChain: dto.destinationChain,
        destinationUserAddress: dto.destinationUserAddress,
        status: OrderStatus.AUCTION_OPEN,
        auctionStartTime: dto.auctionStartTime || new Date(Date.now()),
        auctionDuration: dto.auctionDuration || 3 * 12, // Default to 36 seconds - 3 blocks at 12 seconds each
      },
    });
    await broadcastOpenOrders();
    return createdOrder;
  }

  async getOrder(orderId: number) {
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

  async revealSecret(orderId: number, dto: RevealSecretDto) {
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
    return secret;
  }
}
