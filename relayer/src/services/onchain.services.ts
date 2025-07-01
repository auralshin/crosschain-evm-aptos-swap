import { ethers } from "ethers";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { buildDstEscrowImmutables, buildTakerTraits, CreateDstEscrowParams, EscrowDetails, OrderDetails, prepareDataSrc, setTimelocks, WithdrawDstParams, WithdrawSrcParams } from "../utils/crosschainlib";

const ETH_RPC = process.env.ETH_RPC_URL!

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

export async function createEVMSrcEscrow(
  orderDetails: OrderDetails,
  resolverAddress: string,
  factoryAddress: string,
  limitOrderProtocol: ethers.Contract,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {

  const secret = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("secret")] as any);
  const hashlock = ethers.solidityPackedKeccak256(["bytes32"], [secret]);
  const { timelocksSrc } = setTimelocks(
    { withdrawal: 300, publicWithdrawal: 600, cancellation: 900, publicCancellation: 1200 },
    { withdrawal: 300, publicWithdrawal: 600, cancellation: 900 }
  );
  const escrowDetails: EscrowDetails = {
    hashlock,
    timelocks: timelocksSrc,
    fakeOrder: false,
    allowMultipleFills: false
  };

  const swapData = await prepareDataSrc(
    orderDetails,
    escrowDetails,
    factoryAddress,
    limitOrderProtocol
  );

  const orderHashBytes = ethers.getBytes(swapData.orderHash);
  const signed = await signer.signMessage(orderHashBytes);
  const split = ethers.Signature.from(signed);
  const vBig = BigInt(split.v - 27) << 255n;
  const vsBig = vBig | BigInt(split.s);
  const vsHex = '0x' + vsBig.toString(16).padStart(64, '0');

  const { traits: takerTraits, args } = buildTakerTraits(
    true,  // makingAmount
    false, // unwrapWeth
    true,  // skipMakerPermit
    false, // usePermit2
    ethers.ZeroAddress,
    swapData.extension,
    new Uint8Array(), // interaction
    0n
  );

  //  Approve token - in case of EVM - Aptos need to check
  // await (new ethers.Contract(orderDetails.srcToken, ["function approve(address,uint256) external returns (bool)"], signer))
  //   .approve(limitOrderProtocol.address, orderDetails.srcAmount);

  const resolver = new ethers.Contract(resolverAddress, [
    "function deploySrc(tuple,address[],uint32,bytes32[2],tuple(address,address,address,address,uint256,uint256,uint256,uint256,address[],uint32,bytes,address,address,uint16,uint16,uint8,uint8,bytes),bytes32,bytes32,uint256,tuple(bool,bool,bool,bool,address,bytes,bytes,uint256),bytes) payable"
  ], signer);

  const tx = await resolver.deploySrc(
    swapData.immutables,
    swapData.order,
    split.r,
    vsHex,
    orderDetails.srcAmount,
    takerTraits,
    args,
    { gasLimit: 3_000_000 }
  );
  return await tx.wait();
}

export async function createEVMDstEscrow(
  params: CreateDstEscrowParams,
  resolverAddress: string,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const immutables = buildDstEscrowImmutables(
    params.orderHash,
    params.hashlock,
    params.amount,
    params.maker,
    params.taker,
    params.token,
    params.safetyDeposit,
    params.timelocks,
    params.protocolFeeAmount,
    params.integratorFeeAmount,
    params.protocolFeeRecipient,
    params.integratorFeeRecipient
  );

  const srcCancellationTimestamp = BigInt(2 ** 32 - 1);

  const resolver = new ethers.Contract(resolverAddress, [
    "function deployDst(tuple, uint32) payable"
  ], signer);

  const value = params.amount + params.safetyDeposit;
  const tx = await resolver.deployDst(
    immutables,
    Number(srcCancellationTimestamp),
    { value: value }
  );

  return await tx.wait();
}

export async function withdrawEVMDst(
  params: WithdrawDstParams,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const updatedTimelocks = (() => {
    // highest 32 bits hold deployedAt
    return params.timelocks & ((1n << 224n) - 1n) | (params.deployedAt << 224n);
  })();
  const secretHashlock = ethers.solidityPackedKeccak256(
    ["bytes"], [ethers.toUtf8Bytes(params.secret)] as any
  );
  
  const integratorAmt = BigInt(Math.floor((Number(params.amount) * params.integratorFee) / 1e2)) ;
  const protocolAmt   = BigInt(Math.floor((Number(params.amount) * params.protocolFee) / 1e2));
  
  const immutables = {
    orderHash: params.orderHash,
    amount: params.amount,
    maker: await signer.getAddress(),
    taker: params.resolverAddress,
    token: params.dstToken,
    hashlock: secretHashlock,
    safetyDeposit: params.safetyDeposit,
    timelocks: updatedTimelocks,
    parameters: ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256","uint256","address","address"],
      [protocolAmt, integratorAmt, params.protocolFeeRecipient, params.integratorFeeRecipient]
    )
  };

  const targets = [params.escrowAddress];
  const iface = new ethers.Interface(["function withdraw(bytes32, tuple(bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes))"]);
  const data = [iface.encodeFunctionData("withdraw", [ethers.zeroPadValue(ethers.getBytes(params.secret), 32), immutables])];

  // f) Call resolver.arbitraryCalls
  const resolver = new ethers.Contract(params.resolverAddress,
    ["function arbitraryCalls(address[] targets, bytes[] data) payable"], signer
  );
  const tx = await resolver.arbitraryCalls(targets, data);
  return tx.wait();
}

export async function withdrawEVMSrc(
  params: WithdrawSrcParams,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const updatedTimelocks = params.timelocks & ((1n << 224n) - 1n) | (params.deployedAt << 224n);

  const secretHashlock = ethers.solidityPackedKeccak256(
    ["bytes"], [ethers.toUtf8Bytes(params.secret)] as any
  );

  const maker = await signer.getAddress();
  const taker = params.resolverAddress;
  const immutables = {
    orderHash: params.orderHash,
    amount: params.amount,
    maker,
    taker,
    token: params.srcToken,
    hashlock: secretHashlock,
    safetyDeposit: params.safetyDeposit,
    timelocks: updatedTimelocks,
    parameters: "0x"
  };

  const factory = new ethers.Contract(params.escrowFactory,
    ["function addressOfEscrowSrc(tuple) view returns(address)"], signer
  );
  const escrowAddress = await factory.addressOfEscrowSrc(immutables);

  const targets = [escrowAddress];
  const iface = new ethers.Interface(["function withdraw(bytes32, tuple(bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes))"]);
  const data = [iface.encodeFunctionData("withdraw", [ethers.zeroPadValue(ethers.getBytes(params.secret), 32), immutables])];

  const resolver = new ethers.Contract(params.resolverAddress,
    ["function arbitraryCalls(address[] targets, bytes[] data) payable"], signer
  );
  const tx = await resolver.arbitraryCalls(targets, data);
  return tx.wait();
}

export const createAptosSrcEscrow = () => {};

export const createAptosDstEscrow = () => {};

export const withdrawAptosDst = () => {};

export const withdrawAptosSrc = () => {};
