import type {
  AIProvider,
  ChatMessage,
  ChatChunk,
  ChatResponse,
  ChatOptions,
  ModelInfo,
} from '@aris/shared';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@aris/shared';

interface LMStudioModel {
  id: string;
  object: string;
}

interface LMStudioModelsResponse {
  data: LMStudioModel[];
}

interface LMStudioChatChoice {
  message: { role: string; content: string };
  delta?: { content?: string };
  finish_reason: string | null;
}

interface LMStudioChatResponse {
  id: string;
  model: string;
  choices: LMStudioChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface LMStudioStreamChoice {
  delta: { content?: string };
  finish_reason: string | null;
}

interface LMStudioStreamChunk {
  model: string;
  choices: LMStudioStreamChoice[];
}

type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

interface PreparedMessage {
  role: string;
  content: MessageContent;
}

export class LMStudioProvider implements AIProvider {
  readonly id = 'lmstudio';
  readonly name = 'LM Studio (Local)';
  readonly supportsVision = true;
  readonly supportsStreaming = true;

  private baseUrl: string;
  private defaultModel: string;
  private resolvedModel: string | null = null;

  constructor(baseUrl = 'http://127.0.0.1:1234', defaultModel = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
  }

  private async throwOnError(res: Response): Promise<void> {
    if (res.ok) return;
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`LM Studio error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  private async resolveModel(requested?: string): Promise<string> {
    const model = requested ?? this.defaultModel;
    if (model) return model;
    if (this.resolvedModel) return this.resolvedModel;
    const models = await this.getModels();
    if (models.length === 0) throw new Error('No models loaded in LM Studio. Load a model first.');
    this.resolvedModel = models[0].id;
    return this.resolvedModel;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const body = {
      model: await this.resolveModel(options?.model),
      messages: this.prepareMessages(messages, options?.systemPrompt),
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await this.throwOnError(res);
    const data = (await res.json()) as LMStudioChatResponse;

    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? '',
      model: data.model,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const body = {
      model: await this.resolveModel(options?.model),
      messages: this.prepareMessages(messages, options?.systemPrompt),
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      stream: true,
    };

    const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await this.throwOnError(res);
    if (!res.body) throw new Error('LM Studio returned no stream body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;
        const chunk = JSON.parse(payload) as LMStudioStreamChunk;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield { text: delta, done: false };
        }
        if (chunk.choices[0]?.finish_reason != null) return;
      }
    }

    yield { text: '', done: true };
  }

  async vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse> {
    const base64 = image.toString('base64');
    const mediaType = this.detectMediaType(image);

    const body = {
      model: await this.resolveModel(options?.model),
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
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await this.throwOnError(res);
    const data = (await res.json()) as LMStudioChatResponse;

    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? '',
      model: data.model,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/models`);
      if (!res.ok) return false;
      const data = (await res.json()) as LMStudioModelsResponse;
      return Array.isArray(data.data) && data.data.length > 0;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as LMStudioModelsResponse;
      return data.data.map((m) => ({
        id: m.id,
        name: m.id,
        supportsVision: false,
        contextLength: 4096,
      }));
    } catch {
      return [];
    }
  }

  private prepareMessages(messages: ChatMessage[], systemPrompt?: string): PreparedMessage[] {
    const result: PreparedMessage[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
        continue;
      }

      if (msg.images?.length) {
        const content: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string } }
        > = msg.images.map((img: Buffer) => ({
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
