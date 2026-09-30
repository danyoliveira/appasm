-- Perfil → Utilização: how much of the database and of file storage the
-- platform is using. Sizes live in system catalogs and in the storage
-- schema, neither of which is reachable through the API, so this function
-- reads them on the coach's behalf (security definer) and returns one JSON:
--   database_bytes  total size of the database
--   tables          every public table with its size and (estimated) rows
--   storage         every bucket with its number of files and total size
create or replace function public.platform_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_coach() then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'tables', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc), '[]'::jsonb)
      from (
        select
          c.relname as name,
          pg_total_relation_size(c.oid) as bytes,
          greatest(coalesce(s.n_live_tup, 0), 0) as rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public' and c.relkind = 'r'
      ) t
    ),
    'storage', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.bytes desc), '[]'::jsonb)
      from (
        select
          bucket_id as bucket,
          count(*) as files,
          coalesce(sum((metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects
        group by bucket_id
      ) b
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.platform_usage() from public;
grant execute on function public.platform_usage() to authenticated;
