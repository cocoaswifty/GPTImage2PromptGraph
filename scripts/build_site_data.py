#!/usr/bin/env python3
"""Build browser-ready static data for the GitHub Pages prompt browser."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "cases.jsonl"
DEFAULT_OUTPUT = ROOT / "data" / "cases.json"


def normalize_image_path(path: str) -> str:
    if path.startswith("prompt-graph/"):
        return path[len("prompt-graph/") :]
    if path.startswith("./"):
        return path[2:]
    return path


def load_cases(source: Path) -> list[dict]:
    cases: list[dict] = []
    with source.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            case = json.loads(line)
            images = [normalize_image_path(str(image)) for image in case.get("images", [])]
            cases.append(
                {
                    "id": case.get("id"),
                    "title": case.get("title", ""),
                    "category": case.get("category", ""),
                    "origin_collection": case.get("origin_collection", ""),
                    "author": case.get("author", ""),
                    "tags": case.get("tags", []),
                    "source_url": case.get("source_url", ""),
                    "images": images,
                    "description": case.get("description", ""),
                    "prompt": case.get("prompt", ""),
                    "prompt_chars": len(case.get("prompt", "")),
                }
            )
    return cases


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the static site data file.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    cases = load_cases(args.source)
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "count": len(cases),
        "cases": cases,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
