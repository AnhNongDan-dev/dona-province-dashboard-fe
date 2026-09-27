import { accountSecuritySchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// D20a — thông tin bảo mật của user đang đăng nhập (S12).
const mapToDTO = (data: unknown) => accountSecuritySchema.parse(data);
export type MySecurityDTO = ReturnType<typeof mapToDTO>;

export const mySecurityRepository = createQueryRepository<MySecurityDTO>({
  queryKey: () => ["me", "security"],
  queryFn: async () => {
    const res = await clientAPI.AccountCenter.getMySecurity();
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  // Chỉ dùng khi chưa tải xong / lỗi — trang S12 hiện skeleton / lỗi thay vì đọc giá trị này.
  defaultData: { username: "", contacts: [], passwordChangedAt: new Date(0), pendingContacts: [] },
  queryOptions: { staleTime: 0 },
});
