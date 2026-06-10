const path = require("node:path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "alien-hunt.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS hunt_stats (
    hunt_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT,
    search_strategy TEXT,
    difficulty TEXT,
    moves INTEGER NOT NULL DEFAULT 0,
    shots INTEGER NOT NULL DEFAULT 0,
    motion_tracker_uses INTEGER NOT NULL DEFAULT 0
  )
`);

ensureColumn("hunt_stats", "search_strategy", "TEXT");
ensureColumn("hunt_stats", "difficulty", "TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS hunt_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hunt_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    action TEXT NOT NULL,
    direction TEXT NOT NULL,
    state TEXT NOT NULL,
    grid_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (hunt_id) REFERENCES hunt_stats (hunt_id)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_hunt_snapshots_hunt_id_sequence
  ON hunt_snapshots (hunt_id, sequence)
`);

const insertHunt = db.prepare(`
  INSERT INTO hunt_stats (hunt_id, started_at, search_strategy, difficulty)
  VALUES (@huntId, @startedAt, @searchStrategy, @difficulty)
`);

const incrementMoves = db.prepare(`
  UPDATE hunt_stats
  SET moves = moves + 1
  WHERE hunt_id = ?
`);

const incrementShots = db.prepare(`
  UPDATE hunt_stats
  SET shots = shots + 1
  WHERE hunt_id = ?
`);

const incrementMotionTrackerUses = db.prepare(`
  UPDATE hunt_stats
  SET motion_tracker_uses = motion_tracker_uses + 1
  WHERE hunt_id = ?
`);

const finishHunt = db.prepare(`
  UPDATE hunt_stats
  SET ended_at = @endedAt,
      outcome = @outcome
  WHERE hunt_id = @huntId
    AND ended_at IS NULL
`);

const getAllStats = db.prepare(`
  SELECT
    hunt_id AS huntId,
    started_at AS startedAt,
    outcome,
    search_strategy AS searchStrategy,
    difficulty,
    moves,
    shots,
    motion_tracker_uses AS motionTrackerUses
  FROM hunt_stats
  ORDER BY started_at DESC
`);

const getStatsForHunt = db.prepare(`
  SELECT
    hunt_id AS huntId,
    started_at AS startedAt,
    outcome,
    search_strategy AS searchStrategy,
    difficulty,
    moves,
    shots,
    motion_tracker_uses AS motionTrackerUses
  FROM hunt_stats
  WHERE hunt_id = ?
`);

const insertSnapshot = db.prepare(`
  INSERT INTO hunt_snapshots (
    hunt_id,
    sequence,
    action,
    direction,
    state,
    grid_json,
    created_at
  )
  VALUES (
    @huntId,
    (
      SELECT COALESCE(MAX(sequence), 0) + 1
      FROM hunt_snapshots
      WHERE hunt_id = @huntId
    ),
    @action,
    @direction,
    @state,
    @gridJson,
    @createdAt
  )
`);

const getSnapshotsForHunt = db.prepare(`
  SELECT
    sequence,
    action,
    direction,
    state,
    grid_json AS gridJson,
    created_at AS createdAt
  FROM hunt_snapshots
  WHERE hunt_id = ?
  ORDER BY sequence ASC
`);

function createStats(huntId, searchStrategy = null, difficulty = null) {
  insertHunt.run({
    huntId,
    searchStrategy,
    difficulty,
    startedAt: new Date().toISOString(),
  });
}

function recordMove(huntId) {
  incrementMoves.run(huntId);
}

function recordShot(huntId) {
  incrementShots.run(huntId);
}

function recordMotionTrackerUse(huntId) {
  incrementMotionTrackerUses.run(huntId);
}

function recordFinishedHunt(huntId, outcome) {
  finishHunt.run({
    huntId,
    outcome,
    endedAt: new Date().toISOString(),
  });
}

function listStats() {
  return getAllStats.all();
}

function recordSnapshot(huntId, action, direction, state, grid) {
  insertSnapshot.run({
    huntId,
    action,
    direction,
    state,
    gridJson: JSON.stringify(grid),
    createdAt: new Date().toISOString(),
  });
}

function getHuntStats(huntId) {
  return getStatsForHunt.get(huntId);
}

function listSnapshots(huntId, options = {}) {
  const revealAlien = options.revealAlien ?? false;

  return getSnapshotsForHunt.all(huntId).map((snapshot) => ({
    sequence: snapshot.sequence,
    action: snapshot.action,
    direction: snapshot.direction,
    state: snapshot.state,
    grid: getSnapshotGrid(snapshot.gridJson, revealAlien),
    createdAt: snapshot.createdAt,
  }));
}

function getSnapshotGrid(gridJson, revealAlien) {
  const grid = JSON.parse(gridJson);

  if (revealAlien) {
    return grid;
  }

  return grid.map((row) => row.map((cell) => (cell === "A" ? "." : cell)));
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

module.exports = {
  createStats,
  getHuntStats,
  listSnapshots,
  listStats,
  recordFinishedHunt,
  recordMotionTrackerUse,
  recordMove,
  recordShot,
  recordSnapshot,
};
