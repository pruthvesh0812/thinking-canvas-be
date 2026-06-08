---
feature: "sdk-delivery-filter"
type: story
created: 2026-05-06
status: approved
jira_ticket: "[PLACEHOLDER — add ticket ID when Jira integration is available]"
git_branch: "[PLACEHOLDER — e.g. feature/HC-XXX-sdk-delivery-filter]"
pr_url: "[PLACEHOLDER]"
---
<!-- approved: 2026-05-06 -->

## What
Add a table-driven, configurable filter that controls whether a message is delivered to the SDK WebSocket channel based on thread classification, message type, and inbound channel — replacing the current unconditional SDK fan-out in `BaseDeliveryService`.

## Why
All incoming messages are currently broadcast to the SDK channel regardless of thread classification. Some flows (e.g. INSURANCE_GPT, internal ops channels) should not produce SDK events, and there is no mechanism to turn this off without code changes. A generic config table follows the same "no delivery logic in code" principle already established by `MessageDeliveryConfig`.

## Blast Radius
| Component | Impact |
|---|---|
| `orchestrator/service/delivery/BaseDeliveryService.java` | SDK fan-out gate added — checks filter before calling `sdkDeliveryService.deliverMessage()` |
| `integration/model/entity/SdkDeliveryFilter.java` | New entity |
| `integration/respository/SdkDeliveryFilterRepository.java` | New Spring Data repo |
| `integration/service/SdkDeliveryFilterService.java` | New service interface |
| `integration/service/SdkDeliveryFilterServiceImpl.java` | New service impl |
| `db.changelog-master.xml` | New Liquibase changeset |
| All existing thread classifications | Potentially affected — see Open Questions |

## Files to Touch
```
NEW:
  src/main/java/com/turtlemint/helpcenter/integration/model/entity/SdkDeliveryFilter.java
  src/main/java/com/turtlemint/helpcenter/integration/respository/SdkDeliveryFilterRepository.java
  src/main/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterService.java
  src/main/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterServiceImpl.java
  src/test/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterServiceImplTest.java

MODIFIED:
  src/main/java/com/turtlemint/helpcenter/orchestrator/service/delivery/BaseDeliveryService.java
  src/main/java/com/turtlemint/helpcenter/core/config/cache/RedisCacheManager.java
  src/main/resources/db/changelog/db.changelog-master.xml
```

## Liquibase Impact
Yes.
- Table: `sdk_delivery_filter`
- Change: new table with columns `id`, `thread_classification`, `message_type`, `inbound_channel`, `sdk_delivery_enabled`
- Next changeset ID: `06052026-1`

Schema:
```sql
CREATE TABLE sdk_delivery_filter (
  id                    BIGSERIAL       PRIMARY KEY,
  thread_classification VARCHAR(255),          -- NULL = match any classification
  message_type          VARCHAR(255),          -- NULL = match any message type
  inbound_channel       VARCHAR(255),          -- NULL = match any inbound channel
  sdk_delivery_enabled  BOOLEAN NOT NULL DEFAULT TRUE
);
```

Matching logic (in service):
1. Query rows where each non-null column in the row matches the incoming value.
2. If **any** matching row has `sdk_delivery_enabled = false` → deny SDK delivery.
3. If **no rows match** → apply the default policy (see Open Questions — must be decided before implementation).

## New RabbitMQ Queues
No.

## Risks
- **Breaking change risk (default policy):** If the default for "no matching row" is DENY, every existing classification stops getting SDK delivery until rows are seeded. If the default is ALLOW, the filter has no effect until deny-rows are added. Engineer must decide before implementation (see Open Questions).
- **Performance:** Every message now triggers a DB query to `sdk_delivery_filter`. Consider adding a Spring Cache (`@Cacheable`) on the service method — the table changes rarely. Cache eviction would need a management endpoint or a short TTL.
- **Null-column matching in JPA:** JPQL `IS NULL OR x = :value` patterns must be tested explicitly — some JPA providers handle parameterised null comparisons differently.

## Decisions
| Question | Decision |
|---|---|
| Default policy (no matching row) | **ALLOW** — deliver to SDK; filter is additive |
| Caching | **Yes** — cache per `(threadClassification, messageType, inboundChannel)` using the existing Redis store |
| Filter dimensions | **All three** — `threadClassification`, `messageType`, `inboundChannel` |
| Day-one deny rows | **None** — no seed inserts in the changeset |

## Test Plan
- `SdkDeliveryFilterServiceImplTest.java`
  - `shouldAllowSdkWhenNoRowsPresent` — empty table → default policy
  - `shouldAllowSdkWhenMatchingRowEnabled` — matching row with `sdk_delivery_enabled=true`
  - `shouldDenySdkWhenMatchingRowDisabled` — matching row with `sdk_delivery_enabled=false`
  - `shouldMatchNullClassificationAsWildcard` — row with null classification matches any thread
  - `shouldNotMatchWhenClassificationDiffers` — row for POLICY_COPY does not match QUOTE_REQUEST
- `BaseDeliveryServiceTest.java` (additions)
  - `shouldSkipSdkDeliveryWhenFilterDenies`
  - `shouldCallSdkDeliveryWhenFilterAllows`

## Known Issues (from learnings.json)
None — `learnings.json` has no entries for the delivery or SDK area.

## Task Breakdown
Tasks required (reason: Liquibase migration + new business logic across ≥3 boundaries + hard sequential dependency — service cannot be written without entity):

- **task-01:** Data layer — `SdkDeliveryFilter` entity, `SdkDeliveryFilterRepository`, Liquibase changeset `06052026-1`
- **task-02:** Service + gate — `SdkDeliveryFilterService` interface + impl, modify `BaseDeliveryService` to consult filter before SDK fan-out

See `tasks/` directory.
