import { Router, Request, Response } from 'express';
import { BidsService, CreateBidDto } from '../services/bids.services';
import { EscrowDto, EscrowsService } from '../services/escrow.services';
import { AuctionService } from '../services/auction.services';
import { createAptosEscrow, createEVMDstEscrow,  withdrawAptos, withdrawEVMDst} from '../services/onchain.services';
import { ethers } from 'ethers';
import { Account, PendingTransactionResponse } from '@aptos-labs/ts-sdk';
export const resolverRouter = Router();
const bids = new BidsService();
const escrows = new EscrowsService();
const auction = new AuctionService();

// Place a bid
resolverRouter.post('/orders/:id/bids', async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const dto: CreateBidDto = req.body;
    const bid = await bids.placeBid(orderId, dto);
    res.status(201).json(bid);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

resolverRouter.post('/evm/dst/create', async (req, res) => {
  try {
    const {
      orderHash,
      hashlock,
      amount,
      maker,
      taker,
      token,
      safetyDeposit,
      timelocks,
      protocolFeeAmount,
      integratorFeeAmount,
      protocolFeeRecipient,
      integratorFeeRecipient,
      resolverAddress
    } = req.body;

    // signer should be attached to request (e.g., via middleware)
    const signer: ethers.Signer = req.app.get('evmSigner');

    const receipt = await createEVMDstEscrow(
      {
        orderHash,
        hashlock: ethers.getBytes(hashlock).toString(),
        amount: BigInt(amount),
        maker,
        taker,
        token,
        safetyDeposit: BigInt(safetyDeposit),
        timelocks: BigInt(timelocks),
        protocolFeeAmount: Number(protocolFeeAmount),
        integratorFeeAmount: Number(integratorFeeAmount),
        protocolFeeRecipient,
        integratorFeeRecipient
      },
      resolverAddress,
      signer
    );

    res.status(201).json({ transactionHash: receipt.hash });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === POST /escrow/evm/dst/withdraw ===
resolverRouter.post('/evm/dst/withdraw', async (req, res) => {
  try {
    const {
      escrowAddress,
      secret,
      orderHash,
      amount,
      resolverAddress,
      dstToken,
      safetyDeposit,
      timelocks,
      integratorFee,
      protocolFee,
      protocolFeeRecipient,
      integratorFeeRecipient,
      deployedAt,
      integratorShare
    } = req.body;
    const signer: ethers.Signer = req.app.get('evmSigner');

     const receipt = await withdrawEVMDst(
      {
        escrowAddress,
        secret,
        orderHash,
        amount: BigInt(amount),
        resolverAddress,
        dstToken,
        safetyDeposit: BigInt(safetyDeposit),
        timelocks: BigInt(timelocks),
        integratorFee: Number(integratorFee),
        protocolFee: Number(protocolFee),
        protocolFeeRecipient,
        integratorFeeRecipient,
        deployedAt: BigInt(deployedAt),
        integratorShare: Number(integratorShare)
      },
      signer
    );

    res.json({ transactionHash: receipt.hash });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === POST /escrow/aptos/create ===
resolverRouter.post('/aptos/create', async (req, res) => {
  try {
    const {
      senderPrivateKey,
      recipient,
      amount,
      chainId,
      dstChainId,
      dstAddress,
      secret,
      expirationTime
    } = req.body;

    const sender = Account.fromPrivateKey(senderPrivateKey);
    const hash = ethers.solidityPackedKeccak256(['bytes'], [ethers.toUtf8Bytes(secret)]);
    const secretHash = ethers.getBytes(hash);

    const tx: PendingTransactionResponse = await createAptosEscrow(
      sender,
      recipient,
      Number(amount),
      Number(chainId),
      Number(dstChainId),
      dstAddress,
      secretHash,
      Number(expirationTime)
    );

    res.status(201).json({ hash: tx.hash });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// === POST /escrow/aptos/withdraw ===
resolverRouter.post('/aptos/withdraw', async (req, res) => {
  try {
    const { privateKey, senderAddress, secret, secretHash } = req.body;
    const signer = Account.fromPrivateKey(privateKey);

    let tx: PendingTransactionResponse;
    if (secret) {
      tx = await withdrawAptos(signer, senderAddress, { secret: ethers.getBytes(secret) });
    } else if (secretHash) {
      tx = await withdrawAptos(signer, senderAddress, { secretHash: new Uint8Array(secretHash) });
    } else {
      throw new Error('Provide either secret or secretHash');
    }

    res.json({ hash: tx.hash });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
