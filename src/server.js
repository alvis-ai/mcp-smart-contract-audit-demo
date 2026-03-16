import readline from "node:readline";
import {
  auditCode,
  auditFile,
  generateChecklist,
  resumeAlignment
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

const tools = [
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
    description: "Audit Solidity code using resume-aligned static rules.",
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
  },
  {
    name: "resume_alignment_report",
    title: "Resume Alignment Report",
    description: "Show how this audit workflow maps to resume topics for interview storytelling.",
    inputSchema: {
      type: "object",
      properties: {
        projectType: {
          type: "string",
          enum: ["general", "launchpad", "nft", "staking", "lending"],
          description: "Project type used for mapping."
        }
      },
      required: ["projectType"]
    }
  }
];

const prompts = [
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

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function markdownFindings(result, includePath = "") {
  const lines = [
    includePath ? `File: ${includePath}` : undefined,
    `Contract type: ${result.contractType}`,
    `Summary: ${result.summary}`,
    "",
    "Findings:"
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
  return lines.join("\n");
}

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
              "Step 3: Run audit_contract_file or audit_contract_code.",
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

function handleToolCall(name, args = {}) {
  if (name === "audit_contract_file") {
    const audited = auditFile(args.path, { contractType: args.contractType });
    return textResult(markdownFindings(audited, audited.path), audited);
  }

  if (name === "audit_contract_code") {
    const audited = auditCode(args.code, { contractType: args.contractType });
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

  if (name === "resume_alignment_report") {
    const points = resumeAlignment(args.projectType);
    const report = {
      projectType: args.projectType,
      mappedHighlights: points,
      talkingPoint: `This demo shows ${args.projectType} audit understanding through MCP tools, local knowledge resources and reusable prompt workflows.`
    };
    const text = [
      `Project type: ${report.projectType}`,
      "Resume-aligned highlights:",
      ...report.mappedHighlights.map((item) => `- ${item}`),
      "",
      report.talkingPoint
    ].join("\n");
    return textResult(text, report);
  }

  return null;
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    writeMessage(failure(null, -32700, "Invalid JSON"));
    return;
  }

  const { id, method, params = {} } = message;

  if (method === "initialize") {
    writeMessage(success(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false }
      },
      serverInfo: {
        name: "smart-contract-audit-demo",
        title: "Smart Contract Audit Assistant",
        version: "0.1.0"
      },
      instructions: "Use resources for context, prompts for reusable workflows and tools for audit actions."
    }));
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    writeMessage(success(id, { tools }));
    return;
  }

  if (method === "tools/call") {
    try {
      const result = handleToolCall(params.name, params.arguments || {});
      if (!result) {
        writeMessage(failure(id, -32602, `Unknown tool: ${params.name}`));
        return;
      }
      writeMessage(success(id, result));
    } catch (error) {
      writeMessage(success(id, {
        content: [{ type: "text", text: error.message }],
        isError: true
      }));
    }
    return;
  }

  if (method === "resources/list") {
    writeMessage(success(id, { resources: listResources() }));
    return;
  }

  if (method === "resources/read") {
    const resource = readResource(params.uri);
    if (!resource) {
      writeMessage(failure(id, -32602, `Unknown resource: ${params.uri}`));
      return;
    }
    writeMessage(success(id, { contents: [resource] }));
    return;
  }

  if (method === "prompts/list") {
    writeMessage(success(id, { prompts }));
    return;
  }

  if (method === "prompts/get") {
    const prompt = getPrompt(params.name, params.arguments || {});
    if (!prompt) {
      writeMessage(failure(id, -32602, `Unknown prompt: ${params.name}`));
      return;
    }
    writeMessage(success(id, prompt));
    return;
  }

  writeMessage(failure(id ?? null, -32601, `Method not found: ${method}`));
});
