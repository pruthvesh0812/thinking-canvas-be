---
name: liquibase_check
description: Validate every entity schema change has a matching Liquibase changeset.
---

# Skill: Liquibase Changeset Check

Load `.ai/context/CODING-STANDARDS.md` §3 before proceeding.

## Steps
1. Find all field additions/removals/type changes in `core/model/entity/*.java`
2. Cross-reference with `src/main/resources/db/changelog/db.changelog-master.xml`
3. Validate each changeset: id format `DDMMYY-N`, author present, table name matches, column type correct

```bash
grep '<changeSet' src/main/resources/db/changelog/db.changelog-master.xml | tail -20
```

Test locally — Liquibase runs on startup. A bad changeset will fail the boot.

## Output Format
```
[Entity.java] → [table_name]
  Field: [fieldName] ([JavaType])
  Changeset: FOUND: id=050526-1 ✅ | MISSING ❌
  Issue (if any): [description]
```

Verdict: **ALL CHANGESETS PRESENT** | **MISSING CHANGESETS** (list each gap).
