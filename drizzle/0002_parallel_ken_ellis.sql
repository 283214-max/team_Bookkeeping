PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`auth_provider_user_id` text,
	`avatar_object_key` text,
	`avatar_file_name` text,
	`avatar_content_type` text,
	`avatar_size` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_role_check" CHECK("__new_users"."role" IN ('ADMIN', 'MEMBER')),
	CONSTRAINT "users_status_check" CHECK("__new_users"."status" IN ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "users_avatar_size_check" CHECK("__new_users"."avatar_size" IS NULL OR "__new_users"."avatar_size" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "name", "role", "status", "auth_provider_user_id", "avatar_object_key", "avatar_file_name", "avatar_content_type", "avatar_size", "created_at", "updated_at") SELECT "id", "email", "name", "role", "status", "auth_provider_user_id", NULL, NULL, NULL, NULL, "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_provider_user_id_unique` ON `users` (`auth_provider_user_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);
