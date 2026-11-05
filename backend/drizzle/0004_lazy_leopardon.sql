CREATE TABLE "catalog_requests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_type" varchar(20) NOT NULL,
	"name" varchar(64) NOT NULL,
	"code" varchar(50),
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_by" varchar(36) NOT NULL,
	"reviewed_by" varchar(36),
	"review_note" text,
	"target_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_requests_status_idx" ON "catalog_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_requests_type_idx" ON "catalog_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "catalog_requests_requested_by_idx" ON "catalog_requests" USING btree ("requested_by");