import { formatObject } from "@repo/shared/src/common/object.helper";
import { activitySchema, pagedSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { queryClient } from "@/config/query-client.config";
import { createQueryRepository } from "./-factory";
import { defaultPagedResult, mapPaging, type PagedResult } from "./-paging";
import type { MyActivityDTO } from "./searchMyActivities.repository";

// Lịch sử hoạt động của một tài khoản, cùng hình dạng lịch sử hoạt động của chính user.
export type SearchAdminUserActivitiesQuery = { id: string; page: number; size: number };

const mapToDTO = (data: unknown) => mapPaging(pagedSchema(activitySchema).parse(data), (a) => a);

export const searchAdminUserActivitiesRepository = createQueryRepository<
  PagedResult<MyActivityDTO>,
  SearchAdminUserActivitiesQuery
>({
  queryKey: (query) => ["admin", "user-activities", ...Object.values(formatObject(query))],
  queryFn: async ({ id, ...query }) => {
    const res = await clientAPI.Admin.searchUserActivities({ params: { id }, query });
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: defaultPagedResult<MyActivityDTO>(),
  searchMode: true,
  queryOptions: { staleTime: 0, retry: false },
});

/** Mọi trang / bộ lọc — sau thao tác của admin thứ tự và nội dung có thể đổi ở bất kỳ trang nào. */
export const invalidateAllSearchAdminUserActivitiesQueries = () =>
  queryClient.invalidateQueries({ queryKey: ["admin", "user-activities"] });
