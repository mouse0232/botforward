import { ChannelConfigManager, ChannelConfig } from './channel-config';
import { TelegramClient, InlineKeyboardMarkup, InlineKeyboardButton } from './telegram-client';
import { TelegramMessage } from './types';

export class ChannelSelector {
  private messageCache: Map<string, { message: TelegramMessage; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟
  private readonly MAX_CACHE_SIZE = 100; // 最多缓存100条消息

  constructor(
    private channelConfig: ChannelConfigManager,
    private telegramClient: TelegramClient
  ) {}

  cacheMessage(key: string, message: TelegramMessage): void {
    // 清理过期消息
    this.cleanupExpiredMessages();

    // 如果超过大小限制，删除最旧的
    if (this.messageCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.messageCache.keys().next().value;
      if (oldestKey) {
        this.messageCache.delete(oldestKey);
      }
    }

    this.messageCache.set(key, {
      message,
      timestamp: Date.now()
    });
  }

  getCachedMessage(key: string): TelegramMessage | null {
    const cached = this.messageCache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.messageCache.delete(key);
      return null;
    }

    this.messageCache.delete(key);
    return cached.message;
  }

  private cleanupExpiredMessages(): void {
    const now = Date.now();
    for (const [key, value] of this.messageCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.messageCache.delete(key);
      }
    }
  }

  generateChannelButtons(messageId?: number): InlineKeyboardMarkup {
    const channels = this.channelConfig.getAllChannels();
    const buttons: InlineKeyboardButton[][] = [];

    if (messageId) {
      buttons.push(
        channels.map(channel => ({
          text: `${channel.isDefault ? '⭐ ' : ''}${channel.alias}`,
          callback_data: `f:${messageId}:${channel.alias}`
        }))
      );
    } else {
      buttons.push(
        channels.map(channel => ({
          text: `${channel.isDefault ? '⭐ ' : ''}${channel.alias}`,
          callback_data: `s:${channel.alias}`
        }))
      );
    }

    return { inline_keyboard: buttons };
  }

  getChannelFromCallbackData(data: string): { alias: string; messageId?: number } | null {
    if (data.startsWith('s:')) {
      const alias = data.substring(2);
      return { alias };
    }

    if (data.startsWith('f:')) {
      const parts = data.substring(2).split(':');
      if (parts.length === 2) {
        return { alias: parts[1], messageId: parseInt(parts[0], 10) };
      }
    }

    return null;
  }

  async showChannelSelection(userId: number, chatId: number, messageId?: number): Promise<void> {
    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(String(chatId), '⚠️ 没有可用的转发频道');
      return;
    }

    const message = '请选择转发频道：';
    const replyMarkup = this.generateChannelButtons(messageId);
    await this.telegramClient.sendMessageWithButtons(String(chatId), message, replyMarkup);
  }

  formatChannelList(): string {
    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      return '⚠️ 没有可用的转发频道';
    }

    let text = '📋 可用频道列表：\n\n';
    channels.forEach((channel, index) => {
      text += `${index + 1}. ${channel.isDefault ? '⭐ ' : ''}${channel.alias} -> ${channel.id}\n`;
    });

    return text;
  }
}