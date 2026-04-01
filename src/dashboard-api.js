import express from "express";
import { z } from "zod";
import {
  createRule,
  deleteRule,
  editableRuleSchema,
  getRules,
  updateRule
} from "./rule-store.js";
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

function parseJsonField(raw) {
  if (typeof raw === "string") {
    return JSON.parse(raw);
  }
  return raw;
}

function sendValidationError(res, error) {
  res.status(400).json({
    error: error instanceof Error ? error.message : "Invalid request."
  });
}

export function createDashboardRouter() {
  const router = express.Router();

  router.get("/rules", async (_req, res) => {
    res.json({
      rules: await getRules()
    });
  });

  router.post("/rules", async (req, res) => {
    try {
      const created = await createRule(editableRuleSchema.parse(parseJsonField(req.body)));
      res.status(201).json(created);
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  router.put("/rules/:id", async (req, res) => {
    try {
      const updated = await updateRule(req.params.id, editableRuleSchema.parse(parseJsonField(req.body)));
      res.json(updated);
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  router.delete("/rules/:id", async (req, res) => {
    try {
      await deleteRule(req.params.id);
      res.status(204).end();
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  router.get("/audits", async (_req, res) => {
    res.json({
      audits: await listAuditRuns(),
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
      const input = auditAddressSchema.parse(parseJsonField(req.body));
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
