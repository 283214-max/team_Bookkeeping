ALTER TABLE `transactions` ADD `receipt_object_key` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_file_name` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_content_type` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_size` integer;