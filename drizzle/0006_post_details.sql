CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
ALTER TABLE posts ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX posts_category ON posts(category_id);
