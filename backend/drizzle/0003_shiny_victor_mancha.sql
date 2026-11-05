ALTER TABLE "knowledge_items" ADD COLUMN "source_id" varchar(36);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_items_source_unique" ON "knowledge_items" USING btree ("source_id");