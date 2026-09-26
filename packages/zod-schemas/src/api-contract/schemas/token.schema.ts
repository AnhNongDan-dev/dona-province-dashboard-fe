import { z } from "zod";
import { commonZod } from "../../common";

export const HEADER_AUTH_DESCRIPTION = "Header Authorization";

const dummyUuid: string = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

export const jwtAuthHeaderSchema = z
  .object({
    authorization: z.string().regex(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
      message: 'Invalid Authorization format. Expected "Bearer <jwt-token>"',
    }),
    token: z
      .object({
        userId: commonZod.entityId.default(0),
        jwtId: z.uuid().default(dummyUuid),
      })
      .default({
        userId: 0,
        jwtId: dummyUuid,
      })
      .meta({ hidden: true }),
  })
  .describe(HEADER_AUTH_DESCRIPTION);
export const jwtZod = z.jwt({ message: "Invalid JWT format" }).meta({
  example:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiN2ExMGVmMy1mZWVkLTRmM2MtOTU0MS05M2ZjMTYzNTRlNjgiLCJqdGkiOiI1NzQ5M2U4MC0wNDRkLTQxN2ItOTBjMy0zNjkyZjExNWE3YjQiLCJ0eXBlIjoiYXV0aCIsImlzcyI6ImFsLWNvcmUiLCJpYXQiOjE3NDg1MDk4MTAsImV4cCI6MTc0ODUxMDQxMH0.-uRvw-h5zUGA5zVq81hDbvF-UhiMDQYnvpkrd6WkOz8",
});
