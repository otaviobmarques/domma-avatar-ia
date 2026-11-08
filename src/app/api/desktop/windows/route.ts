import { ultimaVersaoWindows, PAGINA_RELEASES } from "@/lib/desktop";

/** Link fixo de download: sempre aponta para o instalador mais recente. */
export async function GET() {
  const v = await ultimaVersaoWindows();
  return Response.redirect(v?.url ?? PAGINA_RELEASES, 302);
}
