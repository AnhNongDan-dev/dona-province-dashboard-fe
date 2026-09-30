import { formatObject } from "@repo/shared/src/common/object.helper";
import { activitySchema, pagedSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";
import { defaultPagedResult, mapPaging, type PagedResult } from "./-paging";

// Lịch sử hoạt động của chính user. Phân trang + lọc phía server; page tính từ 0.
export type SearchMyActivitiesQuery = {
  page: number;
  size: number;
  /** Mã loại sự kiện, phân cách bằng dấu phẩy. */
  types?: string;
  /** YYYY-MM-DD theo giờ VN, tính cả hai đầu. */
  from?: string;
  to?: string;
};

// clientAPI không validate response → parse để occurredAt thành Date.
const mapToDTO = (data: unknown) => mapPaging(pagedSchema(activitySchema).parse(data), (a) => a);
export type MyActivityDTO = ReturnType<typeof mapToDTO>["items"][number];

export const searchMyActivitiesRepository = createQueryRepository<
  PagedResult<MyActivityDTO>,
  SearchMyActivitiesQuery
>({
  queryKey: (query) => ["me", "activities", ...Object.values(formatObject(query))],
  queryFn: async (query) => {
    const res = await clientAPI.AccountCenter.searchMyActivities({ query });
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: defaultPagedResult<MyActivityDTO>(),
  searchMode: true,
  // Lịch sử chỉ tăng thêm — mở lại trang là đọc mới.
  queryOptions: { staleTime: 0 },
});
