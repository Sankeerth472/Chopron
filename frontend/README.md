# Chopron Frontend

React + Vite + TypeScript frontend for the Chopron FastAPI backend.

## Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Radix Dialog
- Lucide React
- Sonner toasts

## Features

- Resume upload flow with PDF validation, loading states, and toast feedback
- Landing/dashboard experience with hero, profile summary, metrics, and pipeline actions
- Jobs page with search, filters, and fit-score sorting
- Right-side job detail drawer with fit analysis, resume guidance, and apply link
- API client layer driven by `VITE_API_BASE_URL`
- Responsive light-first UI with dark-mode support through system preference

## Local Setup

1. Start the FastAPI backend on `http://localhost:8000`.
2. In the `frontend` directory, install dependencies:

```bash
npm install
```

3. Create or verify the local env file:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

4. Start the frontend:

```bash
npm run dev
```

The app will run at [http://localhost:5173](http://localhost:5173).

## Production Build

```bash
npm run build
```

## Notes

- The frontend assumes the backend already allows CORS for `http://localhost:5173`.
- Missing profile and API failures are surfaced with user-friendly empty/error states instead of raw fetch errors.
