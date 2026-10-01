-- Unpaid vault dues: the part of a payment the vault couldn't cover, paid later.

-- CreateTable
CREATE TABLE "VaultDue" (
    "id" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "vault" "Currency" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "VaultDue_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "VaultEntry" ADD COLUMN "dueId" TEXT;

-- CreateIndex
CREATE INDEX "VaultDue_vault_settledAt_idx" ON "VaultDue"("vault", "settledAt");

-- CreateIndex
CREATE INDEX "VaultDue_txnId_idx" ON "VaultDue"("txnId");

-- AddForeignKey
ALTER TABLE "VaultDue" ADD CONSTRAINT "VaultDue_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_dueId_fkey" FOREIGN KEY ("dueId") REFERENCES "VaultDue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
