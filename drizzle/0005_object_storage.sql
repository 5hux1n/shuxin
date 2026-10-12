CREATE TABLE object_stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  configuration TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE media_objects (
  key TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES object_stores(id),
  object_key TEXT NOT NULL,
  size INTEGER NOT NULL
);
