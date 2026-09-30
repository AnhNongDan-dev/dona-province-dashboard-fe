import z from "zod";

// Kiểm trước email / SĐT ở FE (đăng ký, trang Bảo mật, màn thêm email). BE vẫn kiểm lại.
// SĐT chỉ là thông tin tự khai, không xác minh: số di động VN 10 số, đầu 03/05/07/08/09;
// nhận 0… hoặc +84….
const VN_MOBILE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

export const normalizePhone = (v: string) => v.replace(/[\s.-]/g, "");
export const isValidPhone = (v: string) => VN_MOBILE.test(v);
export const isValidEmail = (v: string) => z.email().safeParse(v.trim()).success;

export const PHONE_FORMAT_ERROR = "Số điện thoại di động không hợp lệ (10 số, đầu 03/05/07/08/09)";
