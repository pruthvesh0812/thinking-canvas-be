---
feature: "sdk-delivery-filter"
type: task
task_id: task-02
story: ../story.md
created: 2026-05-06
status: implemented
---

## Scope
Service + gate — implement `SdkDeliveryFilterService` (interface + impl) containing the allow/deny decision logic, then wire it into `BaseDeliveryService.deliverMessage()` as a guard before the SDK fan-out call.

## Decisions Applied
- Default policy: **ALLOW** (empty result → deliver)
- Caching: **yes**, `@Cacheable` on `isSdkDeliveryAllowed()` using the existing Redis cache configuration
- Filter dimensions: all three — `threadClassification`, `messageType`, `inboundChannel`
- Day-one seed rows: none

## Files to Touch
```
NEW:
  src/main/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterService.java
  src/main/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterServiceImpl.java
  src/test/java/com/turtlemint/helpcenter/integration/service/SdkDeliveryFilterServiceImplTest.java

MODIFIED:
  src/main/java/com/turtlemint/helpcenter/orchestrator/service/delivery/BaseDeliveryService.java
    → @Autowired SdkDeliveryFilterService
    → Add sdkAllowed check before line 99 (the sdkDeliveryService.deliverMessage() call)
  src/main/java/com/turtlemint/helpcenter/core/config/cache/RedisCacheManager.java
    → Add private static final String SDK_DELIVERY_FILTER_CACHE = "sdkDeliveryFilter";
    → In the static block, register: cacheValueTypes.put(SDK_DELIVERY_FILTER_CACHE,
        JsonUtil.getMapper().getTypeFactory().constructType(Boolean.class));
    WHY: RedisCache.readValue() returns raw value when defaultValueType is null. Boolean is
    serialized to JSON string "true"/"false" by serializeValue(). Without registration,
    cache hits return a String and Spring's @Cacheable proxy throws ClassCastException.
```

## Service Design

### Interface
```java
// SdkDeliveryFilterService.java
public interface SdkDeliveryFilterService {
    boolean isSdkDeliveryAllowed(String threadClassification, String messageType, String inboundChannel);
}
```

### Implementation — default-ALLOW + Redis cache
```java
// SdkDeliveryFilterServiceImpl.java
@Slf4j
@Service
public class SdkDeliveryFilterServiceImpl implements SdkDeliveryFilterService {

    @Autowired
    private SdkDeliveryFilterRepository sdkDeliveryFilterRepository;

    @Override
    @Cacheable(value = "sdkDeliveryFilter", key = "#threadClassification + '_' + #messageType + '_' + #inboundChannel")
    public boolean isSdkDeliveryAllowed(String threadClassification, String messageType, String inboundChannel) {
        List<SdkDeliveryFilter> filters = sdkDeliveryFilterRepository
            .findMatchingFilters(threadClassification, messageType, inboundChannel);

        if (filters.isEmpty()) {
            // default-ALLOW: no rule = deliver
            return true;
        }
        // deny wins: if ANY matching row blocks delivery, skip SDK
        boolean allowed = filters.stream().allMatch(SdkDeliveryFilter::isSdkDeliveryEnabled);
        log.debug("[SdkDeliveryFilterServiceImpl.isSdkDeliveryAllowed] threadClassification=[{}] messageType=[{}] inboundChannel=[{}] allowed=[{}]",
            threadClassification, messageType, inboundChannel, allowed);
        return allowed;
    }
}
```

**Cache name:** `sdkDeliveryFilter` — must be declared in the Redis `CacheManager` config (check `core/config/` for the existing `CacheManager` bean and add this cache name to it).

**Cache invalidation:** Entries are evicted when a filter row changes. Since there is no admin API for this table today, cache entries expire at the configured Redis TTL (align with existing cache TTL in the project). A `@CacheEvict` management endpoint can be added later if ops needs manual flush.

### BaseDeliveryService gate — replace current lines 98-101
```java
// Before (unconditional):
log.debug("[BaseDeliveryService.deliverMessage] Delivering message to SDK.");
sdkDeliveryService.deliverMessage(msDomainObject);
log.info("[BaseDeliveryService.deliverMessage] Delivered message to SDK. ...");

// After (gated):
String classification = threadDto.getThreadClassification() != null
    ? threadDto.getThreadClassification().name() : null;
String msgType = msDomainObject.getMessageType();
String channel = msDomainObject.getChannel() != null
    ? msDomainObject.getChannel().name() : null;

if (sdkDeliveryFilterService.isSdkDeliveryAllowed(classification, msgType, channel)) {
    log.debug("[BaseDeliveryService.deliverMessage] Delivering message to SDK.");
    sdkDeliveryService.deliverMessage(msDomainObject);
    log.info("[BaseDeliveryService.deliverMessage] Delivered message to SDK. msDomainObject=[{}]", msDomainObject);
} else {
    log.info("[BaseDeliveryService.deliverMessage] SDK delivery skipped by filter. threadClassification=[{}] messageType=[{}] channel=[{}]",
        classification, msgType, channel);
}
```

## Depends On
task-01 must be complete — `SdkDeliveryFilter` entity and `SdkDeliveryFilterRepository` must exist.

## Definition of Done
- [ ] `SdkDeliveryFilterService` interface and impl compile with no errors
- [ ] `BaseDeliveryService` autowires `SdkDeliveryFilterService` and the gate is in place
- [ ] `./mvnw compile` passes
- [ ] All 7 unit tests listed below pass (`./mvnw test -pl . -Dtest=SdkDeliveryFilterServiceImplTest,BaseDeliveryServiceTest`)

## Test Plan
### SdkDeliveryFilterServiceImplTest
| Test method | Scenario | Expected |
|---|---|---|
| `shouldAllowWhenNoRowsMatch` | Table empty / no matching rows | `true` (default-ALLOW) |
| `shouldAllowWhenMatchingRowEnabled` | One row matches, `sdkDeliveryEnabled=true` | `true` |
| `shouldDenyWhenMatchingRowDisabled` | One row matches, `sdkDeliveryEnabled=false` | `false` |
| `shouldDenyWhenAnyMatchingRowDisabled` | Two rows match, one enabled, one disabled | `false` (deny wins) |
| `shouldMatchNullClassificationAsWildcard` | Row has null classification, incoming has POLICY_COPY | row applies |
| `shouldNotMatchWhenClassificationDiffers` | Row has POLICY_COPY, incoming is QUOTE_REQUEST | row does not apply → default-ALLOW |

### BaseDeliveryServiceTest (additions)
| Test method | Scenario | Expected |
|---|---|---|
| `shouldSkipSdkDeliveryWhenFilterDenies` | `sdkDeliveryFilterService.isSdkDeliveryAllowed(...)` returns false | `sdkDeliveryService.deliverMessage()` never called |
| `shouldCallSdkDeliveryWhenFilterAllows` | filter returns true | `sdkDeliveryService.deliverMessage()` called exactly once |
