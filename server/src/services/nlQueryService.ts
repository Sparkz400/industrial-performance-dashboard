import config from "../config/config.js";
import logger from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type {
  NLQueryResponse,
  NLChartConfig,
} from "@performance-dashboard/shared";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
}

async function callClaude(
  messages: ClaudeMessage[],
  system: string,
): Promise<string> {
  const apiKey = config.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "Natural language queries are not configured. Set ANTHROPIC_API_KEY.",
      503,
      "NL_NOT_CONFIGURED",
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Claude API error: ${response.status} ${errorBody}`);
    throw new AppError("AI query service unavailable", 502, "NL_API_ERROR");
  }

  const data = (await response.json()) as ClaudeResponse;
  const textBlock = data.content.find((c) => c.type === "text");
  return textBlock?.text || "";
}

const SYSTEM_PROMPT = `You are an AI assistant for an industrial performance monitoring dashboard.
The database has these tables:
- opcua_data: columns (id, node_key, node_label, timestamp, value, machine_id) — time-series sensor data
- machines: columns (id, name, endpoint_url, ip, port, status, is_active)
- dashboards: columns (id, name, widgets, layout, created_at, updated_at)
- node_mappings: columns (id, machine_id, node_id, node_key, display_name, data_type, sampling_interval, is_active)

When the user asks a question about data, respond with a JSON object containing:
{
  "answer": "Human-readable answer to the question",
  "sql": "A safe, read-only SELECT query if applicable (no INSERT/UPDATE/DELETE)",
  "chartConfig": { "type": "line|bar|pie", "title": "Chart Title", "xAxis": "column_name", "yAxis": "column_name" } or null
}

Always wrap your JSON response in \`\`\`json code blocks.
Only generate SELECT queries. Never generate mutations.
Use parameterized-style references for user values (e.g., $1 placeholders described in your answer).
If the question is about the UI or unrelated to data, just provide the answer field with helpful guidance.`;

export const nlQueryService = {
  async processQuery(
    query: string,
    machineId?: number,
  ): Promise<NLQueryResponse> {
    const userMessage = machineId
      ? `Machine ID: ${machineId}\n\nUser question: ${query}`
      : `User question: ${query}`;

    const responseText = await callClaude(
      [{ role: "user", content: userMessage }],
      SYSTEM_PROMPT,
    );

    // Parse the JSON from the response
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      return { answer: responseText, chartConfig: null, data: [] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const data: unknown[] = [];
      const chartConfig: NLChartConfig | null = parsed.chartConfig || null;
      const sqlGenerated =
        typeof parsed.sql === "string" && parsed.sql.trim() !== ""
          ? parsed.sql.trim()
          : undefined;

      return {
        answer: parsed.answer,
        sqlGenerated,
        chartConfig,
        data,
      };
    } catch {
      return { answer: responseText, chartConfig: null, data: [] };
    }
  },
};
