-- Run after `supabase db reset` with:
--   supabase test db supabase/tests/repair_cms_public_data_flow.sql
-- Every fixture is rolled back. This is the real PostgreSQL/trigger validation
-- for the migration; the Node contract test is not a substitute for this file.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(2);

do $homepage_writer_test$
declare
  fixture_layout jsonb := '{
    "version": 1,
    "blocks": [
      {"id":"hero","kind":"hero","content":{"title":"Old hero","eyebrow":"Old eyebrow","body":"Keep hero body","custom":"keep hero custom"}},
      {"id":"author","kind":"author","content":{"title":"Old author","body":"Keep author body"}},
      {"id":"story-fixture","kind":"story","content":{"title":"Keep story","body":"Keep entire custom block"}}
    ],
    "custom_root_value": "keep root"
  }'::jsonb;
  direct_write_rejected boolean := false;
  row_value jsonb;
  row_key text;
begin
  perform pg_catalog.set_config('drevito.homepage_layout_write', 'on', true);
  insert into public.site_content (content_key, locale, section, label, content_type, value, status, sort_order, published_at)
  values
    ('homepage.layout', 'zz-test', 'homepage', 'Published fixture', 'json', fixture_layout, 'published', 0, now()),
    ('homepage.layout.draft', 'zz-test', 'homepage', 'Draft fixture', 'json', fixture_layout, 'draft', 1, null);

  perform pg_catalog.set_config('drevito.homepage_layout_write', 'off', true);
  begin
    update public.site_content
    set value = value
    where locale = 'zz-test' and content_key = 'homepage.layout';
  exception when sqlstate '42501' then
    direct_write_rejected := true;
  end;
  if not direct_write_rejected then raise exception 'Homepage writer trigger did not reject an unguarded update'; end if;

  perform pg_catalog.set_config('drevito.homepage_layout_write', 'on', true);
  with rebuilt_layouts as (
    select
      content.id,
      pg_catalog.jsonb_set(
        content.value,
        '{blocks}',
        (select pg_catalog.jsonb_agg(
          case
            when block ->> 'id' = 'hero' then
              pg_catalog.jsonb_set(pg_catalog.jsonb_set(block, '{content,title}', pg_catalog.to_jsonb('Dřevito – když se umění snoubí s citem k přirozenosti'::text), true), '{content,eyebrow}', '""'::jsonb, true)
            when block ->> 'id' = 'author' then
              pg_catalog.jsonb_set(block, '{content,title}', pg_catalog.to_jsonb('Příběh za značkou – Vít Thorio, tvůrce Dřevito'::text), true)
            else block
          end order by ordinal
        ) from pg_catalog.jsonb_array_elements(content.value -> 'blocks') with ordinality as items(block, ordinal)),
        true
      ) as value
    from public.site_content content
    where content.locale = 'zz-test' and content.content_key in ('homepage.layout', 'homepage.layout.draft')
  )
  update public.site_content content set value = rebuilt.value
  from rebuilt_layouts rebuilt where content.id = rebuilt.id;
  perform pg_catalog.set_config('drevito.homepage_layout_write', 'off', true);

  for row_key, row_value in
    select content_key, value from public.site_content where locale = 'zz-test'
  loop
    if row_value #>> '{blocks,0,content,title}' <> 'Dřevito – když se umění snoubí s citem k přirozenosti' then raise exception '% hero was not repaired', row_key; end if;
    if row_value #>> '{blocks,0,content,eyebrow}' <> '' then raise exception '% hero eyebrow was not removed', row_key; end if;
    if row_value #>> '{blocks,0,content,body}' <> 'Keep hero body' then raise exception '% hero body changed', row_key; end if;
    if row_value #>> '{blocks,0,content,custom}' <> 'keep hero custom' then raise exception '% custom hero field changed', row_key; end if;
    if row_value #>> '{blocks,1,content,title}' <> 'Příběh za značkou – Vít Thorio, tvůrce Dřevito' then raise exception '% author was not repaired', row_key; end if;
    if row_value #>> '{blocks,1,content,body}' <> 'Keep author body' then raise exception '% author body changed', row_key; end if;
    if row_value #>> '{blocks,2,content,body}' <> 'Keep entire custom block' then raise exception '% custom block changed', row_key; end if;
    if row_value ->> 'custom_root_value' <> 'keep root' then raise exception '% custom root value changed', row_key; end if;
  end loop;
end
$homepage_writer_test$;
select extensions.pass('protected homepage rows accept only an intentional guarded repair and preserve unrelated JSON');

do $category_hierarchy_test$
declare
  root_a uuid := 'a1000000-0000-4000-8000-000000000001';
  root_b uuid := 'a1000000-0000-4000-8000-000000000002';
  child_a uuid := 'a1000000-0000-4000-8000-000000000003';
  grandchild uuid := 'a1000000-0000-4000-8000-000000000004';
  rejected boolean;
begin
  insert into public.product_categories (id, title, slug, parent_id)
  values
    (root_a, 'Test root A', 'test-root-a', null),
    (root_b, 'Test root B', 'test-root-b', null),
    (child_a, 'Test child A', 'test-child-a', root_a);

  rejected := false;
  begin
    insert into public.product_categories (id, title, slug, parent_id)
    values (grandchild, 'Test grandchild', 'test-grandchild', child_a);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Third-level category was accepted'; end if;

  rejected := false;
  begin
    update public.product_categories set parent_id = root_b where id = root_a;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Parent with children was reparented'; end if;

  rejected := false;
  begin
    update public.product_categories set parent_id = child_a where id = child_a;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Self-parenting was accepted'; end if;

  update public.product_categories set parent_id = null where id = child_a;
  if (select parent_id from public.product_categories where id = child_a) is not null then raise exception 'Child could not be promoted to root'; end if;
end
$category_hierarchy_test$;
select extensions.pass('category hierarchy trigger enforces the supported two-level model');

select * from extensions.finish();
rollback;
