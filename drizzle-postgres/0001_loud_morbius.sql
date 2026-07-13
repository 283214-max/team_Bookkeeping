CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_preset" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_settings_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "app_settings"
      ADD CONSTRAINT "app_settings_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by")
      REFERENCES "public"."users"("id")
      ON DELETE no action
      ON UPDATE no action;
  END IF;
END $$;
