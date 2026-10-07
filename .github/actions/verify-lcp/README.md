# Verify LCP GitHub Action

A reusable, composite GitHub Action that fetches and cryptographically verifies a published **Contextio Legal Context Protocol (LCP)** document in continuous integration (CI).

It resolves a tenant's published `/.well-known/contextio-legal-context.json`, validates its schema structure, applies deterministic RFC 8785 (JSON Canonicalization Scheme) ordering, and derives the tamper-evident SHA-256 hash. If an expected hash is provided, it asserts byte-for-byte consistency and fails CI upon any divergence or unreachable document.

---

## Inputs

| Name | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `domain` | String | No | `""` | Tenant domain (e.g., `contextio.xyz`). The action fetches `https://<domain>/.well-known/contextio-legal-context.json`. |
| `url` | String | No | `""` | Direct URL to an LCP document (overrides `domain` if specified). |
| `expected-hash` | String | No | `""` | Optional expected SHA-256 hex digest to assert against. |

> **Note**: At least one of `domain` or `url` must be provided.

---

## Outputs

| Name | Description |
| :--- | :--- |
| `document-hash` | Canonical SHA-256 hex digest of the fetched LCP document. |
| `version` | Document version integer extracted from the document. |
| `context-id` | Tenant context UUID recorded in the document. |
| `tenant-domain` | Declared tenant domain from the document payload. |

---

## Usage Examples

### 1. Basic Verification Against Demo Tenant

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Verify Live LCP Document
    uses: ./.github/actions/verify-lcp
    with:
      domain: contextio.xyz
```

### 2. Pinned Hash Assertion

Ensure CI fails if the published legal context document changes without an explicit hash bump in the workflow:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Verify Pinned LCP Document Hash
    uses: ./.github/actions/verify-lcp
    with:
      domain: contextio.xyz
      expected-hash: "bf3ca757eac32b2161dca341fbe5560f22d21c532dc3c64bf8ec5144b2827954"
```

### 3. Downstream Repository Adoption

Downstream consumers integrating Contextio can reference this action directly:

```yaml
steps:
  - uses: contextio/Contextio/.github/actions/verify-lcp@main
    with:
      domain: "app.yourdomain.com"
```

---

## Failure Modes

- **Unreachable / Network Error**: Fails if the HTTP request returns 4xx/5xx status codes or DNS resolution fails.
- **Malformed JSON / Schema Invalid**: Fails if the document is not valid JSON or lacks mandatory root attributes (`contextId`, `version`, `tenantDomain`, `terms`).
- **Hash Mismatch**: Fails if `expected-hash` is provided and does not match the canonical SHA-256.
