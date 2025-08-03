-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUserAddress" TEXT NOT NULL,
    "sourceTokenAddress" TEXT NOT NULL,
    "destinationTokenAddress" TEXT NOT NULL,
    "sourceTokenAmount" TEXT NOT NULL,
    "destinationTokenAmount" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL,
    "destinationChain" TEXT NOT NULL,
    "destinationUserAddress" TEXT NOT NULL,
    "auctionStartTime" DATETIME NOT NULL,
    "auctionDuration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUCTION_OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "resolver" TEXT NOT NULL,
    "bidAmount" TEXT NOT NULL,
    "bidTxHash" TEXT,
    "filledAmount" TEXT NOT NULL,
    "expiry" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLACED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bid_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "escrowAddress" TEXT NOT NULL,
    "escrowTxHash" TEXT NOT NULL,
    "hashlock" TEXT NOT NULL,
    "orderHash" TEXT NOT NULL,
    "sigR" TEXT NOT NULL,
    "sigVS" TEXT NOT NULL,
    "timelocks" TEXT NOT NULL,
    "extraData" TEXT NOT NULL,
    "auctionDetails" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Escrow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" TEXT NOT NULL,
    "escrowId" INTEGER NOT NULL,
    "secret" TEXT NOT NULL,
    "revealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Secret_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Secret_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Secret_escrowId_key" ON "Secret"("escrowId");
