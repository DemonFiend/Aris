import OpenAI from 'openai';
import type {
  AIProvider,
  ChatMessage,
  ChatChunk,
  ChatResponse,
  ChatOptions,
  ModelInfo,
} from '@aris/shared';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@aris/shared';

export class CustomOpenAIProvider implements AIProvider {
  readonly id = 'custom-openai';
  readonly name = 'Custom OpenAI-compatible';
  readonly supportsVision = true;
  readonly supportsStreaming = true;

  private client: OpenAI;
  private defaultModel: string;

  constructor(baseUrl: string, apiKey?: string, defaultModel = 'gpt-3.5-turbo') {
    this.client = new OpenAI({
      apiKey: apiKey || 'not-needed',
      baseURL: baseUrl.replace(/\/$/, ''),
    });
    this.defaultModel = defaultModel;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const openaiMessages = this.prepareMessages(messages, options?.systemPrompt);

    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      messages: openaiMessages,
    });

    const choice = response.choices[0];
    return {
      text: choice?.message?.content ?? '',
      model: response.model,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const openaiMessages = this.prepareMessages(messages, options?.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      messages: openaiMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { text: delta, done: false };
      }
    }
    yield { text: '', done: true };
  }

  async vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse> {
    const base64 = image.toString('base64');
    const mediaType = this.detectMediaType(image);

    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mediaType};base64,${base64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const choice = response.choices[0];
    return {
      text: choice?.message?.content ?? '',
      model: response.model,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const list = await this.client.models.list();
      const chatModels: ModelInfo[] = [];
      for await (const model of list) {
        chatModels.push({
          id: model.id,
          name: model.id,
          supportsVision: false,
          contextLength: 4096,
        });
      }
      return chatModels.length > 0
        ? chatModels
        : [{ id: this.defaultModel, name: this.defaultModel, supportsVision: false, contextLength: 4096 }];
    } catch {
      return [{ id: this.defaultModel, name: this.defaultModel, supportsVision: false, contextLength: 4096 }];
    }
  }

  private prepareMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
        continue;
      }

      if (msg.images?.length) {
        const content: OpenAI.ChatCompletionContentPart[] = msg.images.map((img: Buffer) => ({
          type: 'image_url' as const,
          image_url: {
            url: `data:${this.detectMediaType(img)};base64,${img.toString('base64')}`,
          },
        }));
        content.push({ type: 'text' as const, text: msg.content });
        result.push({ role: 'user', content });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }

  private detectMediaType(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }
}
