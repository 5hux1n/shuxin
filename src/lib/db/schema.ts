import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const owner = sqliteTable("owner", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarId: text("avatar_id"),
});
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    visibility: text("visibility", {
      enum: ["public", "unlisted", "private"],
    }).notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    publishedAt: integer("published_at"),
  },
  (t) => [
    index("posts_timeline").on(
      t.status,
      t.visibility,
      t.pinned,
      t.publishedAt,
      t.id,
    ),
  ],
);
export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  liveId: text("live_id"),
  linkUrl: text("link_url").notNull().default(""),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owner.id),
  expiresAt: integer("expires_at").notNull(),
});
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const objectStores = sqliteTable("object_stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  configuration: text("configuration").notNull(),
  createdAt: integer("created_at").notNull(),
});
// Retain location records until remote cleanup succeeds.
export const mediaObjects = sqliteTable("media_objects", {
  key: text("key").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => objectStores.id),
  objectKey: text("object_key").notNull(),
  size: integer("size").notNull(),
});

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["audio", "video", "file"] }).notNull(),
  size: integer("size").notNull(),
  received: integer("received").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
