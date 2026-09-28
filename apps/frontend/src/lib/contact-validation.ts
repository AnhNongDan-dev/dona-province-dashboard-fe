import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import z from "zod";

// Kiểm trước kênh liên lạc ở FE (đăng ký, S12, màn thêm email). BE vẫn kiểm lại.
// Số di động VN 10 số, đầu 03/05/07/08/09; nhận 0… hoặc +84… (TASK-003 câu 7).
const VN_MOBILE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
const normalizePhoneInput = (v: string) => v.replace(/[\s.-]/g, "");

type Channel = (typeof OtpChannel)[keyof typeof OtpChannel];

export const normalizeContact = (channel: Channel, v: string) =>
  channel === OtpChannel.SMS ? normalizePhoneInput(v) : v.trim();

export const isValidContact = (channel: Channel, v: string) =>
  channel === OtpChannel.SMS ? VN_MOBILE.test(v) : z.email().safeParse(v).success;
