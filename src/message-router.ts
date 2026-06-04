import { TelegramClient } from './telegram-client';
import { ChannelConfigManager } from './channel-config';
import { ChannelSelector } from './channel-selector';
import { CommandHandler } from './command-handler';
import { ForwardHandler } from './forward-handler';
import { TelegramMessage, classifyMessage } from './types';

export interface CallbackQuery {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data: string;
}

export class MessageRouter {
  constructor(
    private telegramClient: TelegramClient,
    private channelConfig: ChannelConfigManager,
    private channelSelector: ChannelSelector,
    private commandHandler: CommandHandler,
    private forwardHandler: ForwardHandler
  ) {}

  async handleMessage(message: TelegramMessage): Promise<void> {
    const text = message.text;

    if (text && text.trim().startsWith('/')) {
      await this.handleCommand(message);
    } else {
      await this.handleRegularMessage(message);
    }
  }

  async handleCallbackQuery(callbackQuery: CallbackQuery): Promise<void> {
    const callbackData = this.channelSelector.getChannelFromCallbackData(callbackQuery.data);
    if (!callbackData) {
      await this.answerCallbackQuery(callbackQuery.id);
      return;
    }

    const channel = this.channelConfig.getChannelByAlias(callbackData.alias);
    if (!channel) {
      await this.answerCallbackQuery(callbackQuery.id, '⚠️ 频道不存在');
      return;
    }

    try {
      if (callbackData.messageId) {
        const chatId = callbackQuery.message?.chat.id;
        console.log('Callback query chatId:', chatId, 'type:', typeof chatId);

        if (!chatId) {
          await this.answerCallbackQuery(callbackQuery.id, '⚠️ 无法获取会话信息');
          return;
        }

        const cacheKey = `${String(chatId)}:${callbackData.messageId}`;
        console.log('Cache key:', cacheKey);

        const message = await this.channelSelector.getCachedMessage(cacheKey);
        console.log('Cached message:', message ? 'found' : 'not found');

        if (!message) {
          await this.answerCallbackQuery(callbackQuery.id, '⚠️ 消息已过期，请重新发送');
          return;
        }

        await this.forwardMessage(message, channel);

        if (callbackQuery.message?.message_id) {
          await this.updateButtonStatus(
            String(chatId),
            callbackQuery.message.message_id,
            `${channel.alias} ✅`
          );
        }

        await this.answerCallbackQuery(callbackQuery.id, `✅ 已转发到 ${channel.alias}`);
      } else {
        await this.answerCallbackQuery(callbackQuery.id, `已选择频道: ${channel.alias}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to handle callback query:', errorMessage);
      await this.answerCallbackQuery(callbackQuery.id, `⚠️ 转发失败: ${errorMessage}`);
    }
  }

  private async handleCommand(message: TelegramMessage): Promise<void> {
    const text = message.text;
    if (!text) {
      await this.telegramClient.sendMessage(String(message.chat.id), '⚠️ 命令格式错误');
      return;
    }

    const trimmedText = text.trim();
    const parts = trimmedText.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1).join(' ');

    const userId = message.from?.id || message.chat.id;
    const chatId = message.chat.id;
    const replyToMessage = message.reply_to_message || null;

    switch (command) {
      case '/forward':
        await this.commandHandler.handleForwardCommand(userId, chatId, replyToMessage, args);
        break;

      case '/list':
        await this.commandHandler.handleListCommand(userId, chatId);
        break;

      case '/start':
      case '/help':
        await this.commandHandler.handleStartCommand(userId, chatId);
        break;

      default:
        await this.telegramClient.sendMessage(String(chatId), '⚠️ 未知命令，使用 /help 查看帮助');
    }
  }

  private async handleRegularMessage(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const userId = message.from?.id || message.chat.id;
    const messageId = message.message_id;

    console.log('Regular message - chatId:', chatId, 'messageId:', messageId);

    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(chatId, '⚠️ 没有可用的转发频道');
      return;
    }

    // 如果只有一个频道，直接转发
    if (channels.length === 1) {
      const channel = channels[0];
      await this.forwardMessage(message, channel);
      console.log(`Auto forwarded to single channel: ${channel.alias}`);
      return;
    }

    // 多个频道时，显示选择按钮
    const cacheKey = `${chatId}:${messageId}`;
    console.log('Cache key for message:', cacheKey);
    await this.channelSelector.cacheMessage(cacheKey, message);

    const replyMarkup = this.channelSelector.generateChannelButtons(messageId);
    await this.telegramClient.sendMessageWithButtons(
      chatId,
      '📋 请选择转发频道：',
      replyMarkup
    );
  }

  private async forwardMessage(
    message: TelegramMessage,
    channel: { id: string; alias: string }
  ): Promise<void> {
    const classification = classifyMessage(message);

    switch (classification.type) {
      case 'url':
        if (classification.url) {
          await this.forwardHandler.handleUrlMessage(classification.url, channel.id);
        }
        break;

      case 'forwarded':
        await this.forwardHandler.handleForwardedMessage(message, classification, channel.id);
        break;

      case 'other':
        await this.forwardHandler.handleOtherMessage(message, channel.id);
        break;
    }
  }

  private async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    const url = `${this.telegramClient['baseUrl']}/answerCallbackQuery`;

    const body: any = {
      callback_query_id: callbackQueryId
    };

    if (text) {
      body.text = text;
      body.show_alert = true;
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
      throw new Error(`Failed to answer callback query: ${result.description || 'Unknown error'}`);
    }
  }

  private async updateButtonStatus(
    chatId: string,
    messageId: number,
    text: string
  ): Promise<void> {
    try {
      await this.telegramClient.editMessageReplyMarkup(chatId, messageId, null);
    } catch (error) {
      console.error('Failed to update button status:', error);
    }
  }
}