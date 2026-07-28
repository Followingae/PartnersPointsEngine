-- refresh_token.user_id is a foreign key to user_account — staff. But customer
-- sign-in stored the person's id in that column, so every customer sign-in
-- failed the constraint and 500'd. Customer auth has never actually worked.
--
-- A refresh token's subject can be a staff user or a customer; the table now
-- says so, with exactly one of the two set.

ALTER TABLE refresh_token ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS person_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_token_person_id_fkey'
  ) THEN
    ALTER TABLE refresh_token
      ADD CONSTRAINT refresh_token_person_id_fkey
      FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_token_subject_check'
  ) THEN
    ALTER TABLE refresh_token
      ADD CONSTRAINT refresh_token_subject_check
      CHECK ((user_id IS NOT NULL) <> (person_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS refresh_token_person_id_idx ON refresh_token (person_id);
