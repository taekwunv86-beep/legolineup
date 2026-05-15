ALTER TABLE `rounds` ADD `access_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rounds_access_code` ON `rounds` (`access_code`);