-- Price list per organization (used by the on-site quote calculator) and mixed recurring/one-off quote lines.
alter table public.services add column if not exists category text;
alter table public.services add column if not exists unit text not null default 'stk';
alter table public.services add column if not exists unit_price numeric not null default 0;
alter table public.services add column if not exists recurring boolean not null default true;
alter table public.services add column if not exists qty_from_area boolean not null default false;
alter table public.services add column if not exists minutes_per_unit numeric;
alter table public.services add column if not exists position integer not null default 0;
create index if not exists services_org_idx on public.services (org_id, position);

-- null = follow the quote's billing; true = fixed monthly; false = one-off.
alter table public.quote_line_items add column if not exists recurring boolean;

alter table public.quotes add column if not exists source text not null default 'manual' check (source in ('manual', 'onsite'));
alter table public.quotes add column if not exists area_m2 numeric;
alter table public.quotes add column if not exists frequency text;
alter table public.quotes add column if not exists discount_pct numeric not null default 0;
alter table public.quotes add column if not exists location_id uuid references public.locations (id) on delete set null;

-- Example price list for Success Cleaning (prices are examples to be adjusted under Prisliste).
insert into public.services (org_id, name, slug, category, unit, unit_price, recurring, qty_from_area, position, description)
select o.id, s.name, s.slug, s.category, s.unit, s.price, s.recurring, s.area, s.pos, s.descr
from public.organizations o,
(values
  ('Kontorrengøring', 'kontor', 'Fast rengøring', 'm²', 0.90, true, true, 10, 'Støvsugning, gulvvask, aftørring af borde og kontaktflader'),
  ('Køkken / tekøkken', 'koekken', 'Fast rengøring', 'stk', 95, true, false, 20, 'Bordplader, vask, fronter, opvaskemaskine'),
  ('Toiletter', 'toiletter', 'Fast rengøring', 'stk', 65, true, false, 30, 'Toilet, håndvask, spejl, gulv, opfyldning'),
  ('Trappeopgang', 'trappe', 'Fast rengøring', 'etage', 55, true, false, 40, 'Fejning og vask af trapper og reposer'),
  ('Tømning af affald', 'affald', 'Fast rengøring', 'stk', 15, true, false, 50, 'Skraldespande tømmes og poser skiftes'),
  ('Opfyldning af forbrugsvarer', 'forbrug', 'Fast rengøring', 'besøg', 25, true, false, 60, 'Papir, sæbe og poser (varer faktureres efter forbrug)'),
  ('Hovedrengøring', 'hovedrengoering', 'Engangsopgaver', 'm²', 18, false, true, 110, 'Grundig rengøring af alle flader, paneler og inventar'),
  ('Vinduespudsning (ind og ud)', 'vinduer', 'Engangsopgaver', 'fag', 35, false, false, 120, 'Pudsning af vinduer inde og ude'),
  ('Gulvbehandling / polish', 'gulvbehandling', 'Engangsopgaver', 'm²', 28, false, true, 130, 'Afrensning og ny behandling af gulve'),
  ('Tæpperens', 'taepperens', 'Engangsopgaver', 'm²', 22, false, true, 140, 'Dybderens af tæpper'),
  ('Flytterengøring', 'flytterengoering', 'Engangsopgaver', 'm²', 32, false, true, 150, 'Komplet rengøring ved fraflytning'),
  ('Ekstra time', 'ekstra-time', 'Engangsopgaver', 'time', 395, false, false, 160, 'Timepris for opgaver uden for aftalen')
) as s(name, slug, category, unit, price, recurring, area, pos, descr)
where o.slug = 'success-cleaning'
on conflict (org_id, slug) do nothing;
