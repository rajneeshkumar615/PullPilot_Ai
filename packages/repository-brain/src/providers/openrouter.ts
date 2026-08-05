import dotenv from "dotenv";
import path from "node:path";
import OpenAI from "openai";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY not found.");
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "PullPilot AI",
  },
});

export class OpenRouterProvider {
  async analyze(prompt: string): Promise<string> {
    const response = await client.chat.completions.create({
      model:
        process.env.OPENROUTER_MODEL ??
        "nvidia/nemotron-3-ultra-550b-a55b:free",

      messages: [
        {
          role: "system",
          content:
            "You are a Staff Software Engineer. Return ONLY valid JSON. Do not wrap the response in markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.2,
    });

    return response.choices[0]?.message?.content ?? "{}";
  }
}