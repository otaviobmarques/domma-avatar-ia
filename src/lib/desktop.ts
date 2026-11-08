/** Última versão do aplicativo de Windows publicada nas Releases do GitHub. */
export const REPO_DESKTOP = "otaviobmarques/domma-avatar-ia";
export const PAGINA_RELEASES = `https://github.com/${REPO_DESKTOP}/releases/latest`;

export type VersaoDesktop = { versao: string; url: string; tamanhoMb: number; publicadaEm: string } | null;

export async function ultimaVersaoWindows(): Promise<VersaoDesktop> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_DESKTOP}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "domma-avataria" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { tag_name: string; published_at: string; assets: { name: string; browser_download_url: string; size: number }[] };
    const exe = j.assets.find((a) => /setup.*\.exe$/i.test(a.name)) ?? j.assets.find((a) => a.name.endsWith(".exe"));
    if (!exe) return null;
    return { versao: j.tag_name.replace(/^desktop-v|^v/, ""), url: exe.browser_download_url, tamanhoMb: Math.round(exe.size / 1048576), publicadaEm: j.published_at };
  } catch { return null; }
}
