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
import {
  PROTOCOL_VERSION,
  failure,
  success,
  textResult
} from "./protocol.js";

// The custom service layer centralizes tool/resource/prompt definitions so both
// custom transports can share the same business logic.
export const tools = [
  {
    name: "audit_contract_address",
    title: "Audit Contract Address",
    description: "Audit a deployed contract by address using verified-source retrieval plus optional bytecode analysis through external engines such as Mythril.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Deployed EVM contract address." },
        chainId: { type: "integer", description: "Optional EVM chainId to avoid scanning common networks." },
        contractType: {
          type: "string",
          enum: ["general", "launchpad", "nft", "staking", "lending"],
          description: "Optional domain override."
        }
      },
      required: ["address"]
    }
  },
  {
    name: "audit_contract_file",
    title: "Audit Contract File",
    description: "Audit a Solidity contract file inside the demo project and return security findings.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to a Solidity file inside the project." },
        contractType: {
          type: "string",
          enum: ["general", "launchpad", "nft", "staking", "lending"],
          description: "Optional domain override."
        }
      },
      required: ["path"]
    }
  },
  {
    name: "audit_contract_code",
    title: "Audit Solidity Code",
    description: "Audit Solidity code using domain-focused static rules.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Solidity source code." },
        contractType: {
          type: "string",
          enum: ["general", "launchpad", "nft", "staking", "lending"],
          description: "Optional domain override."
        }
      },
      required: ["code"]
    }
  },
  {
    name: "search_audit_knowledge",
    title: "Search Audit Knowledge",
    description: "Search the local smart contract audit knowledge base for relevant audit guidance.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords or question." },
        topic: { type: "string", description: "Optional domain like launchpad, nft, staking or lending." }
      },
      required: ["query"]
    }
  },
  {
    name: "generate_audit_checklist",
    title: "Generate Audit Checklist",
    description: "Generate a project-type-specific smart contract audit checklist.",
    inputSchema: {
      type: "object",
      properties: {
        projectType: {
          type: "string",
          enum: ["general", "launchpad", "nft", "staking", "lending"],
          description: "Audit domain."
        }
      },
      required: ["projectType"]
    }
  }
];

export const prompts = [
  {
    name: "launchpad_audit_skill",
    title: "LaunchPad Audit Skill",
    description: "A reusable workflow prompt for LaunchPad and IDO contract review.",
    arguments: [
      { name: "contract_name", description: "Target contract name.", required: true },
      { name: "risk_focus", description: "Optional extra focus such as whitelist or claim.", required: false }
    ]
  },
  {
    name: "audit_report_writer",
    title: "Audit Report Writer",
    description: "Convert raw tool findings into a concise audit report.",
    arguments: [
      { name: "target", description: "Project or contract name.", required: true },
      { name: "findings_json", description: "Findings JSON from a tool call.", required: true }
    ]
  },
  {
    name: "knowledge_grounded_triage",
    title: "Knowledge-Grounded Triage",
    description: "Force the model to search KB resources before deciding how to audit.",
    arguments: [
      { name: "question", description: "Audit question or user issue.", required: true }
    ]
  }
];

// Render the structured audit payload into a Markdown-like text block that is
// easy to read in terminals, IDE chat panes and plain JSON-RPC clients.
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

// Prompts are intentionally explicit about the tool order so IDE agents can
// follow a repeatable audit workflow instead of improvising every step.
function getPrompt(name, args = {}) {
  if (name === "launchpad_audit_skill") {
    return {
      description: "LaunchPad audit workflow prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Audit contract ${args.contract_name}.`,
              "Step 1: Read kb://audit/launchpad and kb://audit/general.",
              "Step 2: Use search_audit_knowledge for whitelist, claim, refund and admin risks.",
              "Step 3: Run audit_contract_address, audit_contract_file or audit_contract_code.",
              `Step 4: Focus extra attention on ${args.risk_focus || "allocation, whitelist signatures, claim and refund flows"}.`,
              "Step 5: Produce findings ordered by severity."
            ].join("\n")
          }
        }
      ]
    };
  }

  if (name === "audit_report_writer") {
    return {
      description: "Audit report writer prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Write a concise audit report for ${args.target}.`,
              "Use the supplied findings JSON.",
              "Format as: Overview, Findings, Recommendations, Residual Risks.",
              `Findings JSON:\n${args.findings_json}`
            ].join("\n")
          }
        }
      ]
    };
  }

  if (name === "knowledge_grounded_triage") {
    return {
      description: "Knowledge-grounded audit triage prompt",
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
              `Question: ${args.question}`
            ].join("\n")
          }
        }
      ]
    };
  }

  return null;
}

async function handleToolCall(name, args = {}) {
  // Every tool call returns both text content and structuredContent so callers
  // can either display the result directly or post-process it programmatically.
  if (name === "audit_contract_address") {
    const audited = await auditAddress(args.address, {
      chainId: args.chainId,
      contractType: args.contractType
    });
    return textResult(markdownFindings(audited), audited);
  }

  if (name === "audit_contract_file") {
    const audited = await auditFile(args.path, { contractType: args.contractType });
    return textResult(markdownFindings(audited, audited.path), audited);
  }

  if (name === "audit_contract_code") {
    const audited = await auditCode(args.code, { contractType: args.contractType });
    return textResult(markdownFindings(audited), audited);
  }

  if (name === "search_audit_knowledge") {
    const matches = searchKnowledge(args.query, args.topic || "");
    const text = matches
      .map((match, index) => `${index + 1}. ${match.title} (${match.uri})\n${match.excerpt}`)
      .join("\n\n");
    return textResult(text, { matches });
  }

  if (name === "generate_audit_checklist") {
    const checklist = generateChecklist(args.projectType);
    const text = checklist.map((item, index) => `${index + 1}. ${item}`).join("\n");
    return textResult(text, { projectType: args.projectType, checklist });
  }

  return null;
}

export async function handleRpcMessage(message) {
  // This is the single custom JSON-RPC dispatcher used by both stdio and HTTP.
  // Keeping it pure makes it easy to test without spinning up transports.
  const { id, method, params = {} } = message || {};

  if (method === "initialize") {
    return success(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false }
      },
      serverInfo: {
        name: "smart-contract-audit-demo",
        title: "Smart Contract Audit Assistant",
        version: "0.4.0"
      },
      instructions: "Use resources for context, prompts for reusable workflows and tools for audit actions."
    });
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "tools/list") {
    return success(id, { tools });
  }

  if (method === "tools/call") {
    try {
      const result = await handleToolCall(params.name, params.arguments || {});
      if (!result) {
        return failure(id, -32602, `Unknown tool: ${params.name}`);
      }
      return success(id, result);
    } catch (error) {
      return success(id, {
        content: [{ type: "text", text: error.message }],
        isError: true
      });
    }
  }

  if (method === "resources/list") {
    return success(id, { resources: listResources() });
  }

  if (method === "resources/read") {
    const resource = readResource(params.uri);
    if (!resource) {
      return failure(id, -32602, `Unknown resource: ${params.uri}`);
    }
    return success(id, { contents: [resource] });
  }

  if (method === "prompts/list") {
    return success(id, { prompts });
  }

  if (method === "prompts/get") {
    const prompt = getPrompt(params.name, params.arguments || {});
    if (!prompt) {
      return failure(id, -32602, `Unknown prompt: ${params.name}`);
    }
    return success(id, prompt);
  }

  return failure(id ?? null, -32601, `Method not found: ${method}`);
}
