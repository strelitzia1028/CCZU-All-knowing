ALTER TABLE "direct_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_comments" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "direct_messages_recipient_read_idx" ON "direct_messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "source_comments_read_idx" ON "source_comments" USING btree ("source_id","read_at");