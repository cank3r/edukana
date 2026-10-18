import React from "react";
import { hydrateRoot } from "react-dom/client";
import { SubmitWithFiles } from "../../src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/SubmissionFiles";

type Result = { ok: boolean; message: string };
type PackedNode = string | number | boolean | null | undefined | PackedNode[]
  | { html: string } | { tag: string | null; key: string | null; props: Record<string, unknown>; children: PackedNode };
type Props = React.ComponentProps<typeof SubmitWithFiles> & { canSubmit?: boolean };
type Layout = { viewport: number; scrollWidth: number; clipped: string[];
  targets: { label: string | null; width: number; height: number }[] };
type Fixture = {
  calls: Array<Array<[string, string]>>; requests: Array<{ method: string; path: string; body?: unknown }>;
  navigation: string[]; forbidden: string[]; mode: "ok" | "false" | "throw" | "hold";
  holdUpload: boolean; removeMode: "ok" | "false" | "hold"; failedUploadName: string;
  submit(data: FormData): Promise<Result>; releaseSubmit(result: Result): void; rejectSubmit(): void;
  releaseUpload(): void; releaseRemove(ok: boolean): void; updateProps(props: Partial<Props>): void;
  measureLayout(): Layout;
  measureContrast(): { borders: number[]; text: number[]; focus: number };
};
declare global { interface Window { assignmentFixture: Fixture } }
const context: Fixture = {
  calls: [], requests: [], navigation: [], forbidden: [], mode: "ok", holdUpload: false,
  removeMode: "ok", failedUploadName: "", releaseSubmit() { throw new Error("No pending submission"); },
  rejectSubmit() { throw new Error("No pending submission"); },
  releaseUpload() { throw new Error("No pending upload"); }, releaseRemove() { throw new Error("No pending removal"); },
  updateProps() { throw new Error("Boundary not hydrated"); },
  measureLayout() {
    const clipped: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || parent.closest(".sr-only,textarea,input,select") || !parent.getClientRects().length) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const box of Array.from(range.getClientRects())) {
        if (box.left < -1 || box.right > innerWidth + 1) clipped.push(node.textContent.trim());
        for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), boundary = ancestor.getBoundingClientRect();
          if (/(hidden|clip)/.test(css.overflowX) && (box.left < boundary.left - 1 || box.right > boundary.right + 1)) {
            clipped.push(node.textContent.trim());
          }
        }
      }
    }
    const targets = Array.from(document.querySelectorAll<HTMLElement>(
      'main button,main a,main input,main textarea,main summary,main label:has(input[type="file"])'))
      .filter(element => !element.closest("[hidden],.sr-only") && element.getBoundingClientRect().height > 0)
      .map(element => {
        const target = element instanceof HTMLInputElement && ["checkbox", "file"].includes(element.type) ? element.labels?.[0] : element;
        const box = target!.getBoundingClientRect(); return { label: target!.textContent?.trim() || element.getAttribute("name"),
          width: box.width, height: box.height };
      });
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, clipped: [...new Set(clipped)], targets };
  },
  measureContrast() {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const luminance = (color: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
      const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(channel => {
        const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const background = (element: Element): string => {
      const color = getComputedStyle(element).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      return element.parentElement ? background(element.parentElement) : "white";
    };
    const ratio = (foreground: string, element: Element) => {
      const values = [luminance(foreground), luminance(background(element))].sort((a, b) => a - b);
      return (values[1] + 0.05) / (values[0] + 0.05);
    };
    const boundary = document.querySelector("[data-assignment-boundary]")!;
    const visible = (element: Element) => !element.closest("[hidden],.sr-only") && Boolean(element.getClientRects().length);
    const borders = Array.from(boundary.querySelectorAll('textarea,input[type="url"]')).filter(visible)
      .map(element => ratio(getComputedStyle(element).borderTopColor, element));
    const text = Array.from(boundary.querySelectorAll("label,legend,p,button")).filter(visible)
      .map(element => ratio(getComputedStyle(element).color, element));
    const active = document.activeElement!;
    return { borders, text, focus: ratio(getComputedStyle(active).outlineColor, active) };
  },
  async submit(data) {
    const fields = Array.from(data.entries()).map(([key, value]) => {
      if (!["assignmentId", "content", "link", "assetIds"].includes(key) || typeof value !== "string") {
        throw new Error("Unexpected action payload");
      }
      return [key, value] as [string, string];
    });
    context.calls.push(fields);
    if (context.mode === "hold") return new Promise((resolve, reject) => {
      context.releaseSubmit = resolve; context.rejectSubmit = () => reject(new Error("Respuesta simulada perdida."));
    });
    if (context.mode === "throw") throw new Error("Respuesta simulada no disponible.");
    if (context.mode === "false") return { ok: false, message: "No pudimos confirmar la entrega. Revisa tu trabajo antes de intentarlo de nuevo." };
    return { ok: true, message: new URLSearchParams(location.search).get("scene") === "current"
      ? "Entrega actualizada. Tu docente podrá revisarla." : "Tarea entregada. Tu docente podrá revisarla." };
  },
};
window.assignmentFixture = context;
let serial = 0;
const reservations = new Map<string, { name: string }>();
// uploadFile/formatFileSize remain real. Only the network boundary is replaced, before any request can leave the page.
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  const method = options.method ?? "GET";
  const deny = () => { context.forbidden.push(`${method} ${url.href}`); throw new Error("Network forbidden by assignment fixture"); };
  if (url.origin !== location.origin) return deny();
  if (url.pathname === "/api/uploads" && method === "POST") {
    const body = JSON.parse(String(options.body));
    if (body.purpose !== "submission" || body.assignmentId !== "assignment-fixture" || body.courseId !== null) return deny();
    const id = `uploaded-fixture-${++serial}`; reservations.set(id, body);
    context.requests.push({ method, path: url.pathname, body });
    return Response.json({ assetId: id, uploadUrl: `/fixture-upload/${id}` });
  }
  const match = url.pathname.match(/^\/(api\/uploads|fixture-upload)\/((?:uploaded-fixture-\d+|pending-fixture))$/);
  if (!match || !["PUT", "PATCH", "DELETE"].includes(method)) return deny();
  context.requests.push({ method, path: url.pathname });
  const [, route, id] = match;
  if (id !== "pending-fixture" && !reservations.has(id)) return deny();
  if (method === "PUT" && route === "fixture-upload") {
    if (context.holdUpload) await new Promise<void>(resolve => { context.releaseUpload = resolve; });
    return new Response(null, { status: reservations.get(id)?.name === context.failedUploadName ? 500 : 200 });
  }
  if (method === "PATCH" && route === "api/uploads") return new Response(null, { status: 200 });
  if (method === "DELETE" && route === "api/uploads") {
    const ok = context.removeMode === "hold" ? await new Promise<boolean>(resolve => { context.releaseRemove = resolve; })
      : context.removeMode !== "false";
    return new Response(null, { status: ok ? 200 : 500 });
  }
  return deny();
};
document.addEventListener("click", event => {
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor) return;
  event.preventDefault(); context.navigation.push(anchor.getAttribute("href") ?? "");
});
function decode(node: PackedNode): React.ReactNode {
  if (Array.isArray(node)) return node.map((value, key) => {
    const child = decode(value); return React.isValidElement(child) && child.key === null ? React.cloneElement(child, { key }) : child;
  });
  if (!node || typeof node !== "object") return node;
  if ("html" in node) {
    const template = document.createElement("template"); template.innerHTML = node.html;
    function fromDom(child: ChildNode, index: number): React.ReactNode {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent;
      if (!(child instanceof Element)) return null;
      if (["SCRIPT", "IFRAME"].includes(child.tagName)) throw new Error("Executable slot content forbidden");
      const props: Record<string, unknown> = { key: index };
      for (const attribute of Array.from(child.attributes)) {
        const key = attribute.name === "class" ? "className" : attribute.name === "for" ? "htmlFor"
          : /^(aria|data)-/.test(attribute.name) ? attribute.name : attribute.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (key === "style") throw new Error("Inline slot styles require an explicit adapter");
        if (/^on/i.test(key)) throw new Error("Slot event handler forbidden");
        props[key] = attribute.value;
      }
      return React.createElement(child.localName, props, ...Array.from(child.childNodes).map(fromDom));
    }
    return Array.from(template.content.childNodes).map(fromDom);
  }
  return React.createElement(node.tag ?? React.Fragment, { ...node.props, ...(node.key == null ? {} : { key: node.key }) }, decode(node.children));
}
for (const container of document.querySelectorAll<HTMLElement>("[data-assignment-boundary]")) {
  const packed = JSON.parse(container.dataset.props!);
  let props = { ...packed, savedSummary: decode(packed.savedSummary), readOnlyContent: decode(packed.readOnlyContent) } as Props;
  function HydratedSubmission(current: Props) {
    React.useEffect(() => { container.dataset.hydrated = "true"; }, []);
    return <SubmitWithFiles {...current} />;
  }
  const root = hydrateRoot(container, <HydratedSubmission key={props.assignmentId} {...props} />, {
    onRecoverableError(error) { container.dataset.hydrationError = String(error); },
  });
  context.updateProps = update => { props = { ...props, ...update }; root.render(<HydratedSubmission key={props.assignmentId} {...props} />); };
}
