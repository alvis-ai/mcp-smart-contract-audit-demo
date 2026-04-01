import { fileURLToPath } from "node:url";
import { runAuditWorker } from "./audit-queue.js";

export async function startAuditWorker(options = {}) {
  await runAuditWorker(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startAuditWorker().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
