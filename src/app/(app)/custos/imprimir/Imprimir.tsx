"use client";
import { useEffect } from "react";
export function Imprimir() {
  useEffect(() => { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }, []);
  return <button onClick={() => window.print()} className="mb-4 rounded-lg border px-3 py-1.5 text-sm print:hidden">Imprimir / salvar PDF</button>;
}
