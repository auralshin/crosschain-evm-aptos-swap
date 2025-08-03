import WebSocket from "ws";
import axios from "axios";
import { ethers } from "ethers";

const WS_URL = "ws://localhost:3000/orders/auction";
const REST_URL = "http://localhost:3000/resolver/orders";
const provider = new ethers.JsonRpcProvider("http://localhost:8545");

const resolverName = process.env.RESOLVER_NAME ?? "A";
const randomJitter = Math.floor(Math.random() * 1000);
const delayMs = 10 + randomJitter; // 10ms + random jitter

console.log(`[${resolverName}] Starting with delay: ${delayMs}ms`);

const resolverAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const contractAddress = "0xdb88CFC18875e3eD6797de31dfAae31F942231F2";

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log(`[${resolverName}] Connected to WebSocket`);
});

ws.on("message", async (raw) => {
  const msg = JSON.parse(raw.toString());

  // Impersonate on local fork for bid placement
  await provider.send("anvil_impersonateAccount", [resolverAddress]);
  const signer = await provider.getSigner(resolverAddress);

  // Minimal ABI for posting bids (not used in this snippet)
  const postInteractionAbi = [
    "function _postInteraction((address,uint256,uint256,uint256,address[],uint32,bytes,address,address,uint16,uint16,uint8,uint8,bytes),bytes,bytes32,address,uint256,uint256,uint256,bytes)",
    "function createDstEscrow((bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes),uint256) payable",
  ];
  const contract = new ethers.Contract(contractAddress, postInteractionAbi, signer);

  try {
    if (msg.type === "ORDER_CREATED") {
      const order = msg.data;
      console.log(`[${resolverName}] Order ${order.id} received, delaying ${delayMs}ms`);

      setTimeout(async () => {
        try {
          const multiplier = 100000n - BigInt(Math.floor((delayMs / 1000) * 500));
          const bidAmount = (BigInt(order.destinationTokenAmount) * multiplier) / 100000n;

          console.log(
            `[${resolverName}] Using multiplier = ${multiplier}, bidAmount = ${bidAmount}`
          );

          const dto = {
            resolver: resolverName,
            bidAmount: bidAmount.toString(),
            expiry: new Date(Date.now() + 60_000).toISOString(), // expires in 60s
          };

          const res = await axios.post(`${REST_URL}/${order.id}/bids`, dto);
          console.log(`[${resolverName}] Placed bid: ${res.data.id} for ${dto.bidAmount}`);
        } catch (err: any) {
          console.error(
            `[${resolverName}] Failed to place bid:`,
            err.response?.data ?? err.message
          );
        }
      }, delayMs);
    }

    if (msg.type === "AUCTION_CLOSED") {
      const closeInfo = msg.data;
      const orderId = closeInfo.orderId;

      const winner = closeInfo.winners.find(
        (w: { resolver: string }) => w.resolver === resolverName
      );

      if (winner) {
        console.log(
          `[${resolverName}] 🏆 Auction closed for order ${orderId}, I won!`
        );

        // --- APTOS escrow creation ---
        if (closeInfo.order.sourceChain === "APTOS") {
          const secret = ethers.hexlify(ethers.sha256(ethers.toUtf8Bytes("secret")));
          const aptosPayload = {
            senderPrivateKey:
              "0xdc7b5f72ca32caec5b64aa95d502fddd98c35661c2ed5863acbdc68b4a19078c",
            recipient: closeInfo.order.makerAddress,
            amount: closeInfo.order.srcAmount,
            chainId: closeInfo.order.sourceChainId,
            dstChainId: closeInfo.order.destinationChainId,
            dstAddress: closeInfo.order.destinationAddress,
            secret,
            expirationTime: closeInfo.order.srcExpiration, // unix seconds
          };
          const { data: srcRes } = await axios.post(
            `${REST_URL}/escrow/aptos/create`,
            aptosPayload
          );
          console.log(`[${resolverName}] Aptos escrow tx: ${srcRes.hash}`);

          // --- EVM escrow creation ---
          const hashlock = ethers.hexlify(
            ethers.sha256(ethers.toUtf8Bytes(secret))
          );
          const evmDstPayload = {
            orderHash: closeInfo.order.orderHash,
            hashlock,
            amount: closeInfo.order.srcAmount,
            maker: closeInfo.order.makerAddress,
            taker: resolverAddress,
            token: closeInfo.order.srcTokenAddress,
            safetyDeposit: closeInfo.order.srcSafetyDeposit,
            timelocks: closeInfo.order.srcTimelocks,
            protocolFeeAmount: closeInfo.order.protocolFee,
            integratorFeeAmount: closeInfo.order.integratorFee,
            protocolFeeRecipient: closeInfo.order.protocolFeeRecipient,
            integratorFeeRecipient: closeInfo.order.integratorFeeRecipient,
            resolverAddress,
          };
          const { data: dstRes } = await axios.post(
            `${REST_URL}/escrow/evm/dst/create`,
            evmDstPayload
          );
          console.log(
            `[${resolverName}] EVM escrow tx: ${dstRes.transactionHash}`
          );
        }
      }
    }
  } catch (err) {
    console.error(`[${resolverName}] Error handling message:`, err);
  }
});

ws.on("close", () => {
  console.log(`[${resolverName}] Disconnected from WebSocket`);
});