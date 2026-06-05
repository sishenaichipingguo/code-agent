# Code Agent — 記憶するターミナルコーディングエージェント

<p align="right">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>日本語</b> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/sishenaichipingguo/code-agent/stargazers"><img src="https://img.shields.io/github/stars/sishenaichipingguo/code-agent?style=flat&logo=github" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-000000?logo=bun" alt="Runtime: Bun" /></a>
  <img src="https://img.shields.io/badge/memory-persistent-8a2be2" alt="永続的な記憶" />
</p>

**ほとんどのコーディングエージェントは、閉じた瞬間にすべてを忘れます。Code Agent は違います。** セッションをまたいで永続的で検索可能な記憶を構築します。あなたの好み、プロジェクトの規約、過去の決定がエージェントに残るので、毎回説明し直す必要がありません。

<!--
  これは scripts/make-demo-gif.py で生成したシミュレーションデモです。
  実際の画面録画ができたら assets/demo.gif を差し替えてください。
-->
<p align="center">
  <img src="assets/demo.gif" alt="Code Agent デモ — セッションをまたいで好みを記憶" width="90%" />
</p>

```bash
# インストール（macOS / Linux）— ビルド済みバイナリをダウンロード、Node/Bun 不要
curl -fsSL https://raw.githubusercontent.com/sishenaichipingguo/code-agent/main/install.sh | bash

export ANTHROPIC_API_KEY=sk-...
agent "インデントは2スペース、名前付きエクスポートを好むと覚えておいて"
```

## なぜ Code Agent なのか？

他のターミナルエージェントは実行のたびにゼロから始まります。スタック、コーディングスタイル、プロジェクト規約を毎回説明し直すことになります。Code Agent は記憶を第一級の機能として扱います。

- 🧠 **セッションをまたぐ永続的な記憶** — 事実はプレーンな Markdown として `.claude/memory/` に保存され、`user`・`project`・`feedback`・`reference` の4種類に整理されます。人間が読めて、バージョン管理でき、あなたのものです。
- ✨ **自動抽出** — 会話のあと、LLM パスが残す価値のある事実（「pnpm を使う」「API は `src/api`」「デフォルトエクスポートが嫌い」）を抽出するので、記憶を手動で管理する必要はありません。
- 🔎 **ローカルな意味検索** — オプションの Worker サービスがローカルの `all-MiniLM-L6-v2` モデル（384次元、データは端末外に出ません）で履歴を埋め込み、SQLite + ChromaDB に保存して過去の作業を類似度検索します。
- 👥 **チーム記憶** — 整理された記憶セットをチームで共有し、規約を各人が学び直すのではなく全員で一貫させます。
- 🔒 **プライバシー優先** — 埋め込みはローカルで実行され、記憶はリポジトリ内のファイルにすぎません。あなたが設定したモデルプロバイダ以外には何も送信されません。

> 結果として、3回目のセッションには、エージェントはあなたのプロジェクトの動き方をすでに把握しています。

## 期待される機能はすべて

- 🛠️ **組み込みツール** — bash、read、write、edit、glob、grep、ls、cp、mv、rm
- 🤖 **マルチモデル** — Anthropic Claude をすぐに使え、Ollama 経由でローカルモデルにも対応
- 🔌 **MCP 対応** — Model Context Protocol サーバーを接続し、ツールとコンテキストを拡張
- 🎯 **YOLO と Safe モード** — 速度重視で確認を省略、または危険な操作には承認を要求
- 🌊 **ストリーミング応答** — token とコストをリアルタイム表示
- 🎨 **インタラクティブ UI**（Ink）— タブ補完とキーボードショートカット
- 📝 **セッション管理** — 永続的な履歴、`--continue` で続きから再開
- 🛑 **グレースフルシャットダウン**、YAML ベースの設定

## クイックスタート

### インストール（推奨）

インストーラーがプラットフォームに合ったスタンドアロンバイナリを取得します。Node も Bun も不要です。

```bash
curl -fsSL https://raw.githubusercontent.com/sishenaichipingguo/code-agent/main/install.sh | bash
```

[Releases ページ](https://github.com/sishenaichipingguo/code-agent/releases) からバイナリを直接ダウンロードすることもできます。Windows ユーザーはそこで `.zip` を入手してください。macOS バイナリは ad-hoc 署名済みです。Gatekeeper がまだブロックする場合は `xattr -d com.apple.quarantine $(which agent)` を実行してください。

あとはキーを設定するだけ。

```bash
export ANTHROPIC_API_KEY=your_key_here

agent "hello.txt ファイルを作成して"          # デフォルトは YOLO モード
agent --mode safe "src/auth.ts をリファクタして"  # 危険な操作に承認を要求
```

### ソースからビルド

[Bun](https://bun.sh) が必要です。

```bash
git clone https://github.com/sishenaichipingguo/code-agent
cd code-agent
bun install
bun run dev "hello.txt ファイルを作成して"

# 自分でスタンドアロンバイナリをビルド
bun run build:binary
```

## 記憶の仕組み

記憶はプレーンなファイルとしてプロジェクト内に存在するため、透明でレビュー可能です。

```
.claude/memory/
├── MEMORY.md              # 人間が読めるインデックス、種類別に整理
├── user_indent-style.md   # 「2スペースインデント、名前付きエクスポートを好む」
├── project_api-layout.md  # 「REST ハンドラは src/api、ルートごとに1ファイル」
└── feedback_pr-style.md   # 「PR の説明は簡潔に、まず理由から」
```

各エントリは、シンプルな frontmatter（`name`、`description`、`type`、`created`、`updated`）付きの Markdown です。4つの種類：

| 種類 | 記録する内容 |
|------|--------------|
| `user` | あなた個人の好みと作業スタイル |
| `project` | このコードベースの規約と構造 |
| `feedback` | あなたがエージェントに与えた訂正 |
| `reference` | 残しておく価値のあるドキュメント、リンク、事実 |

### 自動 vs. 明示

- **明示**：そのまま伝えるだけ — *「Docker Compose でデプロイすると覚えて」* — 記憶エントリを書き込みます。
- **自動**：`AutoExtractor` が終了した会話を見直し、新しい長期的な事実を保存します。インデックスに既にあるものはスキップされます。

### オプション：意味記憶（Worker サービス）

より長い履歴の意味検索には、バックグラウンドの Worker を実行します。埋め込みをローカルで生成し、SQLite + ChromaDB に保存します。

```bash
# Worker を起動（初回はローカル埋め込みモデルをダウンロード）
export ANTHROPIC_API_KEY=your_key_here
bun run dev:worker

# ヘルスチェック
curl http://localhost:37777/health
```

Worker は**非侵入的**です。独立したプロセスで、CLI は HTTP 経由で通信し、完全にオプションです。完全なアーキテクチャとデータフローは [README-MEMORY-SYSTEM.md](./README-MEMORY-SYSTEM.md) を参照してください。

## 設定

プロジェクトに `.agent.yml` を作成します。

```yaml
provider: anthropic
model: claude-sonnet-4-6
mode: yolo

tools:
  bash:
    timeout: 30000
  rm:
    confirm: true

session:
  autoSave: true
  saveDir: .agent/sessions

logging:
  level: info
  file: .agent/logs/agent.log
```

### Ollama でローカルモデルを使う

```yaml
provider: ollama
baseUrl: http://localhost:11434
model: qwen2.5-coder:7b
mode: yolo
```

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

> **注意：** Ollama モデルはツール呼び出しに対応していないため、これらと併用する場合はチャット専用モードで動作します。

すべての設定項目は `.agent.yml.example` を参照してください。

## 使い方

```bash
agent "リクエスト内容"                  # CLI モード（シンプルな出力）
agent --ui "リクエスト内容"             # インタラクティブ UI（Ink）
agent --mode safe "リクエスト内容"      # 危険な操作に承認を要求
agent --model claude-opus-4 "..."      # モデルを指定
agent --continue "追加メッセージ"       # 前回のセッションを継続
```

### UI モード

- ファイル、ツール、コマンドの **タブ補完**
- **キーボードショートカット** — Ctrl+C で終了、矢印キーで履歴
- 応答の**リアルタイムストリーミング**
- token 使用量とパフォーマンスを表示する**ステータスバー**

## ビルド

```bash
bun run build           # JavaScript バンドル
bun run build:binary    # ネイティブバイナリ
```

## アーキテクチャ

- **CLI レイヤー** — 引数解析とモード判定
- **Agent コア** — ツール実行を伴うメインループ
- **記憶システム** — Markdown ストア、自動抽出、チーム記憶
- **Worker サービス** — オプションの意味記憶（SQLite + ChromaDB + ローカル埋め込み）
- **ツールシステム** — 拡張可能なツールレジストリ
- **モデルアダプター** — プロバイダ横断の統一インターフェース
- **インフラ** — ロギング、メトリクス、トレーシング

## ライセンス

MIT
