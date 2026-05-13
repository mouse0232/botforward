import { TelegramMessage } from './types';

export interface TelegramClient {
  sendMessage(chatId: string, text: string, parseMode?: string): Promise<void>;
  forwardMessage(chatId: string, fromChatId: string, messageId: number): Promise<void>;
  copyMessage(
    chatId: string,
    fromChatId: string,
    messageId: number,
    caption?: string
  ): Promise<void>;
}

export class TelegramClientImpl implements TelegramClient {
  private botToken: string;
  private baseUrl: string;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: string, text: string, parseMode: string = 'HTML'): Promise<void> {
    const url = `${this.baseUrl}/sendMessage`;

    const normalizedChatId = this.normalizeChatId(chatId);

    const safeText = parseMode === 'HTML' ? this.escapeHtml(text) : text;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: normalizedChatId,
        text: safeText,
        parse_mode: parseMode
      })
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private normalizeChatId(chatId: string): string {
    if (chatId.startsWith('@')) {
      return chatId;
    }
    
    const numId = parseInt(chatId, 10);
    if (numId > 0) {
      return chatId;
    }
    
    return chatId;
  }

  async forwardMessage(chatId: string, fromChatId: string, messageId: number): Promise<void> {
    const url = `${this.baseUrl}/forwardMessage`;
    
    const normalizedChatId = this.normalizeChatId(chatId);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: normalizedChatId,
        from_chat_id: fromChatId,
        message_id: messageId
      })
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
  }

  async copyMessage(
    chatId: string,
    fromChatId: string,
    messageId: number,
    caption?: string
  ): Promise<void> {
    const url = `${this.baseUrl}/copyMessage`;
    
    const normalizedChatId = this.normalizeChatId(chatId);
    
    const body: any = {
      chat_id: normalizedChatId,
      from_chat_id: fromChatId,
      message_id: messageId
    };

    if (caption) {
      body.caption = this.escapeHtml(caption);
      body.parse_mode = 'HTML';
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, data?: string): Promise<void> {
    const url = `${this.baseUrl}/answerCallbackQuery`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        data: data
      })
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
  }

  async getMe(): Promise<any> {
    const url = `${this.baseUrl}/getMe`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
    
    return result.result;
  }
}
