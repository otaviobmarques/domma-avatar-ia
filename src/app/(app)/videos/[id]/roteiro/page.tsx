import { exigir } from "@/lib/auth";
import { carregarVideo } from "@/lib/pipeline";
import { Cabecalho } from "@/components/ui";
import { PassosVideo } from "../../PassosVideo";
import { EditorRoteiro } from "./EditorRoteiro";

export default async function Roteiro({ params }: { params: Promise<{ id: string }> }) {
  await exigir(["admin", "editor"]);
  const { id } = await params;
  const { video: v } = await carregarVideo(id);
  return (
    <>
      <Cabecalho titulo="Novo vídeo — Roteiro" sub={`${v.titulo} · alvo ${v.duracaoAlvo}s · ${v.proporcao}`} />
      <PassosVideo id={id} atual={1} />
      <EditorRoteiro id={id} duracaoAlvo={v.duracaoAlvo} briefingInicial={v.briefing ?? { produto: "", publico: "", oferta: "", cta: "" }} roteiroInicial={v.roteiro} />
    </>
  );
}
