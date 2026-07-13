const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

/**
 * Calls Ollama's /api/chat endpoint with tool definitions.
 * Returns the assistant message object: { role, content, tool_calls? }
 */
export async function chat({ model, messages, tools }) {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: false,
      options: {
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.message;
}
