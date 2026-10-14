import { apiFetch } from './api';
import type { InterviewSession } from './interviewTypes';

export async function readApiJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}

export async function mutateInterview(id: string, action: string, body: unknown, options: {
  signal?: AbortSignal; onPreview?: (text: string) => void; onStatus?: (text: string) => void;
} = {}): Promise<InterviewSession> {
  const response = await apiFetch(`/api/interview/sessions/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', headers: { Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: options.signal,
  });
  if (!response.ok) await readApiJson(response);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return (await readApiJson<{ session: InterviewSession }>(response)).session;
  }
  if (!response.body) throw new Error('Streaming is unavailable. Retry this turn.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalSession: InterviewSession | undefined;
  const processEvent = (block: string) => {
    const lines = block.split('\n');
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'session') finalSession = payload.session;
    else if (event === 'delta') options.onPreview?.(payload.text);
    else if (event === 'status') options.onStatus?.(payload.message);
    else if (event === 'error') throw new Error(payload.error || 'The interview request failed.');
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      if (buffer.length > 256000) throw new Error('The interview response exceeded the allowed size.');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        processEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) { if (buffer.trim()) processEvent(buffer); break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!finalSession) throw new Error('The connection ended before this turn was saved. Refresh and retry.');
  return finalSession;
}
