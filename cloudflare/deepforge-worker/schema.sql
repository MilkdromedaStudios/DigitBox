CREATE TABLE IF NOT EXISTS player_saves (
  player_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at
  ON player_saves(updated_at);
