-- Video links (with notes) attached to a match preparation, for the
-- "Análise Vídeo" section under Pré-Jogo. `preparation_key` mirrors the
-- [fixtureId] route param as-is (either a numeric API-Football fixture id,
-- or "manual-<uuid>" for a manually added opponent) — a plain text key
-- avoids needing two nullable foreign keys for what's otherwise the same
-- concept as fixture_preparations/manual_preparations.
create table public.preparation_videos (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  preparation_key text not null,
  url text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table public.preparation_videos enable row level security;

create policy "preparation_videos: authenticated read"
  on public.preparation_videos for select
  using (auth.role() = 'authenticated');

create policy "preparation_videos: coach inserts"
  on public.preparation_videos for insert
  with check (public.is_coach());

create policy "preparation_videos: coach deletes"
  on public.preparation_videos for delete
  using (public.is_coach());
