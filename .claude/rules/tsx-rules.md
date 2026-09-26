---
description: Rules for all .tsx files — enum display and async button usage
paths:
  - "**/*.tsx"
---

# TSX Component Rules

## Enum Display

When rendering any enum value in JSX, always use `<AppBadge value={enumValue} />` from `@/components/common/app-badge` (not ported yet — port it from ELP-fe together with `BADGE_CONFIG`).

- Never render enum values as raw strings or plain text.
- If a component currently uses a label/text to display an enum value, replace it with `<AppBadge>`.
- All backend enum values are registered in `BADGE_CONFIG` inside `app-badge.tsx`. If a value is missing, add it there first.

```tsx
// Bad
<span>{user.status}</span>
<TableCell>{report.status}</TableCell>
<p>{indicator.periodType}</p>

// Good
<AppBadge value={user.status} />
<TableCell><AppBadge value={report.status} /></TableCell>
<AppBadge value={indicator.periodType} />
```

## Async Actions

`AsyncButton` (not ported yet — port it from ELP-fe) already handles loading state internally. Prefer it over manually wiring `useMutation` loading state to a button.

- Use `AsyncButton` whenever a button triggers an async action (API call, mutation, etc.).
- Do not add a separate `isLoading` / `isPending` state just to disable or show a spinner on a button — `AsyncButton` does this automatically.
- Only fall back to a plain button + manual loading state when the action cannot be expressed as a button click (e.g. form submit handled by `onSubmit`, programmatic triggers).

```tsx
// Bad
const { mutate, isPending } = useMutation({ ... })
<Button disabled={isPending} onClick={() => mutate(payload)}>
  {isPending ? <Spinner /> : 'Lưu'}
</Button>

// Good
<AsyncButton onClick={() => mutate(payload)}>Lưu</AsyncButton>
```
