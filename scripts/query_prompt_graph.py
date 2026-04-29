#!/usr/bin/env python3
"""Query the local GPT-Image-2 prompt graph without loading the whole corpus into context."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DEFAULT_GRAPH_ROOT = SKILL_ROOT
IGNORED_IMAGE_REFS = ('img.shields.io', 'awesome.re/badge', 'api.star-history.com', 'github.com/', 'github.com/sponsors')


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_一-鿿]{2,}", text.lower()))


def find_graph_root(explicit: str | None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if (root / 'cases.jsonl').exists():
            return root
    if (DEFAULT_GRAPH_ROOT / 'cases.jsonl').exists():
        return DEFAULT_GRAPH_ROOT
    cwd = Path.cwd().resolve()
    for parent in [cwd, *cwd.parents]:
        if (parent / 'cases.jsonl').exists() and (parent / 'index.json').exists():
            return parent
        candidate = parent / 'prompt-graph'
        if (candidate / 'cases.jsonl').exists():
            return candidate
    raise SystemExit('prompt-graph not found; pass --graph-root')


def iter_cases(graph_root: Path):
    with (graph_root / 'cases.jsonl').open(encoding='utf-8') as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def score_case(case: dict, query_terms: set[str], tags: set[str], category_terms: set[str], origin: set[str]) -> float:
    text = ' '.join(str(case.get(k, '')) for k in ['title', 'category', 'description', 'prompt']).lower()
    terms = tokenize(text)
    score = 0.0
    score += 2.0 * len(query_terms & terms)
    case_tags = set(case.get('tags', []))
    score += 8.0 * len(tags & case_tags)
    category = str(case.get('category', '')).lower()
    score += 5.0 * sum(1 for term in category_terms if term in category)
    if origin and str(case.get('origin_collection', '')).lower() in origin:
        score += 4.0
    if case.get('images'):
        score += 0.5
    if case.get('description'):
        score += 0.25
    return score


def usable_images(case: dict) -> list[str]:
    return [img for img in case.get('images', []) if not any(ref in img for ref in IGNORED_IMAGE_REFS)]


def summarize(case: dict, full: bool) -> dict:
    prompt = case.get('prompt', '')
    result = {
        'id': case.get('id'),
        'title': case.get('title'),
        'category': case.get('category'),
        'tags': case.get('tags', []),
        'origin_collection': case.get('origin_collection'),
        'images': usable_images(case)[:3],
        'source_url': case.get('source_url', ''),
        'prompt_chars': len(prompt),
    }
    if case.get('description'):
        result['description'] = case['description']
    if full:
        result['prompt'] = prompt
    else:
        result['prompt_excerpt'] = prompt[:700]
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description='Query prompt-graph cases')
    parser.add_argument('--graph-root')
    parser.add_argument('--query', required=True)
    parser.add_argument('--tags', nargs='*', default=[])
    parser.add_argument('--category', nargs='*', default=[])
    parser.add_argument('--origin', nargs='*', default=[])
    parser.add_argument('--limit', type=int, default=6)
    parser.add_argument('--full', action='store_true')
    args = parser.parse_args()

    graph_root = find_graph_root(args.graph_root)
    query_terms = tokenize(args.query)
    tags = {t.lower() for t in args.tags}
    category_terms = {c.lower() for c in args.category}
    origin = {o.lower() for o in args.origin}

    scored = []
    for case in iter_cases(graph_root):
        score = score_case(case, query_terms, tags, category_terms, origin)
        if score > 0:
            scored.append((score, case))
    scored.sort(key=lambda item: item[0], reverse=True)

    output = {
        'graph_root': str(graph_root),
        'query': args.query,
        'count': min(args.limit, len(scored)),
        'results': [],
    }
    for score, case in scored[: args.limit]:
        item = summarize(case, args.full)
        item['score'] = round(score, 2)
        output['results'].append(item)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
