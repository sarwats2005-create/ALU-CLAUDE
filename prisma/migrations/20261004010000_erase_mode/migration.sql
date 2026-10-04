-- Owner-only erase mode (Ctrl+Alt+R + PIN).
ALTER TABLE "Session" ADD COLUMN "eraseUntil" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN "erasePinHash" TEXT;
