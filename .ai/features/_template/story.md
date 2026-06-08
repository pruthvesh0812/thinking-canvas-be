---
feature: "<feature-name>"
type: story
created: YYYY-MM-DD
status: draft
jira_ticket: "[PLACEHOLDER — add ticket ID when Jira integration is available]"
git_branch: "[PLACEHOLDER — e.g. feature/HC-XXX-short-description]"
pr_url: "[PLACEHOLDER]"
---

## What
[One sentence: what this feature delivers]

## Why
[Business reason or context]

## Blast Radius
[All components, services, tables, queues affected]

## Files to Touch
[Specific file list — be exact]

## Liquibase Impact
Yes / No. If yes:
- Table: [table_name]
- Change: [column/index/constraint]
- Next changeset ID: [DDMMYY-N]

## New RabbitMQ Queues
Yes / No. If yes: [queue name, exchange binding]

## Risks
[Non-obvious risks or side effects]

## Open Questions
[Decisions the engineer must make before implementation can start]

## Test Plan
[What unit tests are required — list by class]

## Known Issues (from learnings.json)
[Any entries from learnings.json relevant to affected area — quote id + title]

## Task Breakdown
NONE — implement directly from this story.
