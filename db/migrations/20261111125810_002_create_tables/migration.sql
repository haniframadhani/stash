CREATE TABLE `folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`parent_id` integer REFERENCES `folders`(`id`),
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` integer
);
--> statement-break
CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`public_id` text NOT NULL UNIQUE,
	`folder_id` integer REFERENCES `folders`(`id`),
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` integer
);
--> statement-break
CREATE TABLE `image_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`image_id` integer NOT NULL REFERENCES `images`(`id`),
	`version` integer NOT NULL,
	`format` text NOT NULL,
	`mime` text NOT NULL,
	`ext` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`original_name` text NOT NULL,
	`original_format` text NOT NULL,
	`original_size` integer NOT NULL,
	`convert_options` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-break
CREATE INDEX `folders_deleted_at_idx` ON `folders` (`deleted_at`);
--> statement-break
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);
--> statement-break
CREATE INDEX `images_deleted_at_idx` ON `images` (`deleted_at`);
-- Unique active-sibling names, case-insensitive, excluding deleted. COALESCE handles NULL parent (= root).
CREATE UNIQUE INDEX `uq_folders_name` ON `folders` (`COALESCE(parent_id, 0), name COLLATE NOCASE`) WHERE `deleted_at` IS NULL;
--> statement-break
CREATE UNIQUE INDEX `uq_images_name` ON `images` (`COALESCE(folder_id, 0), name COLLATE NOCASE`) WHERE `deleted_at` IS NULL;
--> statement-break
CREATE INDEX `image_versions_image_id_idx` ON `image_versions` (`image_id`);
-- UNIQUE(image_id, version)
CREATE UNIQUE INDEX `uq_image_versions_image_version` ON `image_versions` (`image_id`, `version`);