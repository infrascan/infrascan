---
"@infrascan/sdk": minor
---

In cases where the AWS Config ini file didn't define a default region, scans would exit early. This was due to the IAM client not supplying a region in its constructor, which introduced a hard dependency on the config file to provide a default. The same dependency existed when creating credential providers. 

This PR patches the IAM client creation in the SDK, and updates its API to accept a credential provider factory which prevents the SDK from failing in inadequately configured environments.
