# Requirements Document

## Introduction

本文档描述了一个基于 Cloudflare Workers 平台的 Telegram Bot 内容转发功能。该 Bot 能够智能判断用户发送的消息类型，并借助 Worker 的 AI 能力对内容进行摘要处理，最终将处理后的内容转发到指定的 Telegram 频道。

## Glossary

- **System**: Telegram Bot 内容转发系统
- **Worker**: Cloudflare Workers 运行环境
- **AI Model**: Cloudflare Workers AI 提供的文本处理和摘要生成模型
- **频道**: Telegram Channel，用于接收转发内容的目标频道
- **纯网址消息**: 仅包含 URL 链接，不含其他文本内容的消息
- **转发消息**: 从其他 Telegram 聊天转发过来的消息

## Requirements

### Requirement 1: 消息类型识别

**User Story:** AS Telegram 用户，我希望 Bot 能够自动识别我发送的消息类型，以便进行不同的处理。

#### Acceptance Criteria

1. WHEN 用户发送仅包含 URL 链接的消息时，Bot SHALL 识别为"纯网址类型"
2. WHEN 用户发送从其他聊天转发的 Telegram 消息时，Bot SHALL 识别为"转发的 tg 消息类型"
3. WHEN 用户发送其他类型的消息（文本、图片、视频、文件等）时，Bot SHALL 识别为"其他类型"
4. URL 识别规则 SHALL 符合标准 URL 格式（支持 http:// 和 https:// 协议）

### Requirement 2: 纯网址内容摘要

**User Story:** AS Telegram 用户，我希望 Bot 能够读取我发送的网址内容并生成摘要，以便快速了解网页内容。

#### Acceptance Criteria

1. WHEN Bot 识别为纯网址类型消息时，Bot SHALL 使用 Workers AI 读取网页内容
2. WHILE Workers AI 处理网页内容时，Bot SHALL 生成不超过 200 字的中文摘要
3. IF Workers AI 无法读取网页内容（如访问失败、内容为空），Bot SHALL 直接转发原始网址并提示"无法生成摘要"
4. Bot SHALL 将生成的摘要和原始网址一起转发到指定频道

### Requirement 3: 转发消息内容摘要

**User Story:** AS Telegram 用户，我希望 Bot 能够读取我转发的 Telegram 消息并生成摘要，以便快速了解转发内容。

#### Acceptance Criteria

1. WHEN Bot 识别为转发的 tg 消息类型时，Bot SHALL 提取原消息的文本内容
2. WHILE Workers AI 处理原消息内容时，Bot SHALL 生成不超过 200 字的中文摘要
3. IF 原消息无文本内容（如纯图片、视频），Bot SHALL 直接使用消息类型描述作为摘要
4. IF Workers AI 无法生成摘要，Bot SHALL 直接转发原消息内容并提示"无法生成摘要"
5. Bot SHALL 将生成的摘要和原消息的 Telegram 链接一起转发到指定频道

### Requirement 4: 其他类型消息转发

**User Story:** AS Telegram 用户，我希望 Bot 能够将其他类型的消息直接转发到频道，以便分享非文本内容。

#### Acceptance Criteria

1. WHEN Bot 识别为其他类型消息时，Bot SHALL 直接转发到指定频道，不进行 AI 处理
2. Bot SHALL 保持原消息的格式和内容（图片、视频、文件、音频等）
3. IF 消息包含文本和其他媒体，Bot SHALL 保持原有组合转发

### Requirement 5: 错误处理

**User Story:** AS Telegram 用户，我希望 Bot 在处理失败时能够给出明确的错误提示，以便了解问题原因。

#### Acceptance Criteria

1. IF Workers AI 服务不可用，Bot SHALL 直接转发原始消息并提示"AI 服务暂时不可用"
2. IF 目标频道不可达（Bot 无权限），Bot SHALL 向发送者回复错误提示
3. IF 消息格式不被支持，Bot SHALL 向发送者回复"不支持的消息类型"
4. IF 网络请求超时（超过 30 秒），Bot SHALL 向发送者回复"处理超时，请稍后重试"

### Requirement 6: 配置管理

**User Story:** AS Bot 管理员，我希望能够配置 Bot 的目标频道和 AI 模型参数，以便灵活调整 Bot 行为。

#### Acceptance Criteria

1. Bot SHALL 通过环境变量配置目标频道 ID
2. Bot SHALL 通过环境变量配置 Workers AI 模型名称
3. Bot SHALL 通过环境变量配置摘要生成的最大长度
4. Bot SHALL 通过环境变量配置请求超时时间
