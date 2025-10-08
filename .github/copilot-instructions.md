# LibreChat AI Assistant Instructions

## Architecture Overview

LibreChat is an open-source chat application supporting multiple AI models with a modern React frontend and Express.js backend.

### Key Components

- **Backend (Express.js)**: Located in `/api`, handles authentication, chat messaging, and AI model integration
- **Frontend (React)**: Located in `/client`, built with React, React Router, Recoil state management, and TailwindCSS
- **Shared Packages**: Located in `/packages` with modular components:
  - `data-schemas`: Mongoose schemas, models, and types
  - `data-provider`: API client functions and data utilities
  - `client`: Reusable React components
  - `api`: Shared API utilities

### Data Flow

1. Client sends requests to Express backend endpoints (defined in `/api/server/routes`)
2. Backend routes dispatch to controllers, which interact with models
3. Mongoose models (in `/packages/data-schemas`) handle database interactions
4. AI requests are processed through various clients in `/api/app/clients`

## Database Design

- MongoDB-based with Mongoose ODM
- Main entities include: Conversations, Messages, Users, Agents, Presets, Files
- Database operations are abstracted in data-schemas package methods

## Key Development Workflows

### Local Development

```bash
# Backend development
npm run backend:dev

# Frontend development
npm run frontend:dev

# Both (in separate terminals)
npm run backend:dev
npm run frontend:dev

# Or with Bun for faster performance
npm run b:api:dev
npm run b:client:dev
```

### Testing

```bash
# API tests
npm run test:api

# Client tests
npm run test:client

# E2E tests
npm run e2e
```

### Building for Production

```bash
# Build frontend assets
npm run frontend

# Run production backend
npm run backend
```

## Project-Specific Patterns

### Adding New API Endpoints

1. Create a route in `/api/server/routes/[featureName].js`
2. Add route to `/api/server/routes/index.js`
3. Register route in `/api/server/index.js` as `app.use('/api/[featureName]', routes.[featureName])`

### Adding Database Models

1. Define types in `/packages/data-schemas/src/types/[entityName].ts`
2. Create schema in `/packages/data-schemas/src/schema/[entityName].ts`
3. Create model factory in `/packages/data-schemas/src/models/[entityName].ts`
4. Add methods in `/packages/data-schemas/src/methods/[entityName].ts`
5. Export through index files and update main factory functions

### Adding New Frontend Routes

1. Create component in `/client/src/routes/[RouteName].tsx`
2. Add to router in `/client/src/routes/index.tsx`

## AI Model Integration

- Multiple AI models are supported via providers in `/api/app/clients`
- Custom endpoints allow any OpenAI-compatible API to be used
- Configuration is handled through a `librechat.yaml` file

## Important Patterns

- **Authentication**: JWT-based with multiple strategies (email, OAuth, LDAP)
- **State Management**: Recoil for global state, React Query for API data
- **Error Handling**: API errors are captured through ErrorController middleware

## Common Tasks

- User management commands: `npm run create-user`, `npm run invite-user`, etc.
- Database operations: The `/config` directory contains utility scripts

## Theme System

A theming system allows for customization with a built-in light/dark mode toggle and support for custom colors defined through environment variables or local storage.

## Documentation

Reference the project's [official documentation](https://docs.librechat.ai) for comprehensive guides on features and deployment options.