#!/usr/bin/env python3
"""Query the local GPT-Image-2 prompt graph without loading the whole corpus into context."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DEFAULT_GRAPH_ROOT = SKILL_ROOT
IGNORED_IMAGE_REFS = ('img.shields.io', 'awesome.re/badge', 'api.star-history.com', 'github.com/', 'github.com/sponsors')
FIELD_WEIGHTS = {
    'title': 6.0,
    'tags': 5.5,
    'category': 4.5,
    'description': 2.5,
    'prompt': 2.0,
    'retrieval_text': 2.0,
}
PHRASE_WEIGHTS = {
    'title': 8.0,
    'tags': 6.0,
    'category': 5.0,
    'description': 4.0,
    'prompt': 3.0,
    'retrieval_text': 3.0,
}


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_一-鿿]{2,}", text.lower()))


def token_counts(text: str) -> Counter[str]:
    return Counter(re.findall(r"[a-zA-Z0-9_一-鿿]{2,}", text.lower()))


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


def load_index(graph_root: Path) -> dict:
    index_path = graph_root / 'index.json'
    if not index_path.exists():
        return {}
    return json.loads(index_path.read_text(encoding='utf-8'))


def normalize_index_key(key: str) -> str:
    return key.replace('-', ' ').replace('_', ' ').lower()


def collect_index_candidates(index_data: dict, query_terms: set[str], tags: set[str], category_terms: set[str], origin: set[str]) -> set[str]:
    candidate_ids: set[str] = set()
    buckets = (
        ('by_tag', tags | query_terms),
        ('by_category', category_terms | query_terms),
        ('by_origin_collection', origin),
    )
    for bucket_name, needles in buckets:
        bucket = index_data.get(bucket_name, {})
        for key, values in bucket.items():
            normalized = normalize_index_key(str(key))
            key_terms = tokenize(normalized)
            if needles & key_terms or any(term in normalized for term in needles):
                candidate_ids.update(values)
    return candidate_ids


def phrase_in_text(phrase: str, text: str) -> bool:
    return phrase and phrase in text.lower()


def score_text_field(field_text: str, query_terms: set[str], phrase: str, weight: float, phrase_weight: float) -> float:
    if not field_text:
        return 0.0
    counts = token_counts(field_text)
    tokens = set(counts)
    overlap = query_terms & tokens
    if not overlap and not phrase_in_text(phrase, field_text):
        return 0.0
    score = 0.0
    for term in overlap:
        tf = counts[term]
        score += 1.0 + min(tf, 3) * 0.65
    if phrase_in_text(phrase, field_text):
        score += phrase_weight
    if query_terms:
        coverage = len(overlap) / len(query_terms)
        score += coverage * 2.5
    return score * weight


def score_case(case: dict, query_terms: set[str], raw_query: str, tags: set[str], category_terms: set[str], origin: set[str]) -> float:
    field_texts = {
        'title': str(case.get('title', '')),
        'tags': ' '.join(case.get('tags', [])),
        'category': str(case.get('category', '')),
        'description': str(case.get('description', '')),
        'prompt': str(case.get('prompt', '')),
        'retrieval_text': str(case.get('retrieval_text', '')),
    }
    score = 0.0
    for field_name, field_text in field_texts.items():
        score += score_text_field(
            field_text=field_text,
            query_terms=query_terms,
            phrase=raw_query,
            weight=FIELD_WEIGHTS[field_name],
            phrase_weight=PHRASE_WEIGHTS[field_name],
        )

    case_tags = {str(tag).lower() for tag in case.get('tags', [])}
    score += 6.0 * len(tags & case_tags)

    category = str(case.get('category', '')).lower()
    score += 4.0 * sum(1 for term in category_terms if term in category)

    origin_collection = str(case.get('origin_collection', '')).lower()
    if origin and origin_collection in origin:
        score += 5.0

    if case.get('images'):
        score += 0.4
    if case.get('description'):
        score += 0.2
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


def load_cases(graph_root: Path, candidate_ids: set[str] | None = None) -> list[dict]:
    cases = []
    for case in iter_cases(graph_root):
        if candidate_ids is None or case.get('id') in candidate_ids:
            cases.append(case)
    return cases


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
    index_data = load_index(graph_root)
    query_terms = tokenize(args.query)
    tags = {t.lower() for t in args.tags}
    category_terms = {c.lower() for c in args.category}
    origin = {o.lower() for o in args.origin}

    candidate_ids = collect_index_candidates(index_data, query_terms, tags, category_terms, origin)
    if candidate_ids:
        cases = load_cases(graph_root, candidate_ids)
    else:
        cases = load_cases(graph_root)

    scored = []
    for case in cases:
        score = score_case(case, query_terms, args.query.lower(), tags, category_terms, origin)
        if score > 0:
            scored.append((score, case))
    scored.sort(key=lambda item: item[0], reverse=True)

    output = {
        'graph_root': str(graph_root),
        'query': args.query,
        'count': min(args.limit, len(scored)),
        'candidate_pool': len(cases),
        'results': [],
    }
    for score, case in scored[: args.limit]:
        item = summarize(case, args.full)
        item['score'] = round(score, 2)
        output['results'].append(item)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
