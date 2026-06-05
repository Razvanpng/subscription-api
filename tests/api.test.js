const request = require('supertest');
const app = require('../src/app');

describe('subscriptions api', () => {
  let subId;

  test('POST /subscriptions creeaza o subscriptie in trialing', async () => {
    const res = await request(app)
      .post('/subscriptions')
      .send({ user_id: 'user_1' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('trialing');
    expect(res.body.trial_ends_at).toBeGreaterThan(Date.now());
    subId = res.body.id;
  });

  test('GET /subscriptions/:id returneaza subscriptia', async () => {
    const res = await request(app).get(`/subscriptions/${subId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(subId);
  });

  test('GET /subscriptions/:id returneaza 404 pentru id inexistent', async () => {
    const res = await request(app).get('/subscriptions/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('POST /subscriptions fara user_id returneaza 400', async () => {
    const res = await request(app).post('/subscriptions').send({});
    expect(res.status).toBe(400);
  });

  test('payment.succeeded pe trialing -> active', async () => {
    const res = await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_1',
        subscription_id: subId,
        event_type: 'payment.succeeded',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  test('payment.failed pe active -> grace', async () => {
    const res = await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_2',
        subscription_id: subId,
        event_type: 'payment.failed',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('grace');
    expect(res.body.grace_ends_at).toBeGreaterThan(Date.now());
  });

  test('payment.succeeded pe grace -> active', async () => {
    const res = await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_3',
        subscription_id: subId,
        event_type: 'payment.succeeded',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.grace_ends_at).toBeNull();
  });

  test('webhook duplicat cu acelasi event_id e idempotent', async () => {
    const payload = {
      event_id: 'evt_dupe',
      subscription_id: subId,
      event_type: 'payment.failed',
      timestamp: new Date().toISOString(),
      amount: 9.99
    };

    const first = await request(app).post('/webhooks/billing').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('grace');

    const second = await request(app).post('/webhooks/billing').send(payload);
    expect(second.status).toBe(200);
    expect(second.body.message).toBe('already processed');

    const sub = await request(app).get(`/subscriptions/${subId}`);
    expect(sub.body.status).toBe('grace');
  });

  test('cancel muta subscriptia in cancelled', async () => {
    await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_reactivate',
        subscription_id: subId,
        event_type: 'payment.succeeded',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    const res = await request(app).post(`/subscriptions/${subId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  test('a doua cerere de cancel returneaza 409', async () => {
    const res = await request(app).post(`/subscriptions/${subId}/cancel`);
    expect(res.status).toBe(409);
  });

  test('payment.succeeded pe cancelled nu schimba starea', async () => {
    await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_after_cancel',
        subscription_id: subId,
        event_type: 'payment.succeeded',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    const sub = await request(app).get(`/subscriptions/${subId}`);
    expect(sub.body.status).toBe('cancelled');
  });

  test('scenariul cancel-inainte-de-webhook: starea ramane cancelled', async () => {
    const create = await request(app)
      .post('/subscriptions')
      .send({ user_id: 'user_scenario' });
    const id = create.body.id;

    await request(app).post(`/subscriptions/${id}/cancel`);

    await request(app)
      .post('/webhooks/billing')
      .send({
        event_id: 'evt_late_webhook',
        subscription_id: id,
        event_type: 'payment.succeeded',
        timestamp: new Date().toISOString(),
        amount: 9.99
      });

    const sub = await request(app).get(`/subscriptions/${id}`);
    expect(sub.body.status).toBe('cancelled');
  });

  test('GET /subscriptions/:id/history returneaza istoricul ordonat', async () => {
    const create = await request(app)
      .post('/subscriptions')
      .send({ user_id: 'user_hist' });
    const id = create.body.id;

    const res = await request(app).get(`/subscriptions/${id}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].event_type).toBe('created');
    expect(res.body[0].to_status).toBe('trialing');
  });
});