-- Staff accounts: every staff user has a personal vault, users can be archived/restored,
-- owner can collect money back from a staff vault, owner notifications for staff activity.

ALTER TYPE "TxnKind" ADD VALUE IF NOT EXISTS 'USER_VAULT_COLLECT';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "hasPersonalVault" SET DEFAULT true;
-- Every staff user now works from their own vault.
UPDATE "User" SET "hasPersonalVault" = true WHERE "isOwner" = false;
-- Users that were switched off before are treated as archived.
UPDATE "User" SET "archivedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP) WHERE "active" = false AND "isOwner" = false AND "archivedAt" IS NULL;
-- "Own records only" is now the default for staff, so the old opt-in keys go; seeing others' activity is
-- granted with the new "activity:<page>" keys (all off by default).
UPDATE "User" SET "permissions" = ARRAY(SELECT p FROM unnest("permissions") AS p WHERE p NOT LIKE 'scope:%') WHERE "isOwner" = false;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "txnId" TEXT,
  "number" TEXT NOT NULL,
  "kind" "TxnKind" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "totalText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ackAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_ackAt_id_idx" ON "Notification"("userId", "ackAt", "id");
