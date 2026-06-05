const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

router.post('/billing', (req, res) => {
  const { event_id, subscription_id, event_type, timestamp, amount } = req.body;

  if (!event_id || !subscription_id || !event_type) {
    return res.status(400).json({ error: 'event_id, subscription_id and event_type are required' });
  }

  const seen = db.prepare('SELECT event_id FROM processed_events WHERE event_id = ?').get(event_id);
  if (seen) {
    return res.status(200).json({ message: 'already processed' });
  }

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscription_id);
  if (!sub) {
    return res.status(404).json({ error: 'subscription not found' });
  }

  const now = Date.now();
  const prevStatus = sub.status;
  let newStatus = null;
  let graceEndsAt = undefined;

  if (event_type === 'payment.succeeded') {
    if (sub.status === 'trialing' || sub.status === 'grace') {
      newStatus = 'active';
      graceEndsAt = null;
    }
  } else if (event_type === 'payment.failed') {
    if (sub.status === 'trialing' || sub.status === 'active') {
      newStatus = 'grace';
      graceEndsAt = now + GRACE_MS;
    }
  } else {
    return res.status(400).json({ error: 'unknown event_type' });
  }

  const process = db.transaction(() => {
    if (newStatus) {
      if (newStatus === 'active') {
        db.prepare(`
          UPDATE subscriptions SET status = 'active', grace_ends_at = NULL, updated_at = ? WHERE id = ?
        `).run(now, subscription_id);
      } else if (newStatus === 'grace') {
        db.prepare(`
          UPDATE subscriptions SET status = 'grace', grace_ends_at = ?, updated_at = ? WHERE id = ?
        `).run(graceEndsAt, now, subscription_id);
      }

      db.prepare(`
        INSERT INTO subscription_history (id, subscription_id, event_type, from_status, to_status, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), subscription_id, event_type, prevStatus, newStatus, JSON.stringify({ amount, timestamp }), now);
    } else {
      db.prepare(`
        INSERT INTO subscription_history (id, subscription_id, event_type, from_status, to_status, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), subscription_id, event_type, prevStatus, prevStatus, JSON.stringify({ amount, timestamp, note: 'no state change' }), now);
    }

    db.prepare('INSERT INTO processed_events (event_id, processed_at) VALUES (?, ?)').run(event_id, now);
  });

  process();

  const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscription_id);
  return res.json(updated);
});

module.exports = router;