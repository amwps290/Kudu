# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React 19 frontend: `components/` for UI (`.tsx` + CSS Modules), `views/` for the workspace root view, `stores/` for Zustand state, `api/` for Tauri invoke wrappers, `hooks/` for reusable behavior, and `locales/` for i18n JSON files. `src-tauri/` contains the Rust desktop backend: `commands/` exposes Tauri handlers, `database/` implements per-engine access, `models/` stores shared types, and `utils/` holds logging, crypto, and SQL helpers. Static desktop assets live in `src-tauri/icons/`; generated Tauri schemas live in `src-tauri/gen/`.

## Build, Test, and Development Commands
Use the root `package.json` scripts:

- `npm install`: install frontend and Tauri CLI dependencies.
- `npm run dev`: run the Vite frontend only.
- `npm run tauri:dev`: run the full desktop app with Rust backend and DevTools in debug builds.
- `npm run build`: run `tsc --noEmit` and build the frontend bundle.
- `npm test`: run vitest unit tests (pure-function coverage only).
- `npm run tauri:build`: create a production desktop build.
- `cargo check --manifest-path src-tauri/Cargo.toml`: quick Rust compile check when editing backend code.

## Coding Style & Naming Conventions
Follow the existing style rather than introducing a new one. Frontend files use TypeScript, 2-space indentation, PascalCase component names (`ConnectionDialog.tsx`), camelCase functions, and `useX` naming for hooks. Rust follows standard 4-space indentation, snake_case modules/functions, and small focused modules under `commands/` and `database/`. No lint or formatter config is checked in, so run your editor’s default TypeScript/Rust formatting conservatively and avoid broad style-only rewrites.

## Testing Guidelines
Frontend pure functions have a small vitest suite (`npm test`); there is no Rust test suite. At minimum, run `npm run build` for frontend/type regressions and `cargo check --manifest-path src-tauri/Cargo.toml` for backend changes. For database features, include a short manual test note covering the affected engine (for example: PostgreSQL metadata tree, Redis key read/write, SQLite table designer flow).

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects with prefixes such as `feat:`, `fix:`, and `refactor:`; follow that pattern consistently. Keep commits scoped to one change area. PRs should explain the user-visible impact, list affected database engines, include screenshots for UI work, and note the commands or manual scenarios used to verify the change. Do not commit secrets, sample credentials, or local database connection details.
