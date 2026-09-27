import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { connectionSchema } from "../entity/connection-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

export const connectionContract = c.router({
  listMyConnections: {
    summary: "D16 — Hệ thống và tài khoản đã liên kết của tôi",
    description: "Dùng cho dashboard (S8) và Account Center (S9).",
    method: "GET",
    path: "/api/me/connections",
    responses: { 200: successResponseSchema(z.array(connectionSchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Unauthenticated, ErrorCode.SessionExpired),
  },
});
