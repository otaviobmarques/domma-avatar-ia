export const TERMO_VERSAO = "1.0";

export function textoTermo(d: { nome: string; cpf: string; finalidade: string; prazoMeses: number; empresa: string }) {
  return `TERMO DE CONSENTIMENTO PARA USO DE IMAGEM E VOZ (DADO BIOMÉTRICO) — versão ${TERMO_VERSAO}

Eu, ${d.nome || "[nome]"}, CPF ${d.cpf || "[CPF]"}, autorizo de forma livre, específica, informada e destacada (LGPD — Lei 13.709/2018, arts. 5º, II, e 11) a criação e o uso de um gêmeo digital (clone de rosto e voz) a partir das amostras que eu mesmo(a) enviar.

1. Finalidade: ${d.finalidade || "[finalidade]"}, para ${d.empresa || "[empresa]"}.
2. Prazo: ${d.prazoMeses} meses a partir do aceite. Após o prazo, o clone fica bloqueado até nova autorização.
3. Dados tratados: vídeo, fotos e gravação de voz (dados pessoais sensíveis — biométricos), armazenados de forma criptografada e enviados apenas aos provedores de IA necessários para gerar os vídeos.
4. Rotulagem: todo vídeo gerado leva marca d'água e o aviso “conteúdo gerado por IA”.
5. Uso proibido: conteúdo político-eleitoral, golpes, conteúdo enganoso ou que me atribua falas contra a minha vontade. Cada vídeo gerado fica registrado com quem o gerou.
6. Direito de exclusão: posso pedir a exclusão do meu clone a qualquer momento. As amostras e modelos são apagados do sistema e a exclusão é solicitada aos provedores.
7. Declaro que sou a pessoa retratada e que gravarei a verificação ao vivo pela câmera.`;
}

const PALAVRAS = ["laranja", "vistoria", "janela", "sete", "azul", "carro", "montanha", "quatro", "relógio", "praia", "café", "nove", "verde", "estrela", "ponte", "doze", "livro", "vento"];
export function fraseAleatoria() {
  const p = [...PALAVRAS].sort(() => Math.random() - 0.5).slice(0, 5);
  return `Eu autorizo meu gêmeo digital. Código: ${p.join(" ")}.`;
}

export const TEXTO_LEITURA = `Olá! Esta é a minha gravação de voz para o gêmeo digital. Vou ler este texto com calma, no meu ritmo natural, como se estivesse conversando com um cliente.
Hoje é um ótimo dia para conhecer novidades. Você sabia que uma vistoria bem feita evita dor de cabeça na hora de vender o carro? Pois é. Com processos simples, tudo fica mais rápido e seguro.
Agora, algumas perguntas: qual é o melhor horário para você? Prefere atendimento pelo WhatsApp ou por telefone? E se eu te disser que dá para resolver tudo em poucos minutos?
Números também importam: um, dois, três, quatro, cinco. Dez por cento de desconto. Cento e vinte reais. Vinte e quatro horas por dia.
Às vezes eu falo mais animado, com energia! Outras vezes, mais sério e tranquilo. E, para terminar, um sorriso na voz: obrigado por assistir, até a próxima!`;

export function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
