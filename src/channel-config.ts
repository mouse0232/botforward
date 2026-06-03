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
    const seenAliases = new Set<string>();
    const seenIds = new Set<string>();

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

      if (!alias || alias === '') {
        console.warn(`Skipping empty alias in channel configuration at index ${index}`);
        return;
      }

      if (!id || id === '') {
        console.warn(`Skipping empty ID in channel configuration at index ${index}`);
        return;
      }

      if (seenAliases.has(alias)) {
        console.warn(`Skipping duplicate alias "${alias}" in channel configuration`);
        return;
      }

      if (seenIds.has(id)) {
        console.warn(`Skipping duplicate ID "${id}" in channel configuration`);
        return;
      }

      seenAliases.add(alias);
      seenIds.add(id);

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