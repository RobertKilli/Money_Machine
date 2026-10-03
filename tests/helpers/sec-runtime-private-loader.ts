import type { Plugin } from "vite";

/** Test compiler access; never configured in Next.js or application builds. */
export function secRuntimePrivateLoader():Plugin {
  return {
    name:"sec-runtime-private-test-access",
    enforce:"pre",
    resolveId(id) {
      if(id==="test-only:sec-runtime-constructor")return "\0sec-runtime-private-constructor";
      if(id==="test-only:exchange-announcement-normal-form")return "\0exchange-announcement-private-normal-form";
    },
    load(id) {
      if(id==="\0sec-runtime-private-constructor")return 'export { createSecRuntimeBatchForTest as createSecRuntimeBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";';
      if(id==="\0exchange-announcement-private-normal-form")return 'export { constructSyntheticAnnouncementForTest as constructSyntheticAnnouncement, compareFingerprintMaterialForTest as compareFingerprintMaterial } from "@/domain/intelligence/event-intelligence-exchange-regulatory-announcement-source-qualification";';
    },
    transform(code,id) {
      if(id.replaceAll("\\","/").endsWith("/src/domain/intelligence/sec-edgar-event-source-provenance-runtime.ts"))
        return `${code}\nexport { constructSecRuntimeBatch as createSecRuntimeBatchForTest };\n`;
      if(id.replaceAll("\\","/").endsWith("/src/domain/intelligence/event-intelligence-exchange-regulatory-announcement-source-qualification.ts"))
        return `${code}\nexport { constructSyntheticAnnouncement as constructSyntheticAnnouncementForTest, compareFingerprintMaterialForTest };\n`;
    },
  };
}
