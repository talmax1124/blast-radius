-- PrizePicks line tape. Open / last / close per player-market, unowned.
create table if not exists desk_quotes (
  quote_date date not null,
  quote_key text not null,
  name text not null,
  team_abbr text not null default '',
  opponent_abbr text not null default '',
  market text not null,
  odds_type text not null,
  open_line numeric not null,
  last_line numeric not null,
  prev_line numeric,
  close_line numeric,
  ticks integer not null default 1,
  moved_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key (quote_date, quote_key)
);
create index if not exists desk_quotes_date_idx on desk_quotes (quote_date);
