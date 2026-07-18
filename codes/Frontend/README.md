# OrthoFlow Frontend

React and Vite frontend for the Orthodontics Workflow Automation System.

## What the Frontend Provides

The frontend provides the browser interface for:

- login and Google Sign-In
- role-aware navigation with touch-friendly controls for phone and tablet use
- dashboard
- patient directory and patient profile
- visits and reception actions
- dental chart and chart PDF versions
- documents and trash/restore workflows
- diagnosis and treatment notes
- clinic queue
- student cases for students, orthodontist supervisors, dental surgeon supervisors, and admin cleanup
- materials and inventory
- user management, reports, and audit logs for admins

## Stack

- React
- TypeScript
- Vite
- Tailwind-style utility classes
- Lucide icons

## Local Development

From this folder:

```bash
npm install
npm run dev
```

Default local frontend URL:

```text
http://localhost:5173
```

The backend should also be running:

```bash
cd ../Backend
npm run bootstrap-db
npm run ensure-admin
npm run dev
```

## Environment Variables

Create `codes/Frontend/.env` for local development. In Render, set these in the frontend Static Site environment.

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

For Render production:

```env
VITE_API_BASE_URL=https://<backend-service>.onrender.com
VITE_GOOGLE_CLIENT_ID=<google-client-id>
```

If `VITE_API_BASE_URL` is not set, the frontend falls back to `http://localhost:3000`.

## Build

```bash
npm run build
```

The production build is written to:

```text
dist/
```

## Render Static Site Deployment

Recommended settings:

- Root directory: `codes/Frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

After changing `VITE_API_BASE_URL` or `VITE_GOOGLE_CLIENT_ID`, redeploy the frontend because Vite embeds these values at build time.

## Current Routes

- `/login`
- `/`
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

## Role-Aware Areas

- All signed-in users: dashboard, patients, settings
- Admin: reports, user management, audit logs
- Admin: view materials/inventory
- Nurse: view and manage materials/inventory, including stock changes
- Admin, nurse, orthodontist, dental surgeon, student, reception: clinic queue
- Admin, orthodontist, dental surgeon, student: student cases
- Orthodontist and dental surgeon: request approvals

The backend still enforces permissions. Frontend route gating is only the first layer of user experience.

## Common Deployment Checks

If the page is blank after deployment:

1. Open browser developer tools.
2. Check the console for JavaScript errors.
3. Confirm `VITE_API_BASE_URL` points to the backend Render URL.
4. Confirm the backend `CORS_ORIGIN` points to the frontend Render URL.
5. Redeploy the frontend after changing environment variables.
