-- Employees & salaries: a payroll list, and SALARY documents that pay employees out of a vault (USD ledger).

ALTER TYPE "TxnKind" ADD VALUE IF NOT EXISTS 'SALARY';

DO $$ BEGIN
  CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'DAILY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "salaryUsd" DECIMAL(18,2) NOT NULL,
  "salaryType" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
  "phone" TEXT NOT NULL DEFAULT '',
  "gender" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "avatar" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Employee_name_idx" ON "Employee"("name");

ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "Txn" ADD COLUMN IF NOT EXISTS "period" TEXT;
CREATE INDEX IF NOT EXISTS "Txn_employeeId_idx" ON "Txn"("employeeId");
DO $$ BEGIN
  ALTER TABLE "Txn" ADD CONSTRAINT "Txn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
