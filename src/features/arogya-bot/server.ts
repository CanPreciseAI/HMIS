import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Google retires Gemini models for existing keys over time, and a retired
 * model answers 404. Try the newest working Flash models in order and let
 * GEMINI_MODEL override the first choice without a code change.
 */
const DEFAULT_GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

function geminiModels() {
  const preferred = process.env["GEMINI_MODEL"]?.trim();
  return preferred
    ? [
        preferred,
        ...DEFAULT_GEMINI_MODELS.filter((model) => model !== preferred),
      ]
    : DEFAULT_GEMINI_MODELS;
}

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  patientContext: z.string().min(1).max(24000),
  languageLabel: z.string().min(2).max(60),
  actorName: z.string().trim().min(1).max(80),
  question: z.string().trim().max(2000).nullable(),
  history: z.array(messageSchema).max(20),
});

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
};

function buildSystemPrompt(
  context: string,
  languageLabel: string,
  actorName: string,
) {
  return [
    "You are Arogya Bot, a patient-friendly assistant inside a hospital management system.",
    `Answer entirely in ${languageLabel}, regardless of the language of these instructions.`,
    `You are talking to ${actorName}. Address ${actorName} by name naturally in the opening line of every answer, and use their name once when it fits. Never call them 'user' or 'patient' when you know their name.`,
    "Use only the PATIENT DASHBOARD CONTEXT below. Never invent values, diagnoses, medicines or dates.",
    "If the context does not contain something, say that it is not recorded in the dashboard and suggest asking the care team.",
    "You explain records in plain language. You never diagnose, never prescribe, and never advise changing medicines or doses.",
    "For worrying symptoms (chest pain, breathlessness, bleeding, fainting, high fever) advise contacting the care team or emergency services immediately.",
    "Keep answers short and structured. When asked for a summary, cover the current conditions, recent care, medicines, test results, allergies and anything that needs follow-up, then a brief conclusion of what this means for the patient.",
    "Format every answer as simple Markdown that renders well in a narrow chat panel: use '## ' for at most five section headings, a short opening sentence, '- ' for bullets, **bold** for key numbers or medicine names, and no tables, code blocks, emoji or links.",
    "Do not repeat the raw context back; interpret it kindly and simply.",
    "",
    "PATIENT DASHBOARD CONTEXT:",
    context,
  ].join("\n");
}

const SUMMARY_PROMPT =
  "Summarise this patient's dashboard for them. Greet the person by name in one warm line, then use '## ' headings with short '- ' bullets for: current conditions, recent care, medicines, test results, allergies and pending items. Bold the most important numbers, medicine names and dates. End with a '## What this means for you' conclusion and one or two sensible next steps (for example, resuming a follow-up visit). Keep it compact enough to read in a narrow panel. Do not give a new diagnosis.";

/**
 * Server-only Gemini call. The patient dashboard context is assembled in the
 * browser from rows the actor is already allowed to see, so this function
 * never touches the database or the API key on the client.
 */
export const askArogyaBot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Arogya Bot is not configured yet. Add GEMINI_API_KEY to the server environment and restart the app.",
      );
    }

    const contents = data.history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.text }],
    }));
    contents.push({
      role: "user",
      parts: [{ text: data.question ?? SUMMARY_PROMPT }],
    });

    const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: buildSystemPrompt(
              data.patientContext,
              data.languageLabel,
              data.actorName,
            ),
          },
        ],
      },
      contents,
      generationConfig: {
        temperature: 0.3,
        // Gemini 3 spends part of this budget on internal reasoning, so a
        // 1024-token cap truncates the summary after the first heading.
        maxOutputTokens: 2048,
      },
    });

    let response: Response | null = null;
    let lastStatus = 0;
    let lastDetail = "";
    let retryable = true;

    for (const model of geminiModels()) {
      try {
        response = await fetch(
          `${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(45_000),
            body: requestBody,
          },
        );
      } catch (cause) {
        console.error(
          `[Arogya Bot] Gemini request failed with ${model}`,
          cause,
        );
        response = null;
        lastStatus = 0;
        continue;
      }

      if (response.ok) break;

      lastStatus = response.status;
      lastDetail = await response.text();
      console.error(
        `[Arogya Bot] Gemini model ${model} returned ${response.status}: ${lastDetail.slice(0, 500)}`,
      );
      response = null;
      retryable = [404, 429, 503].includes(lastStatus);
      if (!retryable) break;
    }

    if (!response) {
      if (lastStatus === 404) {
        throw new Error(
          "Arogya Bot's Gemini model is no longer available. Set GEMINI_MODEL to a current Gemini model (for example gemini-3-flash-preview) in .env.local and restart the app.",
        );
      }
      if (lastStatus === 400 || lastStatus === 403) {
        throw new Error(
          "Arogya Bot could not use the configured Gemini API key. Check that GEMINI_API_KEY is valid and enabled for the Generative Language API.",
        );
      }
      if (lastStatus === 429) {
        throw new Error(
          "Arogya Bot has reached the Gemini API rate limit. Please wait a moment and try again.",
        );
      }
      throw new Error(
        "Arogya Bot is temporarily unavailable. Please try again in a moment.",
      );
    }

    const payload = (await response.json()) as GeminiResponse;
    const answer = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!answer) {
      console.error("[Arogya Bot] Empty Gemini response", payload);
      throw new Error(
        "Arogya Bot did not return an answer. Please rephrase your question and try again.",
      );
    }

    return { answer };
  });
