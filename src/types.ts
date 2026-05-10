export interface TelegramMessage {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  entities?: MessageEntity[];
  forward_from?: User;
  forward_from_chat?: Chat;
  forward_from_message_id?: number;
  photo?: PhotoSize[];
  video?: Video;
  document?: Document;
  audio?: Audio;
  caption?: string;
}

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface Chat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface MessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface PhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface Video {
  file_id: string;
  width: number;
  height: number;
  duration: number;
  file_size?: number;
}

export interface Document {
  file_id: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
}

export interface Audio {
  file_id: string;
  duration: number;
  file_size?: number;
}

export interface MessageClassification {
  type: 'url' | 'forwarded' | 'other';
  url?: string;
  text?: string;
  forwardedFromChatId?: number;
  forwardedFromMessageId?: number;
  forwardedFromChatUsername?: string;
}

export function classifyMessage(message: TelegramMessage): MessageClassification {
  if (message.forward_from || message.forward_from_chat) {
    return {
      type: 'forwarded',
      text: message.text || message.caption || '',
      forwardedFromChatId: message.forward_from_chat?.id || message.forward_from?.id,
      forwardedFromMessageId: message.forward_from_message_id,
      forwardedFromChatUsername: message.forward_from_chat?.username
    };
  }
  
  if (message.text && message.entities) {
    const hasUrlEntity = message.entities.some((e) => e.type === 'url');
    const isPureUrl = /^\s*https?:\/\/\S+\s*$/.test(message.text);
    
    if (hasUrlEntity && isPureUrl) {
      return {
        type: 'url',
        url: message.text.trim()
      };
    }
  }
  
  return {
    type: 'other'
  };
}

export function isValidUrl(text: string): boolean {
  const urlPattern = /^\s*https?:\/\/[^\s]+$/;
  return urlPattern.test(text);
}

export function buildTelegramLink(chatId: number, messageId: number, username?: string): string {
  if (username) {
    return `https://t.me/${username}/${messageId}`;
  }
  
  if (chatId > 0) {
    return `https://t.me/+${chatId}/${messageId}`;
  } else {
    const channelId = String(chatId).replace('-100', '');
    return `https://t.me/c/${channelId}/${messageId}`;
  }
}
