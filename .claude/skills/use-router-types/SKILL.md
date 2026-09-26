---
name: use-router-types
description: Use when extracting route-aware types from TanStack Router — type-safe navigation, route paths, search params, path params, or link options. Triggers on NavigateOptions, ToPathOption, LinkOptions, RegisteredRouter, RouteIds, UseNavigateResult, or any route type inference.
compatibility: Requires TanStack Router with file-based routing and registered router module augmentation
---

# Use TanStack Router Types

## Overview

Extract type-safe route types from TanStack Router's `RegisteredRouter` — the project's router instance registered via module augmentation. All types below automatically reflect only the routes defined in `routeTree.gen.ts`.

## When to Use

- Typing a function/variable that accepts navigation options (`navigate()`, `<Navigate>`)
- Need the union of all valid route paths
- Typing `<Link>` component props
- Extracting search params or path params for a specific route
- Typing the return value of `useNavigate()`

## How It Works

The router is registered in `apps/frontend/src/main.tsx`:

```typescript
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

This makes `RegisteredRouter` resolve to the project's actual router.

## Quick Reference

| Type | Import from `@tanstack/react-router` | Purpose |
|---|---|---|
| `NavigateOptions<RegisteredRouter>` | `NavigateOptions, RegisteredRouter` | Full options for `navigate()` / `<Navigate>` |
| `ToPathOption<RegisteredRouter, string>` | `ToPathOption, RegisteredRouter` | Union of all valid `to` paths |
| `LinkOptions<RegisteredRouter>` | `LinkOptions, RegisteredRouter` | Full options for `<Link>` component |
| `RouteIds<RegisteredRouter>` | `RouteIds, RegisteredRouter` | Union of all route IDs |
| `UseNavigateResult<string>` | `UseNavigateResult` | Return type of `useNavigate()` |

## Patterns

### NavigateOptions — Full Navigation Options

```typescript
import type { NavigateOptions, RegisteredRouter } from '@tanstack/react-router'

type AnyNavOptions = NavigateOptions<RegisteredRouter>

// Constrain to specific from/to routes
type SpecificNavOptions = NavigateOptions<RegisteredRouter, '/app', '/app/districts/$districtId'>

function goToPage(options: NavigateOptions<RegisteredRouter>) {
  navigate(options)
}

// Has autocomplete for `to`, `search`, `params`, etc.
goToPage({ to: '/app/districts/$districtId', params: { districtId: '123' } })
```

### ToPathOption — Route Path Union

```typescript
import type { ToPathOption, RegisteredRouter } from '@tanstack/react-router'

type RoutePath = ToPathOption<RegisteredRouter, string>
// Result: '/' | '/app' | '/app/districts' | '/app/districts/$districtId' | '/admin' | ...
```

### LinkOptions — Link Component Props

```typescript
import type { LinkOptions, RegisteredRouter } from '@tanstack/react-router'

type MyLinkOptions = LinkOptions<RegisteredRouter>
```

### Route-Specific Search & Params

Use the route's hook directly (simplest approach):

```typescript
const search = Route.useSearch()   // fully typed search params
const params = Route.useParams()   // fully typed path params
```

### UseNavigateResult — Navigate Function Type

```typescript
import type { UseNavigateResult } from '@tanstack/react-router'

type NavigateFn = UseNavigateResult<string>
```

## Common Mistakes

1. **Don't import from `@tanstack/router-core`** — always import from `@tanstack/react-router`. It re-exports everything and ensures module augmentation is applied.

2. **Don't hardcode route paths as string literals** — use `ToPathOption<RegisteredRouter, string>` for compile-time safety when routes change.
   ```typescript
   // WRONG
   type Route = '/app' | '/admin'

   // CORRECT
   type Route = ToPathOption<RegisteredRouter, string>
   ```

3. **Don't forget the `RegisteredRouter` generic** — without it, types default to `AnyRouter` and you lose route-specific autocomplete.
   ```typescript
   // WRONG
   type Nav = NavigateOptions

   // CORRECT
   type Nav = NavigateOptions<RegisteredRouter>
   ```
