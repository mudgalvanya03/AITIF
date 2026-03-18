/**
 * geminiClient.ts
 *
 * Handles all communication with Google Gemini Flash API.
 * Uses the free tier — no billing required.
 *
 * Setup:
 *   1. Get free API key at https://aistudio.google.com
 *   2. Add to your .env file: GEMINI_API_KEY=your_key_here
 *   3. Install dotenv: npm install dotenv
 */

import fetch from "node-fetch";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not found. Add it to your .env file.\n" +
      "Get a free key at: https://aistudio.google.com"
    );
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,      // Low temp = consistent, factual summaries
        maxOutputTokens: 2048,
      },
        
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text.trim();
}