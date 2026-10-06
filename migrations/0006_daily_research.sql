CREATE TABLE IF NOT EXISTS desk_daily_runs (
  date date NOT NULL,
  task text NOT NULL CHECK (task IN ('mlb', 'nfl', 'nhl', 'research', 'board')),
  status text NOT NULL CHECK (status IN ('running', 'published', 'failed')),
  lease_token text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  payload jsonb,
  PRIMARY KEY (date, task)
);
