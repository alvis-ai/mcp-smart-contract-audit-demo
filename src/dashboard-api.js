import express from "express";
import { z } from "zod";
import {
  getAuditRun,
  listAuditRuns
} from "./audit-store.js";
import {
  enqueueAddressAuditJob,
  getAuditQueueStats
} from "./audit-queue.js";

const auditAddressSchema = z.object({
  address: z.string().min(1),
  chainId: z.number().int().positive().optional(),
  contractType: z.enum(["general", "launchpad", "nft", "staking", "lending"]).optional()
});

function sendValidationError(res, error) {
  res.status(400).json({
    error: error instanceof Error ? error.message : "Invalid request."
  });
}

export function createDashboardRouter() {
  const router = express.Router();

  router.get("/audits", async (_req, res) => {
    res.json({
      audits: await listAuditRuns({ includeResult: false }),
      queue: await getAuditQueueStats()
    });
  });

  router.get("/audits/:id", async (req, res) => {
    const audit = await getAuditRun(req.params.id);
    if (!audit) {
      res.status(404).json({ error: "Audit run not found." });
      return;
    }
    res.json(audit);
  });

  router.get("/audits/stats/queue", async (_req, res) => {
    res.json(await getAuditQueueStats());
  });

  router.post("/audits/address", async (req, res) => {
    try {
      const input = auditAddressSchema.parse(req.body);
      const job = await enqueueAddressAuditJob({
        address: input.address,
        chainId: input.chainId,
        contractType: input.contractType
      });
      res.status(202).json(job);
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  return router;
}
