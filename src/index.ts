import { Hono } from 'hono';
import { TelegramMessage, classifyMessage } from './types';
import { WorkersAIProcessor } from './ai-processor';
import { TelegramClientImpl } from './telegram-client';
import { ForwardHandler } from './forward-handler';
import { ChannelConfigManager } from './channel-config';
import { ChannelSelector } from './channel-selector';
import { CommandHandler } from './command-handler';
import { MessageRouter } from './message-router';

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHANNEL_ID: string;
  TELEGRAM_CHANNELS?: string;
  WORKERS_AI_MODEL: string;
  SUMMARY_MAX_LENGTH: string;
  REQUEST_TIMEOUT: string;
  AI: any;
}

const app = new Hono<{ Bindings: Env }>();

// 自动设置命令菜单
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

app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received update:', JSON.stringify(body, null, 2));

    const env = c.env;
    const botToken = env.TELEGRAM_BOT_TOKEN;

    // 自动初始化 Bot 命令
    await initializeBot(botToken);

    const aiModel = env.WORKERS_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
    const maxLength = parseInt(env.SUMMARY_MAX_LENGTH || '200', 10);
    const timeout = parseInt(env.REQUEST_TIMEOUT || '30000', 10);

    if (!botToken) {
      console.error('Missing required environment variable: TELEGRAM_BOT_TOKEN');
      return c.text('Configuration error', 500);
    }

    const useMultiChannel = !!env.TELEGRAM_CHANNELS;

    if (!useMultiChannel) {
      return await handleLegacyWebhook(body, env, botToken, aiModel, maxLength, timeout);
    }

    const channelConfig = new ChannelConfigManager(env.TELEGRAM_CHANNELS || '');
    const telegramClient = new TelegramClientImpl(botToken);
    const aiProcessor = new WorkersAIProcessor(env.AI, aiModel, timeout);
    const forwardHandler = new ForwardHandler(aiProcessor, telegramClient, { maxLength });
    const channelSelector = new ChannelSelector(channelConfig, telegramClient);
    const commandHandler = new CommandHandler(channelConfig, channelSelector, telegramClient, forwardHandler);
    const messageRouter = new MessageRouter(telegramClient, channelConfig, channelSelector, commandHandler, forwardHandler);

    if (body.message) {
      const message: TelegramMessage = body.message;
      await messageRouter.handleMessage(message);
    } else if (body.callback_query) {
      await messageRouter.handleCallbackQuery(body.callback_query);
    } else {
      console.log('No message or callback_query in update, skipping');
    }

    return c.text('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return c.text('Internal error', 500);
  }
});

async function handleLegacyWebhook(
  body: any,
  env: Env,
  botToken: string,
  aiModel: string,
  maxLength: number,
  timeout: number
): Promise<Response> {
  if (!body.message) {
    console.log('No message in update, skipping');
    return new Response('OK');
  }

  const message: TelegramMessage = body.message;
  const channelId = env.TELEGRAM_CHANNEL_ID;

  if (!channelId) {
    console.error('Missing required environment variable: TELEGRAM_CHANNEL_ID');
    return new Response('Configuration error', { status: 500 });
  }

  const classification = classifyMessage(message);
  console.log('Message classification:', classification);

  const telegramClient = new TelegramClientImpl(botToken);
  const aiProcessor = new WorkersAIProcessor(env.AI, aiModel, timeout);
  const forwardHandler = new ForwardHandler(aiProcessor, telegramClient, { maxLength });

  switch (classification.type) {
    case 'url':
      console.log('Processing URL message');
      if (classification.url) {
        await forwardHandler.handleUrlMessage(classification.url, channelId);
      }
      break;

    case 'forwarded':
      console.log('Processing forwarded message');
      await forwardHandler.handleForwardedMessage(message, classification, channelId);
      break;

    case 'other':
      console.log('Processing other message type');
      await forwardHandler.handleOtherMessage(message, channelId);
      break;
  }

  return new Response('OK');
}

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/set-webhook', async (c) => {
  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = c.req.query('url');

  if (!botToken) {
    return c.text('Missing TELEGRAM_BOT_TOKEN', 400);
  }

  if (!webhookUrl) {
    return c.text('Missing url parameter', 400);
  }

  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: webhookUrl
    })
  });

  const result = await response.json();
  return c.json(result);
});

app.get('/get-me', async (c) => {
  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return c.text('Missing TELEGRAM_BOT_TOKEN', 400);
  }

  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const response = await fetch(url);
  const result = await response.json();

  return c.json(result);
});

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

export default app;
