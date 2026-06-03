import { ChannelConfigManager, ChannelConfig } from './channel-config';
import { TelegramClient, InlineKeyboardMarkup, InlineKeyboardButton } from './telegram-client';

export class ChannelSelector {
  constructor(
    private channelConfig: ChannelConfigManager,
    private telegramClient: TelegramClient
  ) {}

  generateChannelButtons(channelAlias?: string, messageId?: number): InlineKeyboardMarkup {
    const channels = this.channelConfig.getAllChannels();
    const buttons: InlineKeyboardButton[][] = [];

    if (channelAlias && messageId) {
      buttons.push(
        channels.map(channel => ({
          text: `${channel.isDefault ? '⭐ ' : ''}${channel.alias}`,
          callback_data: `forward:${messageId}:${channel.alias}`
        }))
      );
    } else {
      buttons.push(
        channels.map(channel => ({
          text: `${channel.isDefault ? '⭐ ' : ''}${channel.alias}`,
          callback_data: `select_channel:${channel.alias}`
        }))
      );
    }

    return { inline_keyboard: buttons };
  }

  getChannelFromCallbackData(data: string): { alias: string; messageId?: number } | null {
    if (data.startsWith('select_channel:')) {
      const alias = data.substring('select_channel:'.length);
      return { alias };
    }

    if (data.startsWith('forward:')) {
      const parts = data.substring('forward:'.length).split(':');
      if (parts.length === 2) {
        return { alias: parts[1], messageId: parseInt(parts[0], 10) };
      }
    }

    return null;
  }

  async showChannelSelection(userId: number, chatId: number): Promise<void> {
    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(String(chatId), '⚠️ 没有可用的转发频道');
      return;
    }

    const message = '请选择转发频道：';
    const replyMarkup = this.generateChannelButtons();
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