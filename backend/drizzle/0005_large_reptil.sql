CREATE TABLE "direct_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"recipient_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_comments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "allow_discussion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_comments" ADD CONSTRAINT "source_comments_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_comments" ADD CONSTRAINT "source_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_messages_source_idx" ON "direct_messages" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "direct_messages_sender_idx" ON "direct_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "direct_messages_recipient_idx" ON "direct_messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "source_comments_source_idx" ON "source_comments" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_comments_author_idx" ON "source_comments" USING btree ("author_id");