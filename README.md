## Subscription API

A simple API for managing subscriptions, built with Node.js, Express, and SQLite.

### How to run it

npm install
npm start

The server will start on port 3000.

### How to run the tests

npm test

### Endpoints

#### 1. Create a subscription
curl -X POST http://localhost:3000/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user_123"}'

#### 2. Get subscription details
curl http://localhost:3000/subscriptions/:id

#### 3. Cancel a subscription
curl -X POST http://localhost:3000/subscriptions/:id/cancel

#### 4. Billing webhook (when a payment is processed)
curl -X POST http://localhost:3000/webhooks/billing \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_abc123",
    "subscription_id": "sub_id_here",
    "event_type": "payment.succeeded",
    "timestamp": "2026-06-05T14:00:01Z",
    "amount": 9.99
  }'
*Note: `event_type` can be `payment.succeeded` or `payment.failed`.*

#### 5. Get subscription history
curl http://localhost:3000/subscriptions/:id/history