import type { ReactNode } from "react";
import { safeAnnouncementHref } from "@/lib/announcements";

type Props = { content: string; mentionIds?: ReadonlySet<string> };

function inline(text: string, mentionIds: ReadonlySet<string>, keyPrefix: string): ReactNode[] {
  const pattern = /(@\[([^\]]+)\]\(user:([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, match] of [...text.matchAll(pattern)].entries()) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    if (match[2] && match[3]) {
      nodes.push(mentionIds.has(match[3]) ? <span className="rounded bg-blue-50 px-1 font-semibold text-blue-700" key={`${keyPrefix}-m-${index}`}>@{match[2]}</span> : `@${match[2]}`);
    } else if (match[4] && match[5]) {
      const href = safeAnnouncementHref(match[5]);
      nodes.push(href ? <a className="font-medium text-blue-700 underline underline-offset-2" href={href} key={`${keyPrefix}-l-${index}`} rel="noopener noreferrer" target={href.startsWith("https:") ? "_blank" : undefined}>{match[4]}</a> : match[4]);
    } else if (match[6]) {
      nodes.push(<strong key={`${keyPrefix}-b-${index}`}>{match[6]}</strong>);
    } else if (match[7]) {
      nodes.push(<em key={`${keyPrefix}-i-${index}`}>{match[7]}</em>);
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function AnnouncementContent({ content, mentionIds = new Set<string>() }: Props) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[]; start: number } | null = null;
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag className={`ml-5 ${list.ordered ? "list-decimal" : "list-disc"}`} key={`list-${list.start}`}>{list.items.map((item, index) => <li key={`${list!.start}-${index}`}>{inline(item, mentionIds, `li-${list!.start}-${index}`)}</li>)}</Tag>);
    list = null;
  };

  lines.forEach((line, index) => {
    const item = line.match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
    if (item) {
      const ordered = Boolean(item[1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [], start: index }; }
      list.items.push(item[2]);
      return;
    }
    flushList();
    if (!line.trim()) return;
    if (line.startsWith("### ")) blocks.push(<h4 className="text-base font-bold" key={index}>{inline(line.slice(4), mentionIds, `h3-${index}`)}</h4>);
    else if (line.startsWith("## ")) blocks.push(<h3 className="text-lg font-bold" key={index}>{inline(line.slice(3), mentionIds, `h2-${index}`)}</h3>);
    else if (line.startsWith("# ")) blocks.push(<h2 className="text-xl font-bold" key={index}>{inline(line.slice(2), mentionIds, `h1-${index}`)}</h2>);
    else if (line.startsWith("> ")) blocks.push(<blockquote className="border-l-4 border-slate-300 pl-3 italic text-slate-600" key={index}>{inline(line.slice(2), mentionIds, `q-${index}`)}</blockquote>);
    else blocks.push(<p key={index}>{inline(line, mentionIds, `p-${index}`)}</p>);
  });
  flushList();
  return <div className="space-y-2 break-words text-sm leading-relaxed text-slate-700">{blocks}</div>;
}
