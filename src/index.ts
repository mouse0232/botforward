import { Hono } from 'hono';
import { TelegramMessage, classifyMessage } from './types';
import { WorkersAIProcessor } from './ai-processor';
import { TelegramClientImpl } from './telegram-client';
import { ForwardHandler } from './forward-handler';

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHANNEL_ID: string;
  WORKERS_AI_MODEL: string;
  SUMMARY_MAX_LENGTH: string;
  REQUEST_TIMEOUT: string;
  AI: any;
}

const app = new Hono<{ Bindings: Env }>();

app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received update:', JSON.stringify(body, null, 2));
    
    if (!body.message) {
      console.log('No message in update, skipping');
      return c.text('OK');
    }
    
    const message: TelegramMessage = body.message;
    const env = c.env;
    
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const channelId = env.TELEGRAM_CHANNEL_ID;
    const aiModel = env.WORKERS_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
    const maxLength = parseInt(env.SUMMARY_MAX_LENGTH || '200', 10);
    const timeout = parseInt(env.REQUEST_TIMEOUT || '30000', 10);
    
    if (!botToken || !channelId) {
      console.error('Missing required environment variables');
      return c.text('Configuration error', 500);
    }
    
    const classification = classifyMessage(message);
    console.log('Message classification:', classification);
    
    const telegramClient = new TelegramClientImpl(botToken);
    const aiProcessor = new WorkersAIProcessor(env.AI, aiModel, timeout);
    const forwardHandler = new ForwardHandler(aiProcessor, telegramClient, {
      channelId,
      maxLength
    });
    
    switch (classification.type) {
      case 'url':
        console.log('Processing URL message');
        if (classification.url) {
          await forwardHandler.handleUrlMessage(classification.url);
        }
        break;
        
      case 'forwarded':
        console.log('Processing forwarded message');
        await forwardHandler.handleForwardedMessage(message, classification);
        break;
        
      case 'other':
        console.log('Processing other message type');
        await forwardHandler.handleOtherMessage(message);
        break;
    }
    
    return c.text('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return c.text('Internal error', 500);
  }
});

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

export default app;
