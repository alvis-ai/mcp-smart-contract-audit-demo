import { createHash } from "node:crypto";
import { isPostgresEnabled, withPgClient } from "./database.js";

const DEFAULT_CACHE_MAX_AGE_DAYS = Math.max(0, Number(process.env.AUDIT_AI_CACHE_MAX_AGE_DAYS || 30));
const DEFAULT_CHUNK_SIZE = Math.max(1000, Number(process.env.AUDIT_SOURCE_CHUNK_CHARS || 4000));
const DEFAULT_CHUNK_OVERLAP = Math.max(0, Number(process.env.AUDIT_SOURCE_CHUNK_OVERLAP_CHARS || 400));

let initializationPromise;
let pgvectorAvailable = false;

export function sha256Hex(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function normalizeAddressKey(address) {
  return String(address || "").trim().toLowerCase();
}

export function computeSourceHash(sourceCode) {
  return sha256Hex(String(sourceCode || "").replace(/\r\n/g, "\n").trim());
}

function nowIso() {
  return new Date().toISOString();
}

function parseSourceFiles(sourceCode, fallbackPath = "Contract.sol") {
  const normalized = String(sourceCode || "");
  const lines = normalized.split(/\r?\n/);
  const marker = /^\/\/ File:\s+(.+)$/;
  const files = [];
  let currentPath = "";
  let currentLines = [];

  const flush = () => {
    if (!currentPath && currentLines.length === 0) {
      return;
    }
    files.push({
      path: currentPath || fallbackPath,
      content: currentLines.join("\n").trimEnd()
    });
  };

  for (const line of lines) {
    const match = line.match(marker);
    if (match) {
      flush();
      currentPath = match[1].trim() || fallbackPath;
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  flush();
  return files.length > 0 ? files : [{ path: fallbackPath, content: normalized }];
}

function lineNumberForOffset(text, offset) {
  if (offset <= 0) {
    return 1;
  }
  return String(text).slice(0, offset).split("\n").length;
}

export function createSourceChunks(sourceCode, options = {}) {
  const chunkSize = Math.max(1000, Number(options.chunkSize || DEFAULT_CHUNK_SIZE));
  const overlap = Math.min(chunkSize - 1, Math.max(0, Number(options.overlap || DEFAULT_CHUNK_OVERLAP)));
  const files = parseSourceFiles(sourceCode, options.primarySourcePath || "Contract.sol");
  const chunks = [];

  for (const file of files) {
    const content = file.content || "";
    if (!content.trim()) {
      continue;
    }
    for (let start = 0; start < content.length; start += chunkSize - overlap) {
      const end = Math.min(content.length, start + chunkSize);
      const chunk = content.slice(start, end).trim();
      if (!chunk) {
        continue;
      }
      chunks.push({
        chunkIndex: chunks.length,
        sourcePath: file.path,
        startLine: lineNumberForOffset(content, start),
        endLine: lineNumberForOffset(content, end),
        content: chunk,
        contentHash: sha256Hex(`${file.path}\n${chunk}`)
      });
      if (end >= content.length) {
        break;
      }
    }
  }

  return chunks;
}

async function ensureKnowledgeStore() {
  if (!isPostgresEnabled()) {
    return false;
  }
  if (!initializationPromise) {
    initializationPromise = withPgClient(async (client) => {
      try {
        await client.query("CREATE EXTENSION IF NOT EXISTS vector");
        pgvectorAvailable = true;
      } catch {
        pgvectorAvailable = false;
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_source_contracts (
          source_hash TEXT PRIMARY KEY,
          contract_name TEXT,
          primary_source_path TEXT,
          source_files JSONB,
          source_repository TEXT,
          compiler_version TEXT,
          code_size INTEGER,
          ai_report_json JSONB,
          ai_report_markdown TEXT,
          last_result_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS audit_address_sources (
          chain_id INTEGER NOT NULL,
          address TEXT NOT NULL,
          source_address TEXT,
          analysis_address TEXT,
          source_hash TEXT NOT NULL REFERENCES audit_source_contracts(source_hash) ON DELETE CASCADE,
          bytecode_hash TEXT,
          last_audit_job_id TEXT,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (chain_id, address)
        );
        CREATE TABLE IF NOT EXISTS audit_source_chunks (
          source_hash TEXT NOT NULL REFERENCES audit_source_contracts(source_hash) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          source_path TEXT NOT NULL,
          start_line INTEGER,
          end_line INTEGER,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          embedding_json JSONB,
          embedding_model TEXT,
          ai_summary TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (source_hash, chunk_index)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_source_chunks_content_hash
          ON audit_source_chunks(source_hash, content_hash);
        CREATE INDEX IF NOT EXISTS idx_audit_address_sources_source_hash
          ON audit_address_sources(source_hash);
        CREATE INDEX IF NOT EXISTS idx_audit_source_contracts_updated_at
          ON audit_source_contracts(updated_at DESC);
      `);
      if (pgvectorAvailable) {
        await client.query(`
          ALTER TABLE audit_source_chunks
            ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);
          CREATE INDEX IF NOT EXISTS idx_audit_source_chunks_embedding_vector
            ON audit_source_chunks USING ivfflat (embedding_vector vector_cosine_ops)
            WITH (lists = 100);
        `).catch(() => {
          pgvectorAvailable = false;
        });
      }
    });
  }
  await initializationPromise;
  return true;
}

export async function getCachedAddressAnalysis({ address, chainId, sourceHash, maxAgeDays = DEFAULT_CACHE_MAX_AGE_DAYS }) {
  if (!sourceHash || String(process.env.AUDIT_AI_CACHE_MODE || "readwrite").toLowerCase() === "off") {
    return null;
  }
  if (!(await ensureKnowledgeStore())) {
    return null;
  }

  return withPgClient(async (client) => {
    const maxAgeClause = maxAgeDays > 0 ? "AND c.updated_at >= NOW() - ($4::int * INTERVAL '1 day')" : "";
    const params = [Number(chainId || 0), normalizeAddressKey(address), sourceHash];
    if (maxAgeDays > 0) {
      params.push(Math.floor(maxAgeDays));
    }
    const result = await client.query(`
      SELECT c.last_result_json, c.ai_report_json, c.ai_report_markdown, a.last_seen_at
      FROM audit_address_sources a
      JOIN audit_source_contracts c ON c.source_hash = a.source_hash
      WHERE a.chain_id = $1
        AND a.address = $2
        AND a.source_hash = $3
        AND c.last_result_json IS NOT NULL
        ${maxAgeClause}
      LIMIT 1
    `, params);
    const row = result.rows[0];
    if (!row?.last_result_json) {
      return null;
    }
    return {
      ...row.last_result_json,
      cache: {
        status: "hit",
        sourceHash,
        lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at
      },
      ai: row.ai_report_json
        ? {
          ...(row.last_result_json.ai || {}),
          ...row.ai_report_json,
          reportMarkdown: row.ai_report_markdown || row.ai_report_json.reportMarkdown || ""
        }
        : row.last_result_json.ai
    };
  });
}

export async function upsertAuditKnowledge({ address, chainId, sourceContract, bytecodeContract, result, aiReport, chunks = [], embeddings = [] }) {
  if (!sourceContract?.code) {
    return { status: "skipped", reason: "no-source" };
  }
  if (!(await ensureKnowledgeStore())) {
    return { status: "skipped", reason: "postgres-disabled" };
  }

  const sourceHash = computeSourceHash(sourceContract.code);
  const normalizedAddress = normalizeAddressKey(address || sourceContract.address);
  const now = nowIso();

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`
        INSERT INTO audit_source_contracts (
          source_hash, contract_name, primary_source_path, source_files,
          source_repository, compiler_version, code_size,
          ai_report_json, ai_report_markdown, last_result_json,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $11)
        ON CONFLICT (source_hash) DO UPDATE SET
          contract_name = EXCLUDED.contract_name,
          primary_source_path = EXCLUDED.primary_source_path,
          source_files = EXCLUDED.source_files,
          source_repository = EXCLUDED.source_repository,
          compiler_version = EXCLUDED.compiler_version,
          code_size = EXCLUDED.code_size,
          ai_report_json = COALESCE(EXCLUDED.ai_report_json, audit_source_contracts.ai_report_json),
          ai_report_markdown = COALESCE(EXCLUDED.ai_report_markdown, audit_source_contracts.ai_report_markdown),
          last_result_json = EXCLUDED.last_result_json,
          updated_at = NOW()
      `, [
        sourceHash,
        sourceContract.contractName || result?.contractName || "",
        sourceContract.primarySourcePath || result?.primarySourcePath || "",
        JSON.stringify(sourceContract.sourceFiles || result?.sourceFiles || []),
        sourceContract.sourceRepository || result?.sourceRepository || "",
        sourceContract.compilerVersion || result?.compilerVersion || "",
        sourceContract.code.length,
        aiReport ? JSON.stringify(aiReport) : null,
        aiReport?.reportMarkdown || "",
        JSON.stringify(result || {}),
        now
      ]);

      if (normalizedAddress && chainId) {
        await client.query(`
          INSERT INTO audit_address_sources (
            chain_id, address, source_address, analysis_address, source_hash,
            bytecode_hash, first_seen_at, last_seen_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (chain_id, address) DO UPDATE SET
            source_address = EXCLUDED.source_address,
            analysis_address = EXCLUDED.analysis_address,
            source_hash = EXCLUDED.source_hash,
            bytecode_hash = EXCLUDED.bytecode_hash,
            last_seen_at = NOW()
        `, [
          Number(chainId),
          normalizedAddress,
          normalizeAddressKey(sourceContract.sourceAddress || sourceContract.address || ""),
          normalizeAddressKey(result?.analysisAddress || ""),
          sourceHash,
          bytecodeContract?.bytecodeHash || result?.bytecodeHash || ""
        ]);
      }

      for (const chunk of chunks) {
        const embedding = embeddings[chunk.chunkIndex] || null;
        const embeddingVector = pgvectorAvailable && Array.isArray(embedding?.vector) && embedding.vector.length === 1536
          ? `[${embedding.vector.map((value) => Number(value) || 0).join(",")}]`
          : null;
        const baseParams = [
          sourceHash,
          chunk.chunkIndex,
          chunk.sourcePath,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          chunk.contentHash,
          embedding?.vector ? JSON.stringify(embedding.vector) : null
        ];
        if (pgvectorAvailable) {
          await client.query(`
            INSERT INTO audit_source_chunks (
              source_hash, chunk_index, source_path, start_line, end_line,
              content, content_hash, embedding_json, embedding_vector, embedding_model, ai_summary, metadata,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::vector, $10, $11, $12::jsonb, NOW(), NOW())
            ON CONFLICT (source_hash, chunk_index) DO UPDATE SET
              source_path = EXCLUDED.source_path,
              start_line = EXCLUDED.start_line,
              end_line = EXCLUDED.end_line,
              content = EXCLUDED.content,
              content_hash = EXCLUDED.content_hash,
              embedding_json = COALESCE(EXCLUDED.embedding_json, audit_source_chunks.embedding_json),
              embedding_vector = COALESCE(EXCLUDED.embedding_vector, audit_source_chunks.embedding_vector),
              embedding_model = COALESCE(EXCLUDED.embedding_model, audit_source_chunks.embedding_model),
              ai_summary = COALESCE(EXCLUDED.ai_summary, audit_source_chunks.ai_summary),
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `, [
            ...baseParams,
            embeddingVector,
            embedding?.model || "",
            chunk.aiSummary || "",
            JSON.stringify({ contentHash: chunk.contentHash })
          ]);
          continue;
        }
        await client.query(`
          INSERT INTO audit_source_chunks (
            source_hash, chunk_index, source_path, start_line, end_line,
            content, content_hash, embedding_json, embedding_model, ai_summary, metadata,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, NOW(), NOW())
          ON CONFLICT (source_hash, chunk_index) DO UPDATE SET
            source_path = EXCLUDED.source_path,
            start_line = EXCLUDED.start_line,
            end_line = EXCLUDED.end_line,
            content = EXCLUDED.content,
            content_hash = EXCLUDED.content_hash,
            embedding_json = COALESCE(EXCLUDED.embedding_json, audit_source_chunks.embedding_json),
            embedding_model = COALESCE(EXCLUDED.embedding_model, audit_source_chunks.embedding_model),
            ai_summary = COALESCE(EXCLUDED.ai_summary, audit_source_chunks.ai_summary),
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          ...baseParams,
          embedding?.model || "",
          chunk.aiSummary || "",
          JSON.stringify({ contentHash: chunk.contentHash })
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return { status: "stored", sourceHash, chunkCount: chunks.length };
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

export async function findSimilarSourceChunks(queryEmbedding, options = {}) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return [];
  }
  if (!(await ensureKnowledgeStore())) {
    return [];
  }

  const limit = Math.max(1, Number(options.limit || 6));
  const excludeSourceHash = options.excludeSourceHash || "";
  const rows = await withPgClient(async (client) => {
    const result = await client.query(`
      SELECT source_hash, chunk_index, source_path, start_line, end_line, content, embedding_json, embedding_model
      FROM audit_source_chunks
      WHERE embedding_json IS NOT NULL
        AND ($1::text = '' OR source_hash <> $1)
      ORDER BY updated_at DESC
      LIMIT 500
    `, [excludeSourceHash]);
    return result.rows;
  });

  return rows
    .map((row) => ({
      sourceHash: row.source_hash,
      chunkIndex: row.chunk_index,
      sourcePath: row.source_path,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      embeddingModel: row.embedding_model,
      score: cosineSimilarity(queryEmbedding, row.embedding_json)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
