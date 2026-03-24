INSERT INTO cities (slug, name, country_code)
VALUES
  ('london', 'London', 'GB'),
  ('manchester', 'Manchester', 'GB'),
  ('istanbul', 'Istanbul', 'TR')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pet_species (slug, label)
VALUES
  ('dog', 'Dog'),
  ('cat', 'Cat'),
  ('rabbit', 'Rabbit')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO hobbies (slug, label)
VALUES
  ('fetch', 'Fetch'),
  ('walks', 'Walks'),
  ('sun-naps', 'Sun naps')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_tags (slug, label)
VALUES
  ('children', 'Children'),
  ('dogs', 'Dogs'),
  ('cats', 'Cats')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO breeds (species_id, slug, label)
SELECT id, 'golden-retriever', 'Golden Retriever'
FROM pet_species
WHERE slug = 'dog'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO breeds (species_id, slug, label)
SELECT id, 'corgi', 'Corgi'
FROM pet_species
WHERE slug = 'dog'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO breeds (species_id, slug, label)
SELECT id, 'british-shorthair', 'British Shorthair'
FROM pet_species
WHERE slug = 'cat'
ON CONFLICT (slug) DO NOTHING;

