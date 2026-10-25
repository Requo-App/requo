import { Inngest } from "inngest";

import { InngestObservabilityMiddleware } from "@/lib/observability/inngest";

export const inngest = new Inngest({
  id: "requo",
  middleware: [InngestObservabilityMiddleware],
});
