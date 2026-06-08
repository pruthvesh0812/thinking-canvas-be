## 2026-05-06 BaseDeliveryService — threadDto declaration moved before gate

**Decision:** Moved `ThreadDto threadDto = msDomainObject.getThread()` to before the SDK filter gate, removing the duplicate declaration that previously appeared after the SDK delivery call.
**Reason:** The gate code needs `threadDto.getThreadClassification()` to build the filter key. The plan showed the gate referencing `threadDto` but the variable was only declared below — it had to be hoisted.
**Alternative considered:** Inlining `msDomainObject.getThread().getThreadClassification()` directly in the gate, but moving the declaration is cleaner since `threadDto` is used throughout the rest of the method anyway.

## 2026-05-06 BaseDeliveryServiceTest — @InjectMocks replaced with manual construction + ReflectionTestUtils

**Decision:** Replaced `@InjectMocks` with a `@BeforeEach` that calls `new BaseDeliveryService(userPageTracker)` and injects field mocks via `ReflectionTestUtils.setField()`.
**Reason:** `BaseDeliveryService` has a parameterised constructor (`UserPageTracker`). Mockito's `@InjectMocks` uses constructor injection when a matching constructor is found and then skips field injection entirely — leaving all `@Autowired` fields null.
**Alternative considered:** Adding a no-arg constructor or package-private setter to `BaseDeliveryService`, but that would pollute production code for test purposes only.
