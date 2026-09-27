import z from "zod";
import { commonZod } from "../common";
import { linkActionZod, otpChannelZod } from "./link-transaction-schema";

// Mirror D22 — giao dịch gộp tài khoản do user tự làm (TASK-005). Gắn trình duyệt + phiên đã tạo.
// Enum chỉ dùng để rẽ nhánh màn hình, không hiển thị ra UI → không có LABEL/OPTIONS.

export const MergeState = {
  AWAITING_CENTRAL_LOGIN: "AWAITING_CENTRAL_LOGIN",
  CENTRAL_VERIFIED: "CENTRAL_VERIFIED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
} as const;
export type MergeState = (typeof MergeState)[keyof typeof MergeState];
export const mergeStateZod = z.enum(Object.values(MergeState) as [MergeState, ...MergeState[]]);

/** Bên giữ account khi hai tài khoản cùng liên kết một hệ thống. */
export const MergeKeep = { TARGET: "TARGET", SOURCE: "SOURCE" } as const;
export type MergeKeep = (typeof MergeKeep)[keyof typeof MergeKeep];
export const mergeKeepZod = z.enum([MergeKeep.TARGET, MergeKeep.SOURCE]);

const mergeContactSchema = z.object({ channel: otpChannelZod, maskedDestination: z.string() });

export const mergeAccountSchema = z.object({
  providerCode: z.string(),
  providerName: z.string(),
  username: z.string(),
  displayName: commonZod.fullNameResponse,
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
});
export type MergeAccount = z.infer<typeof mergeAccountSchema>;

/** Không có username rõ — chỉ định danh đã che (máy dùng chung). */
const mergeIdentitySchema = z.object({
  displayName: commonZod.fullNameResponse,
  maskedLoginId: z.string(),
  contacts: z.array(mergeContactSchema),
  accounts: z.array(mergeAccountSchema),
});
export type MergeIdentity = z.infer<typeof mergeIdentitySchema>;

export const mergeConflictSchema = z.object({
  providerCode: z.string(),
  providerName: z.string(),
  targetAccount: mergeAccountSchema,
  sourceAccount: mergeAccountSchema,
  resolvable: z.boolean(),
});
export type MergeConflict = z.infer<typeof mergeConflictSchema>;

export const mergeTransactionSchema = z.object({
  txId: z.guid(),
  state: mergeStateZod,
  allowedActions: z.array(linkActionZod),
  expiresAt: commonZod.datetime,
  failureCode: z.string().nullable(),
  returnUrl: z.string(),
  target: mergeIdentitySchema,
  // source / conflicts / contactChanges chỉ có sau bước 2 (đăng nhập tài khoản thứ hai).
  source: mergeIdentitySchema.nullable(),
  conflicts: z.array(mergeConflictSchema).nullable(),
  contactChanges: z
    .object({ moved: z.array(mergeContactSchema), dropped: z.array(mergeContactSchema) })
    .nullable(),
});
export type MergeTransaction = z.infer<typeof mergeTransactionSchema>;
