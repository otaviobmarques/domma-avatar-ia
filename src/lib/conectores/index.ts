import { SignJWT } from "jose";
import Anthropic from "@anthropic-ai/sdk";
import { http, ErroProvedor, type Credenciais } from "../integracoes";

export type Palavra = { palavra: string; inicio: number; fim: number };
export type Saldo = { valor: number; unidade: string } | null;
export type Teste = { ok: boolean; mensagem: string; saldo?: Saldo };
export type Tarefa = { status: "rodando" | "ok" | "erro"; url?: string; erro?: string; headers?: Record<string, string> };
export type Prop = "9:16" | "16:9" | "1:1";

/**
 * Camada única de conectores (seção 2.2): o resto do sistema só fala com esta interface.
 * Trocar/adicionar um motor = implementar um Conector novo + cadastrar no catálogo.
 */
export interface Conector {
  testar(c: Credenciais): Promise<Teste>;
  saldo?(c: Credenciais): Promise<Saldo>;
  voz?(c: Credenciais, e: { texto: string; vozId: string; modelo: string }): Promise<{ audio: Buffer; ext: string; palavras?: Palavra[] }>;
  clonarVoz?(c: Credenciais, e: { nome: string; amostra: Buffer; nomeArquivo: string }): Promise<string>;
  excluirVoz?(c: Credenciais, vozId: string): Promise<void>;
  avatar?(c: Credenciais, e: { modelo: string; fotoUrl: string | null; audioUrl: string; avatarId?: string; proporcao: Prop; fundoUrl?: string | null; prompt?: string }): Promise<string>;
  cena?(c: Credenciais, e: { modelo: string; prompt: string; imagemUrl?: string | null; duracao: number; proporcao: Prop }): Promise<string>;
  imagem?(c: Credenciais, e: { modelo: string; prompt: string; proporcao: Prop }): Promise<string>;
  consultar?(c: Credenciais, tarefa: string): Promise<Tarefa>;
  servidor?(c: Credenciais, acao: "ligar" | "desligar" | "status"): Promise<string>;
  olhar?(c: Credenciais, e: { videoUrl: string; intensidade: number }): Promise<Buffer>;
}

const exigirChave = (c: Credenciais) => {
  if (!c.apiKey) throw new ErroProvedor("Chave não cadastrada", 401, false, false);
  return c.apiKey;
};
const base = (c: Credenciais, padrao: string) => (c.endpoint || padrao).replace(/\/$/, "");
const json = async <T>(r: Response) => (await r.json()) as T;
const caminho = (c: Credenciais, k: string, padrao: string) => c.extra?.[k] || padrao;

/* ---------------- Anthropic ---------------- */
const anthropic: Conector = {
  async testar(c) {
    const cli = new Anthropic({ apiKey: exigirChave(c) });
    const m = await cli.models.list({ limit: 1 });
    return { ok: true, mensagem: `OK — ${m.data.length ? `acesso a ${m.data[0].id}` : "chave válida"}` };
  },
};

/* ---------------- ElevenLabs ---------------- */
const EL = "https://api.elevenlabs.io";
function palavrasDeCaracteres(chars: string[], ini: number[], fim: number[]): Palavra[] {
  const out: Palavra[] = [];
  let atual = "", i0 = 0;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (atual) out.push({ palavra: atual, inicio: i0, fim: fim[i - 1] ?? ini[i] }); atual = ""; return; }
    if (!atual) i0 = ini[i];
    atual += ch;
  });
  if (atual) out.push({ palavra: atual, inicio: i0, fim: fim[fim.length - 1] });
  return out;
}
const elevenlabs: Conector = {
  async testar(c) {
    const s = await this.saldo!(c);
    return { ok: true, mensagem: "OK — assinatura ativa", saldo: s };
  },
  async saldo(c) {
    const r = await http(`${EL}/v1/user/subscription`, { headers: { "xi-api-key": exigirChave(c) } });
    const j = await json<{ character_count: number; character_limit: number }>(r);
    return { valor: j.character_limit - j.character_count, unidade: "caracteres" };
  },
  async voz(c, e) {
    const r = await http(`${EL}/v1/text-to-speech/${encodeURIComponent(e.vozId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": exigirChave(c), "Content-Type": "application/json" },
      body: JSON.stringify({ text: e.texto, model_id: e.modelo, language_code: "pt" }), timeoutMs: 180_000,
    });
    const j = await json<{ audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } }>(r);
    const a = j.alignment;
    return { audio: Buffer.from(j.audio_base64, "base64"), ext: "mp3", palavras: a ? palavrasDeCaracteres(a.characters, a.character_start_times_seconds, a.character_end_times_seconds) : undefined };
  },
  async clonarVoz(c, e) {
    const fd = new FormData();
    fd.append("name", e.nome);
    fd.append("description", "Clone criado pelo Domma AvatarIA (Domma Tecnologia) com consentimento verificado");
    fd.append("files", new Blob([new Uint8Array(e.amostra)]), e.nomeArquivo);
    const r = await http(`${EL}/v1/voices/add`, { method: "POST", headers: { "xi-api-key": exigirChave(c) }, body: fd, timeoutMs: 180_000 });
    return (await json<{ voice_id: string }>(r)).voice_id;
  },
  async excluirVoz(c, id) {
    await http(`${EL}/v1/voices/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "xi-api-key": exigirChave(c) } });
  },
};

/* ---------------- VoiceStudio (servidor próprio — contrato interno) ---------------- */
const voicestudio: Conector = {
  async testar(c) {
    if (!c.endpoint) throw new ErroProvedor("URL do servidor não cadastrada", 400, false, false);
    await http(`${base(c, "")}${caminho(c, "healthPath", "/health")}`, { headers: { Authorization: `Bearer ${c.apiKey ?? ""}` }, timeoutMs: 15_000 });
    return { ok: true, mensagem: "OK — servidor respondeu" };
  },
  async voz(c, e) {
    const r = await http(`${base(c, "")}${caminho(c, "ttsPath", "/tts")}`, {
      method: "POST", headers: { Authorization: `Bearer ${c.apiKey ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: e.texto, voice_id: e.vozId, language: "pt-BR", format: "mp3", timestamps: true }), timeoutMs: 300_000,
    });
    if ((r.headers.get("content-type") ?? "").includes("json")) {
      const j = await json<{ audio_base64: string; words?: { word: string; start: number; end: number }[] }>(r);
      return { audio: Buffer.from(j.audio_base64, "base64"), ext: "mp3", palavras: j.words?.map((w) => ({ palavra: w.word, inicio: w.start, fim: w.end })) };
    }
    return { audio: Buffer.from(await r.arrayBuffer()), ext: "mp3" };
  },
  async clonarVoz(c, e) {
    const fd = new FormData();
    fd.append("name", e.nome);
    fd.append("file", new Blob([new Uint8Array(e.amostra)]), e.nomeArquivo);
    const r = await http(`${base(c, "")}${caminho(c, "clonePath", "/clone")}`, { method: "POST", headers: { Authorization: `Bearer ${c.apiKey ?? ""}` }, body: fd, timeoutMs: 600_000 });
    return (await json<{ voice_id: string }>(r)).voice_id;
  },
  async servidor(c, acao) {
    const url = acao === "ligar" ? c.extra?.ligarUrl : acao === "desligar" ? c.extra?.desligarUrl : c.extra?.statusServidorUrl;
    if (!url) throw new ErroProvedor(`Configure a URL para "${acao}" em Avançado (ex.: API do provedor de GPU)`, 400, false, false);
    const r = await http(url, { method: acao === "status" ? "GET" : "POST", headers: { Authorization: `Bearer ${c.apiKey ?? ""}` } });
    return (await r.text()).slice(0, 300) || "OK";
  },
};

/* ---------------- Kling (chave única Bearer; AK/SK com JWT só no padrão antigo) ---------------- */
async function klingHeaders(c: Credenciais) {
  const ak = exigirChave(c);
  if (!c.secretKey) return { Authorization: `Bearer ${ak}`, "Content-Type": "application/json" };
  const agora = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ iss: ak, exp: agora + 1800, nbf: agora - 5 }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(new TextEncoder().encode(c.secretKey));
  return { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
}
type KlingResp = { code: number; message?: string; data?: { task_id?: string; task_status?: string; task_status_msg?: string; task_result?: { videos?: { url: string }[]; images?: { url: string }[] } } };
async function klingCriar(c: Credenciais, path: string, corpo: Record<string, unknown>) {
  const r = await http(`${base(c, "https://api-singapore.klingai.com")}${path}`, { method: "POST", headers: await klingHeaders(c), body: JSON.stringify(corpo) });
  const j = await json<KlingResp>(r);
  if (j.code !== 0 || !j.data?.task_id) throw new ErroProvedor(`Kling: ${j.message ?? "sem task_id"}`, 400, /balance|insufficient/i.test(j.message ?? ""));
  return `${path}|${j.data.task_id}`;
}
const kling: Conector = {
  async testar(c) {
    // Consulta a lista de tarefas (chamada mínima, sem custo)
    await http(`${base(c, "https://api-singapore.klingai.com")}${caminho(c, "imagemPath", "/v1/images/generations")}?pageNum=1&pageSize=1`, { headers: await klingHeaders(c) });
    return { ok: true, mensagem: `OK — ${c.secretKey ? "Access Key + Secret Key (padrão antigo)" : "chave de API"}` };
  },
  async avatar(c, e) {
    if (!e.fotoUrl) throw new ErroProvedor("Avatar sem foto", 400, false, false);
    const pro = e.modelo.endsWith("pro");
    return klingCriar(c, caminho(c, "avatarPath", "/v1/videos/avatar/image2video"), {
      image: e.fotoUrl, sound_file: e.audioUrl, prompt: e.prompt ?? "pessoa falando naturalmente para a câmera, piscando no ritmo da fala",
      mode: pro ? caminho(c, "modoAvatarPro", "pro") : caminho(c, "modoAvatarStd", "std"),
    });
  },
  async imagem(c, e) {
    return klingCriar(c, caminho(c, "imagemPath", "/v1/images/generations"), { model_name: caminho(c, "modeloImagem", "kling-v3"), prompt: e.prompt, aspect_ratio: e.proporcao, n: 1 });
  },
  async cena(c, e) {
    return klingCriar(c, caminho(c, "videoPath", "/v1/videos/image2video"), {
      model_name: e.modelo,
      image: e.imagemUrl, prompt: e.prompt, duration: e.duracao > 5 ? "10" : "5", aspect_ratio: e.proporcao,
    });
  },
  async consultar(c, tarefa) {
    const [path, id] = tarefa.split("|");
    const r = await http(`${base(c, "https://api-singapore.klingai.com")}${path}/${id}`, { headers: await klingHeaders(c) });
    const j = await json<KlingResp>(r);
    const st = j.data?.task_status;
    if (st === "succeed") return { status: "ok", url: j.data?.task_result?.videos?.[0]?.url ?? j.data?.task_result?.images?.[0]?.url };
    if (st === "failed") return { status: "erro", erro: j.data?.task_status_msg ?? "falhou" };
    return { status: "rodando" };
  },
};

/* ---------------- HeyGen ---------------- */
const HG = "https://api.heygen.com";
const heygen: Conector = {
  async testar(c) {
    const s = await this.saldo!(c);
    return { ok: true, mensagem: "OK — conta acessível", saldo: s };
  },
  async saldo(c) {
    const r = await http(`${HG}/v2/user/remaining_quota`, { headers: { "X-Api-Key": exigirChave(c) } });
    const j = await json<{ data?: { remaining_quota?: number } }>(r);
    return j.data?.remaining_quota != null ? { valor: j.data.remaining_quota, unidade: "cota" } : null;
  },
  async avatar(c, e) {
    if (!e.avatarId) throw new ErroProvedor("Avatar não treinado no HeyGen (informe o ID do avatar)", 400, false, false);
    const dim = e.proporcao === "9:16" ? { width: 720, height: 1280 } : e.proporcao === "16:9" ? { width: 1280, height: 720 } : { width: 720, height: 720 };
    const r = await http(`${HG}/v2/video/generate`, {
      method: "POST", headers: { "X-Api-Key": exigirChave(c), "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: "avatar", avatar_id: e.avatarId, avatar_style: "normal" },
          voice: { type: "audio", audio_url: e.audioUrl },
          ...(e.fundoUrl ? { background: { type: "image", url: e.fundoUrl } } : {}),
        }],
        dimension: dim,
      }),
    });
    const j = await json<{ data?: { video_id?: string }; error?: { message?: string } }>(r);
    if (!j.data?.video_id) throw new ErroProvedor(`HeyGen: ${j.error?.message ?? "sem video_id"}`);
    return j.data.video_id;
  },
  async consultar(c, id) {
    const r = await http(`${HG}/v1/video_status.get?video_id=${encodeURIComponent(id)}`, { headers: { "X-Api-Key": exigirChave(c) } });
    const j = await json<{ data?: { status?: string; video_url?: string; error?: { message?: string } | string } }>(r);
    if (j.data?.status === "completed") return { status: "ok", url: j.data.video_url };
    if (j.data?.status === "failed") return { status: "erro", erro: typeof j.data.error === "string" ? j.data.error : j.data.error?.message ?? "falhou" };
    return { status: "rodando" };
  },
};

/* ---------------- Seedance (BytePlus ModelArk ou agregador compatível) ---------------- */
const seedance: Conector = {
  async testar(c) {
    await http(`${base(c, "https://ark.ap-southeast.bytepluses.com/api/v3")}${caminho(c, "tarefasPath", "/contents/generations/tasks")}?page_size=1`, { headers: { Authorization: `Bearer ${exigirChave(c)}` } });
    return { ok: true, mensagem: "OK — chave válida" };
  },
  async cena(c, e) {
    const modelo = e.modelo === "seedance-2-5" ? caminho(c, "modelo25", e.modelo) : caminho(c, "modeloMini", e.modelo);
    const content: unknown[] = [{ type: "text", text: `${e.prompt} --ratio ${e.proporcao} --duration ${Math.min(10, Math.max(3, Math.round(e.duracao)))}` }];
    if (e.imagemUrl) content.push({ type: "image_url", image_url: { url: e.imagemUrl } });
    const r = await http(`${base(c, "https://ark.ap-southeast.bytepluses.com/api/v3")}${caminho(c, "tarefasPath", "/contents/generations/tasks")}`, {
      method: "POST", headers: { Authorization: `Bearer ${exigirChave(c)}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: modelo, content }),
    });
    return (await json<{ id: string }>(r)).id;
  },
  async consultar(c, id) {
    const r = await http(`${base(c, "https://ark.ap-southeast.bytepluses.com/api/v3")}${caminho(c, "tarefasPath", "/contents/generations/tasks")}/${id}`, { headers: { Authorization: `Bearer ${exigirChave(c)}` } });
    const j = await json<{ status: string; content?: { video_url?: string }; error?: { message?: string } }>(r);
    if (j.status === "succeeded") return { status: "ok", url: j.content?.video_url };
    if (j.status === "failed" || j.status === "cancelled") return { status: "erro", erro: j.error?.message ?? j.status };
    return { status: "rodando" };
  },
};

/* ---------------- Google Veo (Gemini API, operação longa) ---------------- */
const GV = "https://generativelanguage.googleapis.com/v1beta";
const googleVeo: Conector = {
  async testar(c) {
    await http(`${GV}/models?pageSize=1`, { headers: { "x-goog-api-key": exigirChave(c) } });
    return { ok: true, mensagem: "OK — chave válida" };
  },
  async cena(c, e) {
    const r = await http(`${GV}/models/${e.modelo}:predictLongRunning`, {
      method: "POST", headers: { "x-goog-api-key": exigirChave(c), "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: e.prompt }], parameters: { aspectRatio: e.proporcao === "1:1" ? "16:9" : e.proporcao } }),
    });
    return (await json<{ name: string }>(r)).name;
  },
  async consultar(c, nome) {
    const r = await http(`${GV}/${nome}`, { headers: { "x-goog-api-key": exigirChave(c) } });
    const j = await json<{ done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } } }>(r);
    if (j.error) return { status: "erro", erro: j.error.message };
    if (!j.done) return { status: "rodando" };
    return { status: "ok", url: j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri, headers: { "x-goog-api-key": exigirChave(c) } };
  },
};

/* ---------------- Higgsfield (conector genérico configurável) ---------------- */
function pegar(obj: unknown, caminhoJson: string): unknown {
  return caminhoJson.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
const higgsfield: Conector = {
  async testar(c) {
    exigirChave(c);
    if (!c.endpoint) throw new ErroProvedor("Base da API não cadastrada", 400, false, false);
    await http(base(c, ""), { headers: { Authorization: `Bearer ${c.apiKey}` }, timeoutMs: 15_000 }).catch((e: ErroProvedor) => { if (e.status === 401 || e.status === 403) throw e; });
    return { ok: true, mensagem: "Servidor acessível (conector genérico — valide com uma geração de teste)" };
  },
  async cena(c, e) {
    const r = await http(`${base(c, "")}${caminho(c, "criarPath", "/v1/generations")}`, {
      method: "POST", headers: { Authorization: `Bearer ${exigirChave(c)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: e.prompt, image_url: e.imagemUrl, duration: e.duracao, aspect_ratio: e.proporcao }),
    });
    return String(pegar(await r.json(), caminho(c, "campoId", "id")));
  },
  async consultar(c, id) {
    const r = await http(`${base(c, "")}${caminho(c, "statusPath", "/v1/generations/{id}").replace("{id}", id)}`, { headers: { Authorization: `Bearer ${exigirChave(c)}` } });
    const j = await r.json();
    const st = String(pegar(j, caminho(c, "campoStatus", "status")));
    if (st === caminho(c, "statusOk", "completed")) return { status: "ok", url: String(pegar(j, caminho(c, "campoUrl", "video_url"))) };
    if (/fail|error|cancel/i.test(st)) return { status: "erro", erro: st };
    return { status: "rodando" };
  },
};

/* ---------------- Correção de olhar (servidor GPU próprio) ---------------- */
const olharGpu: Conector = {
  async testar(c) {
    await http(`${base(c, "")}${caminho(c, "healthPath", "/health")}`, { headers: { Authorization: `Bearer ${c.apiKey ?? ""}` }, timeoutMs: 15_000 });
    return { ok: true, mensagem: "OK — servidor respondeu" };
  },
  async olhar(c, e) {
    const r = await http(`${base(c, "")}${caminho(c, "corrigirPath", "/gaze")}`, {
      method: "POST", headers: { Authorization: `Bearer ${c.apiKey ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: e.videoUrl, intensity: e.intensidade, reduce_on_head_turn: true }), timeoutMs: 15 * 60_000,
    });
    return Buffer.from(await r.arrayBuffer());
  },
};

export const CONECTORES: Record<string, Conector> = {
  anthropic, elevenlabs, voicestudio, kling, heygen, seedance, google_veo: googleVeo, higgsfield, olhar_gpu: olharGpu,
};

export function conector(id: string): Conector {
  const c = CONECTORES[id];
  if (!c) throw new Error(`Conector ${id} não implementado`);
  return c;
}
