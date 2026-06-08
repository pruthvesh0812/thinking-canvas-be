---
feature: "sdk-delivery-filter"
type: task
task_id: task-01
story: ../story.md
created: 2026-05-06
status: implemented
---

## Scope
Data layer — create the `SdkDeliveryFilter` JPA entity, its Spring Data repository, and the Liquibase changeset that provisions the `sdk_delivery_filter` table.

## Files to Touch
```
NEW:
  src/main/java/com/turtlemint/helpcenter/integration/model/entity/SdkDeliveryFilter.java
  src/main/java/com/turtlemint/helpcenter/integration/respository/SdkDeliveryFilterRepository.java

MODIFIED:
  src/main/resources/db/changelog/db.changelog-master.xml
    → Add changeset id="06052026-1" author="snarkar"
```

## Entity Design
```java
// SdkDeliveryFilter.java
@Data
@Entity
@Table(name = "sdk_delivery_filter")
public class SdkDeliveryFilter implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "thread_classification")
    private String threadClassification;    // null = wildcard (matches any)

    @Column(name = "message_type")
    private String messageType;             // null = wildcard (matches any)

    @Column(name = "inbound_channel")
    private String inboundChannel;          // null = wildcard (matches any)

    @Column(name = "sdk_delivery_enabled", nullable = false)
    private boolean sdkDeliveryEnabled;
}
```

## Repository Design
```java
// SdkDeliveryFilterRepository.java
public interface SdkDeliveryFilterRepository extends JpaRepository<SdkDeliveryFilter, Long> {

    @Query("""
        SELECT f FROM SdkDeliveryFilter f
        WHERE (f.threadClassification IS NULL OR f.threadClassification = :threadClassification)
          AND (f.messageType IS NULL OR f.messageType = :messageType)
          AND (f.inboundChannel IS NULL OR f.inboundChannel = :inboundChannel)
        """)
    List<SdkDeliveryFilter> findMatchingFilters(
        @Param("threadClassification") String threadClassification,
        @Param("messageType") String messageType,
        @Param("inboundChannel") String inboundChannel
    );
}
```

## Liquibase Changeset
```xml
<changeSet id="06052026-1" author="snarkar">
    <createTable tableName="sdk_delivery_filter">
        <column name="id" type="BIGSERIAL" autoIncrement="true">
            <constraints primaryKey="true" nullable="false"/>
        </column>
        <column name="thread_classification" type="VARCHAR(255)"/>
        <column name="message_type" type="VARCHAR(255)"/>
        <column name="inbound_channel" type="VARCHAR(255)"/>
        <column name="sdk_delivery_enabled" type="BOOLEAN" defaultValueBoolean="true">
            <constraints nullable="false"/>
        </column>
    </createTable>
</changeSet>
```

## Depends On
None — this is the first task.

## Definition of Done
- [ ] `SdkDeliveryFilter` entity compiles with no errors
- [ ] `SdkDeliveryFilterRepository.findMatchingFilters()` is declared and compiles
- [ ] Liquibase changeset `06052026-1` is present and valid XML in `db.changelog-master.xml`
- [ ] `./mvnw compile` passes with no errors

## Test Plan
No unit tests in this task — the repository query is tested in task-02 via the service layer.
(Integration tests for the JPA query belong in task-02's `SdkDeliveryFilterServiceImplTest`.)
