/**
 * Swap transaction types and interfaces
 */

export interface EvmTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasUsed: string;
  blockNumber: number;
  timestamp: number;
}

export interface AptosTransaction {
  hash: string;
  sender: string;
  receiver: string;
  amount: string;
  gasUnitPrice: string;
  gasUsed: string;
  sequenceNumber: number;
  timestamp: number;
}

export interface SwapRequest {
  id: string;
  sourceChain: string;
  targetChain: string;
  sourceToken: string;
  targetToken: string;
  amount: string;
  sender: string;
  receiver: string;
  status: SwapStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum SwapStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}
