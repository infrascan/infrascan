#!/bin/sh

curl http://localhost:7700/indexes/graph/settings/filterable-attributes -H 'Authorization: Bearer test' -H 'Content-Type: application/json' -X PUT -d '["group"]'