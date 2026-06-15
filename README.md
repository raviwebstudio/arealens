# AreaLens Backend API

AI-Powered Real Estate Area Calculator — Node.js + Express + PostgreSQL

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your keys
3. Run schema in Supabase SQL Editor: `src/db/schema.sql`
4. Start dev server: `npm run dev`

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `GET /api/auth/profile` — Get profile (auth required)
- `PUT /api/auth/profile` — Update profile (auth required)

### Scans
- `POST /api/scans/upload` — Upload floor plan + AI scan (auth required)
- `GET /api/scans` — Get all scans (auth required)
- `GET /api/scans/:id` — Get single scan (auth required)
- `DELETE /api/scans/:id` — Delete scan (auth required)

### Calculations
- `POST /api/calculations` — Calculate + save (auth required)
- `POST /api/calculations/quick` — Quick calculate (no auth)

### Payments
- `GET /api/payments/plans` — Get all plans
- `POST /api/payments/order` — Create Razorpay order (auth required)
- `POST /api/payments/subscription` — Create subscription (auth required)
- `POST /api/payments/verify` — Verify payment (auth required)
- `POST /api/payments/webhook` — Razorpay webhook

## Keys Required
- Supabase: DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY
- Claude API: ANTHROPIC_API_KEY
- Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
