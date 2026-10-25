import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getExamForm } from "@/server/assessment/exam-admin";
import { ExamForm } from "../ExamTools";

export const dynamic = "force-dynamic";

export default async function NewExamPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const data = await getExamForm({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!data) redirect("/dashboard/aula");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <Link href={`/dashboard/aula/${data.course.id}/examenes`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">← Exámenes</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Crear examen</h1>
        <p className="mt-1 text-sm text-slate-600">Curso: {data.course.name}</p>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <ExamForm courseId={data.course.id} bank={data.bank} categories={data.categories} timezoneLabel={data.timezone.replaceAll("_", " ")} />
      </section>
    </div>
  );
}
