import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  ChatMessage,
  ChatChunk,
  ChatResponse,
  ChatOptions,
  ModelInfo,
} from '@aris/shared';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@aris/shared';

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  readonly name = 'Claude (Anthropic)';
  readonly supportsVision = true;
  readonly supportsStreaming = true;

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages);

    const response = await this.client.messages.create({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages);

    const stream = this.client.messages.stream({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { text: event.delta.text, done: false };
      }
    }
    yield { text: '', done: true };
  }

  async vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse> {
    const base64 = image.toString('base64');
    const mediaType = this.detectMediaType(image);

    const response = await this.client.messages.create({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', supportsVision: true, contextLength: 200000 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', supportsVision: true, contextLength: 200000 },
      { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4', supportsVision: true, contextLength: 200000 },
    ];
  }

  private prepareMessages(messages: ChatMessage[]): {
    systemPrompt: string | undefined;
    anthropicMessages: Anthropic.MessageParam[];
  } {
    let systemPrompt: string | undefined;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
        continue;
      }

      if (msg.images?.length) {
        const content: Anthropic.ContentBlockParam[] = msg.images.map((img: Buffer) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: this.detectMediaType(img),
            data: img.toString('base64'),
          },
        }));
        content.push({ type: 'text' as const, text: msg.content });
        anthropicMessages.push({ role: msg.role, content });
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    return { systemPrompt, anthropicMessages };
  }

  private detectMediaType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }
}
