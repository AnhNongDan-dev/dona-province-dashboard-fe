# API response handling

This is the small but critical layer between the ts-rest client and the repository.

## Always branch on `res.success`

The `clientAPI` calls return a discriminated union. The discriminant is `success`, **not** `status`.

```typescript
// ✅ CORRECT
const res = await clientAPI.Resource.searchResources({ query });
if (res.success) {
  // res.data is typed and guaranteed
  return mapToDTO(res.data);
}
// res.message, res.errorCode are available here

// ❌ WRONG
if (res.status === 200) { /* TS narrows incorrectly, runtime works by accident */ }
```

Branching on `success` is what unlocks the contract-typed `res.data` — this is how you stay type-safe without `as` casts.

## The response envelope — two layers of `.data`

There are **two** wrappers, and they're easy to confuse:

1. **The ts-rest client wrapper.** `res.data` is the client's field for the HTTP response body. `res.data` ≡ `ApiContract['responseData']`.
2. **The backend payload wrapper.** *This project's* Java backend wraps every payload in a `{ data }` object. So the response body itself is `{ data: actualPayload }`, and the payload is at `res.data.data` ≡ `ApiContract['responseData']['data']`.

That is why repos in this project type `ResponseData = ApiContract['responseData']['data']` and call `mapToDTO(res.data)` where `mapToDTO` is typed on `['responseData']['data']` — the type already accounts for the inner unwrap.

**Porting note:** a backend *without* an envelope returns the payload directly as the response body. There, `ApiContract['responseData']` *is* the payload — drop the `['data']`. Inspect what `ExtractApiContract<…>['responseData']` resolves to in the new project and choose accordingly. (See SKILL.md → Porting.)

## Error fields available on failure

```typescript
type FailureRes = {
  success: false;
  status: number;          // HTTP code, mostly for logging
  errorCode: ErrorCode;    // enum from @repo/zod-schemas/src/api/error.schema
  message: string;         // user-presentable string from BE
  // ...other fields depending on contract
};
```

Branch on `errorCode` (not `status`) when you need to differentiate (403 vs 404 vs validation errors). `currentUser.repository.ts` does this — `UserAlreadyLocked → throwLockedError()`, `ServiceUnavailable → throw503Error()`.

## Per-repo error handling, recap

| Repo type | On `!res.success` |
|-----------|-------------------|
| Single (auth-critical) | branch on `errorCode` for known cases, else `throw redirect({ to: '/auth/sign-out', search: { relativePath: window.location.pathname } })` |
| Detail | `throw404Error()` for a missing resource (or a 403 redirect via `errorCode`); or `throw Error(..., { cause: res })` when a surrounding panel handles the error inline |
| List/Search/Parameterized/Infinite | `throw Error('Cannot load ...!', { cause: res })` — surfaced as a normal error in the UI; the `cause` carries `errorCode` for telemetry |

The factory's `loader()` catches non-redirect errors and returns `defaultData` so the page still paints — see [-factory.ts](../../../../apps/frontend/src/repositories/-factory.ts).

## Nullable fields

If the backend returns `null` for a field, the **Zod v4 schema must declare `.nullable()`** (or `.nullish()` for nullable-and-optional). Match the contract exactly. A wrong nullability annotation passes type-check at the boundary but throws at runtime when Zod v4 parses the response.

## Mock fallback (only if you need it)

This project has no mock fallback — every repo hits the real API. If a future project needs to develop a frontend against an endpoint the backend hasn't shipped, a `queryFn` may fall back to a mock **guarded by `import.meta.env.DEV`**, and the mock must be typed against the contract response and routed through the same `mapToDTO` so DEV behavior matches PROD. Don't add this speculatively — only when an endpoint is genuinely missing.

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `clientAPI` | `@/config/clientAPI.config` |
> | `ErrorCode` | `@repo/zod-schemas/src/api/error.schema` |
> | Error/auth routes | `/auth/sign-out`, `/error/403`, `@/routes/error/locked`, `@/routes/error/503` |
> | Response envelope | this project's Java backend wraps payloads in `{ data }` |
