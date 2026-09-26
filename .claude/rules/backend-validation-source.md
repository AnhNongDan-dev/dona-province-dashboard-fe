---
description: Rules for translating Java backend field validation into Zod — which BE source wins for each constraint
paths:
  - "packages/zod-schemas/src/api-contract/**/*.ts"
  - "packages/zod-schemas/src/entity/**/*.ts"
---

# Backend Validation Source Order

When converting a Java field into a Zod field (whether for an entity schema or a contract body), the validation rule comes from **four possible sources**. Read them in this order and the **first match wins** — never invent a constraint that has no BE source.

## The four sources (in priority order)

### 1. `validationItems.json` — lookup table for `@ItemValidate(name = "...")`

Custom annotation `@ItemValidate(param = "x", name = "key")` on a Java field (when the BE uses it) means "look up `key` in `../dona-province-dashboard-be/src/main/resources/validation/validationItems.json` and apply the rules listed there." The file does not exist yet — locate it by grep once present. Example shape:

```json
{
  "username":     { "type": "String", "format": "username", "minLength": 3, "maxLength": 50 },
  "password":     { "type": "String", "format": "password", "minLength": 8, "maxLength": 72 },
  "fullName":     { "type": "String", "format": "fullName", "maxLength": 100 },
  "provinceName": { "type": "String", "maxLength": 255 },
  "reportDescription": { "type": "String", "maxLength": 1000 }
}
```

Translation:
- `minLength` / `maxLength` → `.min(n)` / `.max(n)`
- `format: "email"` → `commonZod.email`
- `format: "password"` → `commonZod.newPassword`
- `format: "fullName"` → `commonZod.fullName`
- `format: "username"` → `commonZod.username`
- Other formats → check `commonZod` for a matching helper; if none, treat as a free-form `z.string()` with the length bounds applied.

If the JSON entry is missing for a referenced `name`, **stop and ask the user** — the BE will reject requests at runtime, so the contract must mirror that.

### 2. Custom validator annotations

Custom annotations (when present) live under `../dona-province-dashboard-be/src/main/java/com/donasky/province_dashboard/` (e.g. a `validation/annotation/*.java` + `validation/validator/*.java` pair) or come from `org.donasky:common-lib` — find them by grepping for `@Constraint`. Example: a `@SimplePassword` annotation (validator: `SimplePasswordValidator.java`) declaring "chữ và số, độ dài 4–12 ký tự!" — the regex / length bounds are in the validator class.

When you encounter a custom annotation:
1. Read the annotation file to confirm the default `message`.
2. Read the validator class to extract the actual rule (regex, length, custom check).
3. Encode in Zod with `.regex(...)`, `.min(...)`, `.max(...)`, or `commonZod.<helper>` if one matches.

Always re-derive — never assume "same annotation as last sync."

### 3. Bean Validation standard annotations

Standard Jakarta Validation annotations applied directly to a DTO field:

| Java | Zod |
|---|---|
| `@NotNull` | (drop `.nullable()` from the entity field, or `.refine(v => v !== null)`) |
| `@NotBlank` | `.min(1, '...')` after a `.trim()` if appropriate |
| `@NotEmpty` on collection | `.nonempty()` / `.min(1)` |
| `@Size(min=2, max=50)` | `.min(2).max(50)` |
| `@Min(n)` / `@Max(n)` | `.min(n)` / `.max(n)` (numeric) |
| `@Email` | `z.email()` or `commonZod.email` |
| `@Pattern(regexp="...")` | `.regex(/.../, '...')` |
| `@Past` / `@Future` | `.refine(...)` — rare; ask the user |
| `@Valid` (cascade) | recurse into the nested type |
| `@JsonProperty(required = true)` | (drop `.optional()` — field must be present) |
| `@Required(param = "x")` (custom) | (drop `.optional()` — same semantics as `@NotNull`) |

### 4. Field type default (last resort)

If no annotation / lookup applies, use the field's Java type with **no length cap**:
- `String` → `z.string()`
- `Long` / `Integer` → `z.int()`
- `Boolean` → `z.boolean()`
- `LocalDate` → `commonZod.dateOnly`
- `LocalTime` → `commonZod.timeOnly`
- `Instant` / `LocalDateTime` → `commonZod.datetime`
- `BigDecimal` → `z.number()`

A `String` field with no `@Size`, no `@ItemValidate`, and no custom annotation has **no max length** — do not invent one. If a max feels mandatory for UX, raise it with the user and add the constraint on BE first.

## JSON serialization rules (response shape only)

Java `*Response.java` DTOs go through Jackson. The on-wire JSON is **not** the Java field list verbatim — three annotations modify it:

| Annotation | Effect |
|---|---|
| `@JsonProperty("name")` on a field | Renames that field in JSON. The Zod key must use the renamed string. |
| `@JsonIgnoreProperties({"a", "b"})` on the class | Removes those JSON keys from output. Do **not** include them in the Zod schema. |
| `@JsonInclude(NON_NULL)` on field/class | Omits a field when null. The Zod field is still `.nullable()` — Java guarantees null is dropped, but a present null is still possible from other paths. Prefer `.nullable()`. |

Boolean field pitfall (Lombok + Jackson): a field declared as `private boolean isPublic;` generates both `isPublic()` and `getIsPublic()` accessors. Without an explicit `@JsonProperty("isPublic")`, Jackson may emit `public: true` (stripping the `is`). Always check for `@JsonProperty` on every `is*` field; if missing, ask whether the on-wire key is `is*` or stripped.

## Permission is NOT a field-level concern

Permission gating does not appear on the controller method or DTO field. It lives in `INSERT INTO permission (...)` rows in a `V*` migration (`src/main/resources/db/migration/`) once the BE seeds permissions. See [permission-check.md](permission-check.md) for the URL pattern + method lookup.

## Anti-patterns

- **Inventing a `.min(2)` because "names usually have at least 2 chars."** If BE doesn't enforce it, BE will accept a 1-char request and your client will reject it — UX disagreement, then a silent fix later. Always anchor to a BE source.
- **Copying validation from a sibling entity.** Each `@ItemValidate` name is independent — `provinceName` and `indicatorName` may have different bounds even if "they're both names."
- **Stale custom-annotation Zod rule.** When BE changes the regex inside `SimplePasswordValidator.java`, FE must update — the annotation name alone tells you nothing.
- **Skipping `@JsonProperty` audit on response DTOs.** A renamed field becomes a missing key on the FE side and `useQuery` returns parse-failure → blank page.
