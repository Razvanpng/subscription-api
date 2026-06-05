const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function resolveGraceExpiry(sub) {
  if (sub.status !== 'grace' || !sub.grace_ends_at) return sub;

  const now = Date.now();
  if (now <= sub.grace_ends_at) return sub;

  db.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', now, sub.id);

  db.prepare(`
    INSERT INTO subscription_history (id, subscription_id, event_type, from_status, to_status, metadata, created_at)
    VALUES (?, ?, 'grace_expired', 'grace', 'cancelled', null, ?)
  `).run(uuidv4(), sub.id, now);

  return { ...sub, status: 'cancelled', updated_at: now };
}

router.post('/', (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const now = Date.now();
  const id = uuidv4();
  const trial_ends_at = now + TRIAL_MS;

  db.prepare(`
    INSERT INTO subscriptions (id, user_id, status, trial_ends_at, created_at, updated_at)
    VALUES (?, ?, 'trialing', ?, ?, ?)
  `).run(id, user_id, trial_ends_at, now, now);

  db.prepare(`
    INSERT INTO subscription_history (id, subscription_id, event_type, from_status, to_status, metadata, created_at)
    VALUES (?, ?, 'created', null, 'trialing', null, ?)
  `).run(uuidv4(), id, now);

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  return res.status(201).json(sub);
});

router.get('/:id', (req, res) => {
  let sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);

  if (!sub) {
    return res.status(404).json({ error: 'subscription not found' });
  }

  sub = resolveGraceExpiry(sub);
  return res.json(sub);
});

router.post('/:id/cancel', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);

  if (!sub) {
    return res.status(404).json({ error: 'subscription not found' });
  }

  if (sub.status === 'cancelled') {
    return res.status(409).json({ error: 'subscription is already cancelled' });
  }

  const now = Date.now();
  const prevStatus = sub.status;

  db.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', now, sub.id);

  db.prepare(`
    INSERT INTO subscription_history (id, subscription_id, event_type, from_status, to_status, metadata, created_at)
    VALUES (?, ?, 'user_cancelled', ?, 'cancelled', null, ?)
  `).run(uuidv4(), sub.id, prevStatus, now);

  const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(sub.id);
  return res.json(updated);
});

router.get('/:id/history', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);

  if (!sub) {
    return res.status(404).json({ error: 'subscription not found' });
  }

  const history = db.prepare(`
    SELECT * FROM subscription_history
    WHERE subscription_id = ?
    ORDER BY created_at ASC
  `).all(sub.id);

  return res.json(history);
});

module.exports = router;