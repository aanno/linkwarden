#!/bin/bash -x
set -euo pipefail

# CONFIG_FILE="config.json"
CONFIG_FILE="${1:-config.json}"
SCOPE="project"

jq -r '
  .mcpServers
  | to_entries[]
  | .key + "\u0001" + (.value | @json)
' "$CONFIG_FILE" | while IFS=$'\x01' read -r name json; do
  claude mcp remove --scope "$SCOPE" "$name" || true
  claude mcp add-json --scope "$SCOPE" "$name" "$json"
done
