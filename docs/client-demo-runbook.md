# Client Demo Runbook

## Goal
Run the platform in a stable, live-data-only mode for local and staging demos without dead UI, placeholder data, or manual cleanup steps.

## Local Demo Startup
1. Set required env vars in `.env.local` for:
   - `JWT_SECRET`
   - `POSTGRES_DSN`
   - `REDIS_URL` if available
   - any live provider keys needed for model validation or execution
2. Start the backend with `npm run backend:dev`.
3. Start the frontend with `npm run dev`.
4. Verify health at `http://localhost:8000/health`.
5. Verify the app loads at `http://localhost:3000/login`.

## Staging Demo Startup
1. Confirm staging has:
   - PostgreSQL connectivity
   - Redis connectivity
   - backend auth env vars
   - live model/provider credentials if those flows will be demoed
2. Start the deployed backend and frontend services.
3. Confirm the same health and login routes respond successfully.
4. Confirm no bootstrap-only local assumptions are required.

## Demo Credentials and Auth
- Local demo credentials:
  - `admin@platform.local` / `admin123`
  - `user@platform.local` / `user123`
  - `viewer@platform.local` / `viewer123`
- Canonical session source is the backend JWT flow.
- MCP auth is secondary and should only affect workspace-capable features.

## Suggested Client Narrative
1. Login as admin.
2. Open Dashboard and confirm real metrics or truthful empty states.
3. Open Teams and create, edit, then delete a team.
4. Open Settings and persist an organization change.
5. Open Governance and toggle model access or feature flags.
6. Open Models and validate a configuration or review secrets/configs.
7. Open Skills, inspect a skill, test it in preview, and review assignments.
8. Open Monitoring and show filters plus scoped activity.
9. Open Analytics and explain partial degradation messaging if any live source is unavailable.
10. Logout and confirm session cleanup.

## Expected Fallback Behavior
- If a live dependency is unavailable, the UI must show an empty or degraded state with a clear message.
- No mock counts, mock users, or synthetic history should appear.
- Successful mutations should update the UI without a page reload.

## Verification Commands
- `npm run lint`
- `npm run test:unit:js`
- `npm run test:unit:py`
- `node docs/tester/run-api-tests.js --base-url http://localhost:8000 --phase governance`
- `node docs/tester/ui-rbac-route-guard.mjs`

## Demo Checklist
- No visible dead buttons in routed pages
- No console errors during the click path
- Login, logout, and restore work
- Teams, Settings, Governance, Models, Skills, Monitoring, and Analytics all show live behavior
- No repo-local pytest temp residue is created by the standard Python test command
