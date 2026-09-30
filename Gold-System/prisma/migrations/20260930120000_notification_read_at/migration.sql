-- Inbox read state. Delivery status (PENDING/SENT/FAILED) is unchanged.
-- Existing rows are treated as already seen so history is not all unread.

ALTER TABLE notifications ADD COLUMN read_at TIMESTAMPTZ;

UPDATE notifications SET read_at = created_at WHERE read_at IS NULL;

CREATE INDEX notifications_recipient_id_channel_created_at_idx
  ON notifications (recipient_id, channel, created_at);

CREATE INDEX notifications_recipient_id_read_at_idx
  ON notifications (recipient_id, read_at);
