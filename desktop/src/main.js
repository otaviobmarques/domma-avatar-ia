// Domma AvatarIA — aplicativo para Windows (Domma Tecnologia)
// Abre o sistema numa janela própria, com câmera/microfone liberados para o domínio oficial,
// tela de "sem conexão" e atualização automática pelas Releases do GitHub.
const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");

const URL_SISTEMA = process.env.DOMMA_URL || "https://avataria.dommasistemas.com.br";
const ORIGEM = new URL(URL_SISTEMA).origin;
const ARQ_JANELA = () => path.join(app.getPath("userData"), "janela.json");

app.setAppUserModelId("br.com.dommasistemas.avataria");
nativeTheme.themeSource = "light";

/** @type {BrowserWindow | null} */
let janela = null;

// Uma instância só: abrir de novo traz a janela para frente
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });
}

function lerJanela() {
  try { return JSON.parse(fs.readFileSync(ARQ_JANELA(), "utf8")); } catch { return { width: 1400, height: 880 }; }
}
function salvarJanela() {
  if (!janela || janela.isDestroyed()) return;
  try {
    fs.writeFileSync(ARQ_JANELA(), JSON.stringify({ ...janela.getNormalBounds(), maximizado: janela.isMaximized() }));
  } catch { /* sem problema */ }
}

const doSistema = (url) => {
  try { return new URL(url).origin === ORIGEM; } catch { return false; }
};

function paginaLocal(nome) {
  return path.join(__dirname, "paginas", nome);
}

function carregarSistema() {
  if (!janela) return;
  janela.loadURL(URL_SISTEMA).catch(() => {});
}

function criarJanela() {
  const salvo = lerJanela();
  janela = new BrowserWindow({
    ...salvo,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "Domma AvatarIA",
    backgroundColor: "#1e1238",
    icon: path.join(__dirname, "icone.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (salvo.maximizado) janela.maximize();

  // Tela de abertura enquanto o sistema carrega
  janela.loadFile(paginaLocal("carregando.html")).then(() => {
    janela.show();
    carregarSistema();
  });

  // Sem internet / servidor fora → tela amigável com "Tentar de novo"
  janela.webContents.on("did-fail-load", (_e, codigo, _desc, url, principal) => {
    if (!principal || codigo === -3 /* abortado */ || !doSistema(url)) return;
    janela.loadFile(paginaLocal("offline.html"));
  });

  // Links externos abrem no navegador; os do sistema ficam no app
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (doSistema(url)) {
      // Link de aprovação e downloads: abre no navegador padrão para o cliente compartilhar
      shell.openExternal(url);
      return { action: "deny" };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  janela.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file:")) return;
    if (!doSistema(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  // Só para testes automatizados: DOMMA_CAPTURA=arquivo.png salva a tela depois de carregar e fecha
  if (process.env.DOMMA_CAPTURA) {
    janela.webContents.on("did-finish-load", () => {
      if (!janela.webContents.getURL().startsWith("http")) return;
      setTimeout(async () => {
        fs.writeFileSync(process.env.DOMMA_CAPTURA, (await janela.capturePage()).toPNG());
        console.log("CAPTURA", janela.webContents.getURL(), await janela.webContents.executeJavaScript("typeof window.dommaDesktop"));
        app.quit();
      }, 4000);
    });
  }

  janela.on("close", salvarJanela);
  janela.on("closed", () => { janela = null; });
}

/** Câmera e microfone (gravação do avatar) só para o domínio oficial. */
function configurarPermissoes() {
  const permitidas = new Set(["media", "clipboard-sanitized-write", "clipboard-read", "notifications", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((wc, permissao, responder) => {
    responder(doSistema(wc.getURL()) && permitidas.has(permissao));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permissao, origem) => {
    return (origem === ORIGEM || (wc && doSistema(wc.getURL()))) && permitidas.has(permissao);
  });
  // Downloads (MP4, CSV): pergunta onde salvar e avisa ao terminar
  session.defaultSession.on("will-download", (_e, item) => {
    item.once("done", (_ev, estado) => {
      if (estado === "completed") {
        const arquivo = item.getSavePath();
        dialog.showMessageBox(janela, { type: "info", title: "Download concluído", message: path.basename(arquivo), buttons: ["Abrir pasta", "OK"] })
          .then((r) => { if (r.response === 0) shell.showItemInFolder(arquivo); });
      }
    });
  });
}

function configurarMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "Arquivo",
      submenu: [
        { label: "Início", accelerator: "Ctrl+H", click: () => janela?.loadURL(URL_SISTEMA) },
        { label: "Novo vídeo", accelerator: "Ctrl+N", click: () => janela?.loadURL(`${URL_SISTEMA}/videos/novo`) },
        { type: "separator" },
        { label: "Imprimir…", accelerator: "Ctrl+P", click: () => janela?.webContents.print() },
        { type: "separator" },
        { label: "Sair", role: "quit" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", role: "undo" }, { label: "Refazer", role: "redo" }, { type: "separator" },
        { label: "Recortar", role: "cut" }, { label: "Copiar", role: "copy" }, { label: "Colar", role: "paste" }, { label: "Selecionar tudo", role: "selectAll" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { label: "Recarregar", accelerator: "F5", click: () => janela?.webContents.reload() },
        { type: "separator" },
        { label: "Aumentar zoom", role: "zoomIn", accelerator: "Ctrl+=" },
        { label: "Diminuir zoom", role: "zoomOut" },
        { label: "Tamanho normal", role: "resetZoom" },
        { type: "separator" },
        { label: "Tela cheia", role: "togglefullscreen" },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        { label: "Abrir no navegador", click: () => shell.openExternal(janela?.webContents.getURL().startsWith("http") ? janela.webContents.getURL() : URL_SISTEMA) },
        { label: "Verificar atualizações", click: () => verificarAtualizacoes(true) },
        { type: "separator" },
        {
          label: "Sobre o Domma AvatarIA",
          click: () => dialog.showMessageBox(janela, {
            type: "info", title: "Domma AvatarIA",
            message: `Domma AvatarIA ${app.getVersion()}`,
            detail: `Domma Tecnologia\n${URL_SISTEMA}`,
          }),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

/* ---------- Atualização automática (Releases do GitHub) ---------- */
let avisarSemNovidade = false;
function verificarAtualizacoes(manual = false) {
  if (!app.isPackaged) {
    if (manual) dialog.showMessageBox(janela, { message: "Atualizações só funcionam no aplicativo instalado." });
    return;
  }
  avisarSemNovidade = manual;
  autoUpdater.checkForUpdates().catch((e) => {
    if (manual) dialog.showMessageBox(janela, { type: "warning", message: "Não foi possível verificar atualizações agora.", detail: String(e?.message ?? e) });
  });
}
function configurarAtualizacoes() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-not-available", () => {
    if (avisarSemNovidade) dialog.showMessageBox(janela, { message: "Você já está na versão mais recente." });
    avisarSemNovidade = false;
  });
  autoUpdater.on("update-downloaded", (info) => {
    dialog.showMessageBox(janela, {
      type: "info", title: "Atualização pronta",
      message: `A versão ${info.version} do Domma AvatarIA foi baixada.`,
      detail: "Reinicie para instalar agora, ou ela será instalada quando você fechar o aplicativo.",
      buttons: ["Reiniciar agora", "Depois"], defaultId: 0,
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  verificarAtualizacoes(false);
  setInterval(() => verificarAtualizacoes(false), 6 * 60 * 60 * 1000);
}

ipcMain.on("tentar-de-novo", () => carregarSistema());
ipcMain.handle("info-app", () => ({ versao: app.getVersion(), url: URL_SISTEMA }));

app.whenReady().then(() => {
  configurarPermissoes();
  configurarMenu();
  criarJanela();
  configurarAtualizacoes();
});

app.on("window-all-closed", () => app.quit());
