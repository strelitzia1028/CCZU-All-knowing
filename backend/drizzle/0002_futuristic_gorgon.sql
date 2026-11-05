CREATE TABLE "source_types" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value" varchar(50) NOT NULL,
	"label" varchar(64) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_types_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE INDEX "source_types_status_idx" ON "source_types" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_types_value_idx" ON "source_types" USING btree ("value");