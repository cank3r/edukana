"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startExamAttemptAction, submitExamAttemptAction, type StartExamState } from "@/server/actions/exams";

const primary = "min-h-11 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-800 disabled:opacity-60";

export type RunnerQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  prompt: string;
  points: number;
  options: string[];
};

const notStarted: StartExamState = { ok: false, message: "" };

/** Botón «Iniciar examen». Al iniciar, la página se vuelve a cargar y muestra el intento en curso. */
export function StartExam({ examId }: { examId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startExamAttemptAction, notStarted);
  const started = state.ok;
  useEffect(() => {
    if (started) router.refresh();
  }, [started, router]);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="examId" value={examId} />
      <button type="submit" className={`${primary} w-full sm:w-auto`} disabled={pending || started}>
        {pending || started ? "Preparando tu examen…" : "Iniciar examen"}
      </button>
      {!state.ok && state.message && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    </form>
  );
}

type Answers = Record<string, string>;

function readSaved(key: string): Answers {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function writeSaved(key: string, answers: Answers | null) {
  try {
    if (answers) window.sessionStorage.setItem(key, JSON.stringify(answers));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Sin almacenamiento (modo privado o lleno) el examen sigue funcionando; solo no sobrevive a una recarga.
  }
}

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

const subscribe = () => () => {};

type RunnerProps = {
  attemptId: string;
  title: string;
  /** Tiempo que quedaba según el servidor cuando armó la página. */
  remainingMs: number;
  questions: RunnerQuestion[];
  resultHref: string;
};

/**
 * Examen en curso. Se dibuja solo en el navegador para poder recuperar, antes del primer
 * dibujo, las respuestas guardadas de este intento.
 */
export function ExamRunner(props: RunnerProps) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  if (!inBrowser) return <p className="p-4 text-slate-600 sm:p-8">Cargando tu examen…</p>;
  return <Runner {...props} />;
}

function Runner({ attemptId, title, remainingMs, questions, resultHref }: RunnerProps) {
  const router = useRouter();
  const storageKey = `edukana:examen:${attemptId}`;
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  const [answers, setAnswers] = useState<Answers>(() => readSaved(storageKey));
  const answersRef = useRef<Answers | null>(null);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [warning, setWarning] = useState("");
  const [phase, setPhase] = useState<"answering" | "confirming" | "sending" | "error" | "sent">("answering");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  const timeUp = remaining <= 0;
  const locked = timeUp || phase === "sending" || phase === "sent";
  const answered = questions.filter((question) => (answers[question.id] ?? "").trim() !== "").length;
  const unanswered = questions.length - answered;

  function setAnswer(id: string, value: string) {
    const next = { ...(answersRef.current ?? answers), [id]: value };
    answersRef.current = next;
    setAnswers(next);
    writeSaved(storageKey, next);
  }

  const submit = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("sending");
    setError("");
    const current = answersRef.current ?? readSaved(storageKey);
    const data = new FormData();
    data.set("attemptId", attemptId);
    for (const [id, value] of Object.entries(current)) {
      if (value.trim() !== "") data.set(`question_${id}`, value);
    }
    try {
      const result = await submitExamAttemptAction({ ok: false, message: "" }, data);
      if (result.ok) {
        writeSaved(storageKey, null);
        setPhase("sent");
        router.replace(resultHref);
        return;
      }
      setError(result.message);
    } catch {
      setError("No se pudo enviar: parece que no hay conexión. Tus respuestas siguen guardadas aquí. Revisa tu internet y vuelve a intentarlo.");
    }
    setPhase("error");
    busy.current = false;
  }, [attemptId, resultHref, router, storageKey]);

  useEffect(() => {
    // Se mide el tiempo transcurrido desde que cargó la página y se resta de lo que el servidor dijo que quedaba.
    const startedAt = Date.now();
    let warned = totalSeconds <= 60 ? 2 : totalSeconds <= 300 ? 1 : 0;
    let finished = false;
    const tick = () => {
      const left = Math.max(0, totalSeconds - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left <= 60 && warned < 2) {
        warned = 2;
        setWarning("Queda 1 minuto. Al terminar el tiempo, el examen se envía solo.");
      } else if (left <= 300 && warned < 1) {
        warned = 1;
        setWarning("Quedan 5 minutos.");
      }
      if (left <= 0 && !finished) {
        finished = true;
        window.clearInterval(timer);
        setWarning("Se acabó el tiempo. Estamos enviando lo que respondiste.");
        void submit();
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [totalSeconds, submit]);

  useEffect(() => {
    if (phase === "confirming") confirmRef.current?.focus();
  }, [phase]);

  const urgent = remaining <= 60;
  return (
    <div className="mx-auto max-w-2xl p-4 pb-24 sm:p-8 sm:pb-24">
      <div className={`sticky top-0 z-10 -mx-4 border-b px-4 py-3 sm:-mx-8 sm:px-8 ${urgent ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">Respondidas {answered} de {questions.length}</p>
          <p className={`text-xl font-bold tabular-nums ${urgent ? "text-red-700" : "text-slate-950"}`} role="timer" aria-live="off">
            <span className="sr-only">Tiempo restante: </span>{clock(remaining)}
          </p>
        </div>
        <p aria-live="polite" className={warning ? `mt-1 text-sm font-semibold ${urgent ? "text-red-800" : "text-amber-800"}` : "sr-only"}>{warning}</p>
      </div>

      <h1 className="mt-5 text-2xl font-bold" style={{ color: "var(--navy)" }}>{title}</h1>

      <form
        className="mt-4 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked) setPhase("confirming");
        }}
      >
        {questions.map((question, index) => (
          <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            {question.type === "SHORT_ANSWER" ? (
              <label className="block">
                <span className="block text-base font-semibold text-slate-950">{index + 1}. {question.prompt}</span>
                <span className="mt-1 block text-sm text-slate-500">Escribe tu respuesta. La revisa tu docente.</span>
                <textarea
                  className="mt-3 block w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-blue-500 disabled:bg-slate-100"
                  rows={4}
                  maxLength={20000}
                  value={answers[question.id] ?? ""}
                  disabled={locked}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                />
              </label>
            ) : (
              <fieldset disabled={locked}>
                <legend className="text-base font-semibold text-slate-950">{index + 1}. {question.prompt}</legend>
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => {
                    const chosen = answers[question.id] === option;
                    return (
                      <label key={option} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-base ${chosen ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}>
                        <input
                          type="radio"
                          className="h-5 w-5 shrink-0"
                          name={`pregunta-${question.id}`}
                          value={option}
                          checked={chosen}
                          onChange={() => setAnswer(question.id, option)}
                        />
                        <span className="min-w-0 break-words">{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        ))}

        {phase === "answering" && !timeUp && (
          <button type="submit" className={`${primary} w-full`}>Enviar examen</button>
        )}
      </form>

      {phase === "confirming" && !timeUp && (
        <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-labelledby="confirmar-envio" className="mt-5 rounded-xl border-2 border-blue-600 bg-white p-5 outline-none">
          <h2 id="confirmar-envio" className="text-lg font-bold text-slate-950">¿Enviar el examen ahora?</h2>
          <p className="mt-2 text-slate-700">
            {unanswered === 0
              ? "Respondiste todas las preguntas."
              : unanswered === 1
                ? "Te falta 1 pregunta por responder. Si envías ahora, queda sin puntos."
                : `Te faltan ${unanswered} preguntas por responder. Si envías ahora, quedan sin puntos.`}{" "}
            Después de enviar no podrás cambiar tus respuestas.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={primary} onClick={() => void submit()}>Sí, enviar examen</button>
            <button type="button" className={secondary} onClick={() => setPhase("answering")}>Seguir respondiendo</button>
          </div>
        </div>
      )}

      {(phase === "sending" || phase === "sent") && (
        <p role="status" className="mt-5 rounded-lg bg-slate-100 p-4 font-medium text-slate-800">Enviando tu examen… No cierres esta página.</p>
      )}

      {phase === "error" && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-900">{error}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={primary} onClick={() => void submit()}>Intentar enviar de nuevo</button>
            {!timeUp && <button type="button" className={secondary} onClick={() => setPhase("answering")}>Seguir respondiendo</button>}
            <Link className={`${secondary} inline-flex items-center justify-center`} href={resultHref}>Ver mi resultado</Link>
          </div>
        </div>
      )}
    </div>
  );
}
