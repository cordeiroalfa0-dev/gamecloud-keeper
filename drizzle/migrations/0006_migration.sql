create table public.tv_presence (
  room text primary key,
  net_hash text not null,
  label text not null default 'TV',
  last_seen timestamptz not null default now()
);
create index tv_presence_net_idx on public.tv_presence (net_hash, last_seen);
alter table public.tv_presence enable row level security;
grant all on public.tv_presence to service_role;