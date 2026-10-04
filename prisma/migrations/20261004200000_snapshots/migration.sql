-- Restore points: full gzip-compressed copies of the business data kept inside the database.
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Snapshot_kind_createdAt_idx" ON "Snapshot"("kind", "createdAt");
