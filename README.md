# Real-Time Interview Assistant POC

A two-day proof of concept using a separate Next.js frontend and Express backend. The applications are intentionally simple and run as separate Node processes.

## Requirements

- Node.js 20.9 or later
- npm

## Project structure

```text
web/       Next.js, React, TypeScript, and Tailwind CSS frontend
server/    Express and TypeScript backend
```

## Install dependencies

```bash
npm --prefix web install
npm --prefix server install
```

## Run in development

Open two terminals from the project root:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

The frontend is available at <http://localhost:3000>. The backend listens at <http://localhost:4000> by default.

To change the backend port, copy `server/.env.example` to `server/.env` and set `PORT`. The `.env` file is ignored by Git. External service keys will be added to the backend environment in their relevant milestones.

## Verify the setup

With both applications running, open <http://localhost:3000> and confirm the setup page loads. In another terminal, request the backend health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{"status":"ok","service":"interview-assistant-server"}
```

Build either app with `npm run build:web` or `npm run build:server` from the project root.
