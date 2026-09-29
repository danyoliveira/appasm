-- A preparation can now be "finished" (Concluída) after the game, from the
-- Pós-Jogo tab: it becomes read-only until the coach reopens it.
alter table public.fixture_preparations
  add column finished_at timestamptz,
  add column finished_by uuid references auth.users (id);

alter table public.manual_preparations
  add column finished_at timestamptz,
  add column finished_by uuid references auth.users (id);

-- fixture_preparations only ever had read/insert policies (rows were just
-- "this fixture was opened"); finishing/reopening updates them.
create policy "fixture_preparations: coach updates"
  on public.fixture_preparations for update
  using (public.is_coach())
  with check (public.is_coach());
