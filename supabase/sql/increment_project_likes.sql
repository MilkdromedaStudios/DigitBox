-- Run in Supabase SQL editor
create or replace function public.increment_project_likes(project_id_input bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_likes integer;
begin
  update public.projects
  set likes = coalesce(likes, 0) + 1
  where id = project_id_input
  returning likes into updated_likes;

  if updated_likes is null then
    raise exception 'Project with id % not found', project_id_input;
  end if;

  return updated_likes;
end;
$$;
