---
name: cve_scan
description: Scan dependencies and Docker image for CVEs using OWASP Dependency Check and Trivy.
---

# Skill: CVE Scan

## Step 1 — Dependency Scan
```bash
./gradlew dependencyCheckAnalyze
# Report: build/reports/dependency-check-report.html
```

## Step 2 — Container Scan
```bash
docker build -t help-center-v2:scan .
trivy image help-center-v2:scan
trivy fs --scanners vuln .
```

## Step 3 — Triage
| Priority | Severity | Action |
|---|---|---|
| Immediate | Critical | Block / patch now |
| High | High | Fix before next release |
| Track | Medium | Assess + schedule |
| Monitor | Low | Log for awareness |

Load `.ai/context/AGENT-GUIDELINES.md` §3 for dependency hygiene rules before recommending upgrades.

## Output Format
```
## CVE Scan — help-center-v2
Date: YYYY-MM-DD

### Critical / High Findings
| CVE | Package | Current | Fixed In | CVSS | Description |

### Summary
Total: N CVEs (X Critical, Y High, Z Medium)
Action required: [packages to upgrade]

Verdict: CLEAN | FINDINGS REQUIRE ACTION
```
