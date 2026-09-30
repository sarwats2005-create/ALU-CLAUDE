-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('en', 'ku');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'IQD');

-- CreateEnum
CREATE TYPE "StockState" AS ENUM ('RAW', 'FINISHED');

-- CreateEnum
CREATE TYPE "TxnKind" AS ENUM ('SALE', 'PURCHASE', 'CUSTOMER_PAYMENT', 'CUSTOMER_REFUND', 'BENEFICIARY_PAYMENT', 'BENEFICIARY_REFUND', 'VAULT_DEPOSIT', 'VAULT_WITHDRAWAL', 'VAULT_TRANSFER', 'PROCESSING');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "LossMethod" AS ENUM ('PERCENT', 'KG');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lang" "Lang" NOT NULL DEFAULT 'en',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'ALU FACTORY',
    "logo" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "phones" TEXT NOT NULL DEFAULT '',
    "footerNote" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "exchangeRate" DECIMAL(18,4) NOT NULL DEFAULT 1480,
    "lowStockKg" DECIMAL(18,3) NOT NULL DEFAULT 100,
    "alertCustomerDue" BOOLEAN NOT NULL DEFAULT true,
    "customerDueUsd" DECIMAL(18,2) NOT NULL DEFAULT 1000,
    "alertBeneficiaryDue" BOOLEAN NOT NULL DEFAULT true,
    "beneficiaryDueUsd" DECIMAL(18,2) NOT NULL DEFAULT 1000,
    "alertLowStock" BOOLEAN NOT NULL DEFAULT true,
    "alertVault" BOOLEAN NOT NULL DEFAULT true,
    "vaultMinUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vaultMinIqd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "alertOverdue" BOOLEAN NOT NULL DEFAULT true,
    "overdueDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateLog" (
    "id" SERIAL NOT NULL,
    "oldRate" DECIMAL(18,4) NOT NULL,
    "newRate" DECIMAL(18,4) NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AluminumType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AluminumType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "lowStockKg" DECIMAL(18,3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Txn" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "TxnKind" NOT NULL,
    "date" DATE NOT NULL,
    "customerId" TEXT,
    "beneficiaryId" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "rate" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "totalUsd" DECIMAL(18,2) NOT NULL,
    "cashPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cashPaidUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vault" "Currency",
    "vaultAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "toVault" "Currency",
    "toAmount" DECIMAL(18,2),
    "cogsUsd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "productId" TEXT,
    "inputKg" DECIMAL(18,3),
    "lossKg" DECIMAL(18,3),
    "outputKg" DECIMAL(18,3),
    "lossMethod" "LossMethod",
    "lossPercent" DECIMAL(9,4),
    "label" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TxnLine" (
    "id" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "state" "StockState" NOT NULL,
    "kg" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "lineTotalUsd" DECIMAL(18,4) NOT NULL,
    "unitCostUsd" DECIMAL(18,4) NOT NULL,
    "cogsUsd" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "TxnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultEntry" (
    "id" SERIAL NOT NULL,
    "vault" "Currency" NOT NULL,
    "direction" "Direction" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "txnId" TEXT NOT NULL,
    "sourceType" "TxnKind" NOT NULL,
    "date" DATE NOT NULL,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyEntry" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT,
    "beneficiaryId" TEXT,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "txnId" TEXT NOT NULL,
    "sourceType" "TxnKind" NOT NULL,
    "date" DATE NOT NULL,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "state" "StockState" NOT NULL,
    "kg" DECIMAL(18,3) NOT NULL,
    "unitCostUsd" DECIMAL(18,4) NOT NULL,
    "valueUsd" DECIMAL(18,4) NOT NULL,
    "txnId" TEXT NOT NULL,
    "sourceType" "TxnKind" NOT NULL,
    "date" DATE NOT NULL,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRead" (
    "userId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRead_pkey" PRIMARY KEY ("userId","alertKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE INDEX "ExchangeRateLog_createdAt_idx" ON "ExchangeRateLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AluminumType_name_key" ON "AluminumType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_typeId_idx" ON "Product"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nameKey_key" ON "Customer"("nameKey");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_nameKey_key" ON "Beneficiary"("nameKey");

-- CreateIndex
CREATE INDEX "Beneficiary_name_idx" ON "Beneficiary"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Txn_number_key" ON "Txn"("number");

-- CreateIndex
CREATE INDEX "Txn_date_idx" ON "Txn"("date");

-- CreateIndex
CREATE INDEX "Txn_kind_date_idx" ON "Txn"("kind", "date");

-- CreateIndex
CREATE INDEX "Txn_customerId_idx" ON "Txn"("customerId");

-- CreateIndex
CREATE INDEX "Txn_beneficiaryId_idx" ON "Txn"("beneficiaryId");

-- CreateIndex
CREATE INDEX "Txn_vault_idx" ON "Txn"("vault");

-- CreateIndex
CREATE INDEX "Txn_deletedAt_idx" ON "Txn"("deletedAt");

-- CreateIndex
CREATE INDEX "Txn_productId_idx" ON "Txn"("productId");

-- CreateIndex
CREATE INDEX "TxnLine_txnId_idx" ON "TxnLine"("txnId");

-- CreateIndex
CREATE INDEX "TxnLine_productId_idx" ON "TxnLine"("productId");

-- CreateIndex
CREATE INDEX "VaultEntry_vault_id_idx" ON "VaultEntry"("vault", "id");

-- CreateIndex
CREATE INDEX "VaultEntry_vault_date_idx" ON "VaultEntry"("vault", "date");

-- CreateIndex
CREATE INDEX "VaultEntry_txnId_idx" ON "VaultEntry"("txnId");

-- CreateIndex
CREATE INDEX "VaultEntry_sourceType_idx" ON "VaultEntry"("sourceType");

-- CreateIndex
CREATE INDEX "PartyEntry_customerId_date_idx" ON "PartyEntry"("customerId", "date");

-- CreateIndex
CREATE INDEX "PartyEntry_beneficiaryId_date_idx" ON "PartyEntry"("beneficiaryId", "date");

-- CreateIndex
CREATE INDEX "PartyEntry_txnId_idx" ON "PartyEntry"("txnId");

-- CreateIndex
CREATE INDEX "StockEntry_productId_state_idx" ON "StockEntry"("productId", "state");

-- CreateIndex
CREATE INDEX "StockEntry_txnId_idx" ON "StockEntry"("txnId");

-- CreateIndex
CREATE INDEX "StockEntry_date_idx" ON "StockEntry"("date");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AluminumType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxnLine" ADD CONSTRAINT "TxnLine_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Txn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxnLine" ADD CONSTRAINT "TxnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyEntry" ADD CONSTRAINT "PartyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyEntry" ADD CONSTRAINT "PartyEntry_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyEntry" ADD CONSTRAINT "PartyEntry_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
