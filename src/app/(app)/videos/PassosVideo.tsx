import { Passos } from "@/components/ui";
export function PassosVideo({ id, atual }: { id: string; atual: number }) {
  const n = ["Formato", "Roteiro", "Avatar e cenário", "Motores e custo", "Revisão"];
  const h = ["formato", "roteiro", "avatar", "motores", ""];
  return <Passos atual={atual} passos={n.map((nome, i) => ({ nome, href: `/videos/${id}${h[i] ? `/${h[i]}` : ""}` }))} />;
}
