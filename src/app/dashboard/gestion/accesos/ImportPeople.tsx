"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { importPeopleAction, type PeopleImportState } from "@/server/actions/people-import";
import { plural } from "@/lib/ux";

type Summary = Extract<PeopleImportState, { ok: true }>;
type Request = { file: File; generation: number; confirm: boolean };
type Focus = "file" | "reviewButton" | "summary" | "error" | null;
const primary = "min-h-11 rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-[var(--navy)] disabled:opacity-60";
const partialWarning = "La importación pudo crear algunas personas. Vuelve a revisar este archivo antes de intentar de nuevo.";

function ImportSummary({ summary }: { summary: Summary }) {
  const done = summary.step === "done";
  return <>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {[
        ["Filas de datos", summary.totalLines],
        [done ? "Personas creadas" : "Personas nuevas que se crearán", summary.toCreate],
        ["Ya existían y no cambian", summary.alreadyExisted],
        ["Errores detectados", summary.rejected],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-white p-3">
        <dt className="text-slate-600">{label}</dt><dd className="mt-1 text-lg font-semibold text-[var(--navy)]">{value}</dd>
      </div>)}
    </dl>
    {(summary.rejected > 0 || summary.sampleErrors.length > 0 || summary.errorsCsv) && <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[var(--navy)]">
        Ver errores ({summary.rejected})
      </summary>
      <ul className="space-y-2 text-sm text-slate-700">
        {summary.sampleErrors.map((error, index) => <li key={`${error.line}-${index}`} className="[overflow-wrap:anywhere]">
          <strong>Fila {error.line} · {error.field}:</strong> {error.message}
        </li>)}
      </ul>
      {summary.errorsCsv && <a className="mt-2 inline-flex min-h-11 max-w-full items-center font-semibold text-[var(--blue)] underline"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(summary.errorsCsv)}`} download="filas-con-errores.csv">
        Descargar informe de errores
      </a>}
    </details>}
  </>;
}

/** La confirmación usa exclusivamente el mismo File de una revisión vigente; nunca reintenta una escritura sola. */
export function ImportPeople() {
  const router = useRouter();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const focus = useRef<Focus>(null);
  const generation = useRef(0);
  const request = useRef<Request | null>(null);
  const reviewedFile = useRef<File | null>(null);
  const uncertainFile = useRef<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [state, setState] = useState<PeopleImportState | null>(null);
  const [working, setWorking] = useState<"review" | "confirm" | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [resultFilename, setResultFilename] = useState("");
  const [, startTransition] = useTransition();
  const preview = state?.ok && state.step === "preview" ? state : null;
  const done = state?.ok && state.step === "done" ? state : null;

  useEffect(() => () => { generation.current += 1; request.current = null; }, []);
  useEffect(() => {
    if (working) return;
    const target = focus.current === "file" ? fileInput.current : focus.current === "reviewButton" ? reviewButton.current
      : focus.current === "summary" ? summaryHeading.current : focus.current === "error" ? errorBox.current : null;
    if (target) { target.focus(); focus.current = null; }
  }, [state, working, selectedFile]);

  function discardReview(nextFile: File | null, destination: Focus = null) {
    if (request.current?.confirm) return;
    generation.current += 1;
    request.current = null;
    reviewedFile.current = null;
    focus.current = destination;
    setWorking(null);
    setState(null);
    if (uncertainFile.current !== nextFile) uncertainFile.current = null;
    setUncertain(uncertainFile.current !== null);
    setSelectedFile(nextFile);
  }
  function cancelReview() { discardReview(fileInput.current?.files?.[0] ?? null, "reviewButton"); }
  function newImport() {
    if (fileInput.current) fileInput.current.value = "";
    discardReview(null, "file");
  }
  function failure(message: string, confirm: boolean) {
    reviewedFile.current = null;
    focus.current = "error";
    const file = fileInput.current?.files?.[0] ?? null;
    if (confirm) uncertainFile.current = file;
    setUncertain(uncertainFile.current !== null && uncertainFile.current === file);
    setState({ ok: false, message });
  }
  function run(confirm: boolean) {
    if (request.current) return;
    const file = fileInput.current?.files?.[0];
    if (!file) { failure("Elige primero el archivo CSV.", false); return; }
    if (confirm && (reviewedFile.current !== file || !preview || preview.toCreate === 0)) {
      failure("El archivo necesita una nueva revisión antes de crear personas.", false); return;
    }
    const current: Request = { file, confirm, generation: generation.current };
    request.current = current;
    if (!confirm) { reviewedFile.current = null; setState(null); }
    setWorking(confirm ? "confirm" : "review");
    const data = new FormData();
    data.set("file", current.file);
    if (confirm) data.set("confirm", "true");
    const isCurrent = () => request.current === current && generation.current === current.generation
      && fileInput.current?.files?.[0] === current.file;
    startTransition(async () => {
      try {
        const result = await importPeopleAction({ ok: false, message: "" }, data);
        if (!isCurrent()) return;
        if (!result.ok) { failure(result.message, confirm); return; }
        if (result.step !== (confirm ? "done" : "preview")) {
          failure("No pudimos confirmar el resultado de esta operación. Revisa de nuevo el archivo.", confirm); return;
        }
        const refresh = confirm || uncertainFile.current === current.file;
        uncertainFile.current = null;
        setUncertain(false);
        setResultFilename(current.file.name);
        focus.current = "summary";
        setState(result);
        if (confirm) {
          reviewedFile.current = null;
          if (fileInput.current) fileInput.current.value = "";
          setSelectedFile(null);
        } else reviewedFile.current = current.file;
        if (refresh) router.refresh();
      } catch {
        if (isCurrent()) failure(confirm ? "No se pudo confirmar cómo terminó la importación."
          : "No se pudo revisar el archivo. Comprueba la conexión y el formato CSV; si es grande, divídelo e intenta de nuevo.", confirm);
      } finally {
        if (request.current === current) { request.current = null; setWorking(null); }
      }
    });
  }

  return <div className="mt-4 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape" && (preview || working === "review") && working !== "confirm") {
      event.preventDefault(); cancelReview();
    }
  }}>
    <label htmlFor={`${id}-file`} className="block text-sm font-semibold text-[var(--navy)]">Archivo CSV</label>
    <input ref={fileInput} id={`${id}-file`} type="file" accept=".csv,text/csv" disabled={working === "confirm"}
      aria-describedby={`${id}-help`} onChange={() => discardReview(fileInput.current?.files?.[0] ?? null)}
      className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm" />
    <p id={`${id}-help`} className="mt-2 text-sm text-slate-600">
      Elige un CSV con las columnas Nombre y Correo. Revisar no crea personas ni envía correos.
    </p>
    {selectedFile && <p className="mt-2 text-sm text-slate-600 [overflow-wrap:anywhere]">
      Archivo seleccionado: <strong>{selectedFile.name}</strong>
    </p>}
    {!preview && !done && <div className="mt-3 flex flex-wrap gap-2">
      <button ref={reviewButton} type="button" className={primary} disabled={working !== null} onClick={() => run(false)}>
        {working === "review" ? "Revisando…" : "Revisar archivo"}
      </button>
      {working === "review" && <button type="button" className={secondary} onClick={cancelReview}>Cancelar revisión</button>}
    </div>}
    {state && !state.ok && <div ref={errorBox} tabIndex={-1} role="alert"
      className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 [overflow-wrap:anywhere]">
      <p className="font-semibold">{state.message}</p>
      {uncertain && <p className="mt-2">{partialWarning}</p>}
    </div>}
    {uncertain && !state && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      {partialWarning}
    </p>}
    {(preview ?? done) && <section aria-labelledby={`${id}-summary`} className="mt-4 min-w-0 rounded-xl bg-slate-50 p-4">
      <h3 ref={summaryHeading} tabIndex={-1} id={`${id}-summary`} className="text-lg font-semibold text-[var(--navy)]">
        {done ? "Importación completada" : "Revisar importación"}
      </h3>
      <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{resultFilename}</p>
      <ImportSummary summary={(preview ?? done)!} />
      {preview && <>
        <p className="mt-4 text-sm text-slate-700">
          Al confirmar se crearán las personas nuevas de este archivo. Las que ya existen no cambian.
          No se enviarán invitaciones automáticamente.
        </p>
        {preview.toCreate === 0 && <p className="mt-3 text-sm text-slate-700">
          No hay personas nuevas para crear. Revisa las filas con errores o elige otro archivo.
        </p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={working !== null || preview.toCreate === 0} onClick={() => run(true)}>
            {working === "confirm" ? "Creando personas…" : `Crear ${plural(preview.toCreate, "persona", "personas")}`}
          </button>
          <button type="button" className={secondary} disabled={working === "confirm"} onClick={cancelReview}>Cancelar revisión</button>
        </div>
      </>}
      {done && <>
        <p className="mt-4 text-sm text-slate-700">{done.message}</p>
        <p className="mt-2 text-sm text-slate-700">
          No se enviaron correos. Puedes revisar las personas y decidir después a quién invitar.
        </p>
        <button type="button" className={`${secondary} mt-4`} onClick={newImport}>Importar otro archivo</button>
      </>}
    </section>}
  </div>;
}
