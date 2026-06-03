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
  id: string;              // 频道 ID
  name: string;            // 频道名称（用于显示）
  alias: string;           // 频道别名（用于命令）
  isDefault: boolean;      // 是否为默认频道
  enabled: boolean;        // 是否启用
}

export interface ChannelConfigList {
  default: string;         // 默认频道 ID
  channels: ChannelConfig[];
}
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
export interface BufferedMessage {
  userId: number;
  messageId: number;
  chatId: number;
  message: TelegramMessage;
  createdAt: number;
}
```

---

## 4. 接口设计

### 4.1 Channel Config 模块接口

```typescript
export class ChannelConfigManager {
  constructor(config: ChannelConfigList);

  getAllChannels(): ChannelConfig[];
  getChannelById(id: string): ChannelConfig | null;
  getChannelByAlias(alias: string): ChannelConfig | null;
  getDefaultChannel(): ChannelConfig | null;
  getEnabledChannels(): ChannelConfig[];

  validateChannelId(id: string): Promise<boolean>;
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
    messageBuffer: MessageBuffer,
    forwardHandler: ForwardHandler
  );

  handleForwardCommand(
    userId: number,
    chatId: number,
    args?: string
  ): Promise<void>;
  handleListCommand(userId: number, chatId: number): Promise<void>;
  handleStartCommand(userId: number, chatId: number): Promise<void>;
}
```

---

## 5. 交互流程设计

### 5.1 方案一：命令模式（推荐优先实现）

#### 流程 A：通过 /forward 命令启动选择流程

```
用户发送消息
    ↓
系统暂存消息到 Message Buffer
    ↓
用户发送 /forward
    ↓
系统显示频道列表（使用内联按钮或消息列表）
    ↓
用户选择频道
    ↓
系统从 Buffer 获取消息并转发到选定频道
    ↓
发送成功确认消息
```

#### 流程 B：通过 /forward <频道别名> 直接转发

```
用户发送消息
    ↓
用户发送 /forward channel1
    ↓
系统从 Buffer 获取最新消息
    ↓
系统查询 channel1 对应的频道 ID
    ↓
系统转发消息到 channel1
    ↓
发送成功确认消息
```

### 5.2 方案二：内联按钮模式（增强用户体验）

#### 流程：消息即时转发模式

```
用户发送消息
    ↓
系统暂存消息
    ↓
系统附加频道选择内联按钮到回复消息
    ↓
用户点击频道按钮
    ↓
系统转发消息到选定频道
    ↓
更新按钮状态为"已转发"
```

### 5.3 方案三：混合模式（最优方案）

结合命令模式和内联按钮模式：
- 优先使用内联按钮提供快速选择
- 同时支持命令模式作为备选
- 对于长消息或复杂内容，使用命令模式

---

## 6. 配置方案

### 6.1 环境变量配置

```bash
# 转发频道配置（JSON 格式）
TELEGRAM_CHANNELS='{
  "default": "-1001234567890",
  "channels": [
    {
      "id": "-1001234567890",
      "name": "主频道",
      "alias": "main",
      "isDefault": true,
      "enabled": true
    },
    {
      "id": "-1000987654321",
      "name": "技术频道",
      "alias": "tech",
      "isDefault": false,
      "enabled": true
    },
    {
      "id": "-1001122334455",
      "name": "新闻频道",
      "alias": "news",
      "isDefault": false,
      "enabled": true
    }
  ]
}'

# 频道选择超时时间（秒）
CHANNEL_SELECTION_TIMEOUT=300

# 暂存消息过期时间（秒）
BUFFERED_MESSAGE_TTL=3600
```

### 6.2 配置文件方案（备选）

如果环境变量长度受限，可以使用 D1 Database 存储配置：

```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT UNIQUE NOT NULL,
  isDefault BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE
);
```

---

## 7. 实现步骤

### 阶段一：基础架构（P0）

1. **创建频道配置模块** (`src/channel-config.ts`)
   - 实现 `ChannelConfigManager` 类
   - 支持从环境变量加载配置
   - 实现频道查询和验证功能

2. **创建消息缓冲模块** (`src/message-buffer.ts`)
   - 使用 KV 存储暂存消息
   - 实现消息的存取和清理逻辑

3. **修改 ForwardHandler** (`src/forward-handler.ts`)
   - 支持动态指定频道 ID
   - 保持现有功能不变

### 阶段二：命令交互模式（P0）

4. **创建命令处理器** (`src/command-handler.ts`)
   - 实现 `/forward` 命令
   - 实现 `/forward <alias>` 命令
   - 实现 `/list` 命令
   - 实现 `/start` 命令（显示帮助）

5. **创建消息路由器** (`src/message-router.ts`)
   - 识别命令和普通消息
   - 路由到相应的处理器

6. **修改主入口** (`src/index.ts`)
   - 集成 MessageRouter
   - 更新 Webhook 处理逻辑

### 阶段三：频道选择界面（P1）

7. **创建频道选择器** (`src/channel-selector.ts`)
   - 实现频道列表展示
   - 实现内联按钮生成

8. **添加回调处理**
   - 处理内联按钮回调
   - 处理频道选择逻辑

### 阶段四：增强功能（P2）

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
| 消息存储 | Cloudflare KV | 低延迟、自动过期、适合临时存储 |
| 配置管理 | 环境变量 | 简单、无需额外依赖 |
| 频道选择界面 | Telegram Inline Keyboard | 用户体验好、易于实现 |
| 状态管理 | 内存 + KV | 低延迟、无需数据库 |

---

## 9. 错误处理策略

### 9.1 频道选择错误

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 频道不存在 | 返回频道列表 | "请选择有效的频道" |
| 频道已禁用 | 返回可用频道列表 | "该频道当前不可用" |
| 无权限访问 | 记录错误并提示 | "无权限访问该频道" |

### 9.2 消息转发错误

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 消息已过期 | 清理缓存 | "消息已过期，请重新发送" |
| 消息不存在 | 提示重新发送 | "未找到待转发消息" |
| 转发失败 | 重试 1 次后放弃 | "转发失败，请稍后重试" |

---

## 10. 性能优化

### 10.1 KV 存储优化
- 设置合理的 TTL 避免数据堆积
- 使用批量操作减少请求次数
- 实现定期清理过期消息

### 10.2 响应优化
- 异步处理转发操作
- 使用流式响应（如适用）
- 缓存频道配置

---

## 11. 测试计划

### 11.1 单元测试

- `ChannelConfigManager` 测试
- `MessageBuffer` 测试
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
- [ ] KV Namespace 已绑定

### 12.2 监控指标

- 频道选择成功率
- 消息转发成功率
- 平均响应时间
- KV 存储使用量

### 12.3 日志规范

```
[INFO] User {userId} selected channel {channelId}
[INFO] Message {messageId} forwarded to channel {channelId}
[ERROR] Failed to forward message {messageId}: {error}
[WARN] Channel selection timeout for user {userId}
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
- Message Buffer 支持多种存储后端
- Command Handler 支持自定义命令注册

---

## 15. 风险和应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| KV 存储成本过高 | 中 | 低 | 设置合理的 TTL，定期清理 |
| 频道配置错误导致无法转发 | 高 | 中 | 提供配置验证和默认频道 |
| 用户选择超时导致消息丢失 | 中 | 中 | 实现超时提醒和重试机制 |
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