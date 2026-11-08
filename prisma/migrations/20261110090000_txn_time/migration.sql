-- Optional time of day ("HH:MM", local wall-clock) entered with an expense. Additive and nullable.
ALTER TABLE "Txn" ADD COLUMN "time" VARCHAR(5);
