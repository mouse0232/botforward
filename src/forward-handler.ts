import { TelegramMessage, MessageClassification, buildTelegramLink } from './types';
import { AIProcessor } from './ai-processor';
import { TelegramClient } from './telegram-client';

export interface ForwardHandlerOptions {
  channelId: string;
  maxLength: number;
}

export class ForwardHandler {
  private aiProcessor: AIProcessor;
  private telegramClient: TelegramClient;
  private channelId: string;
  private maxLength: number;

  constructor(
    aiProcessor: AIProcessor,
    telegramClient: TelegramClient,
    options: ForwardHandlerOptions
  ) {
    this.aiProcessor = aiProcessor;
    this.telegramClient = telegramClient;
    this.channelId = options.channelId;
    this.maxLength = options.maxLength;
  }

  async handleUrlMessage(url: string): Promise<void> {
    try {
      const summary = await this.aiProcessor.summarizeUrl(url, this.maxLength);
      const message = `📄 ${summary}\n\n🔗 ${url}`;
      await this.telegramClient.sendMessage(this.channelId, message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to summarize URL:', errorMessage);
      
      const fallbackMessage = `⚠️ 无法生成摘要\n\n🔗 ${url}`;
      await this.telegramClient.sendMessage(this.channelId, fallbackMessage);
    }
  }

  async handleForwardedMessage(
    message: TelegramMessage,
    classification: MessageClassification
  ): Promise<void> {
    try {
      const content = classification.text || '';
      
      if (!content) {
        const link = classification.forwardedFromChatId && classification.forwardedFromMessageId
          ? buildTelegramLink(classification.forwardedFromChatId, classification.forwardedFromMessageId)
          : '';
        
        const message = `🔄 转发的消息\n\n📎 原消息链接：${link}`;
        await this.telegramClient.sendMessage(this.channelId, message);
        return;
      }

      let summary = '';
      try {
        summary = await this.aiProcessor.summarizeMessage(content, this.maxLength);
      } catch (aiError) {
        console.error('AI Summarization failed:', aiError);
        summary = '';
      }

      const link = classification.forwardedFromChatId && classification.forwardedFromMessageId
        ? buildTelegramLink(classification.forwardedFromChatId, classification.forwardedFromMessageId, classification.forwardedFromChatUsername)
        : '';

      let finalMessage = '';
      
      if (summary) {
        finalMessage = `📝 ${summary}\n\n📎 原消息链接：${link}`;
      } else {
        const shortContent = content.length > 400 ? content.substring(0, 400) + '...' : content;
        finalMessage = `🔄 转发消息\n\n📄 ${shortContent}\n\n📎 原消息链接：${link}`;
      }
      
      await this.telegramClient.sendMessage(this.channelId, finalMessage);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to handle forwarded message:', errorMessage);
      
      await this.telegramClient.sendMessage(this.channelId, `⚠️ 转发失败: ${errorMessage}`);
    }
  }

  async handleOtherMessage(message: TelegramMessage): Promise<void> {
    try {
      const fromChatId = message.chat.id;
      const messageId = message.message_id;
      
      await this.telegramClient.copyMessage(
        this.channelId,
        String(fromChatId),
        messageId
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to forward message:', errorMessage);
      
      if (message.text) {
        await this.telegramClient.sendMessage(this.channelId, message.text);
      }
    }
  }
}
