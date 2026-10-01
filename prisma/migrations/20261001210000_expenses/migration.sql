-- Expenses module: EXPENSE transactions, expense categories and recurring expense rules.

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'EXPENSE';

-- CreateEnum
CREATE TYPE "RecurFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RecurState" AS ENUM ('ACTIVE', 'PAUSED', 'SCHEDULED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "expenseVaultMode" TEXT NOT NULL DEFAULT 'ask',
ADD COLUMN "expensePinHash" TEXT;

-- AlterTable
ALTER TABLE "Txn" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "unitName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "unitPrice" DECIMAL(18,4),
ADD COLUMN "quantity" DECIMAL(18,3),
ADD COLUMN "recurringId" TEXT,
ADD COLUMN "runKey" TEXT;

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "unitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "unitName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "vault" "Currency" NOT NULL,
    "frequency" "RecurFrequency" NOT NULL DEFAULT 'MONTHLY',
    "state" "RecurState" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "nextRun" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dueFlag" BOOLEAN NOT NULL DEFAULT false,
    "dueReason" TEXT NOT NULL DEFAULT '',
    "skipFridays" BOOLEAN NOT NULL DEFAULT false,
    "skipWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "skipDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_nameKey_key" ON "ExpenseCategory"("nameKey");

-- CreateIndex
CREATE INDEX "RecurringExpense_state_nextRun_idx" ON "RecurringExpense"("state", "nextRun");

-- CreateIndex
CREATE UNIQUE INDEX "Txn_runKey_key" ON "Txn"("runKey");

-- CreateIndex
CREATE INDEX "Txn_categoryId_idx" ON "Txn"("categoryId");

-- CreateIndex
CREATE INDEX "Txn_recurringId_idx" ON "Txn"("recurringId");

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
