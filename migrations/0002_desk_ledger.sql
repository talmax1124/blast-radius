-- Shared 7-day grade book. Unowned rows (no user_id) — world-readable sports cards.
create table if not exists desk_cards (
  card_date date primary key,
  version text not null,
  slips jsonb not null default '[]',
  grade_hits integer not null default 0,
  grade_n integer not null default 0,
  grade_dnp integer not null default 0,
  grade_summary text,
  complete boolean not null default false,
  finals integer not null default 0,
  live integer not null default 0,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists desk_days (
  day_date date primary key,
  recap text,
  slate jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists desk_cards_updated_idx on desk_cards (updated_at desc);
create index if not exists desk_days_updated_idx on desk_days (updated_at desc);
