import { z } from "zod";
import {
  auditCode,
  auditAddress,
  auditFile,
  generateChecklist
} from "./analyzer.js";
import {
  listResources,
  readResource,
  searchKnowledge
} from "./knowledge-base.js";

export const CONTRACT_TYPES = ["general", "launchpad", "nft", "staking", "lending"];

// SDK output mirrors the custom MCP output so users can switch transports
// without changing how they parse or read the returned findings.
function markdownFindings(result, includePath = "") {
  const lines = [
    includePath ? `File: ${includePath}` : undefined,
    result.address ? `Address: ${result.address}` : undefined,
    result.proxyAddress ? `Proxy: ${result.proxyAddress}` : undefined,
    result.implementationAddress ? `Implementation: ${result.implementationAddress}` : undefined,
    result.beaconAddress ? `Beacon: ${result.beaconAddress}` : undefined,
    result.proxyDetection ? `Proxy detection: ${result.proxyDetection}` : undefined,
    result.sourceAddress && result.sourceAddress !== result.address ? `Source address: ${result.sourceAddress}` : undefined,
    result.chainId ? `Chain: ${result.chainName || "unknown"} (${result.chainId})` : undefined,
    result.contractName ? `Contract: ${result.contractName}` : undefined,
    result.sourceRepository ? `Source provider: ${result.sourceRepository}` : undefined,
    result.analysisMode ? `Analysis mode: ${result.analysisMode}` : undefined,
    result.bytecodeSize ? `Bytecode size: ${result.bytecodeSize} bytes` : undefined,
    `Contract type: ${result.contractType}`,
    `Summary: ${result.summary}`,
    "",
    "Local Findings:"
  ].filter(Boolean);

  if (result.findings.length === 0) {
    lines.push("- No findings triggered by the local ruleset.");
  } else {
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push(`  Why: ${finding.rationale}`);
      lines.push(`  Fix: ${finding.recommendation}`);
    }
  }

  if (result.missingSourceFiles?.length) {
    lines.push("");
    lines.push(`Warnings: ${result.missingSourceFiles.length} imported source file(s) could not be downloaded from ${result.sourceRepository || "the source provider"}.`);
  }

  if (Array.isArray(result.externalAnalyses) && result.externalAnalyses.length > 0) {
    lines.push("");
    lines.push("External Engines:");
    for (const analysis of result.externalAnalyses) {
      lines.push(`- ${analysis.engine}: ${analysis.summary}`);
      for (const issue of analysis.issues || []) {
        lines.push(`  - [${String(issue.severity || "info").toUpperCase()}] ${issue.title}`);
      }
    }
  }

  return lines.join("\n");
}

function toolError(error) {
  return {
    content: [
      {
        type: "text",
        text: error.message
      }
    ],
    isError: true
  };
}

function registerTools(server) {
  // Tool registration intentionally mirrors src/mcp-service.js. The difference
  // is transport/runtime plumbing, not capability behavior.
  server.registerTool(
      "audit_contract_address",
    {
      title: "Audit Contract Address",
      description: "Audit a deployed contract by address using verified-source retrieval plus optional bytecode analysis through external engines such as Mythril.",
      inputSchema: {
        address: z.string(),
        chainId: z.number().int().positive().optional(),
        contractType: z.enum(CONTRACT_TYPES).optional()
      }
    },
    async ({ address, chainId, contractType }) => {
      try {
        const audited = await auditAddress(address, { chainId, contractType });
        return {
          content: [{ type: "text", text: markdownFindings(audited) }],
          structuredContent: audited
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "audit_contract_file",
    {
      title: "Audit Contract File",
      description: "Audit a Solidity contract file inside the demo project and return security findings.",
      inputSchema: {
        path: z.string(),
        contractType: z.enum(CONTRACT_TYPES).optional()
      }
    },
    async ({ path, contractType }) => {
      try {
        const audited = await auditFile(path, { contractType });
        return {
          content: [{ type: "text", text: markdownFindings(audited, audited.path) }],
          structuredContent: audited
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "audit_contract_code",
    {
      title: "Audit Solidity Code",
      description: "Audit Solidity code using domain-focused static rules.",
      inputSchema: {
        code: z.string(),
        contractType: z.enum(CONTRACT_TYPES).optional()
      }
    },
    async ({ code, contractType }) => {
      try {
        const audited = await auditCode(code, { contractType });
        return {
          content: [{ type: "text", text: markdownFindings(audited) }],
          structuredContent: audited
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "search_audit_knowledge",
    {
      title: "Search Audit Knowledge",
      description: "Search the local smart contract audit knowledge base for relevant audit guidance.",
      inputSchema: {
        query: z.string(),
        topic: z.string().optional()
      }
    },
    async ({ query, topic }) => {
      try {
        const matches = searchKnowledge(query, topic || "");
        const text = matches
          .map((match, index) => `${index + 1}. ${match.title} (${match.uri})\n${match.excerpt}`)
          .join("\n\n");
        return {
          content: [{ type: "text", text }],
          structuredContent: { matches }
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "generate_audit_checklist",
    {
      title: "Generate Audit Checklist",
      description: "Generate a project-type-specific smart contract audit checklist.",
      inputSchema: {
        projectType: z.enum(CONTRACT_TYPES)
      }
    },
    async ({ projectType }) => {
      try {
        const checklist = generateChecklist(projectType);
        return {
          content: [{ type: "text", text: checklist.map((item, index) => `${index + 1}. ${item}`).join("\n") }],
          structuredContent: { projectType, checklist }
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );
}

function registerResources(server) {
  // Each KB entry is registered individually so IDEs can discover them in the
  // MCP resource list and fetch only the context they actually need.
  for (const resource of listResources()) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType
      },
      async () => {
        const loaded = readResource(resource.uri);
        return {
          contents: loaded ? [loaded] : []
        };
      }
    );
  }
}

function registerPrompts(server) {
  // Prompts are shared workflow templates, not free-form prose. They encode
  // the intended retrieval and audit order for agentic IDE clients.
  server.registerPrompt(
    "launchpad_audit_skill",
    {
      title: "LaunchPad Audit Skill",
      description: "A reusable workflow prompt for LaunchPad and IDO contract review.",
      argsSchema: {
        contract_name: z.string(),
        risk_focus: z.string().optional()
      }
    },
    ({ contract_name, risk_focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Audit contract ${contract_name}.`,
              "Step 1: Read kb://audit/launchpad and kb://audit/general.",
              "Step 2: Use search_audit_knowledge for whitelist, claim, refund and admin risks.",
              "Step 3: Run audit_contract_address, audit_contract_file or audit_contract_code.",
              `Step 4: Focus extra attention on ${risk_focus || "allocation, whitelist signatures, claim and refund flows"}.`,
              "Step 5: Produce findings ordered by severity."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "audit_report_writer",
    {
      title: "Audit Report Writer",
      description: "Convert raw tool findings into a concise audit report.",
      argsSchema: {
        target: z.string(),
        findings_json: z.string()
      }
    },
    ({ target, findings_json }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Write a concise audit report for ${target}.`,
              "Use the supplied findings JSON.",
              "Format as: Overview, Findings, Recommendations, Residual Risks.",
              `Findings JSON:\n${findings_json}`
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "knowledge_grounded_triage",
    {
      title: "Knowledge-Grounded Triage",
      description: "Force the model to search KB resources before deciding how to audit.",
      argsSchema: {
        question: z.string()
      }
    },
    ({ question }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You must ground your response in the local knowledge base first.",
              "1. Read relevant kb:// resources.",
              "2. If code is available, run an audit tool.",
              "3. If the KB does not contain enough evidence, say so explicitly.",
              `Question: ${question}`
            ].join("\n")
          }
        }
      ]
    })
  );
}

export function registerSmartContractAuditCapabilities(server) {
  registerTools(server);
  registerResources(server);
  registerPrompts(server);
}
