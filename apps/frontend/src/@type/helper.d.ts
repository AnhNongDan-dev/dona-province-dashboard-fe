import type { AppRoute } from "@ts-rest/core";
import type z from "zod";
export type ExtractApiContract<T extends AppRoute> = {
  responseData: z.infer<T["responses"][200]>;
  query: z.infer<T["query"]>;
  body: z.infer<T["body"]>;
  pathParams: z.infer<T["pathParams"]>;
};
export type ExtractResponseData<T extends AppRoute> = ExtractApiContract<T>["responseData"];
