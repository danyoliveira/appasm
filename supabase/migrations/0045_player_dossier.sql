-- Player dossier: the player page gets its own "Dossier" tab. Individual
-- development evaluations are shared with the club dossier (same rows,
-- linked by player_id); these extra categories only live on the player.
alter table public.team_dossier_files
  drop constraint team_dossier_files_category_check;

alter table public.team_dossier_files
  add constraint team_dossier_files_category_check check (
    category in (
      'monthly_plan', 'individual_eval', 'collective_eval', 'training_unit',
      'individual_plan', 'medical_report', 'player_other'
    )
  );

alter table public.team_dossier_files
  drop constraint team_dossier_files_player_only_for_individual;

-- Player-only categories always belong to a player; club-wide ones never do.
alter table public.team_dossier_files
  add constraint team_dossier_files_player_category check (
    case
      when category in ('individual_plan', 'medical_report', 'player_other') then player_id is not null
      when category = 'individual_eval' then true
      else player_id is null
    end
  );
