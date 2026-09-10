-- Public pages persist Storage public URLs in public.media. Anonymous visitors
-- therefore require these specific buckets to be public; all writes still go
-- through the server with the service-role key. Existing bucket configuration
-- is never rewritten here. Unexpected private/restrictive configuration fails
-- the migration explicitly so an operator can review it instead of silently
-- weakening production security.
do $storage_preconditions$
declare
  bucket_row storage.buckets%rowtype;
  required_mime_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
begin
  for bucket_row in
    select *
    from storage.buckets
    where id in ('site-media', 'product-images', 'blog-images')
  loop
    if bucket_row.public is distinct from true then
      raise exception using
        errcode = '55000',
        message = 'drevito_storage_bucket_requires_operator_review',
        detail = format('Bucket %s already exists and is private; migration left it unchanged.', bucket_row.id);
    end if;

    if bucket_row.file_size_limit is not null and bucket_row.file_size_limit < 3000000 then
      raise exception using
        errcode = '55000',
        message = 'drevito_storage_bucket_requires_operator_review',
        detail = format('Bucket %s has a file limit below the application 3 MB output target; migration left it unchanged.', bucket_row.id);
    end if;

    if bucket_row.allowed_mime_types is not null
       and not (required_mime_types <@ bucket_row.allowed_mime_types)
    then
      raise exception using
        errcode = '55000',
        message = 'drevito_storage_bucket_requires_operator_review',
        detail = format('Bucket %s does not allow every image type supported by the admin; migration left it unchanged.', bucket_row.id);
    end if;
  end loop;
end
$storage_preconditions$;

-- Only missing buckets are created. ON CONFLICT deliberately performs no
-- update, so a pre-existing bucket keeps every security and retention setting.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-media', 'site-media', true, 4000000, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('product-images', 'product-images', true, 4000000, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('blog-images', 'blog-images', true, 4000000, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- The application intentionally supports exactly two levels. This trigger is
-- a persistence-level backstop for both REST/service-role writes and future
-- code paths. Hierarchy-changing statements share one transaction-scoped
-- advisory lock. This is intentionally narrower than a table lock: titles,
-- images, visibility and product links remain concurrent, while INSERTs and
-- parent_id changes are serialized until commit. This validation model relies
-- on READ COMMITTED taking a fresh snapshot after a lock wait; REPEATABLE READ
-- and SERIALIZABLE hierarchy writes are rejected explicitly before the lock or
-- any snapshot-dependent validation. The function mutates no existing category
-- and preserves all product links.
create or replace function public.enforce_product_category_two_levels()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_parent_id uuid;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25000',
      message = 'product_category_hierarchy_requires_read_committed',
      detail = pg_catalog.format(
        'Current transaction isolation is %s; hierarchy writes cannot validate safely against a retained snapshot.',
        pg_catalog.current_setting('transaction_isolation')
      ),
      hint = 'Retry this hierarchy INSERT or parent_id UPDATE in a READ COMMITTED transaction.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('drevito:product-category-hierarchy', 0)
  );

  if new.parent_id is null then return new; end if;

  if new.parent_id = new.id then
    raise exception using errcode = '23514', message = 'product_category_cannot_parent_itself';
  end if;

  select parent_id
  into parent_parent_id
  from public.product_categories
  where id = new.parent_id;

  if not found then
    raise exception using errcode = '23503', message = 'product_category_parent_not_found';
  end if;

  if parent_parent_id is not null then
    raise exception using errcode = '23514', message = 'product_category_max_depth_two';
  end if;

  if exists (
    select 1
    from public.product_categories child
    where child.parent_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'product_category_with_children_cannot_be_reparented';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_product_category_two_levels()
from public, anon, authenticated;

drop trigger if exists enforce_product_category_two_levels on public.product_categories;
create trigger enforce_product_category_two_levels
before insert or update of parent_id on public.product_categories
for each row execute function public.enforce_product_category_two_levels();

comment on function public.enforce_product_category_two_levels()
is 'Allows hierarchy writes only under READ COMMITTED, serializes them transaction-wide, then rejects self-parenting, cycles, depth greater than two, and reparenting a category that still owns children.';

-- Apply only the two confirmed copy corrections. The guard setting is local to
-- this transaction and is enabled in the same DO statement as the UPDATE, so
-- protect_homepage_layout_content remains fully active before and after it.
-- Draft and published rows are rebuilt independently; every other block, field
-- and ordering choice is retained byte-for-byte at the JSON value level.
do $homepage_copy_repair$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homepage-layout:cs', 0)
  );
  perform pg_catalog.set_config('drevito.homepage_layout_write', 'on', true);

  with rebuilt_layouts as (
    select
      content.id,
      pg_catalog.jsonb_set(
        content.value,
        '{blocks}',
        coalesce((
          select pg_catalog.jsonb_agg(
            case
              when block ->> 'id' = 'hero' then
                pg_catalog.jsonb_set(
                  pg_catalog.jsonb_set(
                    block,
                    '{content,title}',
                    pg_catalog.to_jsonb('Dřevito – když se umění snoubí s citem k přirozenosti'::text),
                    true
                  ),
                  '{content,eyebrow}',
                  '""'::jsonb,
                  true
                )
              when block ->> 'id' = 'author' then
                pg_catalog.jsonb_set(
                  block,
                  '{content,title}',
                  pg_catalog.to_jsonb('Příběh za značkou – Vít Thorio, tvůrce Dřevito'::text),
                  true
                )
              else block
            end
            order by ordinal
          )
          from pg_catalog.jsonb_array_elements(content.value -> 'blocks')
            with ordinality as items(block, ordinal)
        ), '[]'::jsonb),
        true
      ) as value
    from public.site_content content
    where content.locale = 'cs'
      and content.content_key in ('homepage.layout', 'homepage.layout.draft')
      and pg_catalog.jsonb_typeof(content.value -> 'blocks') = 'array'
  )
  update public.site_content content
  set value = rebuilt.value
  from rebuilt_layouts rebuilt
  where content.id = rebuilt.id
    and content.value is distinct from rebuilt.value;
end
$homepage_copy_repair$;

-- Deliberately no product INSERT/UPDATE and no product_category_links write:
-- absent, renamed, deleted, or recategorized client content cannot be safely
-- identified as a legacy record from the current schema alone.
