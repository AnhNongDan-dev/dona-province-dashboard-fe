import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { commonZod } from "../common";
import { notifiedResultSchema } from "../entity/account-center-schema";
import { connectionSchema } from "../entity/connection-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

export const connectionContract = c.router({
  listMyConnections: {
    summary: "Hệ thống và tài khoản đã liên kết của tôi",
    description: "Dùng cho trang chủ (các hệ thống) và Account Center (Liên kết tài khoản).",
    method: "GET",
    path: "/api/me/connections",
    responses: { 200: successResponseSchema(z.array(connectionSchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Unauthenticated, ErrorCode.SessionExpired),
  },
  unlinkMyConnection: {
    summary: "Hủy liên kết",
    description:
      "Cần xác thực lại ≤ 5 phút. Đăng xuất user khỏi chính hệ thống đó trên mọi thiết bị; phiên Central giữ nguyên.",
    method: "DELETE",
    path: "/api/me/connections/:linkId",
    pathParams: z.object({ linkId: commonZod.pathId }),
    body: c.noBody(),
    responses: { 200: successResponseSchema(notifiedResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ReauthRequired,
      ErrorCode.UnlinkNotAllowed,
      ErrorCode.ConnectionNotFound,
    ),
  },
});
