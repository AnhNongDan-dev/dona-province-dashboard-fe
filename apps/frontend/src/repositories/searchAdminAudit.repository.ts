import { formatObject } from "@repo/shared/src/common/object.helper";
import { pagedSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { adminAuditRowSchema } from "@repo/zod-schemas/src/entity/admin-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { queryClient } from "@/config/query-client.config";
import { createQueryRepository } from "./-factory";
import { defaultPagedResult, mapPaging, type PagedResult } from "./-paging";

// Nhật ký quản trị. Phân trang + lọc phía server; page tính từ 0.
export type SearchAdminAuditQuery = {
  page: number;
  size: number;
  actorId?: string;
  targetId?: string;
  action?: string;
  result?: string;
  /** YYYY-MM-DD theo giờ VN, tính cả hai đầu. */
  from?: string;
  to?: string;
};

const mapToDTO = (data: unknown) =>
  mapPaging(pagedSchema(adminAuditRowSchema).parse(data), (a) => a);
export type AdminAuditRowDTO = ReturnType<typeof mapToDTO>["items"][number];

export const searchAdminAuditRepository = createQueryRepository<
  PagedResult<AdminAuditRowDTO>,
  SearchAdminAuditQuery
>({
  queryKey: (query) => ["admin", "audit", ...Object.values(formatObject(query))],
  queryFn: async (query) => {
    const res = await clientAPI.Admin.searchAudit({ query });
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: defaultPagedResult<AdminAuditRowDTO>(),
  searchMode: true,
  queryOptions: { staleTime: 0, retry: false },
});

/** Mọi trang / bộ lọc — sau thao tác của admin thứ tự và nội dung có thể đổi ở bất kỳ trang nào. */
export const invalidateAllSearchAdminAuditQueries = () =>
  queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
