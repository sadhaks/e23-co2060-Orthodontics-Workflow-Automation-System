# OrthoFlow Frontend

React + Vite frontend for the current Orthodontics Workflow Automation System.

## Run Locally

```bash
cd Frontend
npm install
cp .env.example .env
npm run dev
```

Default URL:

- `http://localhost:5173`

## Environment

Set in `Frontend/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

## Backend Dependency

The frontend currently expects the backend API at `http://localhost:3000`.

That base URL is hardcoded in:

- `Frontend/src/app/config/api.ts`

Run backend in parallel:

```bash
cd ../Backend
npm run dev
```

## Current Functional Coverage

- email/password login
- Google login button and Google auth flow
- role-aware navigation and route gating
- dashboard with refresh behavior
- patient directory filters and assignment workflows
- patient profile tabs for overview, visits, history, dental chart, documents, diagnosis, and treatment notes
- clinic queue
- student cases
- materials/inventory workflows
- request approvals for clinician assignment changes
- admin reports and audit-log pages
- settings password change flow

## Build

```bash
npm run build
```

## Current Routes

- `/`
- `/login`
- `/patients`
- `/patients/:id`
- `/queue`
- `/cases`
- `/reports`
- `/materials`
- `/requests/approvals`
- `/settings`
- `/admin/users`
- `/admin/audit-logs`

## UI Notes

Current UI patterns emphasize:

- visible feedback for refresh, submit, and download actions
- explicit restricted-access messaging where the UX requires visibility without edit rights
- role-aware navigation instead of exposing unusable pages
