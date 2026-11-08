import { exigir } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { Menu } from "@/components/Menu";
import { acaoSair } from "@/app/acoes/sessao";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigir();
  const cfg = await lerConfig();
  return (
    <div className="min-h-screen">
      <Menu nome={s.nome} papel={s.papel} sistema={cfg.nomeSistema} demo={cfg.modoDemo} sair={acaoSair} />
      <main className="px-4 pb-16 pt-16 md:ml-60 md:px-8 md:pt-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
