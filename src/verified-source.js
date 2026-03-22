const DEFAULT_SOURCIFY_BASE_URL = process.env.AUDIT_SOURCIFY_BASE_URL || "https://repo.sourcify.dev";
const DEFAULT_ETHERSCAN_BASE_URL = process.env.AUDIT_ETHERSCAN_BASE_URL || "https://api.etherscan.io/v2/api";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const BEACON_IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const DEFAULT_BLOCKSCOUT_BASE_URLS = new Map([
  [1, "https://eth.blockscout.com/api/"],
  [10, "https://optimism.blockscout.com/api/"],
  [56, "https://bnb.blockscout.com/api/"],
  [100, "https://gnosis.blockscout.com/api/"],
  [137, "https://polygon.blockscout.com/api/"],
  [250, "https://fantom.blockscout.com/api/"],
  [8453, "https://base.blockscout.com/api/"],
  [42161, "https://arbitrum.blockscout.com/api/"],
  [43114, "https://avax.blockscout.com/api/"],
  [59144, "https://linea.blockscout.com/api/"],
  [11155111, "https://eth-sepolia.blockscout.com/api/"]
]);
const DEFAULT_CHAIN_IDS = [1, 56, 137, 10, 42161, 8453, 43114, 324, 59144, 250, 100, 11155111, 97];

// Chain labels are used only for human-readable output; the actual resolution
// logic keys everything off chainId.
const CHAIN_NAMES = new Map([
  [1, "ethereum"],
  [10, "optimism"],
  [56, "bsc"],
  [97, "bsc-testnet"],
  [100, "gnosis"],
  [137, "polygon"],
  [250, "fantom"],
  [324, "zksync-era"],
  [8453, "base"],
  [43114, "avalanche"],
  [59144, "linea"],
  [42161, "arbitrum"],
  [11155111, "sepolia"]
]);

// Address validation happens early because the same address may be passed
// across explorer APIs, Sourcify paths and RPC proxy-resolution calls.
function normalizeAddress(address) {
  const normalized = typeof address === "string" ? address.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error("Invalid contract address. Expected a 0x-prefixed 20-byte EVM address.");
  }
  return normalized;
}

function resolveAddressCandidates(address) {
  // Some providers are picky about checksum vs lowercase addresses, so we try
  // both representations while still keeping the original request address.
  const normalized = normalizeAddress(address);
  return [...new Set([normalized, normalized.toLowerCase()])];
}

function normalizeChainId(chainId) {
  if (typeof chainId === "undefined" || chainId === null || chainId === "") {
    return null;
  }
  const numeric = Number(chainId);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("Invalid chainId. Expected a positive integer.");
  }
  return numeric;
}

function resolveChainIds(chainId) {
  // If the caller does not specify a chain, scan a curated set of common EVM
  // networks instead of trying to discover every possible chain dynamically.
  const explicitChainId = normalizeChainId(chainId);
  if (explicitChainId) {
    return [explicitChainId];
  }

  if (process.env.AUDIT_CHAIN_IDS) {
    const parsed = process.env.AUDIT_CHAIN_IDS
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => normalizeChainId(item));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return DEFAULT_CHAIN_IDS;
}

function encodeSourcePath(sourcePath) {
  return sourcePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function getContractName(metadata, primarySourcePath) {
  const compilationTarget = metadata?.settings?.compilationTarget || {};
  if (primarySourcePath && compilationTarget[primarySourcePath]) {
    return compilationTarget[primarySourcePath];
  }
  const firstTarget = Object.values(compilationTarget)[0];
  return typeof firstTarget === "string" && firstTarget ? firstTarget : "UnknownContract";
}

function parseConfiguredBlockscoutBaseUrls() {
  const configured = process.env.AUDIT_BLOCKSCOUT_BASE_URLS || "";
  const mapping = new Map(DEFAULT_BLOCKSCOUT_BASE_URLS);

  if (!configured.trim()) {
    return mapping;
  }

  for (const entry of configured.split(",")) {
    const [chainIdRaw, urlRaw] = entry.split("=");
    const chainId = Number(chainIdRaw?.trim());
    const url = urlRaw?.trim();
    if (Number.isInteger(chainId) && chainId > 0 && url) {
      mapping.set(chainId, url);
    }
  }

  return mapping;
}

function parseConfiguredRpcUrls() {
  // RPC URLs are optional and only used for proxy slot inspection when explorer
  // metadata is insufficient to resolve the implementation contract.
  const configured = process.env.AUDIT_RPC_URLS || "";
  const mapping = new Map();

  if (!configured.trim()) {
    return mapping;
  }

  for (const entry of configured.split(",")) {
    const [chainIdRaw, urlRaw] = entry.split("=");
    const chainId = Number(chainIdRaw?.trim());
    const url = urlRaw?.trim();
    if (Number.isInteger(chainId) && chainId > 0 && url) {
      mapping.set(chainId, url);
    }
  }

  return mapping;
}

function normalizeImplementationAddress(address) {
  if (typeof address !== "string") {
    return "";
  }
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

async function fetchResponse(url, accept) {
  // The fetch helpers normalize transport errors into consistent Error objects
  // so caller-side fallback logic can log a single explanatory error string.
  let response;
  try {
    response = await fetch(url, {
      headers: accept ? { accept } : {},
      signal: AbortSignal.timeout(12000)
    });
  } catch (error) {
    throw new Error(`Request failed for ${url}: ${error.message}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }

  return response;
}

async function fetchJson(url) {
  const response = await fetchResponse(url, "application/json");
  if (!response) {
    return null;
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetchResponse(url, "text/plain");
  if (!response) {
    return null;
  }
  return response.text();
}

async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
  } catch (error) {
    throw new Error(`Request failed for ${url}: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeSourceCodeEnvelope(sourceCode) {
  // Explorer APIs often wrap standard-json payloads in an extra pair of braces.
  // Strip that envelope before trying to parse the multi-file content.
  if (typeof sourceCode !== "string") {
    return "";
  }
  const trimmed = sourceCode.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractAddressFromHexWord(value) {
  // Storage slot reads return 32-byte words. For EIP-1967 slots, the target
  // address lives in the low 20 bytes.
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return "";
  }
  const normalized = value.slice(2).padStart(64, "0");
  const last20Bytes = normalized.slice(-40);
  if (/^0{40}$/.test(last20Bytes)) {
    return "";
  }
  return `0x${last20Bytes}`;
}

function extractSourcesFromStandardJson(parsed) {
  const sources = parsed?.sources || {};
  const files = Object.entries(sources)
    .map(([filePath, value]) => ({
      path: filePath,
      content: typeof value?.content === "string" ? value.content : ""
    }))
    .filter((item) => item.content);

  const primarySourcePath = Object.keys(parsed?.settings?.compilationTarget || {})[0] || files[0]?.path || "";
  return {
    sourceFiles: files.map((item) => item.path),
    code: files.map((item) => `// File: ${item.path}\n${item.content.trimEnd()}`).join("\n\n"),
    primarySourcePath,
    contractName: getContractName(parsed, primarySourcePath)
  };
}

function extractSourcesFromExplorerPayload(sourceCode, fallbackFileName, fallbackContractName) {
  // Explorer payloads may be:
  // 1. a standard-json Solidity compiler input
  // 2. a JSON map of filenames to contents
  // 3. a single raw Solidity source string
  const normalized = normalizeSourceCodeEnvelope(sourceCode);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("{")) {
    try {
      const parsed = JSON.parse(normalized);
      if (parsed?.language && parsed?.sources) {
        return extractSourcesFromStandardJson(parsed);
      }

      const files = Object.entries(parsed)
        .map(([filePath, value]) => {
          if (typeof value === "string") {
            return { path: filePath, content: value };
          }
          if (typeof value?.content === "string") {
            return { path: filePath, content: value.content };
          }
          return null;
        })
        .filter(Boolean);

      if (files.length > 0) {
        return {
          sourceFiles: files.map((item) => item.path),
          code: files.map((item) => `// File: ${item.path}\n${item.content.trimEnd()}`).join("\n\n"),
          primarySourcePath: files[0].path,
          contractName: fallbackContractName || "UnknownContract"
        };
      }
    } catch {
      // fall through to single-file handling
    }
  }

  const filePath = fallbackFileName || `${fallbackContractName || "Contract"}.sol`;
  return {
    sourceFiles: [filePath],
    code: `// File: ${filePath}\n${normalized}`,
    primarySourcePath: filePath,
    contractName: fallbackContractName || "UnknownContract"
  };
}

async function fetchExplorerPayload(url) {
  const data = await fetchJson(url);
  const result = Array.isArray(data?.result) ? data.result[0] : null;
  if (!result || !result.SourceCode) {
    return null;
  }
  return result;
}

function decorateExplorerResult(baseResult, requestedAddress, sourceAddress, result) {
  // The returned audit result should preserve both the originally requested
  // address and the actual source address when proxy resolution happens.
  const normalizedRequestedAddress = normalizeAddress(requestedAddress);
  const normalizedSourceAddress = normalizeAddress(sourceAddress);
  const implementationAddress = normalizeImplementationAddress(result?.Implementation);
  const isProxy = result?.Proxy === "1" && implementationAddress;

  return {
    ...baseResult,
    address: normalizedRequestedAddress,
    sourceAddress: normalizedSourceAddress,
    ...(isProxy ? {
      proxyAddress: normalizedRequestedAddress,
      implementationAddress,
      isProxy: true
    } : {})
  };
}

async function fetchExplorerSourceVia(providerName, chainId, requestedAddress, fetchPayload, visited = new Set()) {
  // Some explorer APIs already know proxy -> implementation relationships.
  // Follow those first because they are cheaper than raw RPC slot inspection.
  const normalizedRequestedAddress = normalizeAddress(requestedAddress);
  const visitKey = `${providerName}:${chainId}:${normalizedRequestedAddress.toLowerCase()}`;
  if (visited.has(visitKey)) {
    throw new Error(`Detected a proxy/source resolution loop for ${normalizedRequestedAddress} on chain ${chainId}.`);
  }
  visited.add(visitKey);

  const result = await fetchPayload(normalizedRequestedAddress);
  if (!result) {
    return null;
  }

  const implementationAddress = normalizeImplementationAddress(result.Implementation);
  if (result.Proxy === "1" && implementationAddress && implementationAddress.toLowerCase() !== normalizedRequestedAddress.toLowerCase()) {
    const resolvedImplementation = await fetchExplorerSourceVia(
      providerName,
      chainId,
      implementationAddress,
      fetchPayload,
      visited
    );

    if (resolvedImplementation) {
      return {
        ...resolvedImplementation,
        address: normalizedRequestedAddress,
        proxyAddress: normalizedRequestedAddress,
        implementationAddress,
        isProxy: true
      };
    }
  }

  const extracted = extractSourcesFromExplorerPayload(
    result.SourceCode,
    result.ContractFileName || result.FileName,
    result.ContractName
  );

  if (!extracted) {
    return null;
  }

  return decorateExplorerResult({
    chainId,
    chainName: CHAIN_NAMES.get(chainId) || `chain-${chainId}`,
    contractName: extracted.contractName || result.ContractName || "UnknownContract",
    compilerVersion: result.CompilerVersion || "unknown",
    matchType: "verified",
    primarySourcePath: extracted.primarySourcePath,
    sourceFiles: extracted.sourceFiles,
    missingSourceFiles: [],
    sourceRepository: providerName,
    code: extracted.code
  }, normalizedRequestedAddress, normalizedRequestedAddress, result);
}

async function fetchMetadata(chainId, address, matchType) {
  const url = `${DEFAULT_SOURCIFY_BASE_URL}/contracts/${matchType}/${chainId}/${address}/metadata.json`;
  return fetchJson(url);
}

async function fetchSources(basePath, sources) {
  // Sourcify metadata only gives file paths. The actual source text still needs
  // to be downloaded file by file.
  const sourcePaths = Object.keys(sources || {});
  const fetched = await Promise.all(sourcePaths.map(async (sourcePath) => {
    const url = `${basePath}/sources/${encodeSourcePath(sourcePath)}`;
    const content = await fetchText(url);
    return {
      path: sourcePath,
      content
    };
  }));

  return {
    downloaded: fetched.filter((item) => typeof item.content === "string"),
    missing: fetched.filter((item) => typeof item.content !== "string").map((item) => item.path)
  };
}

async function callRpc(rpcUrl, method, params) {
  const response = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params
  });

  if (response?.error) {
    throw new Error(`RPC ${method} failed: ${response.error.message || "unknown error"}`);
  }

  return response?.result;
}

async function resolveProxyImplementationViaRpc(chainId, proxyAddress) {
  // Final fallback for proxy resolution when explorers do not expose the
  // implementation address. Currently supports EIP-1967 implementation slots
  // and beacon proxies with implementation() lookup.
  const rpcUrl = parseConfiguredRpcUrls().get(chainId);
  if (!rpcUrl) {
    return null;
  }

  const normalizedProxyAddress = normalizeAddress(proxyAddress);

  const implementationWord = await callRpc(rpcUrl, "eth_getStorageAt", [normalizedProxyAddress, IMPLEMENTATION_SLOT, "latest"]);
  const implementationAddress = normalizeImplementationAddress(extractAddressFromHexWord(implementationWord));
  if (implementationAddress && implementationAddress.toLowerCase() !== normalizedProxyAddress.toLowerCase()) {
    return {
      implementationAddress,
      proxyDetection: "rpc-eip1967-implementation-slot",
      proxyType: "eip1967"
    };
  }

  const beaconWord = await callRpc(rpcUrl, "eth_getStorageAt", [normalizedProxyAddress, BEACON_SLOT, "latest"]);
  const beaconAddress = normalizeImplementationAddress(extractAddressFromHexWord(beaconWord));
  if (!beaconAddress || beaconAddress.toLowerCase() === normalizedProxyAddress.toLowerCase()) {
    return null;
  }

  const beaconReturn = await callRpc(rpcUrl, "eth_call", [
    {
      to: beaconAddress,
      data: BEACON_IMPLEMENTATION_SELECTOR
    },
    "latest"
  ]);
  const beaconImplementationAddress = normalizeImplementationAddress(extractAddressFromHexWord(beaconReturn));
  if (!beaconImplementationAddress || beaconImplementationAddress.toLowerCase() === normalizedProxyAddress.toLowerCase()) {
    return null;
  }

  return {
    implementationAddress: beaconImplementationAddress,
    beaconAddress,
    proxyDetection: "rpc-eip1967-beacon-slot",
    proxyType: "beacon"
  };
}

async function maybeResolveImplementationFromRpc(baseResult, options = {}) {
  // If the fetched source still looks like a proxy shell, upgrade the audit
  // target to the implementation contract while preserving proxy metadata.
  if (!baseResult || baseResult.isProxy || !baseResult.chainId || !baseResult.address) {
    return baseResult;
  }

  const proxyResolution = await resolveProxyImplementationViaRpc(baseResult.chainId, baseResult.address);
  if (!proxyResolution?.implementationAddress) {
    return baseResult;
  }

  const implementationResult = await fetchVerifiedContractSource(proxyResolution.implementationAddress, {
    ...options,
    chainId: baseResult.chainId,
    __visited: options.__visited
  });

  return {
    ...implementationResult,
    address: baseResult.address,
    proxyAddress: baseResult.address,
    implementationAddress: proxyResolution.implementationAddress,
    isProxy: true,
    proxyDetection: proxyResolution.proxyDetection,
    ...(proxyResolution.beaconAddress ? { beaconAddress: proxyResolution.beaconAddress } : {})
  };
}

async function tryFetchFromSourcify(chainId, addressCandidates, requestedAddress) {
  for (const addressCandidate of addressCandidates) {
    for (const matchType of ["full_match", "partial_match"]) {
      const metadata = await fetchMetadata(chainId, addressCandidate, matchType);
      if (!metadata) {
        continue;
      }

      const basePath = `${DEFAULT_SOURCIFY_BASE_URL}/contracts/${matchType}/${chainId}/${addressCandidate}`;
      const { downloaded, missing } = await fetchSources(basePath, metadata.sources);
      if (downloaded.length === 0) {
        throw new Error(`Verified metadata was found on chain ${chainId}, but no source files were downloadable.`);
      }

      const primarySourcePath = Object.keys(metadata?.settings?.compilationTarget || {})[0] || downloaded[0].path;
      const code = downloaded
        .map((item) => `// File: ${item.path}\n${item.content.trimEnd()}`)
        .join("\n\n");

      return {
        address: requestedAddress,
        sourceAddress: requestedAddress,
        chainId,
        chainName: CHAIN_NAMES.get(chainId) || `chain-${chainId}`,
        contractName: getContractName(metadata, primarySourcePath),
        compilerVersion: metadata.compiler?.version || "unknown",
        matchType,
        primarySourcePath,
        sourceFiles: downloaded.map((item) => item.path),
        missingSourceFiles: missing,
        sourceRepository: "sourcify",
        code
      };
    }
  }

  return null;
}

async function tryFetchFromEtherscan(chainId, requestedAddress) {
  const apiKey = process.env.AUDIT_ETHERSCAN_API_KEY || "";
  if (!apiKey) {
    return null;
  }

  const url = new URL(DEFAULT_ETHERSCAN_BASE_URL);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", requestedAddress);
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("apikey", apiKey);

  return fetchExplorerSourceVia("etherscan", chainId, requestedAddress, async (address) => {
    url.searchParams.set("address", address);
    return fetchExplorerPayload(url.toString());
  });
}

async function tryFetchFromBlockscout(chainId, requestedAddress) {
  const baseUrls = parseConfiguredBlockscoutBaseUrls();
  const baseUrl = baseUrls.get(chainId);
  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", requestedAddress);

  return fetchExplorerSourceVia("blockscout", chainId, requestedAddress, async (address) => {
    url.searchParams.set("address", address);
    return fetchExplorerPayload(url.toString());
  });
}

export async function fetchVerifiedContractSource(address, options = {}) {
  // Resolution order:
  // 1. Sourcify verified source
  // 2. Etherscan V2 verified source
  // 3. Blockscout verified source
  // 4. RPC-based proxy slot resolution if configured
  const requestedAddress = normalizeAddress(address);
  const addressCandidates = resolveAddressCandidates(address);
  const chainIds = resolveChainIds(options.chainId);
  const visited = options.__visited instanceof Set ? options.__visited : new Set();
  const errors = [];

  for (const chainId of chainIds) {
    const visitKey = `${chainId}:${requestedAddress.toLowerCase()}`;
    if (visited.has(visitKey)) {
      throw new Error(`Detected a source resolution loop for ${requestedAddress} on chainId ${chainId}.`);
    }
    visited.add(visitKey);

    try {
      const sourcify = await tryFetchFromSourcify(chainId, addressCandidates, requestedAddress);
      if (sourcify) {
        return await maybeResolveImplementationFromRpc(sourcify, {
          ...options,
          __visited: visited
        });
      }
    } catch (error) {
      errors.push(`chain ${chainId} (sourcify): ${error.message}`);
    }

    try {
      const etherscan = await tryFetchFromEtherscan(chainId, requestedAddress);
      if (etherscan) {
        return await maybeResolveImplementationFromRpc(etherscan, {
          ...options,
          __visited: visited
        });
      }
    } catch (error) {
      errors.push(`chain ${chainId} (etherscan): ${error.message}`);
    }

    try {
      const blockscout = await tryFetchFromBlockscout(chainId, requestedAddress);
      if (blockscout) {
        return await maybeResolveImplementationFromRpc(blockscout, {
          ...options,
          __visited: visited
        });
      }
    } catch (error) {
      errors.push(`chain ${chainId} (blockscout): ${error.message}`);
    }

    try {
      const proxyResolution = await resolveProxyImplementationViaRpc(chainId, requestedAddress);
      if (proxyResolution?.implementationAddress) {
        const implementationResult = await fetchVerifiedContractSource(proxyResolution.implementationAddress, {
          ...options,
          chainId,
          __visited: visited
        });
        return {
          ...implementationResult,
          address: requestedAddress,
          proxyAddress: requestedAddress,
          implementationAddress: proxyResolution.implementationAddress,
          isProxy: true,
          proxyDetection: proxyResolution.proxyDetection,
          ...(proxyResolution.beaconAddress ? { beaconAddress: proxyResolution.beaconAddress } : {})
        };
      }
    } catch (error) {
      errors.push(`chain ${chainId} (rpc-proxy): ${error.message}`);
    }
  }

  const hint = normalizeChainId(options.chainId)
    ? `No verified source was found for ${requestedAddress} on chainId ${options.chainId}.`
    : `No verified source was found for ${requestedAddress} on the configured chain scan set (${chainIds.join(", ")}).`;
  const suffix = errors.length > 0 ? ` First fetch error: ${errors[0]}` : "";
  throw new Error(`${hint} The server currently checks Sourcify first, then Etherscan V2, then configured Blockscout explorers, and finally RPC-based EIP-1967 proxy resolution when RPC URLs are configured.${suffix}`);
}
