# 插件管家

[English](README.md) | 中文

一个 DSH Web 插件，在 **Plugins** 页面增加「插件管家」标签页。

## 功能

- 按标题、包名、描述或组件名搜索已安装的 profile bundle。
- 按名称、启用状态或更新状态排序。
- 一键开启/关闭整个 bundle，也可以单独控制它的 Loader row。
- 从 npm registry 检查新版本，在卡片上显示「可更新」标签。
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
2. 移除旧版本 bundle；
3. 安装精确的新版本，并保留原来的启用状态；
4. 校验实际安装版本；
5. 任一步失败时：
   - 先尝试删除失败的新版本；
   - 再重新安装旧版本；
   - 返回 `rolled-back` 或 `rollback-failed`。

更新结果可能为 `updated`、`restart-required`、`rolled-back` 或 `rollback-failed`。
如果回滚失败，界面会显示旧版本号，此时需要到官方插件页手动重装。

> 更新沿用官方插件管理的「移除 + 安装」流程。因此更新成功后，该 bundle 会重新排到
> profile bundle 列表末尾，可能影响配置覆盖顺序。

## 支持范围

- 只自动更新从 npm registry 安装、且 `removable` 的 profile bundle。
- 本地路径、`link:`、Git、tarball、只读 bundle 和插件管家自身不会自动更新。
- 新版本是否兼容当前 DSH 由 `pluginManager.installBundle` 检查；不兼容时会触发回滚。
- 需要 DSH 重启才能完成的变更会显示 `restart-required`，不会伪装成已经生效。

## Host 接口

浏览器端通过生成的 `pluginManager` Remote 命名空间读取插件清单并开关插件。
Host 端增加两个同源接口：

- `GET /dsh-plugin-steward/updates`：带 10 分钟缓存的 registry 版本检查。
- `POST /dsh-plugin-steward/update`：移除旧 bundle、安装精确新版本、校验版本，并在失败时回滚。

更新接口要求：

- 本机回环地址与同源请求；
- JSON 请求体；
- 私有请求头 `x-plugin-steward-update: 1`；
- 目标必须是已安装、可移除、非本地/Git、非只读且不是插件管家自身的 bundle；
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
- 目标版本由 Host 端更新缓存校验，浏览器不能指定任意版本或 registry。
- 更新和回滚调用官方 `pluginManager` 服务，兼容性检查、构建脚本审批和 profile 写入锁仍然生效。
