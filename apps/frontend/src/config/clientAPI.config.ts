import { ERROR_DATA, ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { type IResponse, responseSchema } from "@repo/zod-schemas/src/api/response";
import { appContract } from "@repo/zod-schemas/src/api-contract";
import { type ApiFetcher, initClient, isAppRouteMutation, tsRestFetchApi } from "@ts-rest/core";
import { ZodObject } from "zod";
import { logger } from "@/lib/client-logger";

type DecrementDepth<T extends number> = T extends 4
  ? 3
  : T extends 3
    ? 2
    : T extends 2
      ? 1
      : T extends 1
        ? 0
        : 0;

type OmitNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

type ExposedHeaders<H> = H extends { authorization: string } ? never : H;

type ExtractArgs<P> = P extends object
  ? OmitNever<{
      [K in keyof P & ("body" | "params" | "query" | "headers")]: NonNullable<P[K]> extends object
        ? keyof NonNullable<P[K]> extends never
          ? never
          : K extends "headers"
            ? ExposedHeaders<NonNullable<P[K]>> extends never
              ? never
              : ExposedHeaders<NonNullable<P[K]>>
            : P[K]
        : never;
    }> extends infer R
    ? keyof R extends never
      ? never
      : R
    : never
  : never;

type CleanArgs<T> = ExtractArgs<T>;

type ExtractResponse<T> =
  T extends Promise<infer U> ? (U extends { body: { data: infer G } } ? G : never) : never;

type CustomType<T, Depth extends number = 2> = Depth extends 0
  ? T
  : {
      [TKey in keyof T]: T[TKey] extends (...args: [infer P]) => infer R
        ? CleanArgs<P> extends never
          ? () => Promise<IResponse<ExtractResponse<R>>>
          : (...args: [CleanArgs<P>]) => Promise<IResponse<ExtractResponse<R>>>
        : T[TKey] extends {}
          ? CustomType<T[TKey], DecrementDepth<Depth>>
          : T[TKey];
    };

const customInitClientType = <T>(a: T): CustomType<T> => a as CustomType<T>;

const customResponseType = (data: IResponse): ReturnType<ApiFetcher> =>
  data as unknown as ReturnType<ApiFetcher>;

export const clientAPI = customInitClientType(
  initClient(appContract, {
    baseUrl: import.meta.env.VITE_SERVER_URL,
    jsonQuery: true,
    validateResponse: false,
    credentials: "omit",
    api: async (args): ReturnType<ApiFetcher> => {
      if (isAppRouteMutation(args.route) && args.route.body instanceof ZodObject) {
        args.body = JSON.stringify(args.route.body.parse(args.rawBody));
      }
      // ponytail: no JWT header yet — add tokenManager + jwtAuthHeaderSchema check (see ELP-fe) when auth lands.

      return tsRestFetchApi(args)
        .then((rawResult) => {
          logger.debug("logger ~ clientAPI.config.ts ~ line 90:", rawResult);
          // Trust the BE envelope; safeParse only normalizes errorCode/errors and NEVER
          // throws — a malformed envelope falls back to the raw body instead of being
          // masked as a fake ServiceUnavailable in the catch below.
          const parsed = responseSchema.safeParse(rawResult.body);
          const res = parsed.success ? parsed.data : (rawResult.body as IResponse);
          return customResponseType(res);
        })
        .catch((error) => {
          logger.error(
            "Failed to fetch from API. Server may be down or unreachable (ERR_CONNECTION_REFUSED).",
            { error },
          );
          return customResponseType({
            success: false,
            errorCode: ErrorCode.ServiceUnavailable,
            errors: [],
            ...ERROR_DATA[ErrorCode.ServiceUnavailable],
          });
        });
    },
  }),
);
