CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_balances" (
	"restaurant_id" text PRIMARY KEY NOT NULL,
	"current_amount" integer DEFAULT 0 NOT NULL,
	"total_added_amount" integer DEFAULT 0 NOT NULL,
	"total_spent_amount" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_transaction_id" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "restaurant_balances_current_amount_check" CHECK ("restaurant_balances"."current_amount" >= 0),
	CONSTRAINT "restaurant_balances_total_added_amount_check" CHECK ("restaurant_balances"."total_added_amount" >= 0),
	CONSTRAINT "restaurant_balances_total_spent_amount_check" CHECK ("restaurant_balances"."total_spent_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"status" text NOT NULL,
	"memo" text,
	"low_balance_threshold" integer DEFAULT 50000 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "restaurants_status_check" CHECK ("restaurants"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "restaurants_low_balance_threshold_check" CHECK ("restaurants"."low_balance_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"type" text NOT NULL,
	"amount_delta" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"memo" text,
	"used_at" text,
	"idempotency_key" text NOT NULL,
	"related_transaction_id" text,
	"receipt_object_key" text,
	"receipt_file_name" text,
	"receipt_content_type" text,
	"receipt_size" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "transactions_type_check" CHECK ("transactions"."type" IN ('SPEND', 'TOP_UP', 'ADJUST', 'REVERSAL')),
	CONSTRAINT "transactions_amount_delta_check" CHECK ("transactions"."amount_delta" != 0),
	CONSTRAINT "transactions_balance_before_check" CHECK ("transactions"."balance_before" >= 0),
	CONSTRAINT "transactions_balance_after_check" CHECK ("transactions"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"auth_provider_user_id" text,
	"avatar_object_key" text,
	"avatar_file_name" text,
	"avatar_content_type" text,
	"avatar_size" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_auth_provider_user_id_unique" UNIQUE("auth_provider_user_id"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('ADMIN', 'MEMBER')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "users_avatar_size_check" CHECK ("users"."avatar_size" IS NULL OR "users"."avatar_size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_balances" ADD CONSTRAINT "restaurant_balances_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_restaurants_status_name" ON "restaurants" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX "idx_transactions_restaurant_created" ON "transactions" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_created" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_type_created" ON "transactions" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");