-- When the user last asked for new screenshots by hand. Browser time is shared by everyone.
ALTER TABLE users ADD COLUMN screenshots_requested_at TEXT;
