import type {
  AIProvider,
  ChatMessage,
  ChatChunk,
  ChatResponse,
  ChatOptions,
  ModelInfo,
} from '@aris/shared';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@aris/shared';

interface OllamaModel {
  name: string;
  details?: { parameter_size?: string; family?: string };
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

const MULTIMODAL_FAMILIES = ['llava', 'bakllava', 'moondream'];

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';
  readonly supportsVision = true;
  readonly supportsStreaming = true;

  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const body = {
      model: options?.model ?? 'llama3.2',
      messages: this.prepareMessages(messages, options?.systemPrompt),
      stream: false,
      options: {
        num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as OllamaChatResponse;

    return {
      text: data.message.content,
      model: data.model,
      usage:
        data.prompt_eval_count != null
          ? { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count ?? 0 }
          : undefined,
    };
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const body = {
      model: options?.model ?? 'llama3.2',
      messages: this.prepareMessages(messages, options?.systemPrompt),
      stream: true,
      options: {
        num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error('Ollama returned no stream body');

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
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatResponse;
        if (chunk.message?.content) {
          yield { text: chunk.message.content, done: chunk.done };
        }
        if (chunk.done) return;
      }
    }

    yield { text: '', done: true };
  }

  async vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse> {
    const base64 = image.toString('base64');
    const model = options?.model ?? 'llava';

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [base64],
        },
      ],
      stream: false,
      options: {
        num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as OllamaChatResponse;

    return {
      text: data.message.content,
      model: data.model,
      usage:
        data.prompt_eval_count != null
          ? { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count ?? 0 }
          : undefined,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models: OllamaModel[] };
      return data.models.map((m) => ({
        id: m.name,
        name: m.name,
        supportsVision: MULTIMODAL_FAMILIES.some((f) => m.name.toLowerCase().includes(f)),
        contextLength: 4096,
      }));
    } catch {
      return [];
    }
  }

  private prepareMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): Array<{ role: string; content: string; images?: string[] }> {
    const result: Array<{ role: string; content: string; images?: string[] }> = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      const entry: { role: string; content: string; images?: string[] } = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.images?.length) {
        entry.images = msg.images.map((img: Buffer) => img.toString('base64'));
      }
      result.push(entry);
    }

    return result;
  }
}
