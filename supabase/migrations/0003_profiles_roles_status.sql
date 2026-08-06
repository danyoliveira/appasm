-- Extra profile fields
alter table public.profiles
  add column phone text,
  add column avatar_url text,
  add column status text not null default 'active' check (status in ('active', 'revoked'));

-- Allow the 'viewer' role alongside 'coach' and 'member'
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('coach', 'member', 'viewer'));

-- Every invite now carries the role it will grant on acceptance
alter table public.invites
  add column role text not null default 'member' check (role in ('member', 'viewer'));

-- The coach manages everyone: reads the full member list, changes roles,
-- revokes/reactivates access. Combines (OR) with the existing "own row"
-- policies, so regular members/viewers are unaffected.
create policy "profiles: coach reads all"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

create policy "profiles: coach updates all"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

-- Carry the invite's intended role into the new profile instead of
-- hardcoding 'member'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  matched_invite public.invites%rowtype;
  is_bootstrap boolean;
begin
  select not exists (select 1 from public.profiles) into is_bootstrap;

  if not is_bootstrap then
    select * into matched_invite
      from public.invites
      where lower(email) = lower(new.email)
        and status = 'pending'
        and expires_at > now()
      order by created_at desc
      limit 1;
  end if;

  if is_bootstrap then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'coach');
  elsif matched_invite.id is not null then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', matched_invite.role);

    update public.invites
      set status = 'accepted', accepted_by = new.id, accepted_at = now()
      where id = matched_invite.id;
  end if;

  return new;
end;
$$;

-- Avatar photos: public read (they're just profile pictures), each user can
-- only write inside their own "<user id>/..." folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
