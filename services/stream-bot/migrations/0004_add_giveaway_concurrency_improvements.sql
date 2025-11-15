-- Add entry_count column to giveaways table for atomic counting
ALTER TABLE "giveaways" ADD COLUMN IF NOT EXISTS "entry_count" integer DEFAULT 0 NOT NULL;

-- Create giveaway_entry_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS "giveaway_entry_attempts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "giveaway_id" varchar,
        "attempted_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints for giveaway_entry_attempts
DO $$ BEGIN
 ALTER TABLE "giveaway_entry_attempts" ADD CONSTRAINT "giveaway_entry_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "giveaway_entry_attempts" ADD CONSTRAINT "giveaway_entry_attempts_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add CHECK constraints to user_balances to prevent negative values
DO $$ BEGIN
 ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_balance_check" CHECK ("balance" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_total_earned_check" CHECK ("total_earned" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_total_spent_check" CHECK ("total_spent" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for performance on frequently queried columns
CREATE INDEX IF NOT EXISTS "idx_giveaway_entry_attempts_user_time" ON "giveaway_entry_attempts" ("user_id", "username", "platform", "attempted_at");

CREATE INDEX IF NOT EXISTS "idx_giveaway_entry_attempts_time" ON "giveaway_entry_attempts" ("attempted_at");

-- Update entry_count for existing giveaways based on actual entries
UPDATE "giveaways" g
SET "entry_count" = (
  SELECT COUNT(*)
  FROM "giveaway_entries" e
  WHERE e."giveaway_id" = g."id"
)
WHERE "entry_count" = 0;

-- Add comment explaining the purpose of these changes
COMMENT ON TABLE "giveaway_entry_attempts" IS 'Rate limiting table for giveaway entries to prevent spam and abuse';
COMMENT ON COLUMN "giveaways"."entry_count" IS 'Atomic counter for giveaway entries to prevent race conditions';
COMMENT ON CONSTRAINT "user_balances_balance_check" ON "user_balances" IS 'Prevents negative balance through database-level constraint';
