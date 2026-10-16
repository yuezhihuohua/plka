#!/bin/zsh
cd -- "${0:A:h}" || exit 1
task_node_bin="$(command -v node)"
if [[ -z "$task_node_bin" && -x /usr/local/bin/node ]]; then task_node_bin=/usr/local/bin/node; fi
if [[ -z "$task_node_bin" && -x /opt/homebrew/bin/node ]]; then task_node_bin=/opt/homebrew/bin/node; fi
if [[ -z "$task_node_bin" ]]; then print '需要先安装 Node.js 22.12 或更新版本。'; read; exit 1; fi
"$task_node_bin" tools/install-skill.mjs
if [[ $? -eq 0 ]]; then
  print '\n安装完成后，在 Codex 输入 $reference-library，或说“用灵感库分析某个收藏夹”。如果没有出现，重启 Codex。'
fi
print '按回车关闭。'
read
