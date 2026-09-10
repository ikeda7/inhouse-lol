/**
 * Identidade visual de um jogador sem foto.
 *
 * Vive aqui, e não dentro do componente `Avatar`, porque DUAS superfícies
 * precisam chegar ao mesmo resultado: a tela (que usa classe do Tailwind) e a
 * imagem do ranking (canvas, que precisa de hexadecimal). Duplicar a paleta e o
 * hash faria as duas divergirem no primeiro nome novo -- alguém apareceria roxo
 * no site e verde no zap, sem erro nenhum em lugar nenhum.
 *
 * É o mesmo motivo de `rankingImage.ts` repetir os tokens de cor. A diferença é
 * que ali a repetição é inevitável (canvas não lê custom property) e aqui não.
 */

/**
 * Paleta própria de propósito: `gold` é acento, `blue`/`red` identificam TIME.
 * Pintar avatar com esses tokens diria uma coisa que não é verdade -- um jogador
 * de avatar azul não está no time azul.
 *
 * Os hexadecimais são os mesmos tons do Tailwind das classes ao lado; todos
 * passam AA com o texto claro por cima.
 */
export const CORES_DE_AVATAR = [
  { classe: 'bg-slate-600', hex: '#475569' },
  { classe: 'bg-teal-700', hex: '#0f766e' },
  { classe: 'bg-indigo-700', hex: '#4338ca' },
  { classe: 'bg-cyan-800', hex: '#155e75' },
  { classe: 'bg-violet-800', hex: '#5b21b6' },
  { classe: 'bg-emerald-800', hex: '#065f46' },
] as const;

/**
 * Sempre a mesma cor para o mesmo nome, em qualquer sessão e em qualquer
 * superfície. Hash simples serve: o objetivo é distinguir a galera numa lista de
 * quinze, não resistir a colisão.
 */
export function indiceDeCorDoNome(nome: string): number {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) | 0;
  return Math.abs(hash) % CORES_DE_AVATAR.length;
}

export function classeDeCorDoNome(nome: string): string {
  return CORES_DE_AVATAR[indiceDeCorDoNome(nome)].classe;
}

export function hexDeCorDoNome(nome: string): string {
  return CORES_DE_AVATAR[indiceDeCorDoNome(nome)].hex;
}

/**
 * Duas letras: iniciais de nome composto, ou as duas primeiras de um apelido
 * único. "amar dps dos 40" vira "A4", "Vini" vira "VI".
 */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
