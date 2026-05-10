export interface AIProcessor {
  summarizeUrl(url: string, maxLength: number): Promise<string>;
  summarizeMessage(content: string, maxLength: number): Promise<string>;
  fetchUrlContent(url: string): Promise<string>;
}

export class WorkersAIProcessor implements AIProcessor {
  private ai: any;
  private model: string;
  private timeout: number;

  constructor(ai: any, model: string, timeout: number) {
    this.ai = ai;
    this.model = model;
    this.timeout = timeout;
  }

  async fetchUrlContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
      }
      
      const html = await response.text();
      return this.extractMainContent(html);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private extractMainContent(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = metaDesc ? metaDesc[1].trim() : '';
    
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogTitleText = ogTitle ? ogTitle[1].trim() : '';
    
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogDescText = ogDesc ? ogDesc[1].trim() : '';
    
    const headings = [];
    const h1Matches = html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
    for (const match of h1Matches) {
      headings.push(match[1].trim());
    }
    
    const content = [title, ogTitleText, description, ogDescText, ...headings].filter(Boolean).join('\n\n');
    
    if (content.length > 0) {
      return content;
    }
    
    const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                           .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                           .replace(/<[^>]+>/g, '\n')
                           .replace(/\s+/g, ' ')
                           .trim();
    
    return textContent.substring(0, 3000);
  }

  async summarizeUrl(url: string, maxLength: number): Promise<string> {
    const content = await this.fetchUrlContent(url);
    
    if (!content || content.length === 0) {
      throw new Error('No content found on page');
    }
    
    const prompt = `请阅读以下网页内容，并生成一个不超过${maxLength}字的简体中文摘要：

网页内容：
${content.substring(0, 4000)}

要求：
1. 用简体中文
2. 不超过${maxLength}字
3. 概括主要内容
4. 不要添加个人评论

摘要：`;

    return this.generateSummary(prompt);
  }

  async summarizeMessage(content: string, maxLength: number): Promise<string> {
    if (!content || content.length === 0) {
      return '无文本内容';
    }

    const prompt = `请阅读以下 Telegram 消息内容，并生成一个不超过${maxLength}字的简体中文摘要：

消息内容：
${content}

要求：
1. 用简体中文
2. 不超过${maxLength}字
3. 概括主要内容
4. 不要添加个人评论

摘要：`;

    return this.generateSummary(prompt);
  }

  private async generateSummary(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await this.ai.run(this.model, {
        messages: [
          { role: 'system', content: '你是一个专业的内容摘要助手，擅长生成简洁准确的中文摘要。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      }, { signal: controller.signal });
      
      clearTimeout(timeoutId);
      
      const summary = response.response?.trim() || response.result?.trim() || '';
      
      if (!summary) {
        throw new Error('AI generated empty summary');
      }
      
      return summary;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
