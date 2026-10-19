# SinkManager

在 iPhone / iPad 上通过 [Scriptable](https://scriptable.app/) 管理自己的 [Sink](https://github.com/ccbikai/Sink) 短链接服务。单文件 JavaScript，无需安装额外依赖。

当前版本：**3.0.5**。

## 功能

- WebView 中文管理界面，支持深色模式。
- 首次运行配置自己的 HTTPS 网站根地址和 Token，无内置网站或凭据。
- Token 存入 Scriptable Keychain，按网站隔离；不会注入 WebView。
- 链接列表、游标分页、关键词搜索、状态和标签筛选。
- 创建、编辑、删除、复制短链接；删除前确认。
- 目标 URL 缺少协议时自动补充 `https://`。
- 到期日期时间选择器，使用设备本地时区，自动转换为 Unix 秒。
- 标签、备注、链接预览、移动端跳转、密码和高级路由选项。
- 中文明文统计：访问次数、独立访客、来源数量、访问趋势及来源、地区、设备、浏览器排行。
- HTTP 状态码和错误原因提示；错误正文中隐藏当前 Token。
- WebView 桥接仅返回字符串，避免不支持的返回类型引发 Error 606。

## 安装和配置

1. 在 iPhone / iPad 安装 Scriptable。
2. 下载本仓库的 `SinkManager.js`，通过分享菜单导入 Scriptable；也可以新建脚本并粘贴完整文件内容。
3. 在 Scriptable App 内运行 **SinkManager**。
4. 点击 **设置**，输入自己的 Sink 网站根地址，例如 `https://your-sink.example`。不要填写 `/dashboard` 或 `/api` 路径。
5. 输入部署 Sink 时设置的 `NUXT_SITE_TOKEN`，点击 **保存并验证**。可直接粘贴 Token，也可带 `Bearer ` 前缀。
6. 验证成功后显示链接列表。换网站时需提供对应 Token；同一网站 Token 留空则保留已保存值。

本项目不包含任何个人网站、真实 Token 或用户数据。运行后填写的配置仅保存在设备的 Keychain 中，不会写回脚本或上传到本仓库。由旧版个人脚本升级时，需要重新填写网站和 Token；旧版 Keychain 项不会被自动读取或删除。

## 使用说明

### 链接管理

点击 **创建链接**，填写目标 URL。Slug 留空时由服务自动生成；手动填写只支持小写字母、数字和中间连字符。编辑时 Slug 固定，不能重命名。

搜索匹配 Slug、URL、备注或标签，最多返回 1000 条；较多结果请缩小关键词。普通列表每页 50 条，点击 **加载下一页** 继续。状态、排序和标签筛选修改后点击 **搜索** 或 **刷新**。

### 到期时间

点击日期时间控件选择到期时间。时间使用手机本地时区，必须晚于当前时间。留空时，创建不设置到期时间，编辑保留原值。当前接口未定义清除到期时间的写法，因此留空不会取消已有到期时间。

### 编辑可选字段

密码留空保留原密码，勾选 **清除原密码** 可移除密码。Apple / Google 跳转地址留空保留原值。高级 JSON 支持 `geo`、`cloaking`、`redirectWithQuery`、`proxy`、`unsafe`；其中布尔选项使用 `true` 或 `false`。

### 统计

先选择最近 7、30 或 90 天，再点击 **全站统计** 或某个链接的 **统计**。访问趋势按天汇总，携带设备 IANA 时区；全站链接总数不受日期范围限制。Analytics 需在 Sink 部署端正常配置，没有访问记录时显示 **暂无数据**。

## API 对接

使用 Sink Bearer Token 鉴权。可在自己的服务访问 `/_docs/openapi.json` 检查部署版本。

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 验证配置 | GET | `/api/verify` |
| 列表 | GET | `/api/link/list` |
| 搜索 | GET | `/api/link/search` |
| 读取链接 | GET | `/api/link/query` |
| 创建 | POST | `/api/link/create` |
| 编辑 | PUT | `/api/link/edit` |
| 删除 | POST | `/api/link/delete` |
| 链接计数 | GET | `/api/link/count` |
| 访问概览 | GET | `/api/stats/counters` |
| 趋势 | GET | `/api/stats/views` |
| 排行 | GET | `/api/stats/metrics` |

趋势请求包含 `unit`、`clientTimezone`、`startAt`、`endAt`；排行请求包含 `type`。不同 Sink 版本的字段和功能可能有差异。

## 常见问题

- **HTTP 401 / 403**：检查网站、Token 和部署侧访问控制。
- **HTTP 400**：根据提示检查字段格式、Slug、URL 和到期日期；同时确认 Sink 版本支持对应接口。
- **统计不可用**：检查 Sink 的 Cloudflare Analytics Engine 配置和访问记录。
- **网络请求失败**：检查网络和 HTTPS 证书。
- **运行位置**：请在 Scriptable App 中运行；本脚本不提供桌面小组件。

## 开发检查

安装 Node.js 18 或更高版本后，在仓库目录执行：

```sh
node tests/check.cjs
```

检查完整脚本和内嵌 WebView 语法、JSON 请求头、HTTP 错误处理、桥接返回类型、日期转换及统计参数。自动检查使用模拟请求，不会向真实服务创建或删除链接；不能代替 iOS 真机验证。

## 项目关系

SinkManager 是面向 Sink API 的独立 Scriptable 客户端，并非 Sink 或 Scriptable 的官方应用。
