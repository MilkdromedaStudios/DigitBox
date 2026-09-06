from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)

# Core auth/account deletion: ensure multiplayer tables and clean rows.
p = Path("pages/api/deepforge/[[...path]].js")
s = p.read_text()
s = replace_once(
    s,
    '    env.DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),',
    '    env.DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),\n    env.DB.prepare("CREATE TABLE IF NOT EXISTS player_cities (user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"),\n    env.DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, company_value INTEGER NOT NULL DEFAULT 0, trophies INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),',
    "core multiplayer schema",
)
s = replace_once(
    s,
    '        env.DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(row.id),\n        env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(row.id),',
    '        env.DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(row.id),\n        env.DB.prepare("DELETE FROM player_presence WHERE user_id = ?1").bind(row.id),\n        env.DB.prepare("DELETE FROM player_cities WHERE user_id = ?1").bind(row.id),\n        env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(row.id),',
    "core account multiplayer cleanup",
)
p.write_text(s)

# Admin deletion: same cleanup guarantees.
p = Path("pages/api/deepforge/admin.js")
s = p.read_text()
s = replace_once(
    s,
    '    DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),',
    '    DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),\n    DB.prepare("CREATE TABLE IF NOT EXISTS player_cities (user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"),\n    DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, company_value INTEGER NOT NULL DEFAULT 0, trophies INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),',
    "admin multiplayer schema",
)
s = replace_once(
    s,
    '      DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(userId),\n      DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId),',
    '      DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(userId),\n      DB.prepare("DELETE FROM player_presence WHERE user_id = ?1").bind(userId),\n      DB.prepare("DELETE FROM player_cities WHERE user_id = ?1").bind(userId),\n      DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId),',
    "admin account multiplayer cleanup",
)
p.write_text(s)

# UI now has four top tabs and city overlay should be explicitly scoped to world screen.
p = Path("styles/deepforge-beta.css")
s = p.read_text()
s = replace_once(s, "  grid-template-columns: repeat(5,1fr);", "  grid-template-columns: repeat(4,1fr);", "four tabs")
if ".df2-world-screen { position: relative; }" not in s:
    s += "\n\n/* Shared-world city overlay scope */\n.df2-world-screen { position: relative; }\n"
p.write_text(s)
