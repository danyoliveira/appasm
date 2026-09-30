-- Pending invites are now listed on the Perfil page, where the coach can
-- cancel one that was sent by mistake. Invites only ever had insert/select
-- policies; cancelling flips the coach's own invite to 'revoked'.
create policy "invites: coach cancels own"
  on public.invites for update
  using (invited_by = auth.uid())
  with check (invited_by = auth.uid());
