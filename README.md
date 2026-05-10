# Telegram Bot 内容转发器

基于 Cloudflare Workers 实现的 Telegram Bot，能够智能识别消息类型并借助 AI 生成摘要后转发到指定频道。

## 功能特性

- ✅ **纯网址消息**：自动读取网页内容，AI 生成摘要后转发
- ✅ **转发的消息**：提取原消息内容，AI 生成摘要后转发
- ✅ **其他消息**：直接转发到频道（支持图片、视频、文件等）

## 部署步骤

### 1. 创建 Telegram Bot

1. 在 Telegram 中搜索 `@BotFather`
2. 发送 `/newbot` 创建新 Bot
3. 设置 Bot 名称和用户名
4. 保存 Bot Token（格式：`123456:ABC-xyz...`）

### 2. 创建频道并添加 Bot

1. 创建一个新的 Telegram Channel
2. 为频道设置用户名（例如：`@my_channel`）
3. 将 Bot 添加为频道管理员（赋予发送消息权限）

> **注意**：频道用户名可以是 `@channelname` 形式，也可以是数字 ID 形式（如 `-1001234567890`）

### 3. 配置环境变量

编辑 `wrangler.toml` 或使用 Cloudflare Dashboard 设置：

```toml
[vars]
TELEGRAM_BOT_TOKEN = "你的 Bot Token"
TELEGRAM_CHANNEL_ID = "@your_channel"  # 或数字 ID：-1001234567890
WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct"
SUMMARY_MAX_LENGTH = "200"
REQUEST_TIMEOUT = "30000"
```

### 4. 部署到 Cloudflare

```bash
# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login

# 部署
npm run deploy
```

部署成功后，会显示 Worker 的 URL，例如：
```
https://tg-bot-content-forwarder.your-username.workers.dev
```

### 5. 设置 Webhook

使用部署后的 URL 设置 Telegram Webhook：

```bash
curl "https://tg-bot-content-forwarder.your-username.workers.dev/set-webhook?url=https://tg-bot-content-forwarder.your-username.workers.dev/webhook"
```

如果返回 `{"ok":true,"result":true,"description":"Info: webhook was already set"}` 表示设置成功。

## 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev
```

开发服务器会运行在 `http://localhost:8787`

### 本地测试 Webhook

使用 ngrok 或其他工具暴露本地服务：

```bash
ngrok http 8787
```

然后用 ngrok 的 URL 设置 Webhook。

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token（必填） | - |
| `TELEGRAM_CHANNEL_ID` | 目标频道 ID（必填） | - |
| `WORKERS_AI_MODEL` | Workers AI 模型 | `@cf/meta/llama-3-8b-instruct` |
| `SUMMARY_MAX_LENGTH` | 摘要最大字数 | `200` |
| `REQUEST_TIMEOUT` | 请求超时时间（毫秒） | `30000` |

## 项目结构

```
.
├── src/
│   ├── index.ts           # 主入口，Webhook 处理
│   ├── types.ts           # TypeScript 类型定义
│   ├── ai-processor.ts    # AI 处理模块
│   ├── telegram-client.ts # Telegram API 客户端
│   └── forward-handler.ts # 转发处理器
├── package.json
├── wrangler.toml          # Cloudflare Workers 配置
└── tsconfig.json
```

## 使用示例

### 发送纯网址

```
用户发送：https://example.com/news/article-123

Bot 转发到频道：
📄 这篇文章介绍了最新的人工智能技术发展趋势，
包括大语言模型、计算机视觉和自然语言处理等
领域的突破性进展...

🔗 https://example.com/news/article-123
```

### 发送转发的消息

```
用户转发：其他频道的消息

Bot 转发到频道：
📝 该消息讨论了云计算的最新价格调整，
AWS、Azure 和 GCP 三大云服务商相继宣布
降价计划...

📎 原消息链接：https://t.me/c/1234567890/456
```

### 发送其他消息

```
用户发送：图片/视频/文件

Bot：直接转发到频道（保持原格式）
```

## 故障排查

### 检查 Bot 状态

```bash
curl https://tg-bot-content-forwarder.your-username.workers.dev/get-me
```

### 检查 Webhook 状态

访问 Telegram API：
```bash
curl "https://api.telegram.org/bot<Bot Token>/getWebhookInfo"
```

### 查看日志

在 Cloudflare Dashboard 中查看 Worker 的 Logs 和 Traces。

## 技术栈

- **Cloudflare Workers** - 无服务器运行环境
- **Workers AI** - AI 摘要生成
- **Hono** - 轻量级 Web 框架
- **TypeScript** - 类型安全

## License

MIT
