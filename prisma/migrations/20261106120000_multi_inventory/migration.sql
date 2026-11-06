-- Multi-inventory: stock locations, per-inventory stock ledger, stock transfers, monthly rent.

-- New txn kind for moving stock between inventories.
ALTER TYPE "TxnKind" ADD VALUE IF NOT EXISTS 'STOCK_TRANSFER';

-- Inventory locations.
CREATE TABLE IF NOT EXISTS "Inventory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "rentAmount" DECIMAL(18,2),
    "rentVault" "Currency",
    "rentNextDue" DATE,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_nameKey_key" ON "Inventory"("nameKey");
CREATE INDEX IF NOT EXISTS "Inventory_isDefault_idx" ON "Inventory"("isDefault");

-- Seed the Main Inventory used by all existing stock (idempotent).
INSERT INTO "Inventory" ("id", "name", "nameKey", "address", "size", "isDefault", "createdAt", "updatedAt")
SELECT 'inv_main_default', 'Main Inventory', 'main inventory', '', '', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Inventory" WHERE "isDefault" = true);

-- Txn links to inventories.
ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "inventoryId" TEXT;
ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "toInventoryId" TEXT;

CREATE INDEX IF NOT EXISTS "Txn_inventoryId_idx" ON "Txn"("inventoryId");
CREATE INDEX IF NOT EXISTS "Txn_toInventoryId_idx" ON "Txn"("toInventoryId");

DO $$ BEGIN
  ALTER TABLE "Txn" ADD CONSTRAINT "Txn_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Txn" ADD CONSTRAINT "Txn_toInventoryId_fkey"
    FOREIGN KEY ("toInventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- StockEntry.inventoryId — add nullable, backfill, then require.
ALTER TABLE "StockEntry" ADD COLUMN IF NOT EXISTS "inventoryId" TEXT;

UPDATE "StockEntry" se
SET "inventoryId" = (SELECT i."id" FROM "Inventory" i WHERE i."isDefault" = true ORDER BY i."createdAt" ASC LIMIT 1)
WHERE se."inventoryId" IS NULL;

ALTER TABLE "StockEntry" ALTER COLUMN "inventoryId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "StockEntry_inventoryId_productId_state_idx"
  ON "StockEntry"("inventoryId", "productId", "state");

-- Point existing purchase/sale/processing txns at the default inventory when they touched stock.
UPDATE "Txn" t
SET "inventoryId" = (SELECT i."id" FROM "Inventory" i WHERE i."isDefault" = true ORDER BY i."createdAt" ASC LIMIT 1)
WHERE t."inventoryId" IS NULL
  AND t.kind IN ('PURCHASE', 'SALE', 'PROCESSING');
