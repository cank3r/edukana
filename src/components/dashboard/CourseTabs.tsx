"use client";

import { useEffect, useState } from "react";
import { COURSE_MORE_AREAS, COURSE_TABS } from "@/lib/ux";

const TABS_WITHOUT_ROSTER = COURSE_TABS.filter((tab) => tab.href !== "#estudiantes");

export default function CourseTabs({ showRoster = true }: { showRoster?: boolean }) {
  const [active, setActive] = useState("#resumen");
  const visibleTabs = showRoster ? COURSE_TABS : TABS_WITHOUT_ROSTER;

  useEffect(() => {
    const sections = [...visibleTabs.map((tab) => tab.href), "#horario", "#certificados"]
      .map((id) => document.querySelector(id))
      .filter((section): section is Element => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(`#${visible.target.id}`);
    }, { rootMargin: "-25% 0px -65%", threshold: [0, 0.1, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [visibleTabs]);

  const linkClass = (href: string) => `course-tab whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active === href ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`;

  return (
    <nav aria-label="Espacios del curso" className="sticky top-0 z-20 -mx-4 mb-7 border-y border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur sm:-mx-8 sm:px-8">
      <div className="md:hidden">
        <label className="mb-1 block text-sm font-semibold text-slate-800" htmlFor="course-section-selector">Ir a una sección del curso</label>
        <select id="course-section-selector" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900" value={active} onChange={(event) => { setActive(event.target.value); window.location.hash = event.target.value; }}>
          <optgroup label="Áreas principales">{visibleTabs.map((tab) => <option value={tab.href} key={tab.href}>{tab.label}</option>)}</optgroup>
          <optgroup label="Más áreas">{COURSE_MORE_AREAS.map((tab) => <option value={tab.href} key={tab.href}>{tab.label}</option>)}</optgroup>
        </select>
      </div>
      <div className="hidden items-center gap-1 overflow-x-auto md:flex">
        {visibleTabs.map((tab) => <a aria-current={active === tab.href ? "location" : undefined} className={linkClass(tab.href)} href={tab.href} key={tab.href}>{tab.label}</a>)}
        <details className="relative shrink-0">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Más <span aria-hidden="true">▾</span></summary>
          <div className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {COURSE_MORE_AREAS.map((tab) => <a className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100" href={tab.href} key={tab.href}>{tab.label}</a>)}
          </div>
        </details>
      </div>
    </nav>
  );
}
