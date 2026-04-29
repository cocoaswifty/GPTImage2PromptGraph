# Prompt Graph Schema

Use this only when field-level details are needed.

## Core files

- `GRAPH_REPORT.md`: overview, counts, common tags/categories.
- `index.json`: inverted indexes by tag, category, unified source, and origin collection.
- `cases.jsonl`: canonical retrieval records, one JSON object per line.
- `graph.json`: nodes and links for graph traversal.
- `assets/images/`: localized image assets copied from the original corpora.

## Case fields

- `id`: canonical case node id.
- `title`: human-readable case title.
- `category`: normalized category from the source corpus.
- `source`: always `gpt-image-2-unified`.
- `source_repo`: always `prompt-graph`.
- `source_file`: canonical file, usually `prompt-graph/cases.jsonl`.
- `source_line`: canonical JSONL line number.
- `origin_collection`: descriptive source batch, such as `evolink-curated`, `youmind-openlab`, `prompt-as-code-cn`, or `api-reference-prompts`.
- `origin_repo`: same descriptive source identifier as `origin_collection`.
- `origin_file` and `origin_line`: relative provenance inside the original batch.
- `author`, `source_url`, `published`, `languages`: attribution metadata when available.
- `images`: local `prompt-graph/assets/images/...` paths or remote image URLs.
- `tags`: rule-derived retrieval tags.
- `description`: description from source when available.
- `prompt`: full prompt.
- `retrieval_text`: merged text for embedding or direct LLM context.

## Graph relations

- `has_origin_collection`: corpus -> origin collection.
- `has_category`: corpus -> category.
- `contains_case`: category -> case.
- `originated_from`: origin collection -> case.
- `credited_to`: case -> author.
- `has_tag`: case -> tag.
- `has_image`: case -> image.
- `similar_title`: case -> case.
