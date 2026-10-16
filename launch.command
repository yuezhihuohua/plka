#!/bin/zsh
cd -- "${0:A:h}" || exit 1
task_node_bin="$(command -v node)"
if [[ -z "$task_node_bin" && -x /usr/local/bin/node ]]; then task_node_bin=/usr/local/bin/node; fi
if [[ -z "$task_node_bin" && -x /opt/homebrew/bin/node ]]; then task_node_bin=/opt/homebrew/bin/node; fi
if [[ -z "$task_node_bin" ]]; then
  print '需要先安装 Node.js 22.12 或更新版本。按回车关闭。'
  read
  exit 1
fi
"$task_node_bin" --experimental-sqlite launcher.mjs
if [[ $? -ne 0 ]]; then print '启动失败。按回车关闭。'; read; fi
