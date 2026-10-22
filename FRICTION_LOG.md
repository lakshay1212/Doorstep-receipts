# Friction log

Keep this running while you build. Specific entries (what you tried, what happened, what you
expected, how you got past it) are worth far more than general impressions.

## Observed while reading the Ring docs (2026-10-16): confirm each against your own experience

| Area | What I saw | Suggestion |
| --- | --- | --- |
| Tooling | The API docs state there is no official Ring Partner SDK, and I found no official local simulator. | Publish a sandbox that can inject events and replay deliveries. |
| Event list | The notifications page lists `device_online` and `device_offline`. Some other pages list only motion and button events plus device added/removed. | Keep one canonical event table and link to it everywhere. |
| Payload shape | The motion page shows `subType` inside `data`. A third-party emulator documents `sub_type`. | State the exact field name and casing in a schema, and publish JSON Schema. |
| Presence | There is no "visitor left" or dwell-time event. | A departure or end-of-motion event would unlock time-on-site features. |
| Sharing | No built-in way to grant a time-boxed, scoped view of events to a third party. | Scoped, expiring access would fit service and rental use cases. |

## Your entries

| Date | What I tried | What happened | What I expected | Workaround or fix |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
