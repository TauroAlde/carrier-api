# Carrier API

REST API that serves delivery performance stats per shipping carrier. It powers the [Carrier Dashboard](https://github.com/TauroAlde/carrier-dashboard).

Stats are computed on the fly from a `shipments` table with a single SQL aggregate query, so they always match the underlying data.

## Tech stack

- **Node.js + TypeScript** with **Express 5**
- **PostgreSQL** through `pg`, with plain SQL migrations
- **Jest + Supertest** for unit, HTTP and database integration tests
- **GitHub Actions** CI that runs the tests against a Postgres container

## Getting started

Requires Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env

# A dedicated role keeps this project separate from other local databases
sudo -u postgres psql -c "CREATE ROLE carrier LOGIN PASSWORD 'carrier' CREATEDB;"
createdb -h localhost -U carrier carrier_api_dev    # password: carrier
createdb -h localhost -U carrier carrier_api_test

npm run db:migrate            # create the tables
npm run db:seed               # load sample shipments
npm run dev                   # http://localhost:3000
```

## Endpoints

### `GET /stats/carriers`

Returns carriers sorted by `performance_score`, best first.

```json
[
  {
    "carrier": "dhl",
    "success_rate": 0.99,
    "avg_days": 1.8,
    "total_shipments": 113,
    "deliveries": 112,
    "failures": 1,
    "performance_score": 0.86,
    "status": "excellent"
  }
]
```

| Field               | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `success_rate`      | Delivered / (delivered + failed). In-transit shipments are excluded.    |
| `avg_days`          | Average days from shipping to delivery, `null` if nothing was delivered |
| `performance_score` | `success_rate × 0.7 + speed × 0.3`, where speed is `1 / avg_days` capped at 1 |
| `status`            | `excellent` (≥ 95%), `good` (≥ 85%), `warning` (≥ 70%), `bad`, or `unknown` (no data) |

### `GET /health`

Returns `{ "status": "ok" }`.

## Scripts

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the server with auto-reload            |
| `npm test`           | Run all tests (needs `TEST_DATABASE_URL`)    |
| `npm run typecheck`  | Type-check without emitting files            |
| `npm run build`      | Compile to `dist/`                           |
| `npm start`          | Run the compiled server                      |
| `npm run db:migrate` | Apply pending SQL migrations                 |
| `npm run db:seed`    | Replace all shipments with sample data       |

## Project structure

```
db/migrations/        # Plain SQL migrations, applied in filename order
src/
├── app.ts            # Express app built from injected dependencies
├── server.ts         # Wires the real database and starts listening
├── config.ts         # Environment variables
├── db/               # Connection pool, migration runner and seed
└── stats/
    ├── carrierStats.ts            # Pure business rules (score, status)
    └── carrierStatsRepository.ts  # The SQL aggregate query
```

### Design notes

- **Business rules are pure functions**, so they are unit tested without a database.
- **The app receives its repository as a dependency**, so HTTP tests use an in-memory fake while the SQL is covered by separate integration tests against a real Postgres.
- **The database enforces data integrity** with `CHECK` constraints (e.g. a delivered shipment must have a delivery date).
- **CORS only allows configured origins** (`CORS_ORIGIN`).
