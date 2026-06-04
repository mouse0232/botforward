## Bot init masks failures


```
async function initializeBot(botToken: string): Promise<void> {
  if (isInitialized) {
    return;
  }

  await setBotCommands(botToken);
  isInitialized = true;
}

app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received update:', JSON.stringify(body, null, 2));

    const env = c.env;
    const botToken = env.TELEGRAM_BOT_TOKEN;

    // 自动初始化 Bot 命令
    await initializeBot(botToken);

```
> initializeBot() sets isInitialized=true even when setBotCommands() fails (errors are
> swallowed), so the worker will never retry setting commands. Additionally, the webhook calls
> initializeBot(botToken) before verifying TELEGRAM_BOT_TOKEN, which can attempt Telegram API
> calls with an empty/undefined token and still mark initialization complete.

## Unbounded message cache growth


```
// 缓存消息
    const cacheKey = `${userId}:${messageId}`;
    this.channelSelector.cacheMessage(cacheKey, message);

    // 发送带按钮的消息
    const replyMarkup = this.channelSelector.generateChannelButtons(messageId);
    await this.telegramClient.sendMessageWithButtons(
      chatId,
      '📋 请选择转发频道：',
      replyMarkup
    );
```
> handleRegularMessage() now caches every non-command message, but ChannelSelector.messageCache
> has no TTL/size limit, so chats that don't click buttons will grow memory indefinitely and can
> exhaust a Worker isolate. This is amplified because cached entries are only removed on successful
> retrieval.


## Cache key user mismatch


```
const userId = message.from?.id || message.chat.id;
    const messageId = message.message_id;

    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(chatId, '⚠️ 没有可用的转发频道');
      return;
    }
	
// 缓存消息
    const cacheKey = `${userId}:${messageId}`;
    this.channelSelector.cacheMessage(cacheKey, message);
```
> Regular-message caching uses userId = message.from?.id || message.chat.id, but callback retrieval
> always uses callbackQuery.from.id, so messages without from (e.g., anonymous admin / sender-chat
> scenarios) can never be retrieved and button forwarding will always report the message as expired.
> This breaks forwarding for those message types even when the same user clicks the button.

## 初始化失败时不要仍然置 isInitialized = true


```
async function setBotCommands(botToken: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/setMyCommands`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: '显示帮助信息' },
          { command: 'help', description: '显示帮助信息' },
          { command: 'forward', description: '转发消息到指定频道' },
          { command: 'list', description: '查看所有可用频道' }
        ]
      })
    });

    const result = await response.json();
    if (result.ok) {
      console.log('Bot commands set successfully');
    } else {
      console.error('Failed to set bot commands:', result.description);
    }
  } catch (error) {
    console.error('Error setting bot commands:', error);
  }
}

// 初始化标记
let isInitialized = false;

// 初始化 Bot 命令
async function initializeBot(botToken: string): Promise<void> {
  if (isInitialized) {
    return;
  }

  await setBotCommands(botToken);
  isInitialized = true;
}
```

> setBotCommands() 把 Telegram API 失败全部吞掉了，但 initializeBot() 仍然无条件置位成功。首轮如果网络抖动或 Telegram 返回非 ok，后续请求就永远不会再重试；同时当前布尔标记也挡不住并发首请求重复进入。建议让设置失败直接抛错，并用共享中的 Promise 串行化初始化。

## 不要把带副作用的管理接口公开成未鉴权 GET


```
app.get('/set-commands', async (c) => {
  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return c.text('Missing TELEGRAM_BOT_TOKEN', 400);
  }

  await initializeBot(botToken);

  const url = `https://api.telegram.org/bot${botToken}/getMyCommands`;
  const response = await fetch(url);
  const result = await response.json();

  return c.json({
    success: true,
    message: 'Commands initialized',
    commands: result.result
  });
});
```
> 这个路由会直接使用服务端 TELEGRAM_BOT_TOKEN 调 Telegram 管理 API。现在任何人访问 /set-commands 都能触发命令配置变更并枚举当前命令；GET 语义还很容易被探活、爬虫或预取误触发。至少加管理鉴权或环境开关，或者把它改成仅内部可调用的运维入口。

## 缓存键缺少 chat.id，跨会话会串消息。


```
    const userId = message.from?.id || message.chat.id;
    const messageId = message.message_id;

    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(chatId, '⚠️ 没有可用的转发频道');
      return;
    }
    // 缓存消息
    const cacheKey = `${userId}:${messageId}`;
    this.channelSelector.cacheMessage(cacheKey, message);

```
> 这里的 message_id 是按 chat 递增的，不是按用户全局唯一。当前键只拼了 userId:messageId，同一用户在两个 chat 里出现相同 message_id 时会互相覆盖，后续按钮点击可能转发错消息。请把 message.chat.id 也纳入键，并在 handleCallbackQuery() 里用 callbackQuery.message.chat.id 取回同一把键。
