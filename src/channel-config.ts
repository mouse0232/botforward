export interface ChannelConfig {
  id: string;
  alias: string;
  isDefault: boolean;
}

export class ChannelConfigManager {
  private channels: ChannelConfig[];

  constructor(configEnv: string) {
    this.channels = this.parseConfig(configEnv);
  }

  private parseConfig(configEnv: string): ChannelConfig[] {
    if (!configEnv || configEnv.trim() === '') {
      return [];
    }

    const channels: ChannelConfig[] = [];
    const parts = configEnv.split(',').map(p => p.trim()).filter(p => p.length > 0);

    parts.forEach((part, index) => {
      const colonIndex = part.indexOf(':');
      let id: string;
      let alias: string;

      if (colonIndex > 0) {
        alias = part.substring(0, colonIndex).trim();
        id = part.substring(colonIndex + 1).trim();
      } else {
        id = part;
        alias = part;
      }

      channels.push({
        id,
        alias,
        isDefault: index === 0
      });
    });

    return channels;
  }

  getAllChannels(): ChannelConfig[] {
    return [...this.channels];
  }

  getChannelByAlias(alias: string): ChannelConfig | null {
    return this.channels.find(c => c.alias === alias) || null;
  }

  getChannelById(id: string): ChannelConfig | null {
    return this.channels.find(c => c.id === id) || null;
  }

  getDefaultChannel(): ChannelConfig | null {
    return this.channels.find(c => c.isDefault) || null;
  }
}