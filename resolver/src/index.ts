import WebSocket from "ws";
import axios from "axios";
import { ethers } from "ethers";
const WS_URL = "ws://localhost:3000/orders/auction";
const REST_URL = "http://localhost:3000/resolver/orders";
const provider = new ethers.JsonRpcProvider("http://localhost:8545");

const resolverName = process.env.RESOLVER_NAME || "A";
const randomJitter = Math.floor(Math.random() * 1000);
const delayMs = 10 + randomJitter; // 10ms + random jitter

console.log(`[${resolverName}] Starting with delay: ${delayMs}ms`);

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log(`[${resolverName}] Connected to WebSocket`);
});

ws.on("message", async (data) => {
  await provider.send("anvil_impersonateAccount", [
    "0x2c06D8eBB95678944C9Ba9f67284619BA7AcAE51",
  ]);
  const signer = await provider.getSigner(
    "0x2c06D8eBB95678944C9Ba9f67284619BA7AcAE51"
  );
  const postInteractionAbi = [
    "function _postInteraction((address,uint256,uint256,uint256,address[],uint32,bytes,address,address,uint16,uint16,uint8,uint8,bytes),bytes,bytes32,address,uint256,uint256,uint256,bytes)",
    "function createDstEscrow((bytes32,uint256,address,address,address,bytes32,uint256,uint256,uint256,bytes),uint256) payable",
  ];
  const contract = new ethers.Contract(
    "0xa7bCb4EAc8964306F9e3764f67Db6A7af6DdF99A",
    postInteractionAbi,
    signer
  );

  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "ORDER_CREATED") {
      const order = msg.data;
      console.log(
        `[${resolverName}] Order ${order.id} received, delaying ${delayMs}ms`
      );

      setTimeout(async () => {
        try {
          const multiplier =
            100000n - BigInt(Math.floor((delayMs / 1000) * 500));
          const bidAmount =
            (BigInt(order.destinationTokenAmount) * multiplier) / 100000n;
          console.log(
            `[${resolverName}] Using multiplier = ${multiplier}, bidAmount = ${bidAmount}`
          );

          const dto = {
            resolver: resolverName,
            bidAmount: bidAmount.toString(),
            expiry: new Date(Date.now() + 60_000), // expires in 60s
          };

          const res = await axios.post(`${REST_URL}/${order.id}/bids`, dto);
          console.log(
            `[${resolverName}] Placed bid: ${res.data.id} for ${dto.bidAmount}`
          );
        } catch (err) {
          console.error(
            `[${resolverName}] Failed to place bid:`,
            (err as any).response?.data || err
          );
        }
      }, delayMs);
    }
    if (msg.type === "AUCTION_CLOSED") {
      const data = msg.data;
      const orderId = data.orderId;

      const isWinner = data.winners.some(
        (w: { resolver: string }) => w.resolver === resolverName
      );

      if (isWinner) {
        console.log(
          `[${resolverName}] 🏆 Auction closed for order ${orderId}, I won!`
        );
        const filledAmount = data.winners.find(
          (w: { resolver: string }) => w.resolver === resolverName
        )?.filledAmount;
        const sourceChain = data.order.sourceChain;
        const destinationChain = data.order.destinationChain;

        if (sourceChain === "EVM" && destinationChain === "APTOS") {
          await contract._postInteraction(
            orderStruct, // fill this from your data
            extension,
            orderHash,
            taker,
            makingAmount,
            takingAmount,
            remainingMakingAmount,
            extraData
          );
        } else if (sourceChain === "APTOS" && destinationChain === "EVM") {
          await resolver.createDstEscrow(
            dstImmutables, // fill this using `buildDstEscrowImmutables`
            srcCancellationTimestamp,
            { value: valueToSend } // value = amount + safety deposit
          );
        }
      } else {
        console.log(
          `[${resolverName}] 😞 Auction closed for order ${orderId}, I lost.`
        );
      }
    }
  } catch (err) {
    console.error(`[${resolverName}] Error handling message:`, err);
  }
});

ws.on("close", () => {
  console.log(`[${resolverName}] Disconnected from WebSocket`);
});


async function getForkSigner(): Promise<{ signerRpc: ethers.JsonRpcSigner; }> {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const address = "0xa7bCb4EAc8964306F9e3764f67Db6A7af6DdF99A";
  return {
    signerRpc: await provider.getSigner(address)
  };
}
