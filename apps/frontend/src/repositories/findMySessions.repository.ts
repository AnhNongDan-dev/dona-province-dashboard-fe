import { deviceSessionSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import z from "zod";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// Phiên còn sống của user đang đăng nhập (Phiên & thiết bị). Không phân trang (số phiên nhỏ).
const mapToDTO = (data: unknown) => z.array(deviceSessionSchema).parse(data);
export type MySessionDTO = ReturnType<typeof mapToDTO>[number];

export const findMySessionsRepository = createQueryRepository<MySessionDTO[]>({
  queryKey: () => ["me", "sessions"],
  queryFn: async () => {
    const res = await clientAPI.AccountCenter.listMySessions();
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: [],
  // Luôn đọc mới khi mở trang: phiên đổi liên tục (thiết bị khác đăng nhập / hết hạn).
  queryOptions: { staleTime: 0 },
});
