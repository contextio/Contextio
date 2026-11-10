#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

/**
 * Deterministic JSON canonicalization (subset of RFC 8785 / JCS):
 * - Object keys sorted lexicographically
 * - Insignificant whitespace eliminated
 * - Arrays preserved in order
 * - Undefined values filtered
 */
function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`Cannot canonicalize value of type: ${typeof value}`);
}

const LCP_WELL_KNOWN_PATH = "/.well-known/contextio-legal-context.json";

async function run() {
  const domain = (process.env.INPUT_DOMAIN || "").trim();
  const directUrl = (process.env.INPUT_URL || "").trim();
  const expectedHash = (process.env.INPUT_EXPECTED_HASH || "").trim().toLowerCase();

  let targetUrl = directUrl;
  if (!targetUrl && domain) {
    targetUrl = `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}${LCP_WELL_KNOWN_PATH}`;
  }

  if (!targetUrl) {
    console.error("❌ Error: Either 'domain' or 'url' input must be provided to verify-lcp action.");
    process.exit(1);
  }

  console.log(`🔍 Fetching Legal Context Protocol (LCP) document from: ${targetUrl}`);

  let response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Contextio-LCP-Verifier/1.0 (GitHub Action)",
      },
      redirect: "follow",
    });
  } catch (err) {
    console.error(`❌ Network error reaching LCP document at ${targetUrl}:`, err);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`❌ HTTP error ${response.status} ${response.statusText} fetching LCP document from ${targetUrl}`);
    process.exit(1);
  }

  let doc;
  try {
    doc = await response.json();
  } catch (err) {
    console.error("❌ Failed to parse response as JSON:", err);
    process.exit(1);
  }

  // Basic structure validation
  if (!doc || typeof doc !== "object") {
    console.error("❌ Invalid LCP document: Root JSON payload must be an object.");
    process.exit(1);
  }

  const requiredFields = ["contextId", "version", "tenantDomain", "terms"];
  for (const field of requiredFields) {
    if (doc[field] === undefined) {
      console.error(`❌ LCP schema validation failure: Missing required field '${field}'.`);
      process.exit(1);
    }
  }

  const canonicalJson = canonicalize(doc);
  const derivedHash = createHash("sha256").update(canonicalJson, "utf8").digest("hex").toLowerCase();

  console.log("--------------------------------------------------");
  console.log("✅ LCP Document Successfully Retrieved and Parsed");
  console.log(`   Tenant Domain: ${doc.tenantDomain}`);
  console.log(`   Context ID:    ${doc.contextId}`);
  console.log(`   Doc Version:   ${doc.version}`);
  console.log(`   Derived Hash:  ${derivedHash}`);
  console.log("--------------------------------------------------");

  if (expectedHash) {
    console.log(`🔐 Comparing against expected hash: ${expectedHash}`);
    if (derivedHash !== expectedHash) {
      console.error("❌ Hash Mismatch Error!");
      console.error(`   Expected: ${expectedHash}`);
      console.error(`   Derived:  ${derivedHash}`);
      process.exit(1);
    }
    console.log("✅ Hash matches expected value!");
  }

  // Write outputs to GitHub Actions environment
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `document-hash=${derivedHash}\n`);
    appendFileSync(githubOutput, `version=${doc.version}\n`);
    appendFileSync(githubOutput, `context-id=${doc.contextId}\n`);
    appendFileSync(githubOutput, `tenant-domain=${doc.tenantDomain}\n`);
  }

  console.log("🎉 LCP Verification completed successfully.");
}

run().catch((err) => {
  console.error("Unhandled verification exception:", err);
  process.exit(1);
});
