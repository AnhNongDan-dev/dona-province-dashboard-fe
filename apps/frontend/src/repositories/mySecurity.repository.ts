import { accountSecuritySchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// Thông tin bảo mật của user đang đăng nhập (trang Bảo mật).
const mapToDTO = (data: unknown) => accountSecuritySchema.parse(data);
export type MySecurityDTO = ReturnType<typeof mapToDTO>;

export const mySecurityRepository = createQueryRepository<MySecurityDTO>({
  queryKey: () => ["me", "security"],
  queryFn: async () => {
    const res = await clientAPI.AccountCenter.getMySecurity();
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  // Chỉ dùng khi chưa tải xong / lỗi — trang Bảo mật hiện skeleton / lỗi thay vì đọc giá trị này.
  defaultData: {
    username: "",
    contacts: [],
    phone: null,
    passwordChangedAt: new Date(0),
    pendingContacts: [],
  },
  queryOptions: { staleTime: 0 },
});
