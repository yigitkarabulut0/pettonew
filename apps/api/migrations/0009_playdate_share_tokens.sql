-- Per-playdate share token. Lets a host send a WhatsApp/SMS link that grants
-- access to a private playdate: the invitee taps the URL, the app POSTs the
-- token to /v1/playdates/{id}/claim-share/{token}, and the server upserts a
-- pending `playdate_invites` row so the visibility gate in
-- GetPlaydateForUser lets the user load the detail screen and join.
--
-- Existing rows are backfilled by the DEFAULT clause — no separate UPDATE
-- needed.

ALTER TABLE playdates
  ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL
  DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS idx_playdates_share_token
  ON playdates(share_token);
