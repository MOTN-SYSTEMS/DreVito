-- Optional structured dimensions in centimetres. Existing text and rows are retained.
alter table public.products
  add column height_cm numeric check (height_cm > 0 and height_cm < 'Infinity'::numeric),
  add column width_cm numeric check (width_cm > 0 and width_cm < 'Infinity'::numeric),
  add column length_cm numeric check (length_cm > 0 and length_cm < 'Infinity'::numeric);

comment on column public.products.height_cm is 'Výška v centimetrech (nepovinné).';
comment on column public.products.width_cm is 'Šířka v centimetrech (nepovinné).';
comment on column public.products.length_cm is 'Délka v centimetrech (nepovinné).';
