---
"@infrascan/aws-eventbridge-scanner": minor
"@infrascan/aws": minor
---

Add an EventBridge scanner. It graphs event buses, rules and API destinations, with edges from each bus to its rules, from each rule to its targets and target dead-letter queues, and from each bus to its dead-letter queue. The scanner is registered in `@infrascan/aws`.
