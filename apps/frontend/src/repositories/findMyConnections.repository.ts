import { connectionSchema } from "@repo/zod-schemas/src/entity/connection-schema";
import z from "zod";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// Hệ thống đã đăng ký + tài khoản đã liên kết của user đang đăng nhập (trang chủ, Liên kết tài
// khoản). clientAPI không validate response → parse ở đây để linkedAt / lastSsoLoginAt thành Date.
const mapToDTO = (data: unknown) => z.array(connectionSchema).parse(data);
export type MyConnectionDTO = ReturnType<typeof mapToDTO>[number];

export const findMyConnectionsRepository = createQueryRepository<MyConnectionDTO[]>({
  // Cache bị xóa khi đăng xuất / đổi người (queryClient.clear), nên key không cần id user.
  queryKey: () => ["me", "connections"],
  queryFn: async () => {
    const res = await clientAPI.Connection.listMyConnections();
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  defaultData: [],
});
