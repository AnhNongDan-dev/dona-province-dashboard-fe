import { adminUserDetailSchema } from "@repo/zod-schemas/src/entity/admin-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// AD2 — chi tiết một tài khoản (A2). Luôn đọc mới: trạng thái đổi sau mỗi thao tác của admin.
const mapToDTO = (data: unknown) => adminUserDetailSchema.parse(data);
export type AdminUserDetailDTO = ReturnType<typeof mapToDTO>;

export const findAdminUserRepository = createQueryRepository<AdminUserDetailDTO, string>({
  queryKey: (id) => ["admin", "user", id],
  queryFn: async (id) => {
    const res = await clientAPI.Admin.getUser({ params: { id } });
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  // Không có giá trị mặc định hợp lý: trang A2 chỉ đọc data khi isSuccess.
  defaultData: null as unknown as AdminUserDetailDTO,
  queryOptions: { staleTime: 0, retry: false },
});
