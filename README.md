# OrthoFlow

OrthoFlow is a web-based orthodontics workflow automation system for a teaching hospital or dental clinic environment. It supports patient registration, appointment/visit tracking, clinic queue management, dental charting, document uploads, treatment notes, payments, materials/inventory, supervised student case tracking, reports, and audit logs.

The system is split into:

- `codes/Frontend` - React/Vite web application.
- `codes/Backend` - Node.js/Express API server.
- MySQL database - structured clinical, user, audit, and workflow records.
- Cloudflare R2 or S3-compatible object storage - uploaded patient documents/images.
- SMTP provider - administrator-generated temporary-password and appointment-reminder emails.

## Current Production Architecture

The current cloud deployment pattern is:

- Frontend: Render Static Site.
- Backend: Render Web Service using Docker.
- Database: Aiven MySQL with SSL enabled.
- File storage: Cloudflare R2 using S3-compatible credentials.
- Email: SMTP2GO or Brevo through SMTP environment variables.
- Google Sign-In: Google OAuth Client ID configured in both frontend and backend.

The backend Docker deployment is important because dental chart PDF generation uses Playwright/Chromium. The Docker image includes the browser dependencies needed for consistent PDF rendering in the cloud.

## Documentation

Start here:

- [Accounts, Sign-In, and Access](docs/accounts-and-access.md)
- [Complete Feature Guide](docs/feature-guide.md)
- [Role and End-to-End Workflows](docs/role-workflows.md)
- [Status and Lifecycle Reference](docs/status-and-lifecycle-reference.md)
- [Roles and Permissions](docs/roles-and-permissions.md)
- [System Overview](docs/system-overview.md)
- [Architecture](docs/architecture.md)
- [Local Development](docs/local-development.md)
- [Cloud Deployment](docs/cloud-deployment.md)
- [Environment Variables](docs/environment-variables.md)
- [Data Storage](docs/data-storage.md)
- [Operations and Maintenance](docs/operations-maintenance.md)
- [Troubleshooting](docs/troubleshooting.md)

Detailed deployment notes are also available in [Production Deployment Runbook](codes/PRODUCTION_DEPLOYMENT_RUNBOOK.md).

## Quick Local Start

Backend:

```bash
cd codes/Backend
npm install
npm run bootstrap-db
npm run ensure-admin
npm run dev
```

Frontend:

```bash
cd codes/Frontend
npm install
npm run dev
```

For local development, create `.env` files manually in `codes/Backend` and `codes/Frontend`. See [Environment Variables](docs/environment-variables.md).

## Maintenance Workflow

For future maintainers:

1. Fork the parent repository, normally from the `cepdnaclk` organization repository.
2. Make changes in the fork.
3. Test locally.
4. Push the latest commit to the fork.
5. Deploy the selected branch/commit through Render.

For routine maintenance steps, see [Operations and Maintenance](docs/operations-maintenance.md).

## Team

- E/23/182, R.K. Kulasooriya, [email](mailto:e23182@eng.pdn.ac.lk)
- E/23/292, K.S. Rambukkanage, [email](mailto:e23292@eng.pdn.ac.lk)
- E/23/299, R.D.K.D. Ranasinghe, [email](mailto:e23299@eng.pdn.ac.lk)
- E/23/302, T.G.D. Randeep, [email](mailto:e23302@eng.pdn.ac.lk)

## Supervisors

- Dr. Asitha Bandaranayake - [asithab@eng.pdn.ac.lk](mailto:asithab@eng.pdn.ac.lk)
- Dr. H.S.K. Ratnatilake - [ksandamala2002@dental.pdn.ac.lk](mailto:ksandamala2002@dental.pdn.ac.lk)
- Dr. D.D. Vithanachchi - [dinakad@dental.pdn.ac.lk](mailto:dinakad@dental.pdn.ac.lk)

## Links

- [Project Repository](https://github.com/cepdnaclk/e23-co2060-Orthodontics-Workflow-Automation-System)
- [Project Page](https://cepdnaclk.github.io/e23-co2060-Orthodontics-Workflow-Automation-System)
- [Department of Computer Engineering](http://www.ce.pdn.ac.lk/)
- [University of Peradeniya](https://eng.pdn.ac.lk/)
