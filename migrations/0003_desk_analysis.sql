-- Persist the full posted analysis so the desk hydrates without a re-fetch.
alter table desk_cards add column if not exists analysis jsonb;
