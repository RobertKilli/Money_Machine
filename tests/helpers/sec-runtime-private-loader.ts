import type { Plugin } from "vite";

/** Test compiler access; never configured in Next.js or application builds. */
export function secRuntimePrivateLoader():Plugin {
  return {
    name:"sec-runtime-private-test-access",
    enforce:"pre",
    resolveId(id) {
      if(id==="test-only:sec-runtime-constructor")return "\0sec-runtime-private-constructor";
    },
    load(id) {
      if(id==="\0sec-runtime-private-constructor")return 'export { createSecRuntimeBatchForTest as createSecRuntimeBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";';
    },
    transform(code,id) {
      if(id.replaceAll("\\","/").endsWith("/src/domain/intelligence/sec-edgar-event-source-provenance-runtime.ts"))
        return `${code}\nexport { constructSecRuntimeBatch as createSecRuntimeBatchForTest };\n`;
    },
  };
}
