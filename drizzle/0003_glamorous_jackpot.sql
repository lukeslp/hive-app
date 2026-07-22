CREATE TABLE `artifactFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artifactId` varchar(128) NOT NULL,
	`fileId` varchar(128) NOT NULL,
	`path` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`encoding` varchar(16),
	`content` mediumtext,
	`contentSynced` boolean NOT NULL DEFAULT false,
	`fileCreatedAt` varchar(40) NOT NULL,
	`fileUpdatedAt` varchar(40) NOT NULL,
	CONSTRAINT `artifactFiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `artifact_files_identity_idx` UNIQUE(`artifactId`,`fileId`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`sessionId` int NOT NULL,
	`schemaVersion` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`recipeId` varchar(128) NOT NULL,
	`scope` text NOT NULL,
	`provenance` text NOT NULL,
	`manifestCreatedAt` varchar(40) NOT NULL,
	`manifestUpdatedAt` varchar(40) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `artifactFiles` ADD CONSTRAINT `artifactFiles_artifactId_artifacts_id_fk` FOREIGN KEY (`artifactId`) REFERENCES `artifacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_sessionId_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `artifact_files_artifact_idx` ON `artifactFiles` (`artifactId`);--> statement-breakpoint
CREATE INDEX `artifacts_user_session_idx` ON `artifacts` (`userId`,`sessionId`);