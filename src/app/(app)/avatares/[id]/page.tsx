import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { urlRelativa } from "@/lib/storage";
import { carregarContexto, disponibilidade } from "@/lib/orquestrador";
import { textoTermo, TEXTO_LEITURA } from "@/lib/termo";
import { Cabecalho, Passos } from "@/components/ui";
import { Assistente } from "./Assistente";

export default async function AvatarPagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ passo?: string }> }) {
  const s = await exigir(["admin", "editor"]);
  const { id } = await params;
  const db = await getDb();
  const [a] = await db.select().from(schema.avatares).where(eq(schema.avatares.id, id));
  if (!a || a.status === "excluido") notFound();
  const [emp] = a.empresaId ? await db.select().from(schema.empresas).where(eq(schema.empresas.id, a.empresaId)) : [];
  const ctx = await carregarContexto();
  const ordem = ["rascunho", "consentido", "verificado", "amostras", "pronto"];
  const sugerido = Math.min(4, ordem.indexOf(a.status));
  const passo = Math.max(0, Math.min(4, Number((await searchParams).passo ?? sugerido + 1) - 1));
  const motores = ["voicestudio", "elevenlabs", "kling", "heygen"].map((p) => ({ id: p, ok: disponibilidade(ctx, p).ok }));
  const passos = ["Consentimento", "Verificação ao vivo", "Rosto", "Voz", "Motores e teste"].map((n, i) => ({ nome: n, href: i <= sugerido + 1 ? `/avatares/${id}?passo=${i + 1}` : undefined }));
  return (
    <>
      <Cabecalho titulo={a.nome} sub={`${emp?.nome ?? ""} · ${a.status === "pronto" ? "Avatar pronto para uso" : "Criar avatar em 5 passos"}`} />
      <Passos passos={passos} atual={passo} />
      <Assistente
        passo={passo}
        admin={s.papel === "admin"}
        demo={ctx.config.modoDemo}
        motores={motores}
        termoModelo={textoTermo({ nome: a.consentimento?.nome ?? "", cpf: a.consentimento?.cpf ?? "", finalidade: a.consentimento?.finalidade ?? "", prazoMeses: a.consentimento?.prazoMeses ?? 12, empresa: emp?.nome ?? "" })}
        empresa={emp?.nome ?? ""}
        textoLeitura={TEXTO_LEITURA}
        avatar={{
          id: a.id, nome: a.nome, status: a.status, consentimento: a.consentimento, validade: a.consentimentoValidade?.toISOString() ?? null,
          verificacao: a.verificacao ? { ...a.verificacao, video: urlRelativa(a.verificacao.video) ?? undefined } : null,
          foto: a.foto, fotos: a.amostras.fotos.map((f) => ({ caminho: f, url: urlRelativa(f)! })), video: urlRelativa(a.amostras.video), videoDuracao: a.amostras.videoDuracao ?? null,
          voz: urlRelativa(a.amostras.voz), vozDuracao: a.amostras.vozDuracao ?? null, vozRuidoDb: a.amostras.vozRuidoDb ?? null, checklist: a.amostras.checklist ?? {},
          modelos: a.modelos, motorVoz: a.motorVoz, motorAvatar: a.motorAvatar,
        }}
      />
    </>
  );
}
