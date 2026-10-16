<p align="center"><img src="extension/brand.svg" width="84" alt="Plka 标志"></p>
<h1 align="center">Plka</h1>
<p align="center">把散落的参考图片，变成下一次设计的起点。</p>
<p align="center">网页收藏 · 本地图库 · 收藏夹管理 · 自己的 Codex</p>

Plka 是为设计师制作的独立本地参考图库。浏览 Pinterest、小红书、花瓣时发起收藏，选好收藏夹和标签，回到图库整理，再让自己的 Codex 逐张分析指定收藏夹，保存有图片依据的报告。

体验以 Eagle 为参照；程序、图库和接口独立实现，不依赖 Eagle。当前版本 **v0.3.2，开发试用阶段**。

![Plka 主界面](docs/assets/plka-library.png)

*界面截图使用人工合成测试图片，不包含个人收藏或真实设计案例。*

## 可以做什么

- **网页收藏**：图片悬停按钮、右键单图收藏、工具栏扫描当前页图片。收藏时选择或新建收藏夹。
- **随时打开图库**：网页右侧 Plka 悬浮入口，支持拖动、临时隐藏与复用已有图库标签页。
- **按原比例浏览**：瀑布流保留图片宽高比，可调整显示密度、搜索名称、标签和备注。
- **整理参考**：多收藏夹归属、来源链接、笔记、可多选的标签；相同文件按字节查重。
- **删除与回收站**：删除收藏夹时保留其他收藏夹共享的图片，独占图片进回收站；支持恢复和单张、多选、全部永久删除。
- **Codex 分析**：安装配套 Skill，逐张读取与分析，记录进度，将综合报告写回图库。
- **本地保存与备份**：SQLite 管理索引，图片独立存储，支持完整快照和升级前自动备份。

## 第一次使用

普通使用者优先从本仓库右侧 **Releases** 下载便携包，不要把 GitHub 的“Download ZIP”源码压缩包当作完整安装包。下载包需由维护者手动发布，未发布时请向维护者索取。

| 电脑 | 选择的文件 | 启动入口 | Skill 安装入口 |
| --- | --- | --- | --- |
| Mac，Apple 芯片（M 系列） | `Plka-Mac-arm64-v版本号.zip` | `1-Start.command` | `2-Install-Codex-Skill.command` |
| Mac，Intel 芯片 | `Plka-Mac-x64-v版本号.zip` | `1-Start.command` | `2-Install-Codex-Skill.command` |
| Windows，Intel / AMD 64 位 | `Plka-Windows-x64-v版本号.zip` | `1-Start.cmd` | `2-Install-Codex-Skill.cmd` |

便携包自带运行环境，无需额外安装 Node.js。

1. 完整解压到固定位置，双击对应启动入口。启动完成后可以关闭启动窗口，服务继续在后台运行。
2. Chrome 打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择包内 `extension` 文件夹。
3. 在 [本地图库](http://127.0.0.1:47831/) 的“连接与备份”复制连接码，在 Chrome 扩展中粘贴并连接。
4. 双击 Skill 安装入口，在本机 Codex 输入 `$reference-library`；未显示时重启 Codex。

详细操作：[Mac 使用说明](distribution/Mac-使用说明.md) · [Windows 使用说明](distribution/Windows-使用说明.md)。两个系统的便携包都附有可直接打开的离线 HTML 说明。

Mac 版尚未做 Plka 启动脚本的 Apple 开发者签名和公证，首次运行可能出现系统提示，处理方式见 Mac 说明。Windows 版可选择当前用户登录时自动启动；Mac 版当前需在重启电脑后手动启动，或由已绑定的 Skill 唤起服务。

## 日常怎么用

**收图：**在支持的网站将鼠标放到图片上，点击“＋ 收藏到 Plka”，选好收藏夹、笔记和标签再保存。也可右键图片收藏。全部成功时中央显示结果，约 1.8 秒后关闭采集窗口；部分失败时保留失败项供重试。

**打开图库：**点击网页右侧“Plka · 打开图库”，或扩展顶部“打开 Plka 图库”。服务未运行时会显示启动引导。其他普通网页可在扩展中选择“所有网页显示入口”，并按 Chrome 提示授予访问权限。

**分析收藏夹：**在自己的本机 Codex 中发送：

```text
$reference-library 分析“包装设计”收藏夹，逐张查看图片，比较构图、配色、字体和材质，归纳可借鉴的方向，并把报告保存回 Plka。
```

图库中的“用 Codex 分析”会准备并复制指令，粘贴到自己的 Codex 发送后执行。Skill 的调用名保留 `$reference-library`。不需要给图库填写模型 API Key，也无需手工配置 MCP；`mcp.mjs` 仍保留为可选接入方式。

收藏、浏览和备份使用本机服务。Codex 分析使用自己的账号、网络和额度，所选图片及备注会交给当前模型处理。无法访问这台电脑文件的云端环境不能直接使用此本地 Skill。

## 数据放在哪里，更新会丢吗

全新安装默认路径：

| 系统 | 图库目录 |
| --- | --- |
| Mac | `~/Library/Application Support/Plka/library` |
| Windows | `%LOCALAPPDATA%\Plka\library` |
| Linux 源码运行 | `$XDG_DATA_HOME/Plka/library` 或 `~/.local/share/Plka/library` |

实际路径以“连接与备份”显示为准。已有旧版可能继续使用原程序中的 `data`，程序不会自动搬移图片；**确认实际路径、创建备份后，才能决定是否删除旧程序目录**。

```text
图库目录/
├── library.sqlite       收藏夹、图片索引、标签、备注、来源、分析状态
├── assets/              按内容哈希命名的图片文件
├── reports/             完成的分析报告
├── backups/             完整备份和升级前快照
└── .connection-key      本机连接凭据，不要上传或分享
```

手动更新：**先备份 → 停止旧服务 → 更新程序 → 保留原图库 → 启动新版 → 重新加载原目录扩展 → 更新 Skill 绑定**。完整步骤见 [手动更新与发布](docs/MAINTENANCE.md)。

删除收藏夹只将无其他收藏夹归属的图片送入回收站；永久删除不会同步删除独立备份。完整备份包含连接凭据，恢复后通常可保留配对；早期不含凭据的备份需要重新配对。

## 从源码运行

需要 **Node.js 22.12 或更新的受支持版本**。当前开发和便携包以 Node 22 为验证基线；没有第三方 npm 运行依赖。

在项目目录执行：

```sh
npm start
```

浏览器打开 `http://127.0.0.1:47831/`。此方式在前台运行，关闭终端会停止服务。Mac 源码也可执行后台启动入口：

```sh
node tools/start-background.mjs
```

安装当前用户的配套 Skill：

```sh
node tools/install-skill.mjs
```

安装器会绑定当前程序位置、图库目录、端口和 Node 路径。移动程序或更换运行环境后，请从新位置重新安装 Skill。

停止已绑定图库的服务：

```sh
node tools/stop-service.mjs
```

可选环境变量：

| 变量 | 用途 |
| --- | --- |
| `REFERENCE_DATA_DIR` | 显式指定图库目录，优先于已保存的路径记录 |
| `REFERENCE_PORT` | 本地服务端口，默认 47831 |
| `PIKA_CONFIG_DIR` | 覆盖配置及启动日志目录，适合隔离测试；名称为兼容现有版本保留 |
| `CODEX_HOME` | 覆盖 Codex 目录，Skill 默认安装到其 `skills/reference-library` |

Chrome 扩展当前固定访问本机 47831 端口；更换服务端口时需同步修改扩展设置代码与权限范围，普通使用者建议保留默认值。

## 项目结构与维护

```text
extension/       Chrome Manifest V3 扩展、采集窗口、悬浮入口、品牌图形
public/          图库界面与人工测试页面
lib/             数据存储、路径绑定、升级备份
server.mjs       本地 HTTP 服务
launcher.mjs     前台启动器
skills/          可安装的 Codex Skill
tools/           Skill 安装、后台启动、打包与维护脚本
test/            数据、接口、权限、扩展行为、Skill、MCP 回归测试
distribution/    Mac / Windows 用户说明及离线 HTML
docs/            开发与手动发布说明、测试截图
.github/         自动检查、问题与变更模板
```

- [维护、构建、手动发版和回退](docs/MAINTENANCE.md)
- [产品目标与功能边界](PRODUCT.md)
- [当前验证范围](VALIDATION.md)
- [版本记录](CHANGELOG.md)
- [报告问题与提交修改](CONTRIBUTING.md)

运行自动检查：

```sh
npm run check
npm test
```

打包由维护者手动执行，便携包与校验值放到 GitHub Releases，源码仓库不提交 `release/`、图片库、数据库、运行环境、日志或本机配置。

## 当前边界

只采集页面已加载的图片，不承诺原始高清分辨率；受登录、页面结构、防盗链和网站更新影响。扫描上限 300 张，单张导入上限 16 MB。Pinterest 的 `ph.pinterest.com` 页面已有验证记录，小红书、花瓣仍需结合实际页面持续验收。浏览器设置页和扩展商店等受限制页面不能注入悬浮按钮。

当前不提供云同步、账户协作、自动更新、相似图检索、商店安装或成熟大图库性能保证。配套 Skill 已验证读图与报告回写接口；真实视觉结论由使用者自己的 Codex 执行并审阅。

目前尚未选定项目开源许可证；内置第三方运行环境的许可证随便携包提供。本仓库优先用于私有维护与同事试用。
