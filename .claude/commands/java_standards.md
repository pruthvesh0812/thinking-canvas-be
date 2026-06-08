---
name: java_standards
description: Enforce help-center-v2 Spring Boot coding standards — controller/service/repo patterns, logging, Liquibase, RabbitMQ.
---

# Skill: Java Standards Check

Load `.ai/context/CODING-STANDARDS.md` before proceeding.

Audit the supplied file(s) or diff for compliance with all patterns in CODING-STANDARDS.md.

## Severity
- `MUST_FIX` — blocks PR
- `SHOULD_FIX` — recommended before merge
- `NIT` — optional improvement

## Output Format
```
[MUST_FIX|SHOULD_FIX|NIT] [ClassName.java:line] [rule violated] → [suggested fix]
```

Finish with summary count and overall verdict: **COMPLIANT** | **NON-COMPLIANT**.
