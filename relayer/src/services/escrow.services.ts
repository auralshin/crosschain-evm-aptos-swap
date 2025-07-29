import { prisma } from '../prisma';
import { OrderStatus } from '../generated/prisma';

export interface EscrowDto {
  escrowAddress: string;
  escrowTxHash: string;
  secretHash: string;
}

export interface CEscrowDto {
  escrowAddress: string;
  escrowTxHash: string;
  secretHash: string;
}

export class EscrowsService {
  async createDestinationEscrow(orderId: number, dto: EscrowDto) {
    const escrow = await prisma.escrow.create({
      data: {
        orderId,
        side: 'DST',
        chain: 'APTOS',
        escrowAddress: dto.escrowAddress,
        escrowTxHash: dto.escrowTxHash,
        secretHash: dto.secretHash,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'DST_ESCROW_CREATED' },
    });
    return escrow;
  }

    async createSourceEscrow(orderId: number, dto: EscrowDto) {

      const escrow = await prisma.escrow.create({
        data: {
          orderId,
          side: 'SRC',
          chain: 'EVM',
          escrowAddress: dto.escrowAddress,
          escrowTxHash: dto.escrowTxHash,
          secretHash: dto.secretHash,
        },
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SRC_ESCROW_CREATED },
      });
      return escrow;
    }
}
