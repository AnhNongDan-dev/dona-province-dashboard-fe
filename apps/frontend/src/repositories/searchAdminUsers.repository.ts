import { formatObject } from "@repo/shared/src/common/object.helper";
import { pagedSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { adminUserRowSchema } from "@repo/zod-schemas/src/entity/admin-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { queryClient } from "@/config/query-client.config";
import { createQueryRepository } from "./-factory";
import { defaultPagedResult, mapPaging, type PagedResult } from "./-paging";

// AD1 — tìm tài khoản (A1). Phân trang + lọc phía server; page tính từ 0.
export type SearchAdminUsersQuery = {
  page: number;
  size: number;
  q?: string;
  status?: string;
  providerCode?: string;
};

const mapToDTO = (data: unknown) =>
  mapPaging(pagedSchema(adminUserRowSchema).parse(data), (u) => u);
export type AdminUserRowDTO = ReturnType<typeof mapToDTO>["items"][number];

export const searchAdminUsersRepository = createQueryRepository<
  PagedResult<AdminUserRowDTO>,
  SearchAdminUsersQuery
>({
  queryKey: (query) => ["admin", "users", ...Object.values(formatObject(query))],
  queryFn: async (query) => {
    const res = await clientAPI.Admin.searchUsers({ query });
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: defaultPagedResult<AdminUserRowDTO>(),
  searchMode: true,
  queryOptions: { staleTime: 0, retry: false },
});

/** Mọi trang / bộ lọc — sau thao tác của admin thứ tự và nội dung có thể đổi ở bất kỳ trang nào. */
export const invalidateAllSearchAdminUsersQueries = () =>
  queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
