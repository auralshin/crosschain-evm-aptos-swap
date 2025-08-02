import { ethers } from "ethers";

export interface SrcTimelocks {
  withdrawal: number;
  publicWithdrawal: number;
  cancellation: number;
  publicCancellation: number;
}

export interface DstTimelocks {
  withdrawal: number;
  publicWithdrawal: number;
  cancellation: number;
}

export interface InteractionParams {
  makerAssetSuffix: Uint8Array;
  takerAssetSuffix: Uint8Array;
  makingAmountData: Uint8Array;
  takingAmountData: Uint8Array;
  predicate: Uint8Array;
  permit: Uint8Array;
  preInteraction: Uint8Array;
  postInteraction: Uint8Array;
}

export interface MakerTraitsParams {
  allowedSender: string;
  shouldCheckEpoch: boolean;
  allowPartialFill: boolean;
  allowMultipleFills: boolean;
  usePermit2: boolean;
  unwrapWeth: boolean;
  expiry: bigint;
  nonce: bigint;
  series: bigint;
}

export interface OrderDetails {
  maker: string;
  receiver: string;
  srcToken: string;
  dstToken: string;
  srcAmount: bigint;
  dstAmount: bigint;
  srcSafetyDeposit: bigint;
  dstSafetyDeposit: bigint;
  resolvers: string[];
  resolverFee: number;
  auctionDetails: string; // use buildAuctionDetails to create this
  protocolFeeRecipient: string;
  integratorFeeRecipient: string;
  protocolFee: number;
  integratorFee: number;
  integratorShare: number;
  whitelistDiscountNumerator: number;
  customDataForPostInteraction: string;
}

export interface EscrowDetails {
  hashlock: string;
  timelocks: bigint; // wrapped Timelocks
  fakeOrder: boolean;
  allowMultipleFills: boolean;
}

export interface SwapData {
  order: any; // IOrderMixin.Order shape
  extension: string;
  extraData: Uint8Array<ArrayBufferLike>;
  orderHash: string;
  immutables: any; // IBaseEscrow.Immutables
}

export interface CreateDstEscrowParams {
  orderHash: string;
  hashlock: string;
  amount: bigint;
  safetyDeposit: bigint;
  maker: string;
  taker: string;
  token: string;
  timelocks: bigint;
  protocolFeeRecipient: string;
  integratorFeeRecipient: string;
  protocolFeeAmount: number;
  integratorFeeAmount: number;
}

export interface WithdrawDstParams {
  resolverAddress: string;
  escrowAddress: string;
  secret: string;
  orderHash: string;
  timelocks: bigint;
  deployedAt: bigint;
  protocolFeeRecipient: string;
  integratorFeeRecipient: string;
  protocolFee: number;
  integratorFee: number;
  integratorShare: number;
  dstToken: string;
  amount: bigint;
  safetyDeposit: bigint;
}

export interface WithdrawSrcParams {
  resolverAddress: string;
  escrowFactory: string;
  secret: string;
  orderHash: string;
  timelocks: bigint;
  deployedAt: bigint;
  srcToken: string;
  amount: bigint;
  safetyDeposit: bigint;
}

/**
 *  TimelocksSettersLib
 */
export function setTimelocks(
  src: SrcTimelocks,
  dst: DstTimelocks,
  deployedAt?: bigint
): { timelocksSrc: bigint; timelocksDst: bigint } {
  const now = deployedAt ?? BigInt(Math.floor(Date.now() / 1000));
  // Stage positions
  const S = {
    SrcWithdrawal: 1n,
    SrcPublicWithdrawal: 2n,
    SrcCancellation: 3n,
    SrcPublicCancellation: 4n,
    DstWithdrawal: 5n,
    DstPublicWithdrawal: 6n,
    DstCancellation: 7n,
  };
  function wrapTlocks(
    w: number,
    pw: number,
    c: number,
    pc: number,
    dw: number,
    dpw: number,
    dc: number,
    ts: bigint
  ): bigint {
    let field = ts << 224n;
    field |= BigInt(w) << (32n * S.SrcWithdrawal);
    field |= BigInt(pw) << (32n * S.SrcPublicWithdrawal);
    field |= BigInt(c) << (32n * S.SrcCancellation);
    field |= BigInt(pc) << (32n * S.SrcPublicCancellation);
    field |= BigInt(dw) << (32n * S.DstWithdrawal);
    field |= BigInt(dpw) << (32n * S.DstPublicWithdrawal);
    field |= BigInt(dc) << (32n * S.DstCancellation);
    return field;
  }

  const tSrc = wrapTlocks(
    src.withdrawal,
    src.publicWithdrawal,
    src.cancellation,
    src.publicCancellation,
    dst.withdrawal,
    dst.publicWithdrawal,
    dst.cancellation,
    now
  );
  const tDst = wrapTlocks(
    0,
    0,
    0,
    0,
    dst.withdrawal,
    dst.publicWithdrawal,
    dst.cancellation,
    now
  );
  return { timelocksSrc: tSrc, timelocksDst: tDst };
}

/**
 * buildAuctionDetails

   *     bytes memory auctionPoints = abi.encodePacked(
   *           uint8(5), // amount of points
    *          uint24(800000), uint16(100),
    *          uint24(700000), uint16(100),
     *         uint24(600000), uint16(100),
    *          uint24(500000), uint16(100),
     *         uint24(400000), uint16(100)
      *   );
         */
export function buildAuctionDetails(
  gasBumpEstimate: number,
  gasPriceEstimate: number,
  startTime: number,
  duration: number,
  delay: number,
  initialRateBump: number,
  auctionPoints: string
): string {
  return ethers.solidityPackedKeccak256(
    ["uint24", "uint32", "uint32", "uint24", "uint24", "bytes"],
    [
      gasBumpEstimate,
      gasPriceEstimate,
      startTime + delay,
      duration,
      initialRateBump,
      auctionPoints,
    ]
  );
}

/**
 * buildMakerTraits
 */
const FLAGS = {
  UNWRAP_WETH: 1n << 247n,
  ALLOW_MULTIPLE_FILLS: 1n << 254n,
  NO_PARTIAL_FILLS: 1n << 255n,
  NEED_CHECK_EPOCH: 1n << 250n,
  USE_PERMIT2: 1n << 248n,
};
export function buildMakerTraits(params: MakerTraitsParams): bigint {
  let data =
    (BigInt(params.series) << 160n) |
    (BigInt(params.nonce) << 120n) |
    (BigInt(params.expiry) << 80n) |
    (BigInt(params.allowedSender) & ((1n << 80n) - 1n));
  if (params.unwrapWeth) data |= FLAGS.UNWRAP_WETH;
  if (params.allowMultipleFills) data |= FLAGS.ALLOW_MULTIPLE_FILLS;
  if (!params.allowPartialFill) data |= FLAGS.NO_PARTIAL_FILLS;
  if (params.shouldCheckEpoch) data |= FLAGS.NEED_CHECK_EPOCH;
  if (params.usePermit2) data |= FLAGS.USE_PERMIT2;
  return data;
}

/**
 *  buildTakerTraits
 */
const T_FLAGS = {
  MAKER_AMOUNT: 1n << 255n,
  UNWRAP_WETH: 1n << 254n,
  SKIP_ORDER: 1n << 253n,
  USE_PERMIT2: 1n << 252n,
  HAS_TARGET: 1n << 251n,
  EXT_LEN_SHIFT: 224n,
  INT_LEN_SHIFT: 200n,
};
export function buildTakerTraits(
  makingAmount: boolean,
  unwrapWeth: boolean,
  skipMakerPermit: boolean,
  usePermit2: boolean,
  target: string,
  extension: string,
  interaction: Uint8Array,
  threshold: bigint
): { traits: bigint; args: string } {
  let data = threshold;
  if (makingAmount) data |= T_FLAGS.MAKER_AMOUNT;
  if (unwrapWeth) data |= T_FLAGS.UNWRAP_WETH;
  if (skipMakerPermit) data |= T_FLAGS.SKIP_ORDER;
  if (usePermit2) data |= T_FLAGS.USE_PERMIT2;
  if (target !== ethers.ZeroAddress) data |= T_FLAGS.HAS_TARGET;
  data |= BigInt(extension.length) << T_FLAGS.EXT_LEN_SHIFT;
  data |= BigInt(interaction.length) << T_FLAGS.INT_LEN_SHIFT;

  const targetBytes =
    target !== ethers.ZeroAddress
      ? ethers.getBytes(target)
      : ethers.getBytes("0x");
  const args = ethers.concat([targetBytes, extension, interaction]);
  return { traits: data, args };
}

/**
 * buildOrder
 * (note: returns minimal shape; tailor to your IOrderMixin.Order)
 */
export function buildOrder(
  maker: string,
  receiver: string,
  makerAsset: string,
  takerAsset: string,
  makingAmount: bigint,
  takingAmount: bigint,
  makerTraits: bigint,
  allowMultipleFills: boolean,
  interactions: InteractionParams,
  customData: Uint8Array,
  nonce: bigint
): { order: any; extension: string } {
  // build extension bytes
  const parts = [
    interactions.makerAssetSuffix,
    interactions.takerAssetSuffix,
    interactions.makingAmountData,
    interactions.takingAmountData,
    interactions.predicate,
    interactions.permit,
    interactions.preInteraction,
    interactions.postInteraction,
    customData,
  ];
  let sum = 0;
  let offset = 0n;
  const blobs = [] as Uint8Array[];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    sum += p.length;
    const shift = BigInt(i * 32);
    offset |= BigInt(p.length) << shift;
    blobs.push(p);
  }
  const offsetsHex = offset.toString(16).padStart(64, "0");
  const offsets = ethers.getBytes("0x" + offsetsHex);
  const extension = ethers.concat([offsets, ...blobs]);

  // compute salt and set flags
  let salt = 1n;
  if (extension.length > 0) {
    salt =
      BigInt(ethers.solidityPackedSha256(["bytes"], [extension])) &
      ((1n << 160n) - 1n);
    makerTraits |= 1n << 249n; // _HAS_EXTENSION_FLAG
  }
  if (interactions.preInteraction.length > 0) {
    makerTraits |= 1n << 252n;
  }
  if (interactions.postInteraction.length > 0) {
    makerTraits |= 1n << 251n;
  }

  const order = {
    salt,
    maker,
    receiver,
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    makerTraits,
  };

  return { order, extension };
}

export function buildDynamicData(
  hashlock: string,
  chainId: number,
  token: string,
  srcSafetyDeposit: bigint,
  dstSafetyDeposit: bigint,
  timelocks: bigint
): Uint8Array {
  const combined = (srcSafetyDeposit << 128n) | dstSafetyDeposit;
  return ethers.getBytes(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "uint256", "uint256", "uint256"],
      [hashlock, chainId, token, combined, timelocks]
    )
  );
}

export async function prepareDataSrc(
  orderDetails: OrderDetails,
  escrowDetails: EscrowDetails,
  factory: string,
  limitOrderProtocol: ethers.Contract
): Promise<SwapData> {
  const network = await limitOrderProtocol.getNetwork();
  const extraData = buildDynamicData(
    escrowDetails.hashlock,
    network.chainId,
    orderDetails.dstToken,
    orderDetails.srcSafetyDeposit,
    orderDetails.dstSafetyDeposit,
    escrowDetails.timelocks
  );

  const auctionDetails = orderDetails.auctionDetails;

  const interactions: InteractionParams = {
    makerAssetSuffix: ethers.getBytes("0x"),
    takerAssetSuffix: ethers.getBytes("0x"),
    makingAmountData: ethers.getBytes(auctionDetails),
    takingAmountData: ethers.getBytes(auctionDetails),
    predicate: ethers.getBytes("0x"),
    permit: ethers.getBytes("0x"),
    preInteraction: ethers.getBytes("0x"),
    postInteraction: extraData,
  };
  const customData = ethers.getBytes("0x");
  const { order, extension } = buildOrder(
    orderDetails.maker,
    orderDetails.receiver,
    orderDetails.srcToken,
    orderDetails.dstToken,
    orderDetails.srcAmount,
    orderDetails.dstAmount,
    0n, // initial makerTraits
    false, // allowMultipleFills
    interactions,
    customData,
    0n // nonce
  );

  const orderHash = await hashOrder(order, limitOrderProtocol);

  const immutables = {
    orderHash,
    amount: orderDetails.srcAmount,
    maker: orderDetails.maker,
    taker: orderDetails.resolvers[0],
    token: orderDetails.srcToken,
    hashlock: escrowDetails.hashlock,
    safetyDeposit: orderDetails.srcSafetyDeposit,
    timelocks: escrowDetails.timelocks,
    parameters: "0x",
  };

  return {
    order,
    extension,
    extraData,
    orderHash,
    immutables,
  };
}

/**
 * buildDstEscrowImmutables (for destination chain)
 */
export function buildDstEscrowImmutables(
  orderHash: string,
  hashlock: string,
  amount: bigint,
  maker: string,
  taker: string,
  token: string,
  safetyDeposit: bigint,
  timelocks: bigint,
  protocolFeeAmount: number,
  integratorFeeAmount: number,
  protocolFeeRecipient: string,
  integratorFeeRecipient: string
): any {
  const parameters = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "address", "address"],
    [
      protocolFeeAmount,
      integratorFeeAmount,
      protocolFeeRecipient,
      integratorFeeRecipient,
    ]
  );
  return {
    orderHash,
    hashlock,
    maker,
    taker,
    token,
    amount,
    safetyDeposit,
    timelocks,
    parameters,
  };
}

export async function hashOrder(
  order: any,
  contract: ethers.Contract
): Promise<string> {
  // use staticCall to perform a call without sending tx
  return await contract.hashOrder.staticCall(order);
}
