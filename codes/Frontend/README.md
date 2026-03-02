# OrthoFlow Frontend

React + Vite frontend for the Orthodontics Workflow Automation System.

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

Frontend expects backend API at `http://localhost:3000` (configured in frontend API config).

Run backend in parallel:

```bash
cd ../Backend
npm run dev
```

## Current Functional Coverage

- Authentication: email/password + Google login
- Role-aware navigation and restrictions
- Dashboard with refresh controls
- Patient directory and patient profile workflows
- Visits and reminders
- Patient history and expanded orthodontic form
- Dental chart (adult/milk/customized) with chart version saving/downloading
- Documents upload/download/trash workflows
- Diagnosis and treatment plan/notes sections
- Inventory/materials workflows
- Reports and audit log pages

## Build

```bash
npm run build
```

## UI Notes

Recent UX updates include:

- More responsive refresh buttons (dashboard and patient directory)
- More responsive download buttons (documents and dental chart versions)
- Improved placement of dental chart version list under summary cards
- Restriction-message visibility for role-limited sections where required
