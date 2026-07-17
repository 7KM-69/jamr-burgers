-- ============================================================================
-- JAMR — seed.sql
-- The 6 products. Run AFTER 0001 / 0002 / 0003.
--
-- Idempotent: re-running updates the existing rows by slug rather than
-- duplicating them or failing. Safe to run on every reset.
--
-- Runs as the `postgres` role (SQL Editor / psql / CLI), which owns these tables
-- and therefore bypasses RLS. There is no INSERT policy or grant on products for
-- anon or authenticated, so this is the ONLY way the menu can change: by migration,
-- never by API call. That is the "nobody-writable" half of the products spec.
--
-- THE SLUGS BELOW ARE AUTHORITATIVE. `design` names the image files from them:
--   slug 'charcoal-smash' -> public/products/charcoal-smash.jpg
--                         -> image_path '/products/charcoal-smash.jpg'
-- A check constraint on products enforces image_path = '/products/' || slug || '.jpg',
-- so a mismatch fails this insert loudly instead of rendering a broken image.
--
-- bun / patty / spice_level are i18n KEYS and a scale, never display copy. `design`
-- maps them in src/i18n/{ar,en}.ts. Rendering them raw would print English words
-- into the Arabic UI. Allowed values are enumerated in CONTRACT.md.
--
-- price_cents is minor currency units (3200 = 32.00). Currency itself is a UI
-- concern and is not stored — see CONTRACT.md §Assumptions.
-- ============================================================================

insert into public.products
  (slug, name_en, name_ar, desc_en, desc_ar,
   price_cents, bun, patty, spice_level, kcal, protein_g, prep_min, image_path, active)
values
  -- 1 --------------------------------------------------------------------------
  ('charcoal-smash',
   'Charcoal Smash',
   'سماش الفحم',
   'Two patties smashed thin on a screaming flat-top. Aged cheddar, burnt onion jam, charcoal bun.',
   'قطعتا لحم مسحوقتان على صاج ملتهب. شيدر معتّق، مربّى بصل محروق، خبز الفحم.',
   3200, 'potato', 'smash_beef', 1, 720, 38, 9,
   '/products/charcoal-smash.jpg', true),

  -- 2 --------------------------------------------------------------------------
  ('double-flame',
   'Double Flame',
   'اللهب المزدوج',
   'Twice the beef, twice the cheese, twice the fire. Order it hungry.',
   'ضعف اللحم، ضعف الجبن، ضعف النار. اطلبه وأنت جائع.',
   4200, 'brioche', 'double_beef', 1, 980, 56, 12,
   '/products/double-flame.jpg', true),

  -- 3 --------------------------------------------------------------------------
  ('firebird',
   'Firebird',
   'طائر النار',
   'Buttermilk chicken, shattered crust, hot honey straight off the heat.',
   'دجاج بالحليب الرائب، قرمشة تتكسّر، عسل حار من قلب اللهب.',
   3600, 'potato', 'crispy_chicken', 2, 810, 42, 11,
   '/products/firebird.jpg', true),

  -- 4 --------------------------------------------------------------------------
  ('cinder-lamb',
   'Cinder Lamb',
   'ضأن الجمر',
   'Lamb over open embers. Harissa, mint yogurt, toasted sesame.',
   'ضأن على الجمر المكشوف. هريسة، لبن بالنعناع، سمسم محمّص.',
   4600, 'sesame', 'lamb', 2, 890, 46, 14,
   '/products/cinder-lamb.jpg', true),

  -- 5 --------------------------------------------------------------------------
  ('inferno',
   'Inferno',
   'جحيم',
   'Ghost pepper, charred jalapeno, chili oil. We warned you once.',
   'فلفل الأشباح، هالبينو محروق، زيت الشطة. حذّرناك مرّة واحدة.',
   3900, 'pretzel', 'beef', 3, 850, 44, 12,
   '/products/inferno.jpg', true),

  -- 6 --------------------------------------------------------------------------
  ('green-ember',
   'Green Ember',
   'الجمر الأخضر',
   'Grilled halloumi and smoked mushroom. No meat, no apology.',
   'حلوم مشوي وفطر مدخّن. بلا لحم، وبلا اعتذار.',
   2900, 'sourdough', 'halloumi_mushroom', 0, 610, 26, 10,
   '/products/green-ember.jpg', true)

on conflict (slug) do update set
  name_en     = excluded.name_en,
  name_ar     = excluded.name_ar,
  desc_en     = excluded.desc_en,
  desc_ar     = excluded.desc_ar,
  price_cents = excluded.price_cents,
  bun         = excluded.bun,
  patty       = excluded.patty,
  spice_level = excluded.spice_level,
  kcal        = excluded.kcal,
  protein_g   = excluded.protein_g,
  prep_min    = excluded.prep_min,
  image_path  = excluded.image_path,
  active      = excluded.active,
  updated_at  = now();
