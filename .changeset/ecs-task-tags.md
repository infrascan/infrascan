---
"@infrascan/aws-ecs-scanner": minor
---

Task tags are only reported in the top-level `tags` component: `ecs.task.tags` (a copy of the same tags) is removed, along with `tags` on the exported `ECSTask` type.
