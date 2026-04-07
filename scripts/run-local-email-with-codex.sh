#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime"
INPUT_JSON="${RUNTIME_DIR}/fb-input.json"
DIGEST_MD="${RUNTIME_DIR}/fb-digest.md"
PROMPT_TXT="${RUNTIME_DIR}/fb-codex-prompt.txt"
CODEX_LOG="${RUNTIME_DIR}/codex-run.log"

mkdir -p "${RUNTIME_DIR}"

echo "[1/4] Preparing digest input..."
node "${SCRIPT_DIR}/prepare-digest.js" > "${INPUT_JSON}"

cat > "${PROMPT_TXT}" <<'EOF'
你是 Follow Builders 的日报编辑。

当前工作区里有一个文件 `.runtime/fb-input.json`。

你的任务：
1. 读取这个 JSON 文件
2. 只根据这个 JSON 里的内容生成一份最终日报
3. 输出中文 Markdown 正文

硬性要求：
- 除了 `.runtime/fb-input.json` 之外，不要检查其他项目文件，除非绝对必要
- 不要联网，不要补充 JSON 之外的事实
- 每条内容尽量保留原始链接
- 邮件要适合手机阅读，结构清晰
- 顶部先给出标题和“今日重点”
- 如果某一类没有内容，就省略该小节
- 不要输出 JSON
- 不要解释过程
- 只输出最终日报正文
EOF

echo "[2/4] Asking Codex to remix the digest..."
cat "${PROMPT_TXT}" | codex exec \
  -C "${ROOT_DIR}" \
  -s read-only \
  --output-last-message "${DIGEST_MD}" \
  - >> "${CODEX_LOG}" 2>&1

if [[ "${FB_SKIP_DELIVERY:-0}" == "1" ]]; then
  echo "[3/4] Delivery skipped because FB_SKIP_DELIVERY=1"
  echo "[4/4] Digest written to ${DIGEST_MD}"
  exit 0
fi

echo "[3/4] Sending email via deliver.js..."
node "${SCRIPT_DIR}/deliver.js" --file "${DIGEST_MD}"

echo "[4/4] Done. Digest sent and saved to ${DIGEST_MD}"
