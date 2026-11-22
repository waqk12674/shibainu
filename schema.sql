-- 全国ランキング用の記録の表（D1: shibainu-scores）
-- 適用: npx wrangler d1 execute shibainu-scores --remote --file=schema.sql
-- 1回ごとの記録を残し、ランキングは端末（player）ごとの最高記録で並べる
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player     TEXT    NOT NULL,          -- 端末ごとの匿名ID（localStorage の shiba_player）
  name       TEXT    NOT NULL,          -- 名前 1〜10 文字
  score      INTEGER NOT NULL,          -- 毛玉の直径（0.1cm 単位。445 = 44.5cm）
  plucks     INTEGER NOT NULL,          -- 抜いた回数
  secs       REAL    NOT NULL,          -- プレイ時間（秒）
  created_at INTEGER NOT NULL,          -- UNIX ミリ秒
  ip_hash    TEXT                       -- 連投防止用（IP そのものは保存しない）
);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player, score);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score);
CREATE INDEX IF NOT EXISTS idx_scores_ip ON scores (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_created ON scores (created_at); -- デイリー（日本時間 0:00 から）の絞り込み用
