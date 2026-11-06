-- Personal staff vaults + owner funding.

ALTER TYPE "TxnKind" ADD VALUE IF NOT EXISTS 'USER_VAULT_FUND';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasPersonalVault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "vaultOwnerUserId" TEXT;
ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "fundUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Txn_vaultOwnerUserId_idx" ON "Txn"("vaultOwnerUserId");
CREATE INDEX IF NOT EXISTS "Txn_fundUserId_idx" ON "Txn"("fundUserId");
CREATE INDEX IF NOT EXISTS "Txn_createdById_idx" ON "Txn"("createdById");

DO $$ BEGIN
  ALTER TABLE "Txn" ADD CONSTRAINT "Txn_vaultOwnerUserId_fkey"
    FOREIGN KEY ("vaultOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Txn" ADD CONSTRAINT "Txn_fundUserId_fkey"
    FOREIGN KEY ("fundUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "VaultDue" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS "VaultDue_ownerUserId_vault_settledAt_idx" ON "VaultDue"("ownerUserId", "vault", "settledAt");

DO $$ BEGIN
  ALTER TABLE "VaultDue" ADD CONSTRAINT "VaultDue_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "VaultEntry" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS "VaultEntry_ownerUserId_vault_id_idx" ON "VaultEntry"("ownerUserId", "vault", "id");

DO $$ BEGIN
  ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
