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
    if (!message.text) {
      return;
    }

    const text = message.text.trim();

    if (text.startsWith('/')) {
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
        const chatId = callbackQuery.message?.chat.id || callbackQuery.from.id;

        await this.forwardMessageById(
          callbackData.messageId,
          String(chatId),
          channel
        );

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
    const text = message.text.trim();
    const parts = text.split(/\s+/);
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

    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(chatId, '⚠️ 没有可用的转发频道');
      return;
    }

    const defaultChannel = this.channelConfig.getDefaultChannel();
    if (!defaultChannel) {
      await this.telegramClient.sendMessage(
        chatId,
        '⚠️ 没有默认频道，请使用 /forward 命令指定频道'
      );
      return;
    }

    const classification = classifyMessage(message);

    try {
      switch (classification.type) {
        case 'url':
          if (classification.url) {
            await this.forwardHandler.handleUrlMessage(classification.url, defaultChannel.id);
          }
          break;

        case 'forwarded':
          await this.forwardHandler.handleForwardedMessage(message, classification, defaultChannel.id);
          break;

        case 'other':
          await this.forwardHandler.handleOtherMessage(message, defaultChannel.id);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to handle regular message:', errorMessage);
    }
  }

  private async forwardMessageById(
    messageId: number,
    chatId: string,
    channel: { id: string; alias: string }
  ): Promise<void> {
    const url = `${this.telegramClient['baseUrl']}/getMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Failed to get message: ${result.description || 'Unknown error'}`);
    }

    const message: TelegramMessage = result.result;
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