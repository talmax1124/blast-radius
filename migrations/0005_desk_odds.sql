-- Sportsbook odds tape. One JSON document per slate date, unowned.
-- Open / last / close plus a short tick path for ML, total, and player props.
create table if not exists desk_odds (
  odds_date date primary key,
  quotes jsonb not null default '[]',
  ticks integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists desk_odds_updated_idx on desk_odds (updated_at desc);
