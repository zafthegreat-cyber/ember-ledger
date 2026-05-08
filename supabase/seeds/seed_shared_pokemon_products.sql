-- Shared Pokemon sealed product starter catalog.
-- Safe to run more than once.
-- Add UPCs/source links only when verified from a public, stable source.

insert into public.pokemon_products (
  product_name,
  set_name,
  product_type,
  era,
  release_year,
  msrp,
  upc,
  active,
  source
) values
  ('Scarlet & Violet Elite Trainer Box', 'Scarlet & Violet Base Set', 'Elite Trainer Box', 'Scarlet & Violet', 2023, 49.99, null, true, 'manual starter seed'),
  ('Scarlet & Violet Booster Bundle', 'Scarlet & Violet Base Set', 'Booster Bundle', 'Scarlet & Violet', 2023, 26.94, null, true, 'manual starter seed'),
  ('Paldea Evolved Elite Trainer Box', 'Paldea Evolved', 'Elite Trainer Box', 'Scarlet & Violet', 2023, 49.99, null, true, 'manual starter seed'),
  ('Paldea Evolved Booster Bundle', 'Paldea Evolved', 'Booster Bundle', 'Scarlet & Violet', 2023, 26.94, null, true, 'manual starter seed'),
  ('Obsidian Flames Elite Trainer Box', 'Obsidian Flames', 'Elite Trainer Box', 'Scarlet & Violet', 2023, 49.99, null, true, 'manual starter seed'),
  ('Obsidian Flames Booster Bundle', 'Obsidian Flames', 'Booster Bundle', 'Scarlet & Violet', 2023, 26.94, null, true, 'manual starter seed'),
  ('151 Elite Trainer Box', 'Scarlet & Violet 151', 'Elite Trainer Box', 'Scarlet & Violet', 2023, 49.99, null, true, 'manual starter seed'),
  ('151 Booster Bundle', 'Scarlet & Violet 151', 'Booster Bundle', 'Scarlet & Violet', 2023, 26.94, null, true, 'manual starter seed'),
  ('151 Ultra-Premium Collection', 'Scarlet & Violet 151', 'Ultra Premium Collection', 'Scarlet & Violet', 2023, 119.99, null, true, 'manual starter seed'),
  ('Paradox Rift Elite Trainer Box', 'Paradox Rift', 'Elite Trainer Box', 'Scarlet & Violet', 2023, 49.99, null, true, 'manual starter seed'),
  ('Paradox Rift Booster Bundle', 'Paradox Rift', 'Booster Bundle', 'Scarlet & Violet', 2023, 26.94, null, true, 'manual starter seed'),
  ('Paldean Fates Elite Trainer Box', 'Paldean Fates', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Paldean Fates Tech Sticker Collection', 'Paldean Fates', 'Collection Box', 'Scarlet & Violet', 2024, 14.99, null, true, 'manual starter seed'),
  ('Temporal Forces Elite Trainer Box', 'Temporal Forces', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Temporal Forces Booster Bundle', 'Temporal Forces', 'Booster Bundle', 'Scarlet & Violet', 2024, 26.94, null, true, 'manual starter seed'),
  ('Twilight Masquerade Elite Trainer Box', 'Twilight Masquerade', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Twilight Masquerade Booster Bundle', 'Twilight Masquerade', 'Booster Bundle', 'Scarlet & Violet', 2024, 26.94, null, true, 'manual starter seed'),
  ('Shrouded Fable Elite Trainer Box', 'Shrouded Fable', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Stellar Crown Elite Trainer Box', 'Stellar Crown', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Stellar Crown Booster Bundle', 'Stellar Crown', 'Booster Bundle', 'Scarlet & Violet', 2024, 26.94, null, true, 'manual starter seed'),
  ('Surging Sparks Elite Trainer Box', 'Surging Sparks', 'Elite Trainer Box', 'Scarlet & Violet', 2024, 49.99, null, true, 'manual starter seed'),
  ('Surging Sparks Booster Bundle', 'Surging Sparks', 'Booster Bundle', 'Scarlet & Violet', 2024, 26.94, null, true, 'manual starter seed'),
  ('Prismatic Evolutions Elite Trainer Box', 'Prismatic Evolutions', 'Elite Trainer Box', 'Scarlet & Violet', 2025, 49.99, null, true, 'manual starter seed'),
  ('Prismatic Evolutions Booster Bundle', 'Prismatic Evolutions', 'Booster Bundle', 'Scarlet & Violet', 2025, 26.94, null, true, 'manual starter seed'),
  ('Sleeved Booster Pack', 'Any Standard Set', 'Sleeved Booster Pack', 'Scarlet & Violet', null, 4.99, null, true, 'manual starter seed'),
  ('3-Pack Blister', 'Any Standard Set', '3-Pack Blister', 'Scarlet & Violet', null, 13.99, null, true, 'manual starter seed'),
  ('Checklane Blister', 'Any Standard Set', 'Checklane Blister', 'Scarlet & Violet', null, 5.99, null, true, 'manual starter seed'),
  ('Mini Tin', 'Any Standard Set', 'Mini Tin', 'Scarlet & Violet', null, 9.99, null, true, 'manual starter seed'),
  ('Pokemon ex Box', 'Assorted', 'ex Box', 'Scarlet & Violet', null, 19.99, null, true, 'manual starter seed'),
  ('Premium Collection Box', 'Assorted', 'Premium Collection Box', 'Scarlet & Violet', null, 39.99, null, true, 'manual starter seed'),
  ('Collector Chest', 'Assorted', 'Collection Box', 'Scarlet & Violet', null, 29.99, null, true, 'manual starter seed'),
  ('Tin', 'Assorted', 'Tin', 'Scarlet & Violet', null, 24.99, null, true, 'manual starter seed'),
  ('Build & Battle Box', 'Any Standard Set', 'Build & Battle Box', 'Scarlet & Violet', null, 19.99, null, true, 'manual starter seed'),
  ('Build & Battle Stadium', 'Any Standard Set', 'Build & Battle Stadium', 'Scarlet & Violet', null, 59.99, null, true, 'manual starter seed')
on conflict (product_name, set_name, product_type)
do update set
  era = excluded.era,
  release_year = excluded.release_year,
  msrp = excluded.msrp,
  active = excluded.active,
  updated_at = now();
