# film-transcreation-agent

**Cultural Resonance Agent** — localization triage for streaming content. Submit a
script and a target country, get back a ranked list of lines unlikely to land there,
each with a plain-English reason and a suggested replacement. Built for the Agentic
Cinema hackathon (devpost).

- **Why things are built the way they are**: [docs/adr/](docs/adr/)
- **What/business context**: [docs/product/](docs/product/)
- **Session-by-session progress log**: [docs/progress/](docs/progress/)
- **Agent workflow / conventions**: [CLAUDE.md](CLAUDE.md)

## Layout

- `frontend/` — Vite + React + TS UI
- `backend/` — thin Express relay (passcode gate, rate limit, calls Dialogflow CX)
- `tests/integration/` — cross-boundary tests (real backend, faked Google call)
- `test_agent.py` — reference script for calling the Dialogflow CX playbook directly

## Running locally

Quick start: `bash scripts/dev.sh` installs everything and starts both servers in
one go — see [scripts/dev.sh](scripts/dev.sh). The steps below are what it automates,
useful if you want to run things by hand or something goes wrong.

### 1. Prerequisites

- Node.js >= 20 (`.nvmrc` pins 20; anything newer works too)
- Google Cloud ADC, if you want the backend to actually reach Dialogflow CX (not
  needed just to run the test suites or click around the UI with a mocked
  backend — see step 3)

### 2. Install

```bash
npm install   # from the repo root — installs all three workspaces at once
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Both `.env.example` files already have working defaults for this project
(`GOOGLE_CLOUD_PROJECT`, `DIALOGFLOW_LOCATION`, `DIALOGFLOW_AGENT_ID`,
`VITE_BACKEND_URL`). The one thing worth changing is `SHARED_PASSCODE` in
`backend/.env` — whatever you set there is what you'll type into the frontend's
passcode screen to unlock it.

### 4. Google Cloud auth (only needed to hit the real Dialogflow CX agent)

```bash
gcloud auth application-default login --project silent-scholar-505618-u6
```

Requires your Google account to have IAM access to that project — see
[docs/adr/0003-google-auth-via-adc.md](docs/adr/0003-google-auth-via-adc.md). If
you skip this, `/health` and the full test suite still work fine; only a real
`/api/analyze` call against the live agent will fail with an auth error.

### 5. Start both servers (two terminals)

```bash
npm run dev:backend    # http://localhost:8787
npm run dev:frontend   # http://localhost:5173
```

Open `http://localhost:5173`, enter the passcode from `backend/.env`, then submit
a script + target country.

### 6. Run the tests

```bash
npm test                  # all three suites
npm run test:frontend     # frontend unit/component tests only
npm run test:backend      # backend unit tests only (Dialogflow CX call is mocked)
npm run test:integration  # real backend + real HTTP, only the Google hop is faked
```


default project so that even when I change the tab around (to details or progress) i dont need to choose which project to go to

whenever i change the action in the line (to research) the scrub bar also need to be colored correspondingly.