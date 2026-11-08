import { NextRequest } from "next/server";
import { sessao } from "@/lib/auth";
import { relatorio, filtroDe } from "@/lib/relatorio";

export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s || s.papel !== "admin") return new Response("Sem acesso", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const r = await relatorio(filtroDe(sp));
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    ["Data", "Vídeo", "Cliente", "Formato", "Modo", "Status", "Duração (s)", "Estimado (R$)", "Real (R$)"].join(";"),
    ...r.videos.map((v) => [v.criadoEm.toISOString().slice(0, 10), v.titulo, v.empresa, v.formato, v.modo, v.status, v.duracao.toFixed(1), (v.estimado ?? 0).toFixed(2).replace(".", ","), v.real.toFixed(2).replace(".", ",")].map(esc).join(";")),
  ];
  return new Response("﻿" + linhas.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="custos-domma-avataria.csv"` } });
}
