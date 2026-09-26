import { ZodCatch, ZodDefault, ZodNullable, ZodOptional, ZodPipe, type ZodType } from "zod";
import { SCHEMA_DESCRIPTION } from "./common";

/**
 * Extracts the description from a Zod schema by recursively unwrapping
 * wrapper types (nullable, optional, default, catch, pipe).
 *
 * Example:
 *   z.string().describe('MY_DESCRIPTION').nullable()
 *   → returns 'MY_DESCRIPTION'
 */
export const getSchemaDescription = (schema: ZodType): string | undefined => {
  if (schema.description) return schema.description;
  if (schema instanceof ZodPipe) return getSchemaDescription(schema.def.out as ZodType);
  if (
    schema instanceof ZodNullable ||
    schema instanceof ZodOptional ||
    schema instanceof ZodDefault ||
    schema instanceof ZodCatch
  )
    return getSchemaDescription(schema.def.innerType as ZodType);
  return undefined;
};

/**
 * Recursively unwraps wrapper types (nullable, optional, default, catch, pipe)
 * and returns the inner "core" schema unchanged.
 *
 * Unlike `ZodArray.prototype.unwrap()` (which returns the array's *element*),
 * this stops at the first non-wrapper — so `z.array(...).optional()` resolves to
 * the `ZodArray`, not its element. Use this when a consumer needs to introspect
 * the underlying schema (e.g. `.element`, `.min`/`.max`) regardless of how the
 * field was marked optional/nullable.
 *
 * Example:
 *   z.array(z.file()).max(1).optional()
 *   → returns the ZodArray (so `.element` is defined)
 */
export const unwrapSchema = (schema: ZodType): ZodType => {
  if (schema instanceof ZodPipe) return unwrapSchema(schema.def.out as ZodType);
  if (
    schema instanceof ZodNullable ||
    schema instanceof ZodOptional ||
    schema instanceof ZodDefault ||
    schema instanceof ZodCatch
  )
    return unwrapSchema(schema.def.innerType as ZodType);
  return schema;
};

/**
 * Resolves the final type name of a Zod schema by recursively unwrapping
 * wrapper types. Returns special type names like 'datetime' based on schema description.
 */
export const getFinalTypeName = (schema: ZodType): string => {
  if (getSchemaDescription(schema) === SCHEMA_DESCRIPTION.DATETIME) return "datetime";
  const core = unwrapSchema(schema);
  if (!core?.type) return "unknown";
  return core.type;
};
