import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import {
  computeSourceHash,
  createSourceChunks,
  findSimilarSourceChunks
} from "./audit-knowledge-store.js";

const DEFAULT_MODEL = process.env.AUDIT_AI_MODEL || "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = process.env.AUDIT_AI_EMBEDDING_MODEL || "text-embedding-3-small";
const DEFAULT_TEMPERATURE = Number(process.env.AUDIT_AI_TEMPERATURE || 0.1);
const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.AUDIT_AI_TIMEOUT_MS || 60000));
const DEFAULT_MAX_SOURCE_CHARS = Math.max(8000, Number(process.env.AUDIT_AI_MAX_SOURCE_CHARS || 24000));

function isAiEnabled() {
  const mode = String(process.env.AUDIT_AI_ENABLED || "auto").toLowerCase();
  if (mode === "off" || mode === "false" || mode === "0") {
    return false;
  }
  return Boolean(process.env.OPENAI_API_KEY || process.env.AUDIT_AI_API_KEY);
}

function isEmbeddingEnabled() {
  const mode = String(process.env.AUDIT_AI_EMBEDDINGS_ENABLED || "auto").toLowerCase();
  if (mode === "off" || mode === "false" || mode === "0") {
    return false;
  }
  return isAiEnabled();
}

function openAiConfig() {
  const apiKey = process.env.AUDIT_AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AUDIT_AI_BASE_URL || process.env.OPENAI_BASE_URL || "";
  return {
    apiKey,
    ...(baseURL ? { configuration: { baseURL } } : {})
  };
}

function createChatModel() {
  return new ChatOpenAI({
    ...openAiConfig(),
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    timeout: DEFAULT_TIMEOUT_MS
  });
}

function createEmbeddingModel() {
  return new OpenAIEmbeddings({
    ...openAiConfig(),
    model: DEFAULT_EMBEDDING_MODEL,
    timeout: DEFAULT_TIMEOUT_MS
  });
}

function useToolCallingAgents() {
  const mode = String(process.env.AUDIT_AI_AGENT_MODE || "auto").toLowerCase();
  if (mode === "tools") {
    return true;
  }
  if (mode === "direct") {
    return false;
  }
  return !DEFAULT_MODEL.toLowerCase().includes("deepseek");
}

function messageContentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }
      return part?.text || part?.content || "";
    }).join("\n");
  }
  return String(content || "");
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("AI model did not return valid JSON.");
  }
}

async function invokeJsonModel(systemPrompt, payload, shapeDescription) {
  const jsonModel = createChatModel().withConfig({
    response_format: { type: "json_object" }
  });
  const messages = [{
    role: "system",
    content: [
      systemPrompt,
      "Return only one valid JSON object. Do not wrap the JSON in Markdown.",
      "Do not include Solidity code blocks outside JSON string values.",
      "The first character of your response must be { and the last character must be }.",
      `Required JSON shape: ${shapeDescription}`
    ].join("\n")
  }, {
    role: "user",
    content: JSON.stringify(payload)
  }];
  const response = await jsonModel.invoke(messages);
  const text = messageContentToText(response.content);
  try {
    return parseJsonObject(text);
  } catch {
    const repaired = await jsonModel.invoke([{
      role: "system",
      content: [
        "Convert the previous model output into one valid JSON object.",
        "Return only JSON. Do not include Markdown or explanatory text.",
        `Required JSON shape: ${shapeDescription}`
      ].join("\n")
    }, {
      role: "user",
      content: text || JSON.stringify(response.additional_kwargs || {})
    }]);
    return parseJsonObject(messageContentToText(repaired.content));
  }
}

function compactFinding(finding) {
  return {
    engine: finding.engine,
    severity: finding.severity,
    title: finding.title,
    sourcePath: finding.sourcePath || "",
    line: finding.line || null,
    rationale: String(finding.rationale || "").slice(0, 800),
    instances: (finding.instances || []).slice(0, 3).map((instance) => ({
      sourcePath: instance.sourcePath || "",
      line: instance.line || null,
      description: String(instance.description || "").slice(0, 500)
    }))
  };
}

async function runDirectSourceReview({ auditResult, chunks, similarChunks, sourceHash }) {
  return invokeJsonModel(
    [
      "You are a senior smart contract security auditor.",
      "Perform two review tracks: analyzer triage and independent source-code review.",
      "Separate analyzer-confirmed findings from AI source-review findings.",
      "Cite source paths and line ranges when possible.",
      "Do not invent vulnerabilities. Evidence-weak items must be manual-check notes.",
      "Write Chinese content in all natural-language fields."
    ].join("\n"),
    {
      contract: {
        address: auditResult.address,
        chainId: auditResult.chainId,
        contractName: auditResult.contractName,
        compilerVersion: auditResult.compilerVersion,
        sourceRepository: auditResult.sourceRepository,
        primarySourcePath: auditResult.primarySourcePath,
        sourceHash
      },
      analyzerFindings: (auditResult.externalAnalyses || []).map(compactAnalysis),
      normalizedFindings: (auditResult.findings || []).slice(0, 40).map(compactFinding),
      sourceContext: sourceDigest(chunks).slice(0, DEFAULT_MAX_SOURCE_CHARS),
      similarKnowledge: similarChunks.map((chunk) => ({
        score: Number(chunk.score.toFixed(4)),
        sourceHash: chunk.sourceHash,
        sourcePath: chunk.sourcePath,
        lines: `${chunk.startLine}-${chunk.endLine}`,
        excerpt: chunk.content.slice(0, 1200)
      }))
    },
    "{ executiveSummary: string, riskLevel: 'critical'|'high'|'medium'|'low'|'informational'|'unknown', keyRisks: [{ severity, title, evidence, recommendation }], analyzerInterpretation: string, sourceReview: string, cacheAndReuseNotes: string }"
  );
}

async function runDirectFinalReport({ auditResult, sourceAnalysis, similarChunks, sourceHash }) {
  return invokeJsonModel(
    [
      "You are a smart contract audit report lead.",
      "Synthesize tool audit results and AI source-review results into a final Chinese audit report.",
      "Include issue points, severity, evidence, impact, concrete modification suggestions, and manual review checklist.",
      "Deduplicate overlapping findings and preserve source attribution.",
      "Do not add claims that are absent from analyzer findings or AI source review."
    ].join("\n"),
    {
      contract: {
        address: auditResult.address,
        chainId: auditResult.chainId,
        contractName: auditResult.contractName,
        compilerVersion: auditResult.compilerVersion,
        sourceRepository: auditResult.sourceRepository,
        primarySourcePath: auditResult.primarySourcePath,
        sourceHash
      },
      rawSummary: auditResult.summary,
      analyzerSummaries: (auditResult.externalAnalyses || []).map(compactAnalysis),
      normalizedFindings: (auditResult.findings || []).slice(0, 60).map(compactFinding),
      aiSourceAnalysis: sourceAnalysis,
      similarChunkCount: similarChunks.length
    },
    "{ title: string, executiveSummary: string, overallRiskLevel: 'critical'|'high'|'medium'|'low'|'informational'|'unknown', scope: object, findings: [{ id, source, severity, title, evidence, impact, recommendation, affectedCode }], modificationSuggestions: [{ priority, title, suggestion, rationale }], analyzerSummary: string, aiReviewSummary: string, cacheAndReuseSummary: string, manualReviewChecklist: string[], reportMarkdown: string }"
  );
}

async function runDirectReportTranslation({ finalReport, targetLocale = "en-US" }) {
  const language = targetLocale === "en-US" ? "English" : "Chinese";
  return invokeJsonModel(
    [
      "You are a professional security audit report translator.",
      `Translate the provided smart contract audit report into ${language}.`,
      "Preserve the JSON structure exactly.",
      "Preserve code identifiers, contract names, function names, addresses, source paths, line numbers, severity enum values, source enum values, priority enum values and hashes exactly.",
      "Translate only human-readable prose fields such as title, summaries, evidence, impact, recommendation, suggestions, rationale, checklist items and Markdown report text.",
      "Do not add new findings, remove findings, change severity, or change technical meaning."
    ].join("\n"),
    {
      targetLocale,
      finalReport
    },
    "{ title: string, executiveSummary: string, overallRiskLevel: 'critical'|'high'|'medium'|'low'|'informational'|'unknown', scope: object, findings: [{ id, source, severity, title, evidence, impact, recommendation, affectedCode }], modificationSuggestions: [{ priority, title, suggestion, rationale }], analyzerSummary: string, aiReviewSummary: string, cacheAndReuseSummary: string, manualReviewChecklist: string[], reportMarkdown: string }"
  );
}

async function buildReportTranslations(finalReport) {
  const translations = {
    "zh-CN": {
      finalReport,
      reportMarkdown: finalReport.reportMarkdown || ""
    }
  };
  try {
    const translatedFinalReport = await runDirectReportTranslation({
      finalReport,
      targetLocale: "en-US"
    });
    translations["en-US"] = {
      finalReport: translatedFinalReport,
      reportMarkdown: translatedFinalReport.reportMarkdown || ""
    };
    return {
      status: "ok",
      translations
    };
  } catch (error) {
    return {
      status: "failed",
      errorMessage: error?.message || String(error),
      translations
    };
  }
}

function compactAnalysis(analysis) {
  return {
    engine: analysis.engine,
    status: analysis.status,
    durationMs: analysis.durationMs || 0,
    issueCount: analysis.issueCount || 0,
    summary: analysis.summary || "",
    issues: (analysis.issues || []).slice(0, 30).map((issue) => ({
      severity: issue.severity || "info",
      title: issue.title || "Unnamed issue",
      sourcePath: issue.sourcePath || "",
      line: issue.line || null,
      description: String(issue.description || "").slice(0, 800)
    }))
  };
}

function sourceDigest(chunks) {
  let remaining = DEFAULT_MAX_SOURCE_CHARS;
  const parts = [];
  for (const chunk of chunks) {
    if (remaining <= 0) {
      break;
    }
    const content = String(chunk.content || "").slice(0, remaining);
    parts.push([
      `// Chunk ${chunk.chunkIndex}: ${chunk.sourcePath}:${chunk.startLine}-${chunk.endLine}`,
      content
    ].join("\n"));
    remaining -= content.length;
  }
  return parts.join("\n\n");
}

const AiSourceAnalysisSchema = z.object({
  executiveSummary: z.string(),
  riskLevel: z.enum(["critical", "high", "medium", "low", "informational", "unknown"]),
  keyRisks: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low", "informational", "info", "unknown"]),
    title: z.string(),
    evidence: z.string(),
    recommendation: z.string()
  })).default([]),
  analyzerInterpretation: z.string(),
  sourceReview: z.string(),
  cacheAndReuseNotes: z.string()
});

const FinalAuditReportSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  overallRiskLevel: z.enum(["critical", "high", "medium", "low", "informational", "unknown"]),
  scope: z.object({
    address: z.string().optional(),
    chainId: z.number().nullable().optional(),
    contractName: z.string().optional(),
    sourceRepository: z.string().optional(),
    sourceHash: z.string().optional()
  }),
  findings: z.array(z.object({
    id: z.string(),
    source: z.enum(["slither", "aderyn", "mythril", "ai-source-review", "combined", "manual-check"]),
    severity: z.enum(["critical", "high", "medium", "low", "informational", "info", "unknown"]),
    title: z.string(),
    evidence: z.string(),
    impact: z.string(),
    recommendation: z.string(),
    affectedCode: z.array(z.object({
      sourcePath: z.string(),
      line: z.number().nullable().optional(),
      lineRange: z.string().optional()
    })).default([])
  })).default([]),
  modificationSuggestions: z.array(z.object({
    priority: z.enum(["p0", "p1", "p2", "p3"]),
    title: z.string(),
    suggestion: z.string(),
    rationale: z.string()
  })).default([]),
  analyzerSummary: z.string(),
  aiReviewSummary: z.string(),
  cacheAndReuseSummary: z.string(),
  manualReviewChecklist: z.array(z.string()).default([]),
  reportMarkdown: z.string()
});

async function embedChunks(chunks) {
  if (!isEmbeddingEnabled() || chunks.length === 0) {
    return [];
  }
  const embeddings = createEmbeddingModel();
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.content));
  return vectors.map((vector) => ({ model: DEFAULT_EMBEDDING_MODEL, vector }));
}

export async function buildAiAuditIntelligence({ auditResult, sourceCode, sourceContract, onProgress = async () => {} }) {
  const chunks = createSourceChunks(sourceCode || "", {
    primarySourcePath: sourceContract?.primarySourcePath || auditResult?.primarySourcePath || ""
  });
  const sourceHash = sourceCode ? computeSourceHash(sourceCode) : "";

  if (!isAiEnabled()) {
    await onProgress({ stage: "ai_source_review", status: "skipped", detail: "AI analysis is disabled or no API key is configured." });
    await onProgress({ stage: "ai_final_report", status: "skipped", detail: "AI analysis is disabled or no API key is configured." });
    await onProgress({ stage: "ai_translation", status: "skipped", detail: "AI analysis is disabled or no API key is configured." });
    return {
      ai: {
        status: "disabled",
        model: DEFAULT_MODEL,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        summary: "AI analysis is disabled or no API key is configured."
      },
      chunks,
      embeddings: []
    };
  }

  await onProgress({ stage: "ai_source_review", status: "running", detail: "Preparing source chunks and historical context." });
  const embeddings = await embedChunks(chunks);
  const queryText = JSON.stringify({
    contractName: auditResult.contractName || sourceContract?.contractName || "",
    findings: (auditResult.findings || []).slice(0, 20).map(compactFinding),
    sourceFiles: auditResult.sourceFiles || sourceContract?.sourceFiles || []
  });
  const similarChunks = isEmbeddingEnabled()
    ? await findSimilarSourceChunks(await createEmbeddingModel().embedQuery(queryText), {
      limit: 6,
      excludeSourceHash: sourceHash
    })
    : [];

  if (!useToolCallingAgents()) {
    const sourceAnalysis = await runDirectSourceReview({
      auditResult,
      chunks,
      similarChunks,
      sourceHash
    });
    await onProgress({ stage: "ai_source_review", status: "completed", detail: `AI source review completed with ${similarChunks.length} similar chunks.` });
    await onProgress({ stage: "ai_final_report", status: "running", detail: "Synthesizing tool and AI review results." });
    const finalReport = await runDirectFinalReport({
      auditResult,
      sourceAnalysis,
      similarChunks,
      sourceHash
    });
    await onProgress({ stage: "ai_final_report", status: "completed", detail: "Final AI report generated." });
    await onProgress({ stage: "ai_translation", status: "running", detail: "Translating final report." });
    const translationResult = await buildReportTranslations(finalReport);
    await onProgress({
      stage: "ai_translation",
      status: translationResult.status === "ok" ? "completed" : "failed",
      detail: translationResult.status === "ok" ? "Report translation completed." : translationResult.errorMessage
    });
    return {
      ai: {
        status: "ok",
        mode: "direct",
        model: DEFAULT_MODEL,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        sourceHash,
        similarChunkCount: similarChunks.length,
        sourceAnalysis,
        finalReport,
        translationStatus: translationResult.status,
        translationErrorMessage: translationResult.errorMessage || "",
        translations: translationResult.translations,
        executiveSummary: finalReport.executiveSummary || sourceAnalysis.executiveSummary || "",
        riskLevel: finalReport.overallRiskLevel || sourceAnalysis.riskLevel || "unknown",
        keyRisks: finalReport.findings || sourceAnalysis.keyRisks || [],
        analyzerInterpretation: sourceAnalysis.analyzerInterpretation || "",
        sourceReview: sourceAnalysis.sourceReview || "",
        cacheAndReuseNotes: finalReport.cacheAndReuseSummary || sourceAnalysis.cacheAndReuseNotes || "",
        reportMarkdown: finalReport.reportMarkdown || ""
      },
      chunks,
      embeddings
    };
  }

  const analyzerFindingsTool = tool(
    async () => JSON.stringify((auditResult.externalAnalyses || []).map(compactAnalysis)),
    {
      name: "get_analyzer_findings",
      description: "Return normalized Slither, Aderyn and Mythril findings for the current smart contract audit.",
      schema: z.object({})
    }
  );

  const sourceContextTool = tool(
    async ({ query = "", maxChars = 8000 }) => {
      const normalizedQuery = String(query || "").toLowerCase();
      const selected = chunks.filter((chunk) => (
        !normalizedQuery
        || chunk.sourcePath.toLowerCase().includes(normalizedQuery)
        || chunk.content.toLowerCase().includes(normalizedQuery)
      )).slice(0, 8);
      return sourceDigest(selected).slice(0, Math.max(1000, Math.min(Number(maxChars || 8000), 16000)));
    },
    {
      name: "get_source_context",
      description: "Return source-code chunks for the current contract. Use it to verify analyzer findings against code.",
      schema: z.object({
        query: z.string().optional(),
        maxChars: z.number().optional()
      })
    }
  );

  const similarKnowledgeTool = tool(
    async () => JSON.stringify(similarChunks.map((chunk) => ({
      score: Number(chunk.score.toFixed(4)),
      sourceHash: chunk.sourceHash,
      sourcePath: chunk.sourcePath,
      lines: `${chunk.startLine}-${chunk.endLine}`,
      excerpt: chunk.content.slice(0, 1200)
    }))),
    {
      name: "get_similar_knowledge",
      description: "Return semantically similar source chunks from prior audits for reuse and comparison.",
      schema: z.object({})
    }
  );

  const sourceReviewAgent = createAgent({
    model: createChatModel(),
    tools: [analyzerFindingsTool, sourceContextTool, similarKnowledgeTool],
    responseFormat: AiSourceAnalysisSchema
  });

  const sourceReviewResponse = await sourceReviewAgent.invoke({
    messages: [{
      role: "system",
      content: [
        "You are a senior smart contract security auditor.",
        "You must perform two separate review tracks before writing the final report.",
        "Track 1: Interpret and triage Slither, Aderyn and Mythril findings, correlating every accepted finding with source code evidence.",
        "Track 2: Independently review the extracted source code for risks that automated analyzers may miss, including authorization, upgradeability, initialization, token transfer assumptions, precision/accounting, external call order, oracle/trust boundaries, signature/replay, pausability, denial-of-service and protocol-specific business logic.",
        "Use get_analyzer_findings and get_source_context before writing the final report. Use get_similar_knowledge when available to compare against prior similar code.",
        "Clearly separate analyzer-confirmed findings from AI source-review findings.",
        "For AI source-review findings, cite the relevant source path and line range or explain that the evidence is architectural across multiple files.",
        "Do not invent vulnerabilities that are not supported by analyzer output or source evidence. If evidence is weak, label it as a review note or manual-check item instead of a confirmed issue.",
        "If a finding is likely informational, dependency-only, or library-only, say so clearly and avoid overstating severity.",
        "Write the final report in Chinese, with precise evidence and recommendations."
      ].join("\n")
    }, {
      role: "user",
      content: JSON.stringify({
        task: "Analyze automated analyzer results, independently review the extracted source code, and produce a consolidated smart contract audit report.",
        contract: {
          address: auditResult.address,
          chainId: auditResult.chainId,
          contractName: auditResult.contractName,
          compilerVersion: auditResult.compilerVersion,
          sourceRepository: auditResult.sourceRepository,
          primarySourcePath: auditResult.primarySourcePath,
          sourceHash
        },
        summary: auditResult.summary,
        findings: (auditResult.findings || []).slice(0, 40).map(compactFinding),
        sourcePreview: sourceDigest(chunks.slice(0, 4)).slice(0, 6000),
        similarChunkCount: similarChunks.length
      })
    }]
  });

  const sourceAnalysis = sourceReviewResponse.structuredResponse || {};
  await onProgress({ stage: "ai_source_review", status: "completed", detail: `AI source review completed with ${similarChunks.length} similar chunks.` });
  await onProgress({ stage: "ai_final_report", status: "running", detail: "Synthesizing tool and AI review results." });

  const sourceAnalysisTool = tool(
    async () => JSON.stringify(sourceAnalysis),
    {
      name: "get_ai_source_review",
      description: "Return the independent AI source-code review result produced by the source review agent.",
      schema: z.object({})
    }
  );

  const finalReportAgent = createAgent({
    model: createChatModel(),
    tools: [analyzerFindingsTool, sourceAnalysisTool, similarKnowledgeTool],
    responseFormat: FinalAuditReportSchema
  });

  const finalReportResponse = await finalReportAgent.invoke({
    messages: [{
      role: "system",
      content: [
        "You are a smart contract audit report lead.",
        "Your only job is to synthesize a final audit report from tool-based analysis and AI source review.",
        "Use get_analyzer_findings and get_ai_source_review before writing the report.",
        "The report must include, but is not limited to: issue points, severity, evidence, impact, concrete modification suggestions, and manual review checklist.",
        "Deduplicate overlapping Slither, Aderyn, Mythril and AI findings. Preserve source attribution for every issue.",
        "Do not introduce new technical claims unless they are present in analyzer findings or the AI source review.",
        "If evidence is weak, classify the item as manual-check rather than confirmed finding.",
        "Write the final report in Chinese with concise, actionable remediation guidance."
      ].join("\n")
    }, {
      role: "user",
      content: JSON.stringify({
        task: "Summarize tool audit results and AI source-review results into a final smart contract audit report.",
        contract: {
          address: auditResult.address,
          chainId: auditResult.chainId,
          contractName: auditResult.contractName,
          compilerVersion: auditResult.compilerVersion,
          sourceRepository: auditResult.sourceRepository,
          primarySourcePath: auditResult.primarySourcePath,
          sourceHash
        },
        rawSummary: auditResult.summary,
        normalizedFindings: (auditResult.findings || []).slice(0, 60).map(compactFinding),
        analyzerSummaries: (auditResult.externalAnalyses || []).map(compactAnalysis),
        aiSourceAnalysis: sourceAnalysis,
        similarChunkCount: similarChunks.length
      })
    }]
  });

  const finalReport = finalReportResponse.structuredResponse || {};
  await onProgress({ stage: "ai_final_report", status: "completed", detail: "Final AI report generated." });
  await onProgress({ stage: "ai_translation", status: "running", detail: "Translating final report." });
  const translationResult = await buildReportTranslations(finalReport);
  await onProgress({
    stage: "ai_translation",
    status: translationResult.status === "ok" ? "completed" : "failed",
    detail: translationResult.status === "ok" ? "Report translation completed." : translationResult.errorMessage
  });
  return {
    ai: {
      status: "ok",
      mode: "tools",
      model: DEFAULT_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      sourceHash,
      similarChunkCount: similarChunks.length,
      sourceAnalysis,
      finalReport,
      translationStatus: translationResult.status,
      translationErrorMessage: translationResult.errorMessage || "",
      translations: translationResult.translations,
      executiveSummary: finalReport.executiveSummary || sourceAnalysis.executiveSummary || "",
      riskLevel: finalReport.overallRiskLevel || sourceAnalysis.riskLevel || "unknown",
      keyRisks: finalReport.findings || sourceAnalysis.keyRisks || [],
      analyzerInterpretation: sourceAnalysis.analyzerInterpretation || "",
      sourceReview: sourceAnalysis.sourceReview || "",
      cacheAndReuseNotes: finalReport.cacheAndReuseSummary || sourceAnalysis.cacheAndReuseNotes || "",
      reportMarkdown: finalReport.reportMarkdown || ""
    },
    chunks,
    embeddings
  };
}
