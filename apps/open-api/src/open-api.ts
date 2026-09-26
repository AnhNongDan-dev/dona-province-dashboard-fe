import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appContract } from "@repo/zod-schemas/src/api-contract/index";
import { OpenAPIHelper } from "@repo/zod-schemas/src/openapi/openAPI.helper";
import { generateOpenApi, type SchemaTransformerSync } from "@ts-rest/open-api";
import { format } from "date-fns";
import yaml from "yaml";
import { toJSONSchema, type ZodType, z } from "zod";

const publicDir = path.resolve(__dirname, "./../dist/");

const currentDateTime = format(new Date(), "HH:mm dd-MM-yyyy ");

// https://ts-rest.com/docs/open-api
OpenAPIHelper.extendErrorResponse(appContract);
const openApiDocument = generateOpenApi(
  appContract,
  {
    info: {
      title: "DONA Province Dashboard",
      version: "1.0.0",
      license: { name: "MIT" },
      description: `**Cập nhật lúc:** ${currentDateTime}`,
      contact: { name: "Donasky", email: "admin@donasky.com" },
    },
    servers: [
      {
        url: "http://localhost:8080",
        description: "Local",
      },
    ],
  },
  {
    schemaTransformer: ({ schema }) => {
      try {
        return toJSONSchema(schema as ZodType, {
          unrepresentable: "any",
          override: (ctx) => {
            try {
              if (ctx.zodSchema?._zod.def.type === "date") {
                ctx.jsonSchema.type = "string";
                ctx.jsonSchema.format = "date-time";
              }
              // Extract refine messages and add to description
              const refineMessages = OpenAPIHelper.extractRefineMessages(ctx.zodSchema);
              if (refineMessages.length > 0) {
                const existingDesc = ctx.jsonSchema.description || "";
                const refineDesc = `**Validation:**\n${refineMessages.map((msg, i) => `${i + 1}. ${msg}`).join("\n")}`;
                ctx.jsonSchema.description = existingDesc
                  ? `${existingDesc}\n\n${refineDesc}`
                  : refineDesc;
              }
            } catch {}
          },
        }) as unknown as SchemaTransformerSync;
      } catch {
        return null;
      }
    },
  },
);
// https://zod.dev/json-schema
// z.number(); // ❌
// z.int64(); // ❌
// z.symbol(); // ❌
// z.undefined(); // ❌
// z.void(); // ❌
// z.date(); // ❌
// z.map(); // ❌
// z.set(); // ❌
// z.transform(); // ❌
// z.nan(); // ❌
// z.custom(); // ❌

const itemHiddenSchema = z.object({
  schema: z.object({ hidden: z.literal(true) }),
});

// remove hidden field - remove headers.token
const cleanObject = (data: unknown, deep = 4) => {
  if (deep <= 0) return;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (key === "parameters" && Array.isArray(val)) {
        obj[key] = val.filter((item) => !itemHiddenSchema.safeParse(item).success);
      } else cleanObject(val, deep - 1);
    });
  }
};
cleanObject(openApiDocument);

// do not write file after deploy to GAE
try {
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
} catch (error) {
  console.error(`mkdirSync failed ${error}`);
}
try {
  writeFileSync(
    path.resolve(publicDir, "openapi.json"),
    JSON.stringify(openApiDocument, null, 2),
    "utf8",
  );
  writeFileSync(path.resolve(publicDir, "openapi.yaml"), yaml.stringify(openApiDocument), "utf8");
} catch (error) {
  console.error("writeFileSync failed", error);
}

export default openApiDocument;
