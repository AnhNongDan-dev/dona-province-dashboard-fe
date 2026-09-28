import { ERROR_DATA, ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { type IResponse, responseSchema } from "@repo/zod-schemas/src/api/response";
import { appContract } from "@repo/zod-schemas/src/api-contract";
import { type ApiFetcher, initClient, isAppRouteMutation, tsRestFetchApi } from "@ts-rest/core";
import { ZodObject } from "zod";
import { logger } from "@/lib/client-logger";
import { recordServerDate, sessionHooks, sessionStore } from "@/lib/session-store";

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

// Nhận một trong các mã này → phiên / token của tab đã cũ → đối chiếu lại D1.
const SESSION_LOST_CODES: string[] = [
  ErrorCode.SessionChanged,
  ErrorCode.SessionExpired,
  ErrorCode.CsrfInvalid,
  ErrorCode.Unauthenticated,
];

// F6 (liên kết) và gộp tài khoản: giao dịch gắn với phiên đã tạo nó. Phiên hết / đổi người giữa
// chừng thì giao dịch FAILED và trang /link/:txId, /merge/:txId tự đọc lại giao dịch để hiện màn
// thất bại — không để bộ xử lý chung đá sang S4 / "phiên đã thay đổi" (TASK-004, TASK-005).
// CSRF_INVALID vẫn đi đường chung để lấy token mới.
const isHandledByTxPage = (path: string, errorCode: string) =>
  (path.includes("/api/link-transactions/") || path.includes("/api/merge-transactions/")) &&
  (errorCode === ErrorCode.SessionExpired || errorCode === ErrorCode.SessionChanged);

export const clientAPI = customInitClientType(
  initClient(appContract, {
    // Cùng origin với BE (dev: Vite proxy; prod: reverse proxy) — cookie phiên HttpOnly đi kèm tự nhiên.
    baseUrl: "",
    jsonQuery: true,
    validateResponse: false,
    credentials: "same-origin",
    api: async (args): ReturnType<ApiFetcher> => {
      if (isAppRouteMutation(args.route) && args.route.body instanceof ZodObject) {
        args.body = JSON.stringify(args.route.body.parse(args.rawBody));
      }

      const send = (): Promise<IResponse> => {
        // CSRF token gắn phiên, giữ theo tab; gửi ở mọi request ghi.
        const csrfToken = sessionStore.get()?.csrfToken;
        if (args.method !== "GET" && csrfToken) args.headers["x-csrf-token"] = csrfToken;

        return tsRestFetchApi(args)
          .then((rawResult) => {
            logger.debug("logger ~ clientAPI.config.ts ~ line 90:", rawResult);
            recordServerDate(rawResult.headers.get("date"));
            // Trust the BE envelope; safeParse only normalizes errorCode/errors and NEVER
            // throws — a malformed envelope falls back to the raw body instead of being
            // masked as a fake ServiceUnavailable in the catch below.
            const parsed = responseSchema.safeParse(rawResult.body);
            return parsed.success ? parsed.data : (rawResult.body as IResponse);
          })
          .catch((error): IResponse => {
            logger.error(
              "Failed to fetch from API. Server may be down or unreachable (ERR_CONNECTION_REFUSED).",
              { error },
            );
            return {
              success: false,
              errorCode: ErrorCode.ServiceUnavailable,
              errors: [],
              data: null,
              ...ERROR_DATA[ErrorCode.ServiceUnavailable],
            };
          });
      };

      let res = await send();
      // Step-up: mở S2, thành công thì gửi lại thao tác đúng một lần.
      if (!res.success && res.errorCode === ErrorCode.ReauthRequired) {
        if (await sessionHooks.onReauthRequired()) res = await send();
      }
      // Không bao giờ tự gửi lại request ghi khi phiên đổi — chỉ đối chiếu lại phiên (D1).
      // Tab đang đăng nhập: chuyển S3/S4/"phiên đã thay đổi". Tab chưa đăng nhập (login, wizard
      // liên kết): chỉ lấy token mới, user bấm lại là được.
      if (
        !res.success &&
        SESSION_LOST_CODES.includes(res.errorCode) &&
        !isHandledByTxPage(args.path, res.errorCode)
      ) {
        sessionHooks.onSessionLost();
      }
      // Tài khoản chưa có email đã xác minh (TASK-008): mọi trang của app → màn thêm email.
      if (
        !res.success &&
        res.errorCode === ErrorCode.EmailSetupRequired &&
        window.location.pathname !== "/email-setup"
      ) {
        window.location.assign("/email-setup");
      }
      return customResponseType(res);
    },
  }),
);
