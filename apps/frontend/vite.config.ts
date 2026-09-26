import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type PluginOption } from "vite";
import svgr from "vite-plugin-svgr";

// Plugin to inject react-scan script
function injectReactScan(): Plugin {
  return {
    name: "inject-react-scan",
    transformIndexHtml(html) {
      if (process.env.VITE_ENABLE_SCAN === "true") {
        return html.replace(
          "<!-- react-scan placeholder -->",
          '<script type="module" src="https://unpkg.com/react-scan/dist/auto.global.js"></script>',
        );
      }
      // Remove placeholder comment if not in scan mode
      return html.replace("<!-- react-scan placeholder -->\n    ", "");
    },
  };
}

// Plugin to serve OpenAPI docs at /api-docs
function serveOpenApiDocs(): Plugin {
  const openApiDistPath = path.resolve(__dirname, "../open-api/dist");
  return {
    name: "serve-openapi-docs",
    configureServer(server) {
      server.middlewares.use("/api-docs", (req, res, next) => {
        const filePath = path.join(
          openApiDistPath,
          req.url === "/" ? "index.html" : req.url || "index.html",
        );
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath);

          const contentTypes: Record<string, string> = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".yaml": "text/yaml",
            ".yml": "text/yaml",
            ".svg": "image/svg+xml",
          };

          res.setHeader("Content-Type", contentTypes[ext] || "text/plain");

          // 👉 HTML: đọc string để replace
          if (ext === ".html") {
            let content = fs.readFileSync(filePath, "utf8");

            content = content.replaceAll("./", "./api-docs/");

            res.end(content);
            return;
          }

          // 👉 File khác: giữ nguyên Buffer
          const content = fs.readFileSync(filePath);
          res.end(content);
        } else {
          next();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../../"), "");
  console.log(`vite config:`, {
    MODE: mode,
    SERVER_URL: env.VITE_SERVER_URL,
  });

  // Điều khiển plugins dựa trên env variable
  const plugins: PluginOption[] = [
    injectReactScan(),
    tanstackRouter({
      routesDirectory: "./src/routes",
      target: "react",
      autoCodeSplitting: true,
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePrefix: "-",
      quoteStyle: "single",
    }),
    react(), // Make sure to add this plugin after the TanStack Router Bundler plugin
    tailwindcss(),
    svgr(),
  ];

  // Bật serveOpenApiDocs khi chạy dev:docs
  if (process.env.VITE_SERVE_DOCS === "true") {
    plugins.push(serveOpenApiDocs());
  }

  return {
    server: {
      port: Number(env.FRONTEND_PORT) || 3000,
    },
    plugins,
    resolve: {
      alias: {
        "@repo/zod-schemas": path.resolve(__dirname, "../../packages/zod-schemas"),
        "@repo/shared": path.resolve(__dirname, "../../packages/shared"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: ["@repo/zod-schemas", "@repo/shared"],
    },
    envDir: "../../",
    envPrefix: "VITE",
    define: {
      "process.env": {
        // Please define it manually and do not add the SECRET key here!!!
        NODE_ENV: mode,
      },
    },
    build: {
      emptyOutDir: true,
      outDir: "../../dist",
      minify: "terser",
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Pin Rollup's shared CommonJS-interop helpers (getDefaultExportFromCjs, etc.)
            // to the React chunk. These are virtual modules (not under node_modules) with no
            // deps; if left unassigned Rollup parks them in an arbitrary heavy chunk (e.g.
            // vendor-docx), which then gets dragged into the initial load by whoever imports
            // the helper. Keeping them in the always-eager vendor-react chunk avoids that.
            if (id.includes("commonjsHelpers") || id.includes("commonjs-dynamic-modules"))
              return "vendor-react";

            if (!id.includes("node_modules")) return;

            // Resolve the REAL package name from the segment after the last
            // `node_modules/`. Matching against the full `id` is unsafe under pnpm:
            // its dir names embed peer-dep versions (e.g. `@radix-ui+react-dialog@1.1_react@19`),
            // so substring checks like `id.includes("react-dom")` / `id.includes("react/")`
            // mis-bucket unrelated packages. That mis-bucketing creates CIRCULAR imports
            // between vendor chunks (vendor-react ↔ vendor-radix), which breaks ESM init
            // order at runtime → "Cannot read properties of undefined (reading 'forwardRef')".
            const tail = id.replace(/\\/g, "/").split("node_modules/").pop() ?? "";
            const pkg = tail.startsWith("@")
              ? tail.split("/").slice(0, 2).join("/") // scoped: "@radix-ui/react-slot"
              : tail.split("/")[0]; // unscoped: "react"

            // React core — a single SELF-CONTAINED chunk. These packages depend only on
            // each other (react-dom→react/scheduler, use-sync-external-store→react), never
            // on radix/tanstack/etc. Keeping them together makes this chunk a pure "sink"
            // with no outgoing vendor imports, so it can never sit in an import cycle.
            if (
              pkg === "react" ||
              pkg === "react-dom" ||
              pkg === "scheduler" ||
              pkg === "react-is" ||
              pkg === "use-sync-external-store" ||
              pkg === "object-assign"
            ) {
              return "vendor-react";
            }

            // TanStack ecosystem
            if (pkg === "@tanstack/react-router" || pkg === "@tanstack/router-core")
              return "vendor-tanstack-router";
            if (pkg === "@tanstack/react-query" || pkg === "@tanstack/query-core")
              return "vendor-tanstack-query";
            if (pkg === "@tanstack/react-table" || pkg === "@tanstack/table-core")
              return "vendor-tanstack-table";

            // Radix UI primitives
            if (pkg.startsWith("@radix-ui/") || pkg === "radix-ui") return "vendor-radix";

            // Icons
            if (pkg === "@tabler/icons-react") return "vendor-tabler-icons";
            if (pkg === "lucide-react") return "vendor-lucide-icons";

            // Heavy libs
            if (pkg === "recharts" || pkg.startsWith("d3-") || pkg === "victory-vendor")
              return "vendor-recharts";


            // Forms
            if (pkg === "react-hook-form" || pkg.startsWith("@hookform/")) return "vendor-forms";

            // Date utilities
            if (pkg === "date-fns" || pkg === "react-day-picker") return "vendor-date";

            // Zod
            if (pkg === "zod") return "vendor-zod";
          },
        },
      },
    },
  };
});
