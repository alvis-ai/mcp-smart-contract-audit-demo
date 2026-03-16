import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const resourceRegistry = [
  {
    uri: "kb://audit/general",
    name: "audit-general",
    title: "General Audit Checklist",
    description: "General smart contract audit checklist.",
    mimeType: "text/markdown",
    filePath: path.join(projectRoot, "kb", "audit-checklist-general.md")
  },
  {
    uri: "kb://audit/launchpad",
    name: "audit-launchpad",
    title: "LaunchPad Risk Model",
    description: "Risk model for LaunchPad and IDO contracts.",
    mimeType: "text/markdown",
    filePath: path.join(projectRoot, "kb", "launchpad-risk-model.md")
  },
  {
    uri: "kb://audit/nft-marketplace",
    name: "audit-nft-marketplace",
    title: "NFT Marketplace Risk Model",
    description: "Risk model for NFT mint and marketplace flows.",
    mimeType: "text/markdown",
    filePath: path.join(projectRoot, "kb", "nft-marketplace-risk-model.md")
  },
  {
    uri: "kb://audit/staking-lending",
    name: "audit-staking-lending",
    title: "Staking and Lending Risk Model",
    description: "Risk model for staking and lending contracts.",
    mimeType: "text/markdown",
    filePath: path.join(projectRoot, "kb", "staking-lending-risk-model.md")
  },
  {
    uri: "sample://contracts/power-launchpad",
    name: "power-launchpad-sample",
    title: "PowerLaunchPad Sample Contract",
    description: "Sample LaunchPad contract with intentionally insecure patterns.",
    mimeType: "text/x-solidity",
    filePath: path.join(projectRoot, "samples", "PowerLaunchPad.sol")
  },
  {
    uri: "sample://contracts/treasure-hunt",
    name: "treasure-hunt-sample",
    title: "TreasureHunt Sample Contract",
    description: "Sample on-chain lottery contract with intentionally insecure randomness.",
    mimeType: "text/x-solidity",
    filePath: path.join(projectRoot, "samples", "TreasureHunt.sol")
  }
];

function loadText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function listResources() {
  return resourceRegistry.map(({ filePath, ...resource }) => resource);
}

export function readResource(uri) {
  const entry = resourceRegistry.find((item) => item.uri === uri);
  if (!entry) {
    return null;
  }
  return {
    uri: entry.uri,
    mimeType: entry.mimeType,
    text: loadText(entry.filePath)
  };
}

export function searchKnowledge(query, topic = "") {
  const queryTerms = tokenize(`${query} ${topic}`);
  const ranked = resourceRegistry
    .filter((item) => item.uri.startsWith("kb://"))
    .map((item) => {
      const text = loadText(item.filePath);
      const haystack = tokenize(`${item.title} ${item.description} ${text}`);
      const score = queryTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return {
        uri: item.uri,
        title: item.title,
        description: item.description,
        score,
        excerpt: text.split("\n").slice(0, 8).join("\n")
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.length > 0 ? ranked : resourceRegistry
    .filter((item) => item.uri.startsWith("kb://"))
    .map((item) => ({
      uri: item.uri,
      title: item.title,
      description: item.description,
      score: 0,
      excerpt: loadText(item.filePath).split("\n").slice(0, 6).join("\n")
    }))
    .slice(0, 3);
}

export function getProjectRoot() {
  return projectRoot;
}
