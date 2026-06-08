---
name: code_security_review
description: Security-focused review — SAST patterns, PII handling, secret management, injection prevention, SCA.
---

# Skill: Code Security Review

Load `.ai/context/AGENT-GUIDELINES.md` §3 (SCA) and §4 (SAST) before proceeding.

## SAST Checklist
- [ ] No user input concatenated into JPQL/SQL
- [ ] No user input concatenated into log statements — parameterized logging only
- [ ] Untrusted JSON deserialized into typed DTOs, not `Object`
- [ ] `Participant.email`, `Participant.mobile`, WhatsApp numbers NOT logged
- [ ] No plaintext PII in `metaData` JSONB fields
- [ ] Internal endpoints under `/api/helpcenter/v2/internal/**`
- [ ] `ContextUtil` not used for access control
- [ ] All credentials from Config Server — not in source or `application.yaml`
- [ ] File uploads go to S3 — no local filesystem storage

## SCA Checklist
- [ ] New dependency checked against nvd.nist.gov
- [ ] Version pinned explicitly
- [ ] No downgrade of existing dependencies
- [ ] Internal libs from internal Nexus only
- [ ] `lz4-java` conflict resolution preserved

```bash
./gradlew dependencyCheckAnalyze
# Report: build/reports/dependency-check-report.html

docker build -t help-center-v2:scan .
trivy image help-center-v2:scan
```

## Output Format
```
## Security Review: [branch / PR]

### SAST Findings
[severity] **[ClassName.java:line]** [description + fix]

### SCA Findings
[dependency] [CVE-ID] [severity] [fix: upgrade to X]

### Verdict
APPROVED | CHANGES REQUESTED | BLOCKED
```
