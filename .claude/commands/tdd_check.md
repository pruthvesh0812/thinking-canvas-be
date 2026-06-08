---
name: tdd_check
description: Verify test coverage for new or modified code in help-center-v2.
---

# Skill: TDD Coverage Check

Load `.ai/context/AGENT-GUIDELINES.md` §2 before proceeding.

Check every new/modified class against the TDD rules. Run tests to confirm:
```bash
./gradlew test --tests "com.turtlemint.helpcenter.*"
```

## Output Format
```
[ClassName] — test file: [TestClassName.java]
  ✅ Happy path covered
  ✅ Error/exception path covered
  ❌ Missing: [what test is absent and why it matters]
```

Verdict: **COVERAGE ADEQUATE** | **TESTS MISSING** (list what must be added before merge).
