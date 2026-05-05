#!/usr/bin/env bash
set -euo pipefail

exec python scripts/query_prompt_graph.py "$@"
