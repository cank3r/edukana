import Link from "next/link";
import type { PublicBrand } from "@/server/catalog/public";

/** Encabezado de las páginas públicas con la marca de la institución. */
export function BrandHeader({ brand }: { brand: PublicBrand }) {
  const accent = brand.brandColor ?? "var(--blue)";
  return (
    <header className="border-b border-slate-200 bg-white" style={{ borderTop: `4px solid ${accent}` }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link href={`/catalogo/${brand.slug}`} className="flex min-h-11 min-w-0 items-center gap-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo externo de la institución
            <img src={brand.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          ) : (
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white" style={{ background: accent }}>
              {brand.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate text-lg font-bold" style={{ color: "var(--navy)" }}>{brand.name}</span>
        </Link>
        <Link href="/login" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800">Entrar</Link>
      </div>
    </header>
  );
}

export function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return <span className="text-slate-500">Sin reseñas todavía</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Valoración ${rating.toLocaleString("es")} de 5, ${count} ${count === 1 ? "reseña" : "reseñas"}`}>
      <span aria-hidden className="text-amber-500">★</span>
      <strong className="text-slate-900">{rating.toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
      <span className="text-slate-500">({count})</span>
    </span>
  );
}
