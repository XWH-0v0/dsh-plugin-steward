# 插件管家

[English](README.md) | 中文

一个 DSH Web 插件，在 **Plugins** 页面增加「插件管家」标签页。

## 功能

- 按标题、包名、描述或组件名搜索已安装的 profile bundle。
- 按名称、启用状态或更新状态排序。
- 一键开启/关闭整个 bundle，也可以单独控制它的 Loader row。
- 从 npm registry 或 GitHub Releases 检查新版本，在卡片上显示「可更新」标签。
- 点击「更新到 vX.Y.Z」直接安装精确的新版本。
- 新版本在移除、下载、安装或激活阶段失败时，自动清理失败版本并重装旧版本。
- 更新会保留原 bundle 的启用/停用状态；需要重启时会明确提示。
- 支持中文和英文界面。

## 使用

1. 打开侧栏的 **Plugins** 页面。
2. 选择 **插件管家** 标签页。
3. 用搜索框、排序菜单和筛选按钮管理已安装插件。
4. 有更新时点击 **更新到 vX.Y.Z**；进度和结果会显示在卡片上。

## 更新与回滚

更新流程：

1. 从更新缓存确认点击的版本仍是该插件的 `latest`；
2. 对 registry 包，先对候选 registry 探测目标 tarball；如果所有 registry 都不可用，
   返回 `network`，旧版本保持安装、不做任何改动；
3. 写入恢复日志（`.plugin-manager/steward-pending-update.json`）；
4. 移除旧版本 bundle；
5. 安装精确的新版本，并保留原来的启用状态；每个 registry 的安装都有超时上限，
   卡住的安装会通过插件管理器取消，而不是等它自己的十分钟静默超时；
6. 校验实际安装版本，成功后删除恢复日志；
7. 任一步失败时：
   - 旧版本仍在磁盘上：返回 `failed` 和 `keptVersion`；
   - 否则重新安装旧版本，返回 `rolled-back`；
   - 回滚也失败：保留恢复日志，返回 `rollback-failed`。

更新结果可能为 `updated`、`restart-required`、`failed`、`rolled-back` 或
`rollback-failed`。如果回滚失败，界面会显示旧版本号，此时需要到官方插件页手动重装。

如果进程在「移除完成、安装完成」之间退出，下一次启动会读取恢复日志，自动重装旧版本，
然后再允许新的更新。恢复日志最多保留七天，profile 回到已知良好状态后删除。

当 DSH 对移除操作返回 `restart-required` 时，这属于延迟成功，不是失败：新版本仍会
安装，结果标记为 `restart-required`；当前进程继续运行旧代码，重启 DSH 后才生效。
重启原因会包含在结果和阶段诊断里。

更新失败后，插件管家会保留一个失败面板，显示错误代码、更新服务返回的原因、回滚
状态和可选的阶段诊断。原因可以一键复制，方便反馈问题。失败结果会包含顶层 `reason`、
原始 `failure` 对象，以及回滚失败时的 `rollbackReason`。

> 更新沿用官方插件管理的「移除 + 安装」流程，因为带 HMR 的运行中 profile 会拒绝在
> 已有依赖上直接安装（`already-installed`）。因此更新成功后，该 bundle 会重新排到
> profile bundle 列表末尾，可能影响配置覆盖顺序。

## 更新来源

- npm registry 包比较 registry 的 `latest` dist-tag。
- 明确的 GitHub 包源比较最新 GitHub Release；只有 tag 是 SemVer 版本时才会提供更新。
  更新会安装该 Release tag 对应的精确 Git spec；失败时回滚到旧版本 tag，pinned 源则
  回滚到原 commit。
- 不会下载 GitHub Release 附件，而是安装 release tag 指向的源码。
- 公开 GitHub 仓库无需凭据。私有仓库或需要更高 API 限额时，在 Host 环境设置
  `GITHUB_TOKEN`、`GH_TOKEN` 或 `GITHUB_PAT`；Git 安装本身仍需要 Host 配好 Git 凭据。
- 本地路径、`link:`、没有 SemVer Release 的 GitHub 源、tarball、只读 bundle 和插件管家
  自身不会自动更新。
- 新版本是否兼容当前 DSH 由 `pluginManager.installBundle` 检查；不兼容时会触发回滚。
- 需要 DSH 重启才能完成的变更会显示 `restart-required`，不会伪装成已经生效。

## Host 接口

浏览器端通过生成的 `pluginManager` Remote 命名空间读取插件清单并开关插件。
Host 端增加两个同源接口：

- `GET /dsh-plugin-steward/updates`：带 10 分钟缓存的 npm / GitHub Release 版本检查；
  返回 `steward.version` 便于排查版本。
- `POST /dsh-plugin-steward/update`：先探测目标 tarball、写入恢复日志，再移除旧 bundle、
  按限定次数和超时安装精确的 npm / GitHub Release 目标、校验版本，失败时恢复旧版本。

更新接口要求：

- 本机回环地址与同源请求；
- JSON 请求体；
- 私有请求头 `x-plugin-steward-update: 1`；
- 目标必须是已安装、可移除、非只读且不是插件管家自身的 bundle；
- 目标版本必须与缓存中的 `latest` 一致。

同一时间只允许一个更新任务。

## 文件

- `index.js`：Host 入口、更新检查、更新/回滚编排。
- `client.js`：`plugins.tab` 管理界面、更新按钮和 `plugins.detail.badge`。
- `cordis.patch.yml`：插入 Loader row。
- `locale/`：插件管理页显示用元数据。
- `icon.svg`：插件图标。

## 安全

- 更新接口只接受同源、本机回环请求，并要求私有意图头。
- 目标版本由 Host 端更新缓存校验，浏览器不能指定任意版本、registry 或 GitHub ref。
- GitHub API 凭据只从 Host 环境读取，不会返回给浏览器；只会访问 `api.github.com`。
- 更新和回滚调用官方 `pluginManager` 服务，兼容性检查、构建脚本审批和 profile 写入锁仍然生效。
