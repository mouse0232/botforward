import { ChannelConfigManager, ChannelConfig } from './channel-config';
import { TelegramClient, InlineKeyboardMarkup, InlineKeyboardButton } from './telegram-client';

export class ChannelSelector {
  private messageCache: Map<string, TelegramMessage> = new Map();

  constructor(
    private channelConfig: ChannelConfigManager,
    private telegramClient: TelegramClient
  ) {}

  cacheMessage(key: string, message: TelegramMessage): void {
    this.messageCache.set(key, message);
  }

  getCachedMessage(key: string): TelegramMessage | null {
    const msg = this.messageCache.get(key);
    if (msg) {
      this.messageCache.delete(key);
      return msg;
    }
    return null;
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