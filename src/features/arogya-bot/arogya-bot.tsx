import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import {
  loadPatientClinicalHistory,
  loadPatientHistoryOptions,
  type PatientHistoryOption,
  type StaffContext,
} from "@/features/dashboard/data";
import type { PatientPortalData } from "@/features/patient-portal/data";
import {
  buildPatientDashboardContext,
  buildStaffPatientContext,
} from "./context";
import {
  AROGYA_LANGUAGES,
  AROGYA_LANGUAGE_STORAGE_KEY,
  findLanguage,
} from "./languages";
import { RichText } from "./rich-text";
import { askArogyaBot } from "./server";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

let messageSeq = 0;
function nextMessageId() {
  messageSeq += 1;
  return `arogya-${Date.now()}-${messageSeq}`;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Arogya Bot could not answer right now. Please try again.";
}

/**
 * Arogya Bot floats over every dashboard. On the patient portal it reads the
 * signed-in patient's dashboard; on staff dashboards the actor picks one of
 * their patients. Gemini turns that context into an answer or a summary in the
 * language the actor selects.
 */
export function ArogyaBot({
  ctx,
  patientData,
}: {
  ctx?: StaffContext;
  patientData?: PatientPortalData | null;
}) {
  const staffMode = Boolean(ctx);
  const [open, setOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState("en");
  const [patientOptions, setPatientOptions] = useState<PatientHistoryOption[]>(
    [],
  );
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [staffContext, setStaffContext] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const summaryCache = useRef(new Map<string, string>());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const language = findLanguage(languageCode);
  const actorName =
    (staffMode ? ctx?.fullName : patientData?.patientName)?.trim() || "there";

  const patientContext = useMemo(() => {
    if (!patientData || patientData.accessPending) return null;
    if (!patientData.patients.length) return null;
    return buildPatientDashboardContext(patientData);
  }, [patientData]);

  const context = staffMode ? staffContext : patientContext;

  useEffect(() => {
    // Some browsers block storage; that must never break the dashboard.
    try {
      const stored = window.localStorage.getItem(AROGYA_LANGUAGE_STORAGE_KEY);
      if (stored && AROGYA_LANGUAGES.some((item) => item.code === stored)) {
        setLanguageCode(stored);
      }
    } catch {
      /* ignore unavailable storage */
    }
  }, []);

  useEffect(() => {
    if (!ctx || !open) return;
    let cancelled = false;
    loadPatientHistoryOptions(ctx)
      .then((options) => {
        if (cancelled) return;
        setPatientOptions(options);
        setSelectedPatientId((current) => {
          if (current) return current;
          return options.length === 1 ? (options[0]?.id ?? "") : "";
        });
      })
      .catch((cause) => {
        if (!cancelled) setContextError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, open]);

  useEffect(() => {
    if (!ctx || !selectedPatientId) {
      setStaffContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    setStaffContext(null);
    loadPatientClinicalHistory(ctx, selectedPatientId)
      .then((history) => {
        if (!cancelled) setStaffContext(buildStaffPatientContext(history));
      })
      .catch((cause) => {
        if (!cancelled) setContextError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, selectedPatientId]);

  useEffect(() => {
    summaryCache.current.clear();
    setSummary(null);
    setSummaryError(null);
    setMessages([]);
  }, [context]);

  useEffect(() => {
    if (!open || !context) return;
    const cached = summaryCache.current.get(languageCode);
    if (cached) {
      setSummary(cached);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }
    const languageLabel = findLanguage(languageCode).label;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    askArogyaBot({
      data: {
        patientContext: context,
        languageLabel,
        actorName,
        question: null,
        history: [],
      },
    })
      .then(({ answer }) => {
        if (cancelled) return;
        summaryCache.current.set(languageCode, answer);
        setSummary(answer);
      })
      .catch((cause) => {
        if (!cancelled) setSummaryError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, context, languageCode, actorName]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, summary, summaryLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || !context || sending) return;
    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    }));
    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: "user", text: question },
    ]);
    setInput("");
    setSending(true);
    try {
      const { answer } = await askArogyaBot({
        data: {
          patientContext: context,
          languageLabel: language.label,
          actorName,
          question,
          history,
        },
      });
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", text: answer },
      ]);
    } catch (cause) {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", text: errorMessage(cause) },
      ]);
    } finally {
      setSending(false);
    }
  }

  function changeLanguage(code: string) {
    setLanguageCode(code);
    try {
      window.localStorage.setItem(AROGYA_LANGUAGE_STORAGE_KEY, code);
    } catch {
      /* ignore unavailable storage */
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Arogya Bot"
        className="fixed right-4 bottom-4 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:right-6 sm:bottom-6"
      >
        <Bot className="size-5" aria-hidden="true" />
        Arogya Bot
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Arogya Bot"
      className="fixed right-3 bottom-3 z-50 flex h-[min(620px,calc(100vh-1.5rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:right-6 sm:bottom-6"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              Arogya Bot
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Patient dashboard assistant
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Arogya Bot"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <label
          htmlFor="arogya-language"
          className="text-[11px] font-medium text-muted-foreground"
        >
          Language
        </label>
        <select
          id="arogya-language"
          value={languageCode}
          onChange={(event) => changeLanguage(event.currentTarget.value)}
          className="ml-auto h-7 max-w-[190px] rounded-lg border border-input bg-background px-2 text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {AROGYA_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} · {item.nativeLabel}
            </option>
          ))}
        </select>
      </div>

      {staffMode && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <label
            htmlFor="arogya-patient"
            className="text-[11px] font-medium text-muted-foreground"
          >
            Patient
          </label>
          <select
            id="arogya-patient"
            value={selectedPatientId}
            onChange={(event) =>
              setSelectedPatientId(event.currentTarget.value)
            }
            className="ml-auto h-7 max-w-[230px] rounded-lg border border-input bg-background px-2 text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a patient…</option>
            {patientOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.number ? ` · ${option.number}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        <section className="rounded-xl border border-primary/15 bg-gradient-to-br from-secondary/70 via-background to-background p-3.5 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Dashboard summary · {language.label}
          </p>
          {!context && !contextLoading ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {staffMode
                ? patientOptions.length
                  ? "Choose a patient above so Arogya Bot can read their dashboard and summarise it for you."
                  : "No patients are available in this workspace yet."
                : "Arogya Bot reads your patient dashboard. It is ready as soon as your record is loaded and approved by reception."}
            </p>
          ) : null}
          {contextLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Reading the patient dashboard…
            </p>
          )}
          {summaryLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Preparing the summary in {language.label}…
            </p>
          )}
          {summaryError && (
            <p className="mt-2 text-xs leading-relaxed text-destructive">
              {summaryError}
            </p>
          )}
          {summary && (
            <RichText
              text={summary}
              className="mt-2.5 space-y-2 text-xs leading-relaxed text-foreground"
            />
          )}
        </section>

        {contextError && staffMode && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {contextError}
          </p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-primary-foreground"
                : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground"
            }
          >
            {message.role === "assistant" ? (
              <RichText
                text={message.text}
                className="space-y-2 text-xs leading-relaxed text-foreground"
              />
            ) : (
              message.text
            )}
          </div>
        ))}
        {sending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Arogya Bot is thinking…
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-3 py-2.5"
      >
        <div className="flex items-end gap-2">
          <label htmlFor="arogya-question" className="sr-only">
            Ask Arogya Bot about this patient dashboard
          </label>
          <textarea
            id="arogya-question"
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            disabled={!context || sending}
            placeholder={
              context ? "Ask about these records…" : "Select a patient to start"
            }
            className="max-h-24 min-h-9 flex-1 resize-none rounded-xl border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!context || !input.trim() || sending}
            aria-label="Send question"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Arogya Bot explains dashboard records only. It does not diagnose or
          prescribe. For emergencies, contact your care team.
        </p>
      </form>
    </div>
  );
}
