# GPT-Image-2 Prompt Graph

這份圖譜把多個 GPT-Image-2 prompt corpus 整合成單一 canonical corpus，並包裝成可安裝的 Codex Skill。所有 case 的 `source` 都指向 `gpt-image-2-unified`；`origin_collection` 只保留描述型來源批次名稱，不依賴任何已刪除的原始資料夾。

## Files

- `SKILL.md`: Skill 入口與漸進式披露工作流。
- `agents/openai.yaml`: Codex UI metadata。
- `index.html`: GitHub Pages 瀏覽入口。
- `styles.css`: 靜態頁樣式。
- `app.js`: 瀏覽與搜尋互動邏輯。
- `scripts/query_prompt_graph.sh`: bash wrapper，避免對使用者要求 `uv`。
- `scripts/query_prompt_graph.py`: 查詢器核心，避免一次載入全部 prompt。
- `scripts/build_site_data.py`: 由 `cases.jsonl` 產生瀏覽頁可用的靜態資料。
- `references/prompt-graph-schema.md`: 欄位與 graph relation 說明。
- `data/cases.json`: 瀏覽頁載入的 prompt 資料。
- `graph.json`: graphify/networkx 風格的 nodes + links 圖譜。
- `cases.jsonl`: 每行一個完整 prompt case，適合 RAG/grep/向量化。
- `index.json`: tag/category/source/origin_collection 到 case id 的倒排索引。
- `assets/images/`: 本地化圖片資產。

## Counts

- Cases: 848
- Nodes: 2159
- Links: 7383
- Local image refs: 667

## Source Breakdown

- gpt-image-2-unified: 848

## Origin Collection Breakdown

- api-reference-prompts: 52
- evolink-curated: 312
- prompt-as-code-cn: 358
- youmind-openlab: 126

## Top Categories

- Prompt-as-Code Gallery: 358
- Poster & Illustration Cases: 101
- UI & Social Media Mockup Cases: 56
- Portrait & Photography Cases: 55
- Comparison & Community Examples: 48
- E-commerce Cases: 20
- Profile / Avatar: 20
- YouTube Thumbnail: 20
- Ad Creative Cases: 19
- Social Media Post: 18
- Comic / Storyboard: 18
- Infographic / Edu Visual: 16
- Product Marketing: 15
- Character Design Cases: 13
- E-commerce Main Image: 13
- Portrait & Photography: 12
- Poster & Illustration: 8
- UI / UX & App Mockups: 8
- Game & Entertainment Screenshots: 7
- Featured Prompts: 6

## Top Tags

- parameterized: 549
- ui: 482
- typography: 456
- photography: 288
- poster: 277
- ecommerce: 257
- character: 240
- architecture: 202
- portrait: 201
- brand: 175
- infographic: 151
- fashion: 145
- aspect-ratio: 140
- storyboard: 138
- game: 91
- food: 56
- template: 19

## LLM Retrieval Pattern

1. 先讀本報告理解分類、標籤與資料規模。
2. 用 `scripts/query_prompt_graph.sh` 查少量候選 case。
3. 只對選中的 case 讀完整 prompt。
4. 將參考 prompt 的結構改寫成符合使用者任務的新設計 prompt。
