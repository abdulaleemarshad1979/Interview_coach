import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';
import { ServiceError, safeError } from '../errors';

export interface AIMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface TokenUsage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface JsonCompletionOptions {
  messages: AIMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  purpose?: 'interview' | 'report' | 'discussion';
  /** Raw provider deltas are provisional until the caller validates the full object. */
  onDelta?: (text: string) => void;
}
export interface JsonCompletionResult {
  value: unknown;
  usage: TokenUsage;
  model: string;
  provider: string;
}
export interface TranscriptionOptions {
  audio: Buffer;
  mimeType: string;
  filename?: string;
  signal?: AbortSignal;
}
export interface AIProvider {
  completeJson(options: JsonCompletionOptions): Promise<JsonCompletionResult>;
  transcribe(options: TranscriptionOptions): Promise<{ text: string; source: string }>;
}

let client: Groq | undefined;
let clientKey: string | undefined;
let activeRequests = 0;

function numericEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function groqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new ServiceError(503, 'PROVIDER_NOT_CONFIGURED', 'Groq is not configured. Ask the administrator to configure GROQ_API_KEY.');
  if (!client || clientKey !== apiKey) {
    client = new Groq({ apiKey, maxRetries: 2, timeout: 30000 });
    clientKey = apiKey;
  }
  return client;
}

function requestSignal(signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(numericEnv('AI_REQUEST_TIMEOUT_MS', 60000, 1000, 120000));
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

async function bounded<T>(fn: () => Promise<T>): Promise<T> {
  // This protects local CPU/network concurrency; shared API abuse limits are imposed by middleware.
  if (activeRequests >= numericEnv('AI_MAX_CONCURRENT_REQUESTS', 6, 1, 32)) {
    throw new ServiceError(429, 'AI_BUSY', 'All AI request slots are busy. Please retry shortly.', true);
  }
  activeRequests++;
  try { return await fn(); }
  catch (error) { throw safeError(error); }
  finally { activeRequests--; }
}

export function parseProviderJson(raw: string): unknown {
  if (raw.length > 120000) throw new ServiceError(502, 'INVALID_AI_RESPONSE', 'The AI response exceeded the allowed size.', true);
  const text = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Object required');
    return result;
  } catch {
    throw new ServiceError(502, 'INVALID_AI_RESPONSE', 'The AI response did not contain valid structured data. Please retry.', true);
  }
}

function tokenUsage(usage: any): TokenUsage {
  const valid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  return {
    promptTokens: valid(usage?.prompt_tokens ?? usage?.prompt_eval_count),
    completionTokens: valid(usage?.completion_tokens ?? usage?.eval_count),
    totalTokens: valid(usage?.total_tokens ?? ((usage?.prompt_eval_count || 0) + (usage?.eval_count || 0))),
  };
}

async function groqCompletion(options: JsonCompletionOptions): Promise<JsonCompletionResult> {
  const groq = groqClient();
  const model = (options.purpose === 'report' || options.purpose === 'discussion' ? process.env.GROQ_MODEL_REPORT : process.env.GROQ_MODEL_CHAT)
    || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const signal = requestSignal(options.signal);
  const params = {
    model, messages: options.messages, response_format: { type: 'json_object' as const },
    temperature: options.purpose === 'interview' ? 0.45 : 0.2,
    max_completion_tokens: options.maxTokens || 3000,
  };
  const requestOptions = { signal, timeout: 30000, maxRetries: 2 };
  if (!options.onDelta) {
    const result = await groq.chat.completions.create({ ...params, stream: false }, requestOptions);
    if (result.choices[0]?.finish_reason === 'length') throw new ServiceError(502, 'INCOMPLETE_AI_RESPONSE', 'The AI response was cut off. Please retry.', true);
    return { value: parseProviderJson(result.choices[0]?.message?.content || ''), usage: tokenUsage(result.usage), model, provider: 'groq' };
  }
  const stream = await groq.chat.completions.create({ ...params, stream: true }, requestOptions);
  let raw = '';
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let finishReason: string | null = null;
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      raw += delta;
      if (raw.length > 120000) throw new ServiceError(502, 'INVALID_AI_RESPONSE', 'The AI response exceeded the allowed size.', true);
      if (delta) options.onDelta(delta);
      if (chunk.x_groq?.usage) usage = tokenUsage(chunk.x_groq.usage);
      if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    }
  } finally {
    stream.controller.abort();
  }
  if (finishReason === 'length') throw new ServiceError(502, 'INCOMPLETE_AI_RESPONSE', 'The AI response was cut off. Please retry.', true);
  return { value: parseProviderJson(raw), usage, model, provider: 'groq' };
}

async function retryFetch(url: string, init: RequestInit, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, { ...init, signal });
      if (response.ok) return response;
      if (![408, 409, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw Object.assign(new Error('Provider request failed'), { status: response.status });
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await response.body?.cancel();
      await delay(Math.min(5000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 300 * 2 ** attempt + Math.random() * 200), signal);
    } catch (error) {
      if (signal.aborted || attempt === 2 || (error as any).status) throw error;
      await delay(300 * 2 ** attempt + Math.random() * 200, signal);
    }
  }
  throw new ServiceError(502, 'PROVIDER_UNAVAILABLE', 'The AI provider is unavailable.', true);
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function compatibleCompletion(options: JsonCompletionOptions, provider: string): Promise<JsonCompletionResult> {
  const ollama = provider === 'ollama';
  const baseUrl = (ollama ? process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' : process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = ollama ? process.env.OLLAMA_AUTH_TOKEN : process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!ollama && !apiKey) throw new ServiceError(503, 'PROVIDER_NOT_CONFIGURED', 'The selected AI provider is not configured.');
  const defaultModel = ollama ? process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b' : process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';
  const model = (options.purpose === 'interview' ? (ollama ? process.env.OLLAMA_MODEL_CHAT : process.env.OPENAI_MODEL_CHAT) : (ollama ? process.env.OLLAMA_MODEL_REPORT : process.env.OPENAI_MODEL_REPORT)) || defaultModel;
  const payload: any = { model, messages: options.messages, stream: Boolean(options.onDelta) };
  if (ollama) { payload.format = 'json'; payload.options = { temperature: 0.3, num_predict: options.maxTokens || 3000 }; }
  else { payload.response_format = { type: 'json_object' }; payload.max_tokens = options.maxTokens || 3000; payload.temperature = 0.3; if (options.onDelta) payload.stream_options = { include_usage: true }; }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const signal = requestSignal(options.signal);
  const response = await retryFetch(`${baseUrl}${ollama ? '/api/chat' : '/chat/completions'}`, { method: 'POST', headers, body: JSON.stringify(payload) }, signal);
  if (!options.onDelta) {
    const result: any = await response.json();
    return { value: parseProviderJson(ollama ? result.message?.content || '' : result.choices?.[0]?.message?.content || ''), usage: tokenUsage(ollama ? result : result.usage), model, provider };
  }
  if (!response.body) throw new ServiceError(502, 'INVALID_AI_RESPONSE', 'No AI stream was returned.', true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let raw = '';
  let usage = tokenUsage(null);
  const consume = (line: string) => {
    const source = ollama ? line.trim() : line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!source || source === '[DONE]') return;
    const item = JSON.parse(source);
    if (item.error) throw new ServiceError(502, 'PROVIDER_UNAVAILABLE', 'The AI stream failed.', true);
    const delta = ollama ? item.message?.content || '' : item.choices?.[0]?.delta?.content || '';
    raw += delta;
    if (raw.length > 120000) throw new ServiceError(502, 'INVALID_AI_RESPONSE', 'The AI response exceeded the allowed size.', true);
    if (delta) options.onDelta?.(delta);
    if (ollama && item.done) usage = tokenUsage(item);
    else if (item.usage) usage = tokenUsage(item.usage);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { value: parseProviderJson(raw), usage, model, provider };
}

async function transcribe(options: TranscriptionOptions): Promise<{ text: string; source: string }> {
  if (!/^audio\/(webm|wav|ogg|mp4|mpeg|mp3|x-m4a)(;.*)?$/i.test(options.mimeType) || options.audio.length < 512 || options.audio.length > 10 * 1024 * 1024) {
    throw new ServiceError(400, 'INVALID_AUDIO', 'Provide supported audio between 512 bytes and 10 MB.');
  }
  const signal = requestSignal(options.signal);
  const ext = options.mimeType.includes('wav') ? 'wav' : options.mimeType.includes('ogg') ? 'ogg' : options.mimeType.includes('mp4') || options.mimeType.includes('m4a') ? 'm4a' : options.mimeType.includes('mpeg') || options.mimeType.includes('mp3') ? 'mp3' : 'webm';
  if (process.env.GROQ_API_KEY) {
    const result = await groqClient().audio.transcriptions.create({
      file: await toFile(options.audio, `speech.${ext}`, { type: options.mimeType }),
      model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
      language: 'en', response_format: 'json', temperature: 0,
    }, { signal, timeout: 30000, maxRetries: 2 });
    return { text: String(result.text || '').slice(0, 24000), source: 'groq' };
  }
  if (!process.env.LOCAL_STT_URL) throw new ServiceError(503, 'STT_NOT_CONFIGURED', 'No speech recognizer is configured.');
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(options.audio)], { type: options.mimeType }), `speech.${ext}`);
  const response = await retryFetch(process.env.LOCAL_STT_URL, { method: 'POST', body: form }, signal);
  const result: any = await response.json();
  return { text: String(result.text || '').slice(0, 24000), source: 'local' };
}

export function createAIProvider(): AIProvider {
  return {
    completeJson: options => bounded(async () => {
      const signal = requestSignal(options.signal);
      const provider = process.env.AI_PROVIDER || 'groq';
      if (!['groq', 'openai', 'litellm', 'ollama'].includes(provider)) throw new ServiceError(503, 'PROVIDER_CONFIGURATION', 'The selected AI provider is unsupported.');
      try {
        return await (provider === 'groq' ? groqCompletion({ ...options, signal }) : compatibleCompletion({ ...options, signal }, provider));
      } catch (error) {
        if (options.signal?.aborted) throw new ServiceError(499, 'CANCELLED', 'The request was cancelled. Your saved answers are available to resume.', true);
        if (signal.aborted) throw new ServiceError(504, 'PROVIDER_TIMEOUT', 'The AI provider timed out. Please retry.', true);
        throw error;
      }
    }),
    transcribe: options => bounded(async () => {
      const signal = requestSignal(options.signal);
      try { return await transcribe({ ...options, signal }); }
      catch (error) {
        if (options.signal?.aborted) throw new ServiceError(499, 'CANCELLED', 'Transcription was cancelled.', true);
        if (signal.aborted) throw new ServiceError(504, 'PROVIDER_TIMEOUT', 'Transcription timed out. Please retry.', true);
        throw error;
      }
    }),
  };
}
