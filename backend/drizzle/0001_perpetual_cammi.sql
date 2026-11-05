ALTER TABLE "profiles" ADD COLUMN "username" varchar(64);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_unique" UNIQUE("username");