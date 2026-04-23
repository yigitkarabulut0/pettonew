-- Adoption favorites: adopter-side "hearts" on shelter_pets listings.
-- Kept separate from the social-match `favorites` table because targets
-- live in `shelter_pets`, not `pets` — the old table's existence check
-- rejected shelter pet IDs, which surfaced in the app as an optimistic
-- like flashing then reverting ~1s later.

CREATE TABLE IF NOT EXISTS adoption_favorites (
  user_id        TEXT NOT NULL,
  shelter_pet_id TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, shelter_pet_id)
);

CREATE INDEX IF NOT EXISTS idx_adoption_favorites_user
  ON adoption_favorites(user_id);
