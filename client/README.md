# Performance Dashboard — Client

React 19 + TypeScript frontend for the Performance Dashboard, built with Vite.

## Stack

- **React 19** with React Router v7
- **Vite** (SWC plugin) for dev server and builds
- **MUI v6** for component library
- **Zustand** for client/UI state
- **React Query (TanStack)** for server state
- **Nivo** for charts (bar, line, pie)
- **Socket.IO** for real-time updates
- **Vitest + Testing Library** for tests
- **Storybook** for component development

## Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check only)
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run test:coverage # Vitest with coverage
npm run storybook    # Storybook dev server on :6006
```

## Project structure

```
src/
├── config/          # API endpoints, constants
├── features/        # Feature modules (dashboard, widgets, auth, machines, settings, etc.)
│   └── widgets/
│       ├── components/   # WidgetContainer, WidgetGrid
│       ├── registry/     # WidgetRegistry (lazy-loaded widget map)
│       └── types/        # Individual widget implementations
├── hooks/           # Shared React Query hooks (useApiQueries)
├── shared/          # Reusable UI components (loading, PrivateRoute, etc.)
├── stores/          # Zustand stores (status, widgets, auth, time range)
├── types/           # Re-exports from @performance-dashboard/shared + client-only types
└── utils/           # API client, CSRF helpers, protectedFetch
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Backend API base URL |
| `VITE_WEBSOCKET_ADDR` | `http://localhost:3000` | WebSocket server address |
