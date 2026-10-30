# Employee Leave Tracker — Leavewise

Leavewise is a responsive leave management website for employees and HR teams. Employees can request time off, follow decisions, and check their balances. HR administrators can manage employees and departments, review applications, and export reports.

## Features

### Employee

- Register an account and securely sign in.
- View a personal dashboard, leave balances, activity, and request history.
- Apply for casual, sick, earned, maternity, paternity, or unpaid leave.
- Calculate leave duration automatically using inclusive calendar days.
- Attach an optional PDF, PNG, or JPEG supporting document (up to 5 MB).
- Track request status and cancel pending requests.
- Update profile details.

### HR administrator

- View employee and leave-request summaries, recent activity, and reports.
- Approve or decline requests; a reason is required when declining.
- Deduct paid leave balance when a request is approved. Unpaid leave does not reduce a paid balance.
- Manage employee records and leave balances.
- Create, rename, and remove departments.
- Filter requests by employee, department, date range, and status.
- Export leave requests as CSV and review employee leave history.

## Technologies

- HTML, CSS, and browser-native JavaScript
- Node.js and Express
- JSON Web Tokens (JWT) and bcrypt password hashing
- Local JSON file storage for single-process development
- Multer for optional supporting-document uploads
- Font Awesome icons

## Requirements

- Node.js 18 or later
- npm

MongoDB is not required. The application stores local records in `data/leavewise.json`, generates a signing secret in `data/.jwt-secret`, and stores uploaded documents in `uploads/`. These runtime files are intentionally excluded from Git. Back up `data/` and `uploads/` if you need to preserve local records. The built-in file store is intended for local development and a single application process, not multi-instance production deployments.

## Installation

From the project directory:

```sh
npm install
```

Optional: copy `.env.example` to `.env` to set the server port or administrator credentials. `.env` is ignored by Git. Set `ADMIN_PASSWORD` to a password with at least 12 characters. If no administrator credentials are configured, the first startup creates `admin@leavewise.local` and prints a randomly generated, one-time password to the terminal. Save that password; it is not shown again.

## Run the application

```sh
npm start
```

Open [http://localhost:3001](http://localhost:3001). Do not open `public/index.html` directly or use a static-file server; authentication and application features require the Express API.

To use a different port, set `PORT` in `.env`, for example `PORT=3002`, and open that port in your browser.

For development with automatic server restarts:

```sh
npm run dev
```

Check JavaScript syntax with:

```sh
npm run check
```

Employees can register from the sign-in page. HR administrators sign in using the configured credentials or the one-time credentials printed on first startup.

## Screenshots

No screenshots are included yet. Add approved screenshots under `docs/screenshots/` and link them here, for example:

```md
![Leavewise employee dashboard](docs/screenshots/employee-dashboard.png)
```

## Project structure

```text
public/          Responsive frontend
server.js        Express API, authentication, and application startup
local-store.js   Persistent local JSON storage
data/            Runtime database and JWT secret (ignored by Git)
uploads/         User-submitted leave documents (ignored by Git)
```
