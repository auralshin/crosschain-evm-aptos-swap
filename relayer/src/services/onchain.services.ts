import { ethers } from "ethers";
import { Account, Aptos, AptosConfig, Network, PendingTransactionResponse } from "@aptos-labs/ts-sdk";
import { buildDstEscrowImmutables, buildTakerTraits, CreateDstEscrowParams, EscrowDetails, OrderDetails, prepareDataSrc, setTimelocks, WithdrawDstParams, WithdrawSrcParams } from "../utils/crosschainlib";

const ETH_RPC = process.env.ETH_RPC_URL!
const MODULE_ADDRESS = "0xYOUR_MODULE_ADDR";
export const getEvmProvider = () => {
  const evmProvider = new ethers.JsonRpcProvider("http://localhost:8545");
  return evmProvider;
};

export const getAptosClient = () => {
  const aptosConfig = new AptosConfig({
    network: Network.LOCAL,
  });
  return new Aptos(aptosConfig);
};

export const getAptosConfig = () => {
  return new AptosConfig({
    network: Network.LOCAL,
  });
}

export async function createEVMSrcEscrow(
  orderDetails: OrderDetails,
  resolverAddress: string,
  factoryAddress: string,
  limitOrderProtocol: ethers.Contract,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const secret = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("secret")]);
  const hashlock = ethers.solidityPackedKeccak256(["bytes32"], [secret]);

  const { timelocksSrc } = setTimelocks(
    { withdrawal: 300, publicWithdrawal: 600, cancellation: 900, publicCancellation: 1200 },
    { withdrawal: 300, publicWithdrawal: 600, cancellation: 900 }
  );

  const escrowDetails = {
    hashlock,
    timelocks: timelocksSrc,
    fakeOrder: false,
    allowMultipleFills: false
  };

  const swapData = await prepareDataSrc(orderDetails, escrowDetails, factoryAddress, limitOrderProtocol);

  const signed = await signer.signMessage(ethers.getBytes(swapData.orderHash));
  const sig = ethers.Signature.from(signed);
  const vsBig = (BigInt(sig.v - 27) << 255n) | BigInt(sig.s);
  const vsHex = "0x" + vsBig.toString(16).padStart(64, "0");

  const { traits: takerTraits, args } = buildTakerTraits(
    true, false, true, false,
    ethers.ZeroAddress,
    swapData.extension,
    new Uint8Array(),
    0n
  );

  const resolver = new ethers.Contract(resolverAddress, [
    "function deploySrc(tuple,address[],uint32,bytes32[2],tuple(address,address,address,address,uint256,uint256,uint256,uint256,address[],uint32,bytes,address,address,uint16,uint16,uint8,uint8,bytes),bytes32,bytes32,uint256,tuple(bool,bool,bool,bool,address,bytes,bytes,uint256),bytes) payable"
  ], signer);

  const tx = await resolver.deploySrc(
    swapData.immutables,
    swapData.order,
    sig.r,
    vsHex,
    orderDetails.srcAmount,
    takerTraits,
    args,
    { gasLimit: 3_000_000 }
  );

  return tx.wait();
}

/**
 * Creates an EVM destination escrow.
 */
export async function createEVMDstEscrow(
  params: CreateDstEscrowParams,
  resolverAddress: string,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const immutables = buildDstEscrowImmutables(
    params.orderHash, params.hashlock, params.amount, params.maker, params.taker, params.token,
    params.safetyDeposit, params.timelocks, params.protocolFeeAmount, params.integratorFeeAmount,
    params.protocolFeeRecipient, params.integratorFeeRecipient
  );

  const resolver = new ethers.Contract(resolverAddress, ["function deployDst(tuple,uint32) payable"], signer);
  const tx = await resolver.deployDst(immutables, Number(2 ** 32 - 1), { value: params.amount + params.safetyDeposit });
  return tx.wait();
}

/**
 * Withdraws from an EVM destination escrow.
 */
export async function withdrawEVMDst(
  params: WithdrawDstParams,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const timelocksUpdated = (params.timelocks & ((1n << 224n) - 1n)) | (params.deployedAt << 224n);
  const hashlock = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes(params.secret)]);

  const integratorAmt = BigInt((Number(params.amount) * params.integratorFee) / 100);
  const protocolAmt = BigInt((Number(params.amount) * params.protocolFee) / 100);

  const immutables = {
    orderHash: params.orderHash,
    amount: params.amount,
    maker: await signer.getAddress(),
    taker: params.resolverAddress,
    token: params.dstToken,
    hashlock,
    safetyDeposit: params.safetyDeposit,
    timelocks: timelocksUpdated,
    parameters: ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "address", "address"],
      [protocolAmt, integratorAmt, params.protocolFeeRecipient, params.integratorFeeRecipient]
    )
  };

  const iface = new ethers.Interface([
    "function withdraw(bytes32,tuple(bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes))"
  ]);
  const data = iface.encodeFunctionData("withdraw", [ethers.zeroPadValue(ethers.getBytes(params.secret), 32), immutables]);

  const resolver = new ethers.Contract(params.resolverAddress, ["function arbitraryCalls(address[],bytes[])"], signer);
  const tx = await resolver.arbitraryCalls([params.escrowAddress], [data]);
  return tx.wait();
}

/**
 * Withdraws from an EVM source escrow.
 */
export async function withdrawEVMSrc(
  params: WithdrawSrcParams,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const timelocksUpdated = (params.timelocks & ((1n << 224n) - 1n)) | (params.deployedAt << 224n);
  const hashlock = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes(params.secret)]);

  const immutables = {
    orderHash: params.orderHash,
    amount: params.amount,
    maker: await signer.getAddress(),
    taker: params.resolverAddress,
    token: params.srcToken,
    hashlock,
    safetyDeposit: params.safetyDeposit,
    timelocks: timelocksUpdated,
    parameters: "0x"
  };

  const factory = new ethers.Contract(params.escrowFactory, ["function addressOfEscrowSrc(tuple) view returns(address)"]);
  const escrowAddress = await factory.addressOfEscrowSrc(immutables);

  const iface = new ethers.Interface([
    "function withdraw(bytes32,tuple(bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes))"
  ]);
  const data = iface.encodeFunctionData("withdraw", [ethers.zeroPadValue(ethers.getBytes(params.secret), 32), immutables]);

  const resolver = new ethers.Contract(params.resolverAddress, ["function arbitraryCalls(address[],bytes[])"], signer);
  const tx = await resolver.arbitraryCalls([escrowAddress], [data]);
  return tx.wait();
}



async function sendEntryFunction(
  client: Aptos,
  signer: Account,
  func: string,
  args: any[],
): Promise<PendingTransactionResponse> {
  const transaction = await client.transaction.build.simple({
    sender: signer.accountAddress,
    data: {
      function: `${MODULE_ADDRESS}::fusion::${func}`,
      functionArguments: args,
    },
  })
  const [userTransactionResponse] = await client.transaction.simulate.simple({
    signerPublicKey: signer.publicKey,
    transaction
  })

  if (userTransactionResponse.success) {
    const senderAuthenticator = client.transaction.sign({
      signer: signer,
      transaction,
    })
    const commitedTransaction = await client.transaction.submit.simple({
      transaction,
      senderAuthenticator,
    })
    return commitedTransaction
  } else {
    throw new Error(`Transaction simulation failed: ${userTransactionResponse.success}`)
  }
}

/**
 * Initiate an escrow (on source or destination chain).
 */
export async function createAptosEscrow(
  sender: Account,
  recipient: string,
  amount: number,            // in octas, e.g. 1 APT = 1_000_000
  chainId: number,
  dstChainId: number,
  dstAddress: string,
  secretHash: Uint8Array,    // keccak256(secret)
  expirationTime: number     // unix seconds
): Promise<PendingTransactionResponse> {
  const client = getAptosClient();
  return sendEntryFunction(
    client,
    sender,
    "initiate_swap",
    [
      recipient,
      amount.toString(),
      chainId.toString(),
      dstChainId.toString(),
      dstAddress,
      Array.from(secretHash),
      expirationTime.toString(),
    ]
  );
}

/**
 * Withdraw an escrow:
 * - If you pass `secret`, it calls `claim_swap`.
 * - If you pass `secretHash`, it calls `refund_swap`.
 */
export async function withdrawAptos(
  signer: Account,
  senderAddress: string,
  opts: {
    secret?: Uint8Array,
    secretHash?: Uint8Array,
  }
): Promise<PendingTransactionResponse> {
  const client = getAptosClient();

  if (opts.secret) {
    // Claim path
    return sendEntryFunction(
      client,
      signer,
      "claim_swap",
      [
        senderAddress,
        Array.from(opts.secret),
      ]
    );
  }

  if (opts.secretHash) {
    // Refund path
    return sendEntryFunction(
      client,
      signer,
      "refund_swap",
      [
        Array.from(opts.secretHash),
      ]
    );
  }

  throw new Error("Must provide either `secret` (to claim) or `secretHash` (to refund)");
}