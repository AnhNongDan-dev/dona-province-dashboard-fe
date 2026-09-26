import z, { type ZodType } from "zod";
import { dateOnlyZod, timeOnlyZod } from "./custom-type";

export const SCHEMA_DESCRIPTION = {
  NEW_PASSWORD: "NEW_PASSWORD",
  UPLOAD_FILES: "UPLOAD_FILES",
  PREVIEW_FILES: "PREVIEW_FILES",
  DATETIME: "DATETIME",
  DATE_ONLY: "DATE_ONLY",
  TIME_ONLY: "TIME_ONLY",
  SHORT_DURATION: "SHORT_DURATION",
  TEXTAREA: "TEXTAREA",
  PHONE: "PHONE",
  CITIZEN_ID: "CITIZEN_ID",
  GENDER: "GENDER",
  MONEY: "MONEY",
  STAR_RATING: "STAR_RATING",
} as const;
export type SCHEMA_DESCRIPTION = (typeof SCHEMA_DESCRIPTION)[keyof typeof SCHEMA_DESCRIPTION];

const entityId = z
  .number()
  .int()
  .positive()
  .meta({ examples: [1, 42, 1001] });

const attachmentZod = z.object({
  id: entityId,
  fileName: z.string(),
  fileSize: z.number().int().positive(),
  contentType: z.string(),
  downloadUrl: z.url(),
});

export type Attachment = z.infer<typeof attachmentZod>;

const pathId = z.coerce.number().int().positive();

// shortDuration — an "hours + minutes" picker for a length of time (e.g. an event's
// duration). Stored as { hours, minutes }; the form derives endAt = startAt + duration.
// Hard caps: 0–8 hours, minutes in 5-minute steps (0,5,…,55). Total bounds (min length,
// 8-hour ceiling) are cross-key and live on the form-side refinement, not here.
export const SHORT_DURATION_MAX_HOURS = 8;
export const SHORT_DURATION_MINUTE_STEP = 5;
const shortDuration = z
  .object({
    hours: z
      .int("Số giờ không hợp lệ")
      .min(0, "Số giờ không hợp lệ")
      .max(SHORT_DURATION_MAX_HOURS, `Tối đa ${SHORT_DURATION_MAX_HOURS} giờ`),
    minutes: z
      .int("Số phút không hợp lệ")
      .min(0, "Số phút không hợp lệ")
      .max(59, "Số phút không hợp lệ")
      .refine(
        (m) => m % SHORT_DURATION_MINUTE_STEP === 0,
        `Số phút phải là bội số của ${SHORT_DURATION_MINUTE_STEP}`,
      ),
  })
  .describe(SCHEMA_DESCRIPTION.SHORT_DURATION);
export type ShortDuration = z.infer<typeof shortDuration>;

const MAX_FILE_SIZE = 50_000_000;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const commonZod = {
  entityId,
  pathId,
  datetime: z
    .union([z.iso.datetime(), z.date()], "Ngày giờ không hợp lệ!")
    .transform((val) => new Date(val))
    .meta({ examples: ["2024-01-15T08:30:00Z", "2024-06-20T14:45:00Z"] })
    .describe(SCHEMA_DESCRIPTION.DATETIME),
  dateOnly: dateOnlyZod,
  timeOnly: timeOnlyZod,
  shortDuration,
  gender: z
    .enum(["MALE", "FEMALE"], "Vui lòng chọn giới tính")
    .meta({ examples: ["MALE", "FEMALE"] })
    .describe(SCHEMA_DESCRIPTION.GENDER),
  email: z
    .email("Email không hợp lệ!")
    .meta({ examples: ["admin@donasky.com", "user@gmail.com"] }),
  fullName: z
    .string("Vui lòng nhập họ tên")
    .trim()
    .min(2, "Họ tên phải có ít nhất 2 ký tự")
    .max(100, "Họ tên quá dài")
    // Họ tên có thể đến từ Google profile (chứa số/ký tự đặc biệt, không bắt đầu/kết
    // thúc bằng chữ cái), nên các refine định dạng dưới đây được tạm tắt để không
    // reject dữ liệu hợp lệ. Giữ lại làm tham chiếu, bật lại nếu cần siết form nhập tay.
    // .refine((val) => /^[\p{L}\s]+$/u.test(val), "Họ tên chỉ được chứa chữ cái và khoảng trắng")
    // .refine((val) => /^\p{L}/u.test(val), "Họ tên phải bắt đầu bằng chữ cái")
    // .refine((val) => /\p{L}$/u.test(val), "Họ tên phải kết thúc bằng chữ cái")
    .refine((val) => !val.includes("  "), "Họ tên không được có 2 khoảng trắng liên tiếp")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({ examples: ["Nguyễn Văn An", "Trần Thị Bình"] }),
  // Biến thể RESPONSE của fullName: dùng khi parse dữ liệu BE trả về (user/tỉnh/huyện…),
  // KHÔNG dùng cho form nhập tay. Họ tên có thể đến từ Google profile và chứa số/ký tự đặc
  // biệt mà BE đã chấp nhận — schema response không được reject dữ liệu đó (sẽ vỡ parse →
  // trang trắng). Chỉ giữ ràng buộc kiểu/độ dài tối thiểu; mọi refine định dạng đều bỏ.
  fullNameResponse: z
    .string()
    .max(255, "Họ tên quá dài")
    .meta({ examples: ["Nguyễn Văn An"] }),
  username: z
    .string("Vui lòng nhập tài khoản")
    .min(3, "Tài khoản phải có ít nhất 3 ký tự")
    .max(50, "Tài khoản quá dài, tối đa 50 ký tự")
    .refine(
      (val) => /^[a-zA-Z0-9_]+$/.test(val),
      "Tài khoản chỉ được chứa chữ cái, số và dấu gạch dưới",
    )
    .meta({ examples: ["nguyenvana", "admin_user01"] }),
  password: z
    .string("Vui lòng nhập mật khẩu")
    .nonempty("Vui lòng nhập mật khẩu")
    .meta({ examples: ["********", "••••••••"] }),
  newPassword: z
    .string("Vui lòng nhập mật khẩu")
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .max(64, "Mật khẩu quá dài")
    .refine((val) => /^[\x20-\x7E]+$/.test(val), "Mật khẩu chỉ được chứa ký tự ASCII")
    .refine((val) => /[A-Z]/.test(val), "Mật khẩu phải có ít nhất 1 chữ hoa")
    .refine((val) => /[a-z]/.test(val), "Mật khẩu phải có ít nhất 1 chữ thường")
    .refine((val) => /[0-9]/.test(val), "Mật khẩu phải có ít nhất 1 chữ số")
    .refine(
      (val) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val),
      "Mật khẩu phải có ít nhất 1 ký tự đặc biệt",
    )
    .meta({ examples: ["SecureP@ss1!", "MyStr0ng#Pass"] })
    .describe(SCHEMA_DESCRIPTION.NEW_PASSWORD),
  file: z
    .file()
    .max(MAX_FILE_SIZE, "File không được vượt quá 50MB")
    .mime([...ALLOWED_MIME_TYPES], "Định dạng file không được hỗ trợ"),
  uploadFiles: z
    .array(
      z
        .file()
        .min(1, "Tập tin không có dữ liệu")
        .max(MAX_FILE_SIZE, "Kích thước tập tin không được vượt quá 50MB")
        .mime([...ALLOWED_MIME_TYPES], "Chỉ cho phép tải lên ảnh (jpeg,png), pdf, word và excel."),
    )
    .describe(SCHEMA_DESCRIPTION.UPLOAD_FILES),
  /**
   * Như `uploadFiles` nhưng nhận danh sách MIME tùy biến (uploadFiles mặc định chỉ
   * cho ảnh/pdf/word/excel — không có zip). `.describe(UPLOAD_FILES)` đặt NGOÀI CÙNG
   * để `getFieldType` vẫn nhận diện (nó chỉ unwrap ZodOptional/Catch/Nullable, không
   * unwrap ZodDefault). `FileUploadField` suy `<input accept>` từ `.mime([...])` và
   * số file bắt buộc từ `.min/.max`.
   */
  // `extensions` (vd: [".rar"]) là lối thoát cho các định dạng trình duyệt/OS thường không
  // gán MIME (file.type === "" khi hệ thống không có association) — chấp nhận theo phần
  // đuôi file khi mime không khớp, thay vì chặn nhầm file hợp lệ. Không truyền = giữ
  // nguyên hành vi cũ (chỉ theo mime, qua .mime() để <input accept> vẫn lọc đúng).
  uploadFilesMime: (
    mimes: string[],
    message = "Định dạng tập tin không được hỗ trợ",
    extensions?: string[],
  ) =>
    z
      .array(
        extensions && extensions.length > 0
          ? z
              .file()
              .min(1, "Tập tin không có dữ liệu")
              .max(MAX_FILE_SIZE, "Kích thước tập tin không được vượt quá 50MB")
              .refine(
                (file) =>
                  mimes.includes(file.type) ||
                  extensions.some((ext) => file.name.toLowerCase().endsWith(ext)),
                message,
              )
          : z
              .file()
              .min(1, "Tập tin không có dữ liệu")
              .max(MAX_FILE_SIZE, "Kích thước tập tin không được vượt quá 50MB")
              .mime(mimes, message),
      )
      .describe(SCHEMA_DESCRIPTION.UPLOAD_FILES),
  previewFiles: z
    .array(attachmentZod)
    .optional()
    .default([])
    .describe(SCHEMA_DESCRIPTION.PREVIEW_FILES),
  textarea: z
    .string("Vui lòng nhập thông tin")
    .max(1000, "Bạn chỉ được phép nhập tối đa 1000 ký tự")
    .describe(SCHEMA_DESCRIPTION.TEXTAREA),
  attachment: attachmentZod,
  version: z.number().int("Phải là số nguyên").nonnegative("Phải là số không âm"),
  unitName: z
    .string("Vui lòng nhập tên đơn vị")
    .trim()
    .min(5, "Tên đơn vị phải có ít nhất 5 ký tự")
    .max(64, "Tên đơn vị quá dài")
    .refine((val) => !val.includes("  "), "Tên đơn vị không được có 2 khoảng trắng liên tiếp")
    .refine(
      (val) => /^[\p{L}\s0-9]+$/u.test(val),
      "Tên đơn vị chỉ được chứa chữ cái, số và khoảng trắng",
    )
    .refine((val) => /[\p{L}]/u.test(val), "Tên đơn vị phải chứa ít nhất một chữ cái")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({
      examples: [
        "Xã Mỹ Đức",
        "Phường Bến Thành",
        "Thị trấn Chợ Mới",
        "Quận 1",
        "Huyện Mỹ Đức",
        "Hà Nội",
        "TP Hồ Chí Minh",
      ],
    }),
  applicantName: z
    .string("Vui lòng nhập tên người/tập thể")
    .trim()
    .nonempty("Vui lòng nhập tên người/tập thể")
    .min(2, "Tên phải có ít nhất 2 ký tự")
    .max(128, "Tên quá dài, tối đa 128 ký tự!")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({ examples: ["Nguyễn Văn An", "Chi bộ Đảng xã An Nhơn"] }),
  queryBoolean: z.preprocess(
    (val) => (val === "true" || val === "1" ? true : val === "false" || val === "0" ? false : val),
    z.boolean(),
  ),
  phoneNumber: z
    .string("Vui lòng nhập số điện thoại")
    .regex(/^(0[35789])\d{8}$/, "Số điện thoại Việt Nam không hợp lệ")
    .meta({ examples: ["0901234567", "0351234567"] }),
  phone: z
    .string("Vui lòng nhập số điện thoại")
    .regex(/^(0[35789])\d{8}$/, "Số điện thoại Việt Nam không hợp lệ")
    .meta({ examples: ["0901234567", "0351234567"] })
    .describe(SCHEMA_DESCRIPTION.PHONE),
  // Tên hiển thị (user-facing) — entity tự thêm .max(n) theo BE @Size
  entityName: z
    .string("Vui lòng nhập tên")
    .trim()
    .min(1, "Vui lòng nhập tên")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({ examples: ["Tổng hai số", "Lớp 10A1", "Quy hoạch động"] }),
  // Định danh kỹ thuật (filename, mime type, docker image, ...) — không áp rule "cụm 10 ký tự"
  identifier: z
    .string("Vui lòng nhập định danh")
    .min(1, "Vui lòng nhập định danh")
    .meta({ examples: ["main.cpp", "python:3.12-slim", "application/pdf"] }),
  // Mô tả dài — TEXTAREA hint nhưng KHÔNG có .max() (entity tự áp theo BE)
  description: z
    .string("Vui lòng nhập mô tả")
    .describe(SCHEMA_DESCRIPTION.TEXTAREA)
    .meta({ examples: ["Mô tả chi tiết..."] }),
  // Code-style identifier (permission code, role code, province code, ...)
  code: z
    .string("Vui lòng nhập mã")
    .min(1, "Vui lòng nhập mã")
    .meta({ examples: ["PROVINCE_VIEW", "ADMIN", "HN-01"] }),
  // URL pattern dùng cho permission
  urlPattern: z
    .string("Vui lòng nhập URL pattern")
    .min(1, "Vui lòng nhập URL pattern")
    .meta({ examples: ["/api/v1/provinces", "/api/v1/provinces/*"] }),
  // URL string — BE dùng z.string() vì có thể là path tương đối
  url: z.string("URL không hợp lệ").meta({ examples: ["https://cdn.example.com/avatars/1.jpg"] }),
  // Mã OTP 6 chữ số
  otp: z
    .string("Vui lòng nhập mã OTP")
    .regex(/^[0-9]{6}$/, "Mã OTP phải gồm 6 chữ số")
    .meta({ examples: ["123456", "987654"] }),
  // Alias của `entityName` với .max(255).
  name: z
    .string("Vui lòng nhập tên")
    .trim()
    .min(1, "Vui lòng nhập tên")
    .max(255, "Tên quá dài, tối đa 255 ký tự")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({ examples: ["Thanh nhạc", "Hội họa cơ bản"] }),
  // Alias của `entityName` với .max(100).
  shortName: z
    .string("Vui lòng nhập tên")
    .trim()
    .min(1, "Vui lòng nhập tên")
    .max(100, "Tên quá dài, tối đa 100 ký tự")
    .refine((val) => !/\S{21,}/.test(val), "Mỗi cụm ký tự liền nhau không được vượt quá 20 ký tự")
    .meta({ examples: ["Quản trị viên", "Người dùng"] }),
  // Mật khẩu đăng nhập (@Size(min=8, max=100)) — khác commonZod.newPassword (max=64).
  // Describe NEW_PASSWORD để PasswordField bật nút generate + copy.
  authPassword: z
    .string("Vui lòng nhập mật khẩu")
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .max(100, "Mật khẩu quá dài, tối đa 100 ký tự")
    .describe(SCHEMA_DESCRIPTION.NEW_PASSWORD),
  // Refresh token (bare string, không trống)
  refreshToken: z
    .string("Refresh token không được để trống")
    .min(1, "Refresh token không được để trống"),
  // Số tiền VNĐ (BE BigDecimal). Renderer MONEY tự format nghìn theo vi-VN;
  // entity tự áp .min() theo @DecimalMin của BE.
  moneyVnd: z
    .number("Vui lòng nhập số tiền")
    .describe(SCHEMA_DESCRIPTION.MONEY)
    .meta({ examples: [50000, 100000] }),
  // S3 object key cho avatar — entity tự áp .nullable() / .max() theo BE (@Size).
  avatarKey: z
    .string("Vui lòng nhập avatar key")
    .min(1, "Vui lòng nhập avatar key")
    .meta({ examples: ["avatars/user-1.jpg", "avatars/2024/u-42.png"] }),
};

export const searchOptionsSchema = z.object({
  query: z
    .string()
    .transform((v) => v.replace(/[^\p{L}\p{N}\s]/gu, "").trim())
    .pipe(z.string().min(1))
    .optional()
    .catch(undefined)
    .meta({ examples: ["Nguyễn Văn", "thi đua 2024"] }),
  page: z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .optional()
    .default(0)
    .catch(0)
    .meta({ examples: [0, 1, 5] }),
  size: z.coerce
    .number()
    .int()
    .min(10)
    .max(100)
    .optional()
    .default(20)
    .catch(20)
    .meta({ examples: [10, 20, 50] }),
  sort: z
    .templateLiteral([z.string(), z.literal(","), z.enum(["asc", "desc"])])
    .optional()
    .catch(undefined),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;
export type SortOrder = "asc" | "desc";

export const searchResultsSchema = <T extends ZodType>(schema: T) =>
  z.object({
    data: z.array(schema),
    paging: z.object({
      page: z.number().int().min(0),
      size: z.number().int().min(1),
      totalElements: z.number().int(),
      totalPages: z.number().int(),
      hasNext: z.boolean(),
    }),
  });
