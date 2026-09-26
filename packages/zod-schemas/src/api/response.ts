import { type ZodType, z } from "zod";
import { ErrorCode, errorCodeZod } from "./error.schema";

export const successResponseSchema = <T extends ZodType>(
  schema: T = z.unknown().optional() as unknown as T,
) =>
  z
    .object(
      {
        success: z.literal(true),
        data: schema,
      },
      "Phản hồi thành công không hợp lệ",
    )
    .describe("OK");
export type SuccessResponse<T> = z.infer<ReturnType<typeof successResponseSchema<ZodType<T>>>>;

export const errorResponseSchema = z
  .object(
    {
      success: z.literal(false),
      errorCode: errorCodeZod.catch(ErrorCode.ResponseParseFailed),
      message: z.string(),
      errors: z
        .array(
          z.object({
            fieldName: z.string(),
            code: z.string(),
            message: z.string(),
          }),
        )
        .catch([]),
    },
    "Phản hồi lỗi không hợp lệ",
  )
  .describe("Error Response");
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type IResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export const responseSchema = z.union([successResponseSchema(), errorResponseSchema]);
