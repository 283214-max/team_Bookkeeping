CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `restaurant_balances` (
	`restaurant_id` text PRIMARY KEY NOT NULL,
	`current_amount` integer DEFAULT 0 NOT NULL,
	`total_added_amount` integer DEFAULT 0 NOT NULL,
	`total_spent_amount` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_transaction_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "restaurant_balances_current_amount_check" CHECK("restaurant_balances"."current_amount" >= 0),
	CONSTRAINT "restaurant_balances_total_added_amount_check" CHECK("restaurant_balances"."total_added_amount" >= 0),
	CONSTRAINT "restaurant_balances_total_spent_amount_check" CHECK("restaurant_balances"."total_spent_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`status` text NOT NULL,
	`memo` text,
	`low_balance_threshold` integer DEFAULT 50000 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "restaurants_status_check" CHECK("restaurants"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "restaurants_low_balance_threshold_check" CHECK("restaurants"."low_balance_threshold" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_restaurants_status_name` ON `restaurants` (`status`,`name`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`type` text NOT NULL,
	`amount_delta` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`memo` text,
	`used_at` text,
	`idempotency_key` text NOT NULL,
	`related_transaction_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" IN ('SPEND', 'TOP_UP', 'ADJUST', 'REVERSAL')),
	CONSTRAINT "transactions_amount_delta_check" CHECK("transactions"."amount_delta" != 0),
	CONSTRAINT "transactions_balance_before_check" CHECK("transactions"."balance_before" >= 0),
	CONSTRAINT "transactions_balance_after_check" CHECK("transactions"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_idempotency_key_unique` ON `transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_transactions_restaurant_created` ON `transactions` (`restaurant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_transactions_user_created` ON `transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_transactions_type_created` ON `transactions` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`auth_provider_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('ADMIN', 'MEMBER')),
	CONSTRAINT "users_status_check" CHECK("users"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_provider_user_id_unique` ON `users` (`auth_provider_user_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);