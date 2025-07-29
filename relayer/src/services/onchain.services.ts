import { ethers } from 'ethers';
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"


const ETH_RPC = process.env.ETH_RPC_URL!;

export const getEvmProvider = () => {
  const evmProvider = new ethers.JsonRpcProvider(ETH_RPC);
  return evmProvider;
};

export const getAptosClient = () => {
    const aptosConfig = new AptosConfig({
        network: Network.TESTNET,
    });
    return new Aptos(aptosConfig);
};