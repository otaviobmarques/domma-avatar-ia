/** Símbolo Domma Tecnologia (onda + ponto), redesenhado em vetor a partir do logo oficial. */
export function Simbolo({ tamanho = 32, ponto = "currentColor", className }: { tamanho?: number; ponto?: string; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho * 0.62} viewBox="0 0 120 74" fill="none" className={className} aria-hidden>
      <path d="M8 50 C 20 30, 26 20, 34 20 C 44 20, 48 60, 60 60 C 72 60, 76 20, 86 20 C 94 20, 100 30, 112 50" stroke="#7360FA" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="60" cy="9" r="8.5" fill={ponto} />
    </svg>
  );
}

export function Logo({ claro = false, produto = "AvatarIA", className }: { claro?: boolean; produto?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Simbolo tamanho={40} ponto={claro ? "#ffffff" : "#1E1238"} />
      <div className="leading-none">
        <div className={`font-titulo text-lg font-extrabold tracking-tight ${claro ? "text-white" : "text-tinta"}`}>Domma <span className="text-marca-500">{produto}</span></div>
        <div className={`mt-1 text-[9px] font-bold tracking-[0.35em] ${claro ? "text-marca-100/70" : "text-marca-500"}`}>TECNOLOGIA</div>
      </div>
    </div>
  );
}
