import z from "zod";

export const StatusCode = {
  // 2xx: Success
  OK: 200,
  Created: 201,

  // 4xx: Client Errors
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  URITooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,

  // 5xx: Server Errors
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HTTPVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
} as const;
export type StatusCode = (typeof StatusCode)[keyof typeof StatusCode];

export const ErrorCode = {
  BadRequest: "BadRequest",
  LoginRequired: "LoginRequired",
  Forbidden: "Forbidden",
  ResourcesNotFound: "E_DATA_NOT_FOUND",
  InvalidCredentials: "InvalidCredentials",
  DuplicateUserName: "DuplicateUserName",
  DuplicateEmail: "DuplicateEmail",
  AccountPendingVerify: "E_AUTH_EMAIL_NOT_VERIFIED",
  AccountBanned: "AccountBanned",
  AccountInactive: "AccountInactive",
  InvalidToken: "InvalidToken",
  DuplicateEntry: "DuplicateEntry",
  InternalServerError: "InternalServerError",
  ResponseParseFailed: "ResponseParseFailed",
  InvalidAuthToken: "InvalidAuthToken",
  ExpiredAuthToken: "ExpiredAuthToken",
  TokenInBlackList: "TokenInBlackList",
  Deprecated: "Deprecated",
  TooManyAttempts: "TooManyAttempts",
  InvalidStatusTransition: "InvalidStatusTransition",
  ServiceUnavailable: "ServiceUnavailable",
  AuthFailed: "E_AUTH_FAILED",
  // Central Auth (TASK-001 bảng mã lỗi) — BE trả nguyên tên mã
  Unauthenticated: "UNAUTHENTICATED",
  SessionExpired: "SESSION_EXPIRED",
  SessionChanged: "SESSION_CHANGED",
  CsrfInvalid: "CSRF_INVALID",
  ReauthRequired: "REAUTH_REQUIRED",
  InvalidLoginCredentials: "INVALID_CREDENTIALS",
  RateLimited: "RATE_LIMITED",
  AccountLocked: "ACCOUNT_LOCKED",
  IdentityMerged: "IDENTITY_MERGED",
  LoginRequestExpired: "LOGIN_REQUEST_EXPIRED",
  ValidationError: "VALIDATION_ERROR",
  InternalError: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_DATA: Record<ErrorCode, { statusCode: number; message: string }> = {
  [ErrorCode.BadRequest]: {
    statusCode: StatusCode.BadRequest,
    message: "Thông tin nhập không hợp lệ!",
  },
  [ErrorCode.LoginRequired]: {
    statusCode: StatusCode.Unauthorized,
    message: "Vui lòng đăng nhập để tiếp tục",
  },
  [ErrorCode.InvalidAuthToken]: {
    statusCode: StatusCode.Unauthorized,
    message: "Vui lòng đăng nhập để tiếp tục",
  },
  [ErrorCode.ExpiredAuthToken]: {
    statusCode: StatusCode.Unauthorized,
    message: "Vui lòng đăng nhập để tiếp tục",
  },
  [ErrorCode.TokenInBlackList]: {
    statusCode: StatusCode.Unauthorized,
    message: "Vui lòng đăng nhập để tiếp tục",
  },
  [ErrorCode.Forbidden]: {
    statusCode: StatusCode.Forbidden,
    message: "Bạn không có quyền hạn để thực hiện hành động này.",
  },
  [ErrorCode.ResourcesNotFound]: {
    statusCode: StatusCode.NotFound,
    message: "Dữ liệu không tìm thấy!",
  },
  [ErrorCode.InvalidCredentials]: {
    statusCode: StatusCode.Unauthorized,
    message: "Thông tin đăng nhập không chính xác.",
  },
  [ErrorCode.DuplicateUserName]: {
    statusCode: StatusCode.Conflict,
    message: "Tên đăng nhập đã tồn tại.",
  },
  [ErrorCode.DuplicateEmail]: {
    statusCode: StatusCode.Conflict,
    message: "Email đã được sử dụng.",
  },
  [ErrorCode.AccountPendingVerify]: {
    statusCode: StatusCode.Forbidden,
    message: "Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư.",
  },
  [ErrorCode.AccountBanned]: {
    statusCode: StatusCode.Forbidden,
    message: "Tài khoản đã bị cấm",
  },
  [ErrorCode.AccountInactive]: {
    statusCode: StatusCode.Forbidden,
    message: "Tài khoản đã bị vô hiệu hóa",
  },
  [ErrorCode.InvalidToken]: {
    statusCode: StatusCode.BadRequest,
    message: "Mã xác thực không hợp lệ hoặc đã hết hạn.",
  },
  [ErrorCode.DuplicateEntry]: {
    statusCode: StatusCode.Conflict,
    message: "Dữ liệu đã tồn tại.",
  },
  [ErrorCode.InternalServerError]: {
    statusCode: StatusCode.InternalServerError,
    message: "Lỗi máy chủ. Vui lòng thử lại sau.",
  },
  [ErrorCode.Deprecated]: {
    statusCode: StatusCode.BadRequest,
    message: "API không còn được hỗ trợ.",
  },
  [ErrorCode.TooManyAttempts]: {
    statusCode: StatusCode.TooManyRequests,
    message: "Yêu cầu quá thường xuyên. Vui lòng thử lại sau.",
  },
  [ErrorCode.InvalidStatusTransition]: {
    statusCode: StatusCode.Conflict,
    message: "Trạng thái không phù hợp!",
  },
  [ErrorCode.ResponseParseFailed]: {
    statusCode: StatusCode.InternalServerError,
    message: "Failed to parse response data!",
  },
  [ErrorCode.ServiceUnavailable]: {
    statusCode: StatusCode.ServiceUnavailable,
    message: "Máy chủ hiện không khả dụng. Vui lòng thử lại sau.",
  },
  [ErrorCode.AuthFailed]: {
    statusCode: StatusCode.Unauthorized,
    message: "Token không hợp lệ hoặc đã hết hạn",
  },
  [ErrorCode.Unauthenticated]: {
    statusCode: StatusCode.Unauthorized,
    message: "Bạn chưa đăng nhập.",
  },
  [ErrorCode.SessionExpired]: {
    statusCode: StatusCode.Unauthorized,
    message: "Phiên đăng nhập đã kết thúc.",
  },
  [ErrorCode.SessionChanged]: {
    statusCode: StatusCode.Forbidden,
    message: "Phiên đăng nhập đã thay đổi sang người dùng khác.",
  },
  [ErrorCode.CsrfInvalid]: {
    statusCode: StatusCode.Forbidden,
    message: "Phiên làm việc của trang đã cũ. Vui lòng tải lại trang.",
  },
  [ErrorCode.ReauthRequired]: {
    statusCode: StatusCode.Forbidden,
    message: "Vui lòng nhập lại mật khẩu để tiếp tục.",
  },
  [ErrorCode.InvalidLoginCredentials]: {
    statusCode: StatusCode.Unauthorized,
    message: "Thông tin đăng nhập không đúng.",
  },
  [ErrorCode.RateLimited]: {
    statusCode: StatusCode.TooManyRequests,
    message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  },
  [ErrorCode.AccountLocked]: {
    statusCode: StatusCode.Locked,
    message: "Tài khoản đang bị khóa. Vui lòng liên hệ quản trị đơn vị.",
  },
  [ErrorCode.IdentityMerged]: {
    statusCode: StatusCode.Conflict,
    message: "Tài khoản này đã được gộp vào tài khoản khác. Hãy đăng nhập bằng tài khoản đó.",
  },
  [ErrorCode.LoginRequestExpired]: {
    statusCode: StatusCode.Gone,
    message: "Yêu cầu đăng nhập đã hết hạn.",
  },
  [ErrorCode.ValidationError]: {
    statusCode: StatusCode.BadRequest,
    message: "Dữ liệu nhập không hợp lệ.",
  },
  [ErrorCode.InternalError]: {
    statusCode: StatusCode.InternalServerError,
    message: "Lỗi hệ thống. Vui lòng thử lại sau.",
  },
};

const ERROR_CODE_VALUES = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];
export const errorCodeZod = z.enum(ERROR_CODE_VALUES);
