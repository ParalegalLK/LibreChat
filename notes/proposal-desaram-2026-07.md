# Proposal — AI Workspace Platform Upgrade

**Prepared for:** D. L. & F. de Saram — Managing Partner
**Prepared by:** paralegal.lk
**Date:** 9 July 2026
**Validity:** 30 days

---

## 1. Executive Summary

Your AI workspace currently gives your lawyers secure, governed access to frontier AI models
for research and drafting. This upgrade turns it into a **document-producing legal work
platform**: lawyers will receive finished Word, PDF, Excel, and PowerPoint documents — on firm
templates, in house style — produced by AI running on infrastructure dedicated exclusively to
your firm.

Three headline capabilities:

1. **Secure code execution** — AI can now compute, analyse data, and generate files inside an
   isolated sandbox reserved for your firm. No client material ever touches shared
   infrastructure or third-party AI services beyond the models you already use.
2. **Native document production** — the AI drafts and returns actual `.docx`, `.pdf`, `.xlsx`,
   and `.pptx` files: opinions and agreements on firm letterhead, tracked-changes reviews,
   schedules and tables, filing-ready court documents.
3. **A firm skill library** — reusable, partner-approved instructions that teach the AI your
   document types and house style, authored and maintained by paralegal.lk to D. L. & F. de
   Saram's specifications. The library grows with you: each new document type is a catalogued,
   priced addition.

At 50 fee earners, if each lawyer saves **30 minutes per week** on drafting and formatting,
the firm recovers roughly **25 lawyer-hours weekly** — the entire one-time investment is
recovered within the first weeks of use. Your monthly maintenance fee **does not change**.

---

## 2. What Will Be Rolled Out

### 2.1 Code Execution on Dedicated Infrastructure
- A private, sandboxed code-execution environment provisioned **exclusively for your firm** —
  network-isolated, locked to your workspace, with no internet access from inside the sandbox.
- Runs Python, JavaScript/TypeScript, and shell workloads: data analysis, document assembly,
  spreadsheet computation, bulk formatting.
- Every execution is session-isolated; generated files are available in-chat for preview and
  download.
- Operated, patched, and monitored by paralegal.lk. **First 12 months of dedicated sandbox
  operations are included** in the upgrade fee.

### 2.2 Document Production
- AI-generated Word documents with correct styles, numbering, and letterhead; tracked changes
  and comments supported for review workflows.
- PDF assembly and form-filling; Excel models with working formulas; presentation decks.
- Output to **your firm's templates and drafting conventions** (see 2.3).

### 2.3 Firm Skill Library (authored to your specification)
- **Included in this rollout:** a base library covering general document production, document
  co-authoring workflow, and firm writing style.
- **Custom document-type skills** — each teaches the AI one of your document types end to end
  (structure, house style, letterhead, formatting rules). Initial bundle of **five document
  types** selected with your partners (e.g., legal opinions, agreements, writ petitions,
  written submissions, board papers).
- Each skill is delivered against a written acceptance criterion: *a designated reviewing
  partner signs off that the output is filing/issue-ready on firm template.*
- Additional document types can be commissioned at any time at a fixed per-type price.
- All skills are reviewed against your governance rules (below) before deployment.

### 2.4 Governance & Risk Controls
- **Enforced firm system prompt** on every third-party model — cannot be removed or altered by
  users: Sri Lankan jurisdiction default, professional-use scope, no fabricated authorities
  (with verification reminders), not-legal-advice framing, confidentiality rules.
- **Tool lockdown per model** — capabilities are enabled only where appropriate; features not
  suited to legal work are removed platform-wide.
- Model line-up: latest OpenAI (GPT-5.x), Anthropic (Claude 4.6), and Google (Gemini 3.x)
  models, all under the same governance.

### 2.5 Security Posture (summary)
- Dedicated sandbox VM per firm; access restricted at the network layer to your workspace only.
- No network egress from code execution; strict per-run resource and file limits.
- SSO with your existing identity provider; sessions under centrally managed policy.
- All infrastructure in paralegal.lk-managed environments; no client documents used for model
  training.

---

## 3. Rollout Plan

| Phase | Scope | Duration | Acceptance |
|---|---|---|---|
| **1 — Platform upgrade** | Dedicated sandbox provisioning, code execution, document production, governance hardening, base skill library | 2 weeks from acceptance | Demo checklist executed with your IT/partner representative |
| **2 — Custom skills, batch 1** | First 3 document types | 2–3 weeks | Reviewing-partner sign-off per document type |
| **3 — Custom skills, batch 2** | Remaining 2 document types + refinements from batch-1 feedback | 2–3 weeks | Reviewing-partner sign-off per document type |
| **4 — Onboarding** | Two training sessions (fee earners + support staff), quick-reference guide | Alongside phases 2–3 | Sessions delivered |

Total elapsed time: approximately **6–8 weeks** from acceptance to full rollout.

---

## 4. Investment

| Item | Fee (LKR, one-time) |
|---|---|
| Platform upgrade — dedicated sandbox, code execution, document production, governance; **includes 12 months of dedicated sandbox operations** | 1,800,000 |
| Custom document skill bundle — five document types to firm specification, partner-acceptance per type | 1,000,000 |
| Firm skill library integration — base skills adapted to firm governance, tested and deployed | 500,000 |
| **Total one-time** | **3,300,000** |

| Recurring | Fee (LKR) |
|---|---|
| Monthly platform maintenance | **150,000 — unchanged** |
| Dedicated sandbox operations, from month 13 | 400,000 / year |

- Additional custom document types beyond the initial five: **LKR 200,000 per type**, with the
  same partner-acceptance criterion.
- Skill maintenance (template tweaks, court-formatting updates to existing skills) is covered
  under monthly maintenance; new document types are new commissions.

### Payback illustration
50 fee earners × 30 minutes saved per week ≈ 25 hours/week. At a conservative blended rate of
LKR 15,000/hour, that is **LKR 375,000 per week** in recovered capacity — the one-time fee is
recovered in under 9 weeks; at 1 hour/week saved, under 5 weeks.

---

## 5. Support & Service Levels

- Business-hours support (weekdays 8.30–18.00) with 4-hour response for platform-down issues.
- Monthly patch cadence for sandbox infrastructure; security fixes applied out-of-cycle.
- Quarterly review meeting: usage patterns, skill-library roadmap, new model availability.

## 6. Assumptions & Exclusions

- Firm templates, letterheads, and two reference examples per document type are provided by
  the firm at Phase 2 start.
- A reviewing partner (or designee) is available for acceptance reviews within 5 business days
  of each delivery.
- Excluded: changes to the firm's identity provider or network; document types beyond the
  initial five; integrations with practice-management systems (quotable separately).

## 7. Acceptance

This proposal is accepted by written confirmation (email sufficient). Phase 1 begins within 5
business days of acceptance and a 50% advance of the one-time fee; balance on completion of
Phase 3.

---

*paralegal.lk — private AI infrastructure for Sri Lankan legal practice.*
