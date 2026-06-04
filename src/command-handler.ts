import { ChannelConfigManager } from './channel-config';
import { ChannelSelector } from './channel-selector';
import { TelegramClient } from './telegram-client';
import { TelegramMessage, classifyMessage } from './types';
import { ForwardHandler } from './forward-handler';

export class CommandHandler {
  constructor(
    private channelConfig: ChannelConfigManager,
    private channelSelector: ChannelSelector,
    private telegramClient: TelegramClient,
    private forwardHandler: ForwardHandler
  ) {}

  async handleForwardCommand(
    userId: number,
    chatId: number,
    replyToMessage: TelegramMessage | null,
    args?: string
  ): Promise<void> {
    const channels = this.channelConfig.getAllChannels();
    if (channels.length === 0) {
      await this.telegramClient.sendMessage(String(chatId), '⚠️ 没有可用的转发频道');
      return;
    }

    if (!replyToMessage) {
      await this.telegramClient.sendMessage(
        String(chatId),
        '⚠️ 请先发送要转发的消息，然后回复该消息并使用 /forward 命令'
      );
      return;
    }

    if (args && args.trim() !== '') {
      const channelAlias = args.trim();
      const channel = this.channelConfig.getChannelByAlias(channelAlias);

      if (!channel) {
        await this.telegramClient.sendMessage(
          String(chatId),
          `⚠️ 频道 "${channelAlias}" 不存在\n\n可用频道：\n${this.channelSelector.formatChannelList()}`
        );
        return;
      }

      await this.forwardMessage(replyToMessage, channel, chatId);
    } else {
      // 没有参数时，检查是否只有一个频道
      const channels = this.channelConfig.getAllChannels();
      if (channels.length === 1) {
        // 只有一个频道，直接转发
        await this.forwardMessage(replyToMessage, channels[0], chatId);
      } else {
        // 多个频道，显示选择按钮
        const messageId = replyToMessage.message_id;
        const cacheKey = `${chatId}:${messageId}`;
        await this.channelSelector.cacheMessage(cacheKey, replyToMessage);
        await this.channelSelector.showChannelSelection(userId, chatId, messageId);
      }
    }
  }

  async handleListCommand(userId: number, chatId: number): Promise<void> {
    const text = this.channelSelector.formatChannelList();
    await this.telegramClient.sendMessage(String(chatId), text);
  }

  async handleStartCommand(userId: number, chatId: number): Promise<void> {
    const helpText = `👋 欢迎使用消息转发 Bot！

📌 使用方法：
1. 发送要转发的消息
2. 回复该消息并发送：/forward
3. 选择频道或使用：/forward <频道别名>

📋 可用命令：
/forward - 转发消息到指定频道
/forward <频道> - 转发到指定频道
/list - 查看所有可用频道
/start - 显示帮助信息

${this.channelSelector.formatChannelList()}`;
    await this.telegramClient.sendMessage(String(chatId), helpText);
  }

  private async forwardMessage(
    message: TelegramMessage,
    channel: { id: string; alias: string },
    chatId: number
  ): Promise<void> {
    const classification = classifyMessage(message);

    try {
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

      await this.telegramClient.sendMessage(String(chatId), `✅ 已转发到 ${channel.alias}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to forward message:', errorMessage);
      await this.telegramClient.sendMessage(
        String(chatId),
        `⚠️ 转发失败: ${errorMessage}`
      );
    }
  }
}