// Ponte mínima entre o sistema (web) e o aplicativo — sem acesso ao Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dommaDesktop", {
  plataforma: process.platform,
  info: () => ipcRenderer.invoke("info-app"),
  tentarDeNovo: () => ipcRenderer.send("tentar-de-novo"),
});
