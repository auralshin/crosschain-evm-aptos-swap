import { prisma } from "../prisma";
import { OrderStatus } from "../generated/prisma";
import {
  createEVMSrcEscrow,
  createEVMDstEscrow,
  createAptosEscrow,
} from "../services/onchain.services";

import { ethers } from "ethers";
import { Account } from "@aptos-labs/ts-sdk";
import { OrderDetails } from "../utils/crosschainlib";

export interface EscrowDto {
  escrowAddress: string;
  escrowTxHash: string;
  hashlock: string;
}

export interface ExtendedEscrowDto {
  platform: "EVM" | "APTOS";
  orderDetails: OrderDetails;
  signer: ethers.Signer | Account;
  hashlock: string;
  orderHash: string;
  sigR: string;
  sigVS: string;
  timelocks: string;
  extraData: string;
  auctionDetails: string;
}

/**
 * Service to track escrow creation and database sync
 */
export class EscrowsService {
  async createSourceEscrow(orderId: string, dto: ExtendedEscrowDto) {
    if (dto.platform === "EVM") {
      const receipt = await createEVMSrcEscrow(
        dto.orderDetails,
        dto.orderDetails.resolvers,
        dto.orderDetails.factoryAddress,
        dto.signer as ethers.Signer,
        dto.signer as ethers.Signer // Assuming same signer for deployer and logic call
      );

      await prisma.escrow.create({
        data: {
          orderId,
          side: "SRC",
          chain: "EVM",
          escrowAddress: receipt.to || "", // Contract address
          escrowTxHash: receipt.hash,
          hashlock: "0x...", // Should be passed/derived
          orderHash: dto.orderHash,
    sigR: dto.sigR,
    sigVS: dto.sigVS,
    timelocks: dto.timelocks,
    extraData: dto.extraData,
    auctionDetails: dto.auctionDetails,
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SRC_ESCROW_CREATED },
      });
    }

    return { success: true };
  }

  async createDestinationEscrow(orderId: string, dto: ExtendedEscrowDto) {
    if (dto.platform === "APTOS") {
      const tx = await createAptosEscrow(
        dto.signer as Account,
        dto.orderDetails.resolverAddress,
        Number(dto.orderDetails.dstAmount), // assuming in octas
        1, // chainId
        2, // dstChainId
        dto.orderDetails.resolverAddress,
        new Uint8Array(32), // Secret hash placeholder
        Math.floor(Date.now() / 1000) + 600
      );

      await prisma.escrow.create({
        data: {
          orderId,
          side: "DST",
          chain: "APTOS",
          escrowAddress: dto.orderDetails.resolverAddress,
          escrowTxHash: tx.hash,
          hashlock: "0x...", // same as above
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DST_ESCROW_CREATED },
      });
    }

    return { success: true };
  }
}
