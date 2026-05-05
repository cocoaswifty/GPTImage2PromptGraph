# GPT-Image-2 Prompt Graph Skill

這個目錄是給 LLM / Agent 直接檢索用的整合版 prompt corpus，也是一個可安裝的 Codex Skill。使用者需要設計、繪圖、生成圖片、UI mockup、海報、商品圖、資訊圖、角色設定或品牌視覺時，Skill 會用漸進式披露方式從本圖譜找到合適 prompt 作為設計參考。

不要把整包資料一次丟給 LLM。正確方式是先讀報告與索引，再查少量候選案例，最後只讀選中的完整 prompt。

## 檔案

- `SKILL.md`: Skill 入口與工作流。
- `agents/openai.yaml`: Codex Skill metadata。
- `index.html`: GitHub Pages 瀏覽入口。
- `styles.css`: 靜態頁樣式。
- `app.js`: 瀏覽與搜尋互動邏輯。
- `scripts/query_prompt_graph.py`: 查詢 prompt graph 的輕量腳本。
- `scripts/query_prompt_graph.sh`: bash wrapper，方便沒有 `uv` 的環境直接呼叫。
- `scripts/build_site_data.py`: 由 `cases.jsonl` 產生瀏覽頁可用的靜態資料。
- `references/prompt-graph-schema.md`: graph/case 欄位說明。
- `data/cases.json`: 瀏覽頁載入的 prompt 資料。
- `GRAPH_REPORT.md`: 快速總覽、來源統計、熱門分類與標籤。
- `graph.json`: graphify / NetworkX 風格圖譜，包含 `nodes` 與 `links`。
- `cases.jsonl`: 每行一個完整 prompt case，最適合直接檢索、RAG、向量化。
- `index.json`: `tag`、`category`、`source`、`origin_collection` 到 case id 的倒排索引。
- `assets/images/`: 本地化圖片資產。

## 安裝 Skill

把這個 `prompt-graph/` 目錄複製或連結到 Codex skills 目錄，並命名為 `design-prompt-graph`。

### 方式一：複製安裝

```bash
mkdir -p ~/.codex/skills
cp -R prompt-graph ~/.codex/skills/design-prompt-graph
```

### 方式二：用 symlink 安裝

適合你會持續更新 GitHub repo 的情況。

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/prompt-graph ~/.codex/skills/design-prompt-graph
```

安裝後重新開啟 Codex，Skill 名稱是：

```text
$design-prompt-graph
```

用法範例：

```text
Use $design-prompt-graph to find reference prompts for a luxury skincare product ad.
```

```text
Use $design-prompt-graph to design a Chinese RAG explainer infographic.
```

## 手動查詢

不透過 Skill 也可以直接查：

```bash
bash scripts/query_prompt_graph.sh \
  --query "luxury perfume ecommerce product ad black gold marble" \
  --tags ecommerce poster photography brand \
  --limit 5
```

需要完整 prompt 時加上 `--full`，但 limit 要小：

```bash
bash scripts/query_prompt_graph.sh \
  --query "technical RAG explainer infographic Chinese labels" \
  --tags infographic typography ui \
  --limit 3 \
  --full
```

## 建議檢索流程

1. 先讀 `GRAPH_REPORT.md` 理解整體分佈。
2. 用 `scripts/query_prompt_graph.sh` 或 `index.json` 依 `tag`、`category` 或 `source` 找候選 case id。
3. 從 `cases.jsonl` 取回完整 case。每筆都有 `retrieval_text`，可直接餵給 LLM。
4. 需要追溯原始批次時看 `origin_collection`，不要尋找已刪除的原始資料夾。
5. 需要跨來源比較時讀 `graph.json`，走 `similar_title`、`has_tag`、`contains_case` 關係。

## Web Browser

1. 直接開 `index.html` 可瀏覽 prompt 與圖片預覽。
2. 更新 `cases.jsonl` 後先跑 `python scripts/build_site_data.py`，把資料同步到 `data/cases.json`。
3. GitHub Actions 會在推送到 `main` 後自動部署 GitHub Pages。

## Case Schema

`cases.jsonl` 每行包含：

- `id`: 圖譜節點 id。
- `title`: 案例標題。
- `category`: 來源內分類。
- `source`: 固定為 `gpt-image-2-unified`。
- `source_repo`: 固定為 `prompt-graph`。
- `source_file` / `source_line`: 指向整合後的 `prompt-graph/cases.jsonl`。
- `origin_collection`: 描述型來源批次，例如 `evolink-curated`、`youmind-openlab`、`prompt-as-code-cn`、`api-reference-prompts`。
- `origin_repo`: 描述型來源代號，與 `origin_collection` 對齊。
- `origin_file` / `origin_line`: 原始批次內的相對位置，僅作溯源，不依賴已刪除資料夾。
- `author`: 原始作者或來源名稱。
- `source_url`: 原始貼文或頁面 URL。
- `images`: 本地或遠端圖片路徑。
- `tags`: 規則萃取標籤。
- `description`: 描述文字，如果來源有提供。
- `prompt`: 完整 prompt。
- `retrieval_text`: 給 LLM/RAG 的合併文字。

## Graph Schema

`graph.json` 的主要 node types：

- `corpus`
- `origin_collection`
- `category`
- `case`
- `author`
- `image`
- `tag`

主要 edge relations：

- `has_origin_collection`
- `has_category`
- `contains_case`
- `originated_from`
- `credited_to`
- `has_image`
- `has_tag`
- `similar_title`
