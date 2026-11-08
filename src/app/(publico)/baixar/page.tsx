import Link from "next/link";
import { Download, Monitor, ShieldCheck, RefreshCw, Camera, ArrowLeft, Info } from "lucide-react";
import { Logo, Simbolo } from "@/components/Logo";
import { ultimaVersaoWindows, PAGINA_RELEASES } from "@/lib/desktop";
import { data } from "@/lib/formato";

export const revalidate = 600;
export const metadata = { title: "Baixar para Windows — Domma AvatarIA" };

const VANTAGENS = [
  { icone: Monitor, titulo: "Janela própria", texto: "Ícone na área de trabalho e no Menu Iniciar, sem abas do navegador." },
  { icone: Camera, titulo: "Câmera e microfone prontos", texto: "Grave a verificação e a voz do avatar sem pedir permissão toda vez." },
  { icone: RefreshCw, titulo: "Atualiza sozinho", texto: "Quando sair versão nova, o aplicativo baixa e instala automaticamente." },
  { icone: ShieldCheck, titulo: "Mesmo sistema, mesma conta", texto: "Seus vídeos, avatares e integrações são os mesmos do site." },
];

export default async function Baixar() {
  const v = await ultimaVersaoWindows();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca-600 hover:underline"><ArrowLeft size={15} />Voltar ao sistema</Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <section className="surgir relative overflow-hidden rounded-3xl bg-tinta px-8 py-12 text-white shadow-suave md:px-12">
          <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-marca-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-marca-700/40 blur-3xl" />
          <Simbolo tamanho={380} ponto="#ffffff" className="pointer-events-none absolute -right-10 bottom-6 opacity-[0.08]" />
          <div className="relative max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-marca-100"><Monitor size={13} />Windows 10 e 11 · 64 bits</div>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Domma AvatarIA no seu computador</h1>
            <p className="mt-3 text-slate-300">Instale o aplicativo e abra o estúdio de gêmeos digitais direto da área de trabalho.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="/api/desktop/windows" className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-6 py-3.5 text-base font-bold text-tinta shadow-suave transition hover:bg-marca-50">
                <Download size={20} />Baixar para Windows
              </a>
              <div className="text-sm text-slate-300">
                {v ? <>Versão {v.versao} · {v.tamanhoMb} MB · {data(v.publicadaEm)}</> : <a href={PAGINA_RELEASES} className="underline">Ver versões disponíveis</a>}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VANTAGENS.map((x) => (
            <div key={x.titulo} className="cartao surgir p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-marca-50 text-marca-600 ring-1 ring-marca-100"><x.icone size={19} /></div>
              <div className="font-titulo font-bold text-tinta">{x.titulo}</div>
              <p className="mt-1 text-sm text-slate-500">{x.texto}</p>
            </div>
          ))}
        </div>

        <section className="cartao surgir mt-8 p-6 md:p-8">
          <h2 className="text-xl font-extrabold text-tinta">Como instalar</h2>
          <ol className="mt-5 grid gap-5 md:grid-cols-3">
            {[
              ["Baixe o instalador", "Clique em “Baixar para Windows” e abra o arquivo Domma-AvatarIA-Setup.exe."],
              ["Confirme o Windows", "Se aparecer “O Windows protegeu o computador”, clique em “Mais informações” e depois em “Executar assim mesmo”."],
              ["Pronto", "Escolha a pasta, conclua e entre com o seu usuário e senha de sempre."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marca-500 to-marca-700 font-titulo text-sm font-extrabold text-white shadow-marca">{i + 1}</div>
                <div><div className="font-semibold text-tinta">{t}</div><p className="mt-0.5 text-sm text-slate-500">{d}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            <p>O aviso do Windows aparece porque o aplicativo ainda não tem certificado de assinatura digital — é normal em aplicativos novos e some quando o certificado da Domma Tecnologia for instalado.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
