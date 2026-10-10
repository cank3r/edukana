export function EdukanaFooter({ hidden = false }: { hidden?: boolean }) {
  if (hidden) return null;
  return <footer className="px-4 py-5 text-center text-xs text-slate-500">Hecho con Edukana</footer>;
}
