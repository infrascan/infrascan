#!/bin/sh

curl -X POST http://localhost:7700/indexes/graph/documents?primaryKey=id -H 'Authorization: Bearer test' -H 'Content-Type: application/json' --data-binary @static/graph.json