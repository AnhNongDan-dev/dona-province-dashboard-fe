import { removeDuplicates } from "@repo/shared/src/common/array.helper";
import { pickFields } from "@repo/shared/src/common/object.helper";
import type { AppRoute } from "@ts-rest/core";
import { type _ZodType, type core, z } from "zod";
import { ERROR_DATA, ErrorCode, errorCodeZod } from "../api/error.schema";

/**
 * Extract all refine error messages from a Zod schema
 * Useful for generating OpenAPI documentation from hidden refine validations
 */
const extractRefineMessages = <T extends core.$ZodType>(schema: T): string[] => {
  const messages: string[] = [];
  const checks = (schema as unknown as { _def: { checks?: unknown[] } })._def?.checks || [];

  for (const check of checks as {
    def?: { type?: string; error?: (arg: { input: unknown }) => unknown };
  }[]) {
    if (check.def?.type === "custom" && typeof check.def.error === "function") {
      try {
        const msg = check.def.error({ input: "" });
        if (typeof msg === "string") {
          messages.push(msg);
        }
      } catch {
        // ignore
      }
    }
  }

  return messages;
};

const DEFAULT_ERROR_CODES = [ErrorCode.BadRequest, ErrorCode.InternalServerError] as const;
const DEFAULT_HEADER_ERROR_CODES = [ErrorCode.LoginRequired, ErrorCode.InvalidAuthToken] as const;

const generateErrorCodes = (
  ...customErrorCodes: Exclude<ErrorCode, (typeof DEFAULT_ERROR_CODES)[number]>[]
) => {
  return {
    errorCodes: removeDuplicates([...customErrorCodes, ...DEFAULT_ERROR_CODES]),
  };
};

const getContractErrorCodes = (contract: AppRoute): ErrorCode[] => {
  const checkMetadata = errorCodeMetadataSchema.safeParse(contract.metadata);
  if (!checkMetadata.success) throw Error("Invalid metadata");
  if (contract.headers) checkMetadata.data.errorCodes.push(...DEFAULT_HEADER_ERROR_CODES);
  return checkMetadata.data.errorCodes;
};

const errorCodeMetadataSchema = z.object({
  errorCodes: z.array(errorCodeZod),
});

const generateErrorResponseSchemas = (appRoute: AppRoute): Record<number, _ZodType> => {
  const parsedMetadata = errorCodeMetadataSchema.safeParse(appRoute.metadata);
  const responseSchemas: Record<number, _ZodType> = {};

  if (!parsedMetadata.success) {
    throw Error("Invalid contract metadata", {
      cause: {
        ...pickFields(appRoute, ["summary", "method", "path", "metadata"]),
        parsedMetadata: parsedMetadata.error.issues,
      },
    });
  }

  const { errorCodes } = parsedMetadata.data;
  if (appRoute.headers) errorCodes.push(...DEFAULT_HEADER_ERROR_CODES);

  const messagesByStatus: Record<number, Record<string, string>> = {};

  for (const errorCode of removeDuplicates(errorCodes)) {
    const { message, statusCode } = ERROR_DATA[errorCode];
    messagesByStatus[statusCode] ??= {};
    messagesByStatus[statusCode][errorCode] = message;
  }

  for (const [statusCodeStr, errorMap] of Object.entries(messagesByStatus)) {
    const statusCode = Number(statusCodeStr);

    responseSchemas[statusCode] = z
      .object({
        success: z.literal(false),
        message: z.string().meta({ examples: Object.values(errorMap) }),
        errors: z
          .object({
            fields: z.array(
              z.object({
                field: z.string(),
                code: z.string(),
                message: z.string(),
              }),
            ),
          })
          .default({ fields: [] }),
      })
      .describe(Object.keys(errorMap).join(" | "));
  }

  return responseSchemas;
};

const MAX_TRAVERSAL_DEPTH = 3;

const extendErrorResponse = (data: unknown, depth = MAX_TRAVERSAL_DEPTH) => {
  if (depth <= 0 || !data || typeof data !== "object") return;

  const obj = data as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (key === "metadata") {
      obj.responses = {
        ...(obj.responses as Record<string, unknown>),
        ...generateErrorResponseSchemas(obj as unknown as AppRoute),
      };
    } else if (obj[key] && typeof obj[key] === "object") {
      extendErrorResponse(obj[key], depth - 1);
    }
  }
};

export const OpenAPIHelper = {
  generateErrorCodes,
  extendErrorResponse,
  getContractErrorCodes,
  extractRefineMessages,
};
