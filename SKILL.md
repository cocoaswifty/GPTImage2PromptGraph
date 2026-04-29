---
name: design-prompt-graph
description: Use when Codex needs to design, draw, generate images, create visual concepts, UI mockups, posters, product shots, infographics, character sheets, brand visuals, or any visual asset and should first retrieve suitable reference prompts from the bundled GPT-Image-2 prompt graph. This skill progressively discloses local prompt-graph context before synthesizing a design prompt or visual direction, and can be used alongside image generation skills.
---

# Design Prompt Graph

Use the local GPT-Image-2 prompt graph as a reference system for visual design and drawing tasks. The goal is not to copy a prompt blindly; the goal is to retrieve close patterns, extract reusable structure, and synthesize a better prompt or design direction for the user's task.

## Graph Location

The graph root is this skill folder. It must contain `cases.jsonl`, `index.json`, `graph.json`, and `GRAPH_REPORT.md`.

If the skill folder data is missing, search upward from the current workspace for a `prompt-graph/` directory containing `cases.jsonl`, `index.json`, and `GRAPH_REPORT.md`. If no graph exists, state that the reference graph is unavailable and continue without this skill.

## Progressive Disclosure Workflow

1. Read only `GRAPH_REPORT.md` first to understand available categories, tags, and corpus counts.
2. Classify the user's visual request into retrieval hints:
   - Use case: portrait, product/e-commerce, poster, infographic, UI, character, brand/logo, storyboard, architecture/interior, food, fashion, game, template.
   - Style cues: photography, illustration, anime, 3D render, retro, cyberpunk, minimalism, Chinese ink, typography-heavy, etc.
   - Output constraints: aspect ratio, exact text, language, number of panels, image/reference preservation.
3. Query candidates with `scripts/query_prompt_graph.py`, resolving the script path relative to this skill folder, not relative to the user's current project. Start with broad tags and the raw user request. Do not load all cases into context.
4. Inspect the top 3-8 candidate summaries. If needed, rerun the query with narrower tags/category or `--full` for a small limit.
5. Read complete case records only for the selected candidates, either from script `--full` output or from `cases.jsonl` by id.
6. Synthesize the final design prompt or design guidance using patterns from the retrieved cases. Preserve the user's actual goal over the reference prompt's subject.
7. Cite the reference case ids/titles and any useful local image paths when giving the user a prompt or using another image generation skill.

## Query Examples

```bash
python scripts/query_prompt_graph.py \
  --query "luxury perfume ecommerce product ad black gold marble" \
  --tags ecommerce product poster photography brand \
  --limit 6
```

```bash
python scripts/query_prompt_graph.py \
  --query "technical RAG explainer infographic Chinese labels" \
  --tags infographic typography ui \
  --limit 5 --full
```

## Selection Rules

- Prefer cases with matching structure over matching surface style. A 9-panel storyboard reference is more valuable for a 9-panel task than a visually similar single poster.
- Prefer local image references in `prompt-graph/assets/images/` when the user asks for visual examples or style grounding.
- Do not include reference-only brand names, people, slogans, or copyrighted subjects unless the user requested them.
- For image generation, pass the synthesized prompt to the appropriate image generation/editing workflow after this reference step.
- If retrieved examples contain exact in-image text, replace it with the user's text and explicitly require clean typography.
- If the user provides a rough idea, use references to add structure: subject, layout, camera/composition, materials, lighting, typography, constraints, negative requirements.
- If the user already provides a detailed prompt, use references only to tighten omissions and avoid overwriting intent.

## Output Pattern

When answering a design request after retrieval, include:

- Selected references: 2-5 case ids/titles with one-line reason each.
- Synthesized prompt: a clean prompt ready for image generation or design execution.
- Notes: constraints, aspect ratio, text handling, or risks if relevant.

Keep the reference list short. The user needs useful direction, not a literature review.
