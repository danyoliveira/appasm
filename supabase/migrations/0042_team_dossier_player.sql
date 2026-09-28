-- Individual development evaluations are about one squad player. The name
-- is stored alongside the API-Football id so the file still reads right
-- after the player leaves the squad.
alter table public.team_dossier_files
  add column player_id integer,
  add column player_name text;

alter table public.team_dossier_files
  add constraint team_dossier_files_player_only_for_individual
    check (player_id is null or category = 'individual_eval');

create index team_dossier_files_player_idx on public.team_dossier_files (team_id, player_id);
