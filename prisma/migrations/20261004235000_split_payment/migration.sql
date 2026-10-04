-- Split payment: a sale or purchase can be paid partly in USD and partly in IQD, each part to its own vault.
ALTER TABLE "Txn" ADD COLUMN "paidUsd" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Txn" ADD COLUMN "paidIqd" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Existing invoices were paid into one vault: copy that amount into the matching currency.
UPDATE "Txn" SET "paidUsd" = "vaultAmount" WHERE kind IN ('SALE', 'PURCHASE') AND vault = 'USD';
UPDATE "Txn" SET "paidIqd" = "vaultAmount" WHERE kind IN ('SALE', 'PURCHASE') AND vault = 'IQD';
