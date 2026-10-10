-- Truck log: one row per entry a driver submits. Weather and calendar columns are filled in
-- automatically by the app and follow the layout of the training data (hour.csv).
-- Run in the Supabase SQL editor of a new project, then set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
create table public.truck_log (
  id bigint generated always as identity primary key,
  logged_at timestamptz not null default now(),
  local_date date not null,                                   -- Washington local date (dteday)
  hr smallint not null check (hr between 0 and 23),
  season smallint not null check (season between 1 and 4),
  year smallint not null,                                     -- calendar year (hour.csv stores yr = year - 2011)
  mnth smallint not null check (mnth between 1 and 12),
  weekday smallint not null check (weekday between 0 and 6),  -- 0 = Sunday, as in hour.csv
  holiday smallint not null check (holiday in (0, 1)),
  workingday smallint not null check (workingday in (0, 1)),
  weathersit smallint not null check (weathersit between 1 and 4),
  weather_code smallint,                                      -- raw WMO code from the weather service
  temp_c numeric(4,1) not null check (temp_c between -40 and 55),
  humidity_pct smallint not null check (humidity_pct between 0 and 100),
  wind_kmh numeric(5,1) not null check (wind_kmh between 0 and 300),
  precip_mm numeric(5,1) not null default 0 check (precip_mm >= 0),
  -- normalized exactly like hour.csv
  temp numeric generated always as (round(temp_c / 41.0, 4)) stored,
  hum numeric generated always as (round(humidity_pct / 100.0, 4)) stored,
  windspeed numeric generated always as (round(wind_kmh / 67.0, 4)) stored,
  bikes_moved integer not null check (bikes_moved >= 1),
  truck_id text check (truck_id is null or char_length(truck_id) <= 20),
  forecast_rentals integer,                                   -- what the model predicted for that hour at entry time
  source text not null default 'driver-app' check (source = 'driver-app')
);

comment on table public.truck_log is 'Bikes moved by trucks (rebalancing). NOT rental counts: do not use bikes_moved as the rentals target (cnt) without a separate rentals source.';

create index truck_log_logged_at_idx on public.truck_log (logged_at desc);
create index truck_log_hour_idx on public.truck_log (local_date, hr);

alter table public.truck_log enable row level security;

-- The app talks to the database only from its server, with the publishable key.
-- Allowed: add an entry, read entries. Not allowed: edit or delete (no policy exists for them).
revoke all on table public.truck_log from anon, authenticated;
grant select, insert on table public.truck_log to anon, authenticated;

create policy "insert driver entries" on public.truck_log
  for insert to anon, authenticated
  with check (source = 'driver-app' and bikes_moved >= 1);

create policy "read entries" on public.truck_log
  for select to anon, authenticated
  using (true);

-- Same shape as hour.csv: one row per date and hour, with the bikes moved summed.
create view public.truck_log_hourly with (security_invoker = true) as
select
  local_date as dteday, hr, season, year, mnth, holiday, weekday, workingday, weathersit,
  round(avg(temp), 4) as temp, round(avg(hum), 4) as hum, round(avg(windspeed), 4) as windspeed,
  sum(bikes_moved)::bigint as bikes_moved,
  count(*)::int as entries
from public.truck_log
group by local_date, hr, season, year, mnth, holiday, weekday, workingday, weathersit;

grant select on public.truck_log_hourly to anon, authenticated;
