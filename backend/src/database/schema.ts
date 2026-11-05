import { pgTable, serial, timestamp, varchar, text, index, uniqueIndex, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const profiles = pgTable(
	"profiles",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		username: varchar("username", { length: 64 }).unique(),
		password_hash: text("password_hash"),
		display_name: varchar("display_name", { length: 128 }).notNull(),
		role: varchar("role", { length: 20 }).notNull().default("user"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("profiles_role_idx").on(table.role),
		uniqueIndex("profiles_display_name_unique_ci").on(
			sql`lower(${table.display_name})`
		),
	]
);

export const tags = pgTable(
	"tags",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 64 }).notNull().unique(),
		description: text("description"),
		status: varchar("status", { length: 20 }).notNull().default("active"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("tags_status_idx").on(table.status), index("tags_name_idx").on(table.name)]
);

export const sourceTypes = pgTable(
	"source_types",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		value: varchar("value", { length: 50 }).notNull().unique(),
		label: varchar("label", { length: 64 }).notNull(),
		description: text("description"),
		status: varchar("status", { length: 20 }).notNull().default("active"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("source_types_status_idx").on(table.status),
		index("source_types_value_idx").on(table.value),
	]
);

export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 256 }).notNull(),
		content: text("content").notNull(),
		source_type: varchar("source_type", { length: 30 }),
		source_level: varchar("source_level", { length: 30 }).notNull().default("user_share"),
		review_status: varchar("review_status", { length: 20 }).notNull().default("approved"),
		created_by: varchar("created_by", { length: 36 }).references(() => profiles.id),
		source_id: varchar("source_id", { length: 36 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("knowledge_items_status_idx").on(table.review_status),
		index("knowledge_items_source_idx").on(table.source_level),
		index("knowledge_items_updated_idx").on(table.updated_at),
		index("knowledge_items_created_by_idx").on(table.created_by),
		uniqueIndex("knowledge_items_source_unique").on(table.source_id),
	]
);

export const knowledgeItemTags = pgTable(
	"knowledge_item_tags",
	{
		id: serial().primaryKey(),
		knowledge_item_id: varchar("knowledge_item_id", { length: 36 }).notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
		tag_id: varchar("tag_id", { length: 36 }).notNull().references(() => tags.id),
	},
	(table) => [
		index("kit_knowledge_item_id_idx").on(table.knowledge_item_id),
		index("kit_tag_id_idx").on(table.tag_id),
		uniqueIndex("kit_item_tag_unique").on(table.knowledge_item_id, table.tag_id),
	]
);

export const sources = pgTable(
	"sources",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 256 }).notNull(),
		content: text("content").notNull(),
		type: varchar("type", { length: 30 }).notNull(),
		contact_mode: varchar("contact_mode", { length: 30 }).notNull().default("platform"),
		contact_value: text("contact_value"),
		valid_until: timestamp("valid_until", { withTimezone: true }),
		location: varchar("location", { length: 256 }),
		allow_discussion: boolean("allow_discussion").notNull().default(false),
		status: varchar("status", { length: 20 }).notNull().default("draft"),
		reject_reason: text("reject_reason"),
		created_by: varchar("created_by", { length: 36 }).notNull().references(() => profiles.id),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("sources_status_idx").on(table.status),
		index("sources_type_idx").on(table.type),
		index("sources_created_by_idx").on(table.created_by),
	]
);

export const sourceTags = pgTable(
	"source_tags",
	{
		id: serial().primaryKey(),
		source_id: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
		tag_id: varchar("tag_id", { length: 36 }).notNull().references(() => tags.id),
	},
	(table) => [
		index("st_source_id_idx").on(table.source_id),
		index("st_tag_id_idx").on(table.tag_id),
		uniqueIndex("st_source_tag_unique").on(table.source_id, table.tag_id),
	]
);

export const sourceComments = pgTable(
	"source_comments",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		source_id: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
		author_id: varchar("author_id", { length: 36 }).notNull().references(() => profiles.id),
		content: text("content").notNull(),
		read_at: timestamp("read_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("source_comments_source_idx").on(table.source_id),
		index("source_comments_author_idx").on(table.author_id),
		index("source_comments_read_idx").on(table.source_id, table.read_at),
	]
);

export const directMessages = pgTable(
	"direct_messages",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		source_id: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
		sender_id: varchar("sender_id", { length: 36 }).notNull().references(() => profiles.id),
		recipient_id: varchar("recipient_id", { length: 36 }).notNull().references(() => profiles.id),
		content: text("content").notNull(),
		read_at: timestamp("read_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("direct_messages_source_idx").on(table.source_id),
		index("direct_messages_sender_idx").on(table.sender_id),
		index("direct_messages_recipient_idx").on(table.recipient_id),
		index("direct_messages_recipient_read_idx").on(table.recipient_id, table.read_at),
	]
);

export const catalogRequests = pgTable(
	"catalog_requests",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		request_type: varchar("request_type", { length: 20 }).notNull(),
		name: varchar("name", { length: 64 }).notNull(),
		code: varchar("code", { length: 50 }),
		description: text("description"),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		requested_by: varchar("requested_by", { length: 36 }).notNull().references(() => profiles.id),
		reviewed_by: varchar("reviewed_by", { length: 36 }).references(() => profiles.id),
		review_note: text("review_note"),
		target_id: varchar("target_id", { length: 36 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("catalog_requests_status_idx").on(table.status),
		index("catalog_requests_type_idx").on(table.request_type),
		index("catalog_requests_requested_by_idx").on(table.requested_by),
	]
);

export const chatSessions = pgTable(
	"chat_sessions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		created_by: varchar("created_by", { length: 36 }).references(() => profiles.id),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("chat_sessions_created_by_idx").on(table.created_by)]
);

export const chatMessages = pgTable(
	"chat_messages",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		session_id: varchar("session_id", { length: 36 }).notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
		role: varchar("role", { length: 20 }).notNull(),
		content: text("content").notNull(),
		msg_type: varchar("msg_type", { length: 20 }).default("text"),
		retrieved_items: text("retrieved_items"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("chat_messages_session_idx").on(table.session_id)]
);

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		actor_id: varchar("actor_id", { length: 36 }).notNull().references(() => profiles.id),
		action: varchar("action", { length: 50 }).notNull(),
		target_type: varchar("target_type", { length: 50 }).notNull(),
		target_id: varchar("target_id", { length: 36 }).notNull(),
		detail: text("detail"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("audit_logs_actor_idx").on(table.actor_id),
		index("audit_logs_target_idx").on(table.target_type, table.target_id),
	]
);
