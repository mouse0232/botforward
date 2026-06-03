# 技术设计文档：支持选择转发到指定频道

## 1. 设计概述

**设计目标**：为现有 Telegram Bot 转发系统增加频道选择功能，支持用户通过交互式方式选择转发目标频道。

**设计原则**：
- 最小化对现有代码的侵入性
- 保持系统的可扩展性和可维护性
- 提供良好的用户体验
- 确保向后兼容性

---

## 2. 系统架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐      ┌──────────────┐               │
│  │ Webhook API  │─────▶│Message Router│               │
│  └──────────────┘      └──────┬───────┘               │
│                                │                        │
│         ┌──────────────────────┼──────────────────────┐│
│         │                      │                      ││
│         ▼                      ▼                      ││
│  ┌──────────────┐      ┌──────────────┐              ││
│  │Command Handler│     │Message Handler│              ││
│  └──────┬───────┘      └──────┬───────┘              ││
│         │                      │                      ││
│         │              ┌───────┴───────┐              ││
│         │              │               │              ││
│         ▼              ▼               ▼              ││
│  ┌──────────────┐ ┌──────────┐ ┌──────────────┐      ││
│  │Channel Selector│ │Message  │ │Forward Handler│      ││
│  └──────┬───────┘ │Buffer    │ └──────┬───────┘      ││
│         │         └──────────┘        │              ││
│         │                             │              ││
│         └──────────┬──────────────────┘              ││
│                    │                                 ││
│                    ▼                                 ││
│           ┌────────────────┐                        ││
│           │Telegram Client │                        ││
│           └────────────────┘                        ││
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心模块

| 模块名称 | 职责 | 文件路径 |
|---------|------|---------|
| Message Router | 消息路由，区分命令和普通消息 | `src/message-router.ts` |
| Command Handler | 处理 Bot 命令（/forward, /list） | `src/command-handler.ts` |
| Channel Selector | 频道选择交互逻辑 | `src/channel-selector.ts` |
| Message Buffer | 暂存待转发消息 | `src/message-buffer.ts` |
| Channel Config | 频道配置管理 | `src/channel-config.ts` |

---

## 3. 数据结构设计

### 3.1 频道配置结构

```typescript
export interface ChannelConfig {
  id: string;           // @username 或频道 ID
  alias: string;        // 别名（用于命令）
  isDefault: boolean;   // 是否为默认频道（第一个就是默认）
}

// 配置加载时从环境变量解析得到
// 示例：从 "@mainchannel,tech:@techchannel" 解析出两个 ChannelConfig
```

### 3.2 频道选择状态

```typescript
export interface ChannelSelectionState {
  userId: number;          // 用户 ID
  messageId: number;       // 待转发消息 ID
  chatId: number;          // 聊天 ID
  timestamp: number;       // 创建时间戳
  expiresAt: number;       // 过期时间戳
}
```

### 3.3 暂存消息结构

```typescript
// 不需要存储，通过 Telegram 回复机制或 callback_data 获取消息
```

---

## 4. 接口设计

### 4.1 Channel Config 模块接口

```typescript
export class ChannelConfigManager {
  constructor(configEnv: string);

  getAllChannels(): ChannelConfig[];
  getChannelByAlias(alias: string): ChannelConfig | null;
  getDefaultChannel(): ChannelConfig | null;

  // 从环境变量字符串解析配置
  private parseConfig(configEnv: string): ChannelConfig[];
}
```

### 4.2 Channel Selector 模块接口

```typescript
export class ChannelSelector {
  constructor(
    channelConfig: ChannelConfigManager,
    telegramClient: TelegramClient
  );

  showChannelSelection(userId: number, chatId: number): Promise<void>;
  showChannelSelectionInline(
    userId: number,
    chatId: number,
    message: TelegramMessage
  ): Promise<void>;
  handleChannelSelection(
    userId: number,
    channelId: string,
    state: ChannelSelectionState
  ): Promise<void>;
}
```

### 4.3 Message Buffer 模块接口

```typescript
export class MessageBuffer {
  constructor(storage: KVNamespace | D1Database);

  bufferMessage(userId: number, message: TelegramMessage): Promise<string>;
  getBufferedMessage(key: string): Promise<BufferedMessage | null>;
  removeBufferedMessage(key: string): Promise<void>;
  cleanupExpiredMessages(): Promise<void>;
}
```

### 4.4 Command Handler 模块接口

```typescript
export class CommandHandler {
  constructor(
    channelSelector: ChannelSelector,
    channelConfig: ChannelConfigManager,
    telegramClient: TelegramClient
  );

  handleForwardCommand(
    userId: number,
    chatId: number,
    replyToMessageId?: number,
    args?: string
  ): Promise<void>;
  handleListCommand(userId: number, chatId: number): Promise<void>;
  handleStartCommand(userId: number, chatId: number): Promise<void>;
}
```

---

## 5. 交互流程设计

### 5.1 方案 A：回复消息 + 命令（推荐）

#### 流程 A：回复消息 + 频道选择列表

```
用户发送消息：https://example.com/article
    ↓
Bot 收到消息，暂不转发
    ↓
用户回复这条消息：/forward
    ↓
Bot 识别 reply_to_message_id，获取要转发的消息
    ↓
Bot 显示频道列表（内联按钮）
    ↓
用户点击频道按钮
    ↓
Bot 把消息转发到选定频道
```

#### 流程 B：回复消息 + 直接指定频道

```
用户发送消息：https://example.com/article
    ↓
Bot 收到消息，暂不转发
    ↓
用户回复这条消息：/forward tech
    ↓
Bot 识别 reply_to_message_id 和频道参数
    ↓
Bot 把消息转发到 tech 频道
```

### 5.2 方案 B：内联按钮 + callback_data

#### 流程：消息即时转发模式

```
用户发送消息：https://example.com/article
    ↓
Bot 收到消息
    ↓
Bot 回复消息并附加频道选择按钮
    按钮格式：
    callback_data = "MSG_ID:CHANNEL_ALIAS"
    示例：callback_data = "123:main"
    ↓
用户点击频道按钮
    ↓
Bot 从 callback_data 解析出消息 ID 和频道
    ↓
Bot 转发消息
    ↓
更新按钮状态为"✓ 已转发"
```

### 5.3 方案 C：混合模式（最优方案）

结合方案 A 和方案 B：
- 收到消息后，同时提供两种方式：
  - 回复 `/forward` 命令
  - 内联按钮快速选择
- 适应不同使用习惯

---

## 6. 配置方案

### 6.1 环境变量配置

```bash
# 简单配置（使用 @username 或频道 ID）
TELEGRAM_CHANNELS="@mainchannel,@techchannel,@newschannel"

# 带别名配置
TELEGRAM_CHANNELS="main:@mainchannel,tech:@techchannel,news:-1001122334455"

# 混合使用
TELEGRAM_CHANNELS="@mainchannel,tech:-1000987654321"

# 第一个频道为默认频道
TELEGRAM_CHANNEL_ID="@mainchannel"  # 可选，向后兼容

# 频道选择超时时间（秒）
CHANNEL_SELECTION_TIMEOUT=300

# 暂存消息过期时间（秒）
BUFFERED_MESSAGE_TTL=3600
```

**配置格式说明：**

| 格式 | 示例 | 说明 |
|------|------|------|
| 简单列表 | `@a,@b,@c` | 用 @username 或频道 ID，第一个为默认 |
| 带别名 | `main:@a,tech:@b` | `别名:目标`，可通过别名选择 |
| 混合 | `@a,tech:@b` | 两种格式可以混合使用 |

**解析规则：**
- 包含 `:` - 前面是别名，后面是目标
- 不包含 `:` - 目标本身当作别名
- 支持 `@username` 格式
- 支持数字 ID 格式（如 `-1001234567890`）

---

## 7. 实现步骤

### 阶段一：基础架构（P0）

1. **创建频道配置模块** (`src/channel-config.ts`)
   - 实现 `ChannelConfigManager` 类
   - 从环境变量解析配置
   - 实现频道查询功能

2. **修改 ForwardHandler** (`src/forward-handler.ts`)
   - 支持动态指定频道 ID
   - 保持现有功能不变

3. **扩展 TelegramClient** (`src/telegram-client.ts`)
   - 添加 `editMessageReplyMarkup` 方法（更新按钮状态）
   - 添加 `sendMessageWithButtons` 方法（发送带按钮的消息）

### 阶段二：命令处理器（P0）

4. **创建命令处理器** (`src/command-handler.ts`)
   - 实现 `/forward` 命令（处理回复消息）
   - 实现 `/forward <alias>` 命令
   - 实现 `/list` 命令
   - 实现 `/start` 命令（显示帮助）

5. **创建频道选择器** (`src/channel-selector.ts`)
   - 实现频道列表展示
   - 实现内联按钮生成
   - 实现按钮 callback_data 编码/解码

6. **创建消息路由器** (`src/message-router.ts`)
   - 识别命令和普通消息
   - 处理回调查询
   - 路由到相应的处理器

### 阶段三：主入口集成（P0）

7. **修改主入口** (`src/index.ts`)
   - 集成 MessageRouter
   - 处理回调查询
   - 更新 Webhook 处理逻辑

### 阶段四：增强功能（P1）

9. **添加错误处理和日志**
   - 频道权限检查
   - 详细的错误提示
   - 操作日志记录

10. **添加用户帮助**
    - 欢迎消息
    - 使用说明
    - 错误提示优化

---

## 8. 技术选型

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| 消息获取 | Telegram reply_to_message_id | 原生功能，无需存储 |
| 消息传递 | callback_data | 内联按钮传递消息 ID |
| 配置管理 | 环境变量 | 简单、无需额外依赖 |
| 频道选择界面 | Telegram Inline Keyboard | 用户体验好、易于实现 |

---

## 9. 错误处理策略

### 9.1 频道选择错误

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 频道不存在 | 返回频道列表 | "请选择有效的频道" |
| 频道别名无效 | 返回可用频道列表 | "无效的频道别名" |
| 无权限访问 | 记录错误并提示 | "无权限访问该频道" |
| 未回复消息 | 提示使用方法 | "请回复要转发的消息并使用 /forward" |

### 9.2 消息转发错误

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 消息不存在 | 检查 reply_to_message_id | "未找到要转发的消息，请回复正确的消息" |
| 消息 ID 无效 | 验证 callback_data | "消息 ID 无效" |
| 转发失败 | 重试 1 次后放弃 | "转发失败，请稍后重试" |

---

## 10. 性能优化

### 10.1 响应优化
- 异步处理转发操作
- 快速响应用户操作（即使转发未完成）
- 缓存频道配置

---

## 11. 测试计划

### 11.1 单元测试

- `ChannelConfigManager` 测试
- `CommandHandler` 测试
- `ChannelSelector` 测试

### 11.2 集成测试

- 完整的消息转发流程测试
- 频道选择流程测试
- 错误处理测试

### 11.3 手动测试清单

- [ ] `/forward` 命令显示频道列表
- [ ] `/forward <alias>` 直接转发到指定频道
- [ ] `/list` 命令显示所有频道
- [ ] 内联按钮选择频道
- [ ] 无效频道选择提示
- [ ] 超时未选择处理
- [ ] 权限不足处理

---

## 12. 部署和运维

### 12.1 环境变量配置检查清单

- [ ] TELEGRAM_CHANNELS 配置正确
- [ ] CHANNEL_SELECTION_TIMEOUT 设置合理
- [ ] BUFFERED_MESSAGE_TTL 设置合理
- [ ] TELEGRAM_BOT_TOKEN 有效

### 12.2 监控指标

- 频道选择成功率
- 消息转发成功率
- 平均响应时间

### 12.3 日志规范

```
[INFO] User {userId} selected channel {channelId}
[INFO] Message {messageId} forwarded to channel {channelId}
[ERROR] Failed to forward message {messageId}: {error}
```

---

## 13. 向后兼容性

### 13.1 兼容性策略

- 保持 `TELEGRAM_CHANNEL_ID` 环境变量支持
- 如果未配置 `TELEGRAM_CHANNELS`，使用 `TELEGRAM_CHANNEL_ID` 作为默认频道
- 现有的直接转发功能继续可用

### 13.2 迁移路径

```
阶段 1：保持现有功能不变，添加频道选择功能
阶段 2：逐步引导用户使用新的频道选择功能
阶段 3：可选：移除旧的单一频道模式
```

---

## 14. 未来扩展

### 14.1 可能的扩展功能

- 支持用户自定义频道收藏
- 支持消息批量转发
- 支持定时转发
- 支持转发规则配置（基于关键词、用户等）

### 14.2 架构扩展预留

- Channel Selector 支持插件化扩展
- Command Handler 支持自定义命令注册

---

## 15. 风险和应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| 频道配置错误导致无法转发 | 高 | 中 | 提供配置验证和默认频道 |
| reply_to_message_id 不可用 | 低 | 低 | 同时提供内联按钮模式 |
| 内联按钮在某些客户端不可用 | 低 | 低 | 同时提供命令模式备选 |

---

## 16. 总结

本设计方案采用分阶段实现策略：

- **阶段一**：实现基础的频道配置和消息缓冲功能
- **阶段二**：实现命令交互模式（优先级最高）
- **阶段三**：实现内联按钮模式（提升用户体验）
- **阶段四**：完善错误处理和用户帮助

通过这种渐进式实现，能够：
1. 快速交付核心功能
2. 保持系统稳定性
3. 逐步提升用户体验
4. 降低实现风险