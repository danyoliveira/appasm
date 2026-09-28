-- "Dossier de Equipa": PDFs the coach keeps with the club — monthly
-- planning (projected + real), individual/collective development
-- evaluations and training units. Upload + storage only; the files
-- themselves live in the private "team-dossier" bucket.
create table public.team_dossier_files (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  category text not null check (
    category in ('monthly_plan', 'individual_eval', 'collective_eval', 'training_unit')
  ),
  -- Only for monthly_plan: the projected plan vs. what actually happened.
  variant text check (variant in ('projected', 'real')),
  -- Month the document refers to (first day of the month).
  period date,
  title text not null,
  storage_path text not null unique,
  file_size integer,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_dossier_files_variant_only_for_plan
    check ((category = 'monthly_plan') = (variant is not null))
);

create index team_dossier_files_team_idx on public.team_dossier_files (team_id, stint_id);

alter table public.team_dossier_files enable row level security;

create policy "team_dossier_files: authenticated read"
  on public.team_dossier_files for select
  using (auth.role() = 'authenticated');

create policy "team_dossier_files: coach inserts"
  on public.team_dossier_files for insert
  with check (public.is_coach());

create policy "team_dossier_files: coach updates"
  on public.team_dossier_files for update
  using (public.is_coach());

create policy "team_dossier_files: coach deletes"
  on public.team_dossier_files for delete
  using (public.is_coach());

-- Private bucket: PDFs only, 20 MB max. Read through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-dossier', 'team-dossier', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "team-dossier: authenticated read"
  on storage.objects for select
  using (bucket_id = 'team-dossier' and auth.role() = 'authenticated');

create policy "team-dossier: coach insert"
  on storage.objects for insert
  with check (bucket_id = 'team-dossier' and public.is_coach());

create policy "team-dossier: coach delete"
  on storage.objects for delete
  using (bucket_id = 'team-dossier' and public.is_coach());
