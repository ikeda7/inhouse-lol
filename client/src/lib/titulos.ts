/**
 * O título da aba do navegador para cada tela.
 *
 * Era "InHouse LoL" em todas: com três abas do site abertas (ranking, o perfil
 * de alguém, a série) não dava para saber qual era qual, e o histórico do
 * navegador virava uma coluna do mesmo nome. O nome da tela vem primeiro
 * porque é o que cabe numa aba estreita.
 */

const SITE = 'InHouse LoL';

/** Do mais específico para o mais geral: a primeira regra que casa vale. */
const TELAS: [caminho: RegExp, nome: string][] = [
  [/^\/$/, 'Ranking'],
  [/^\/sorteio/, 'Sorteio'],
  [/^\/serie/, 'Série'],
  [/^\/draft\//, 'Draft ao vivo'],
  [/^\/destaques/, 'Destaques'],
  [/^\/historico/, 'Histórico'],
  // O perfil troca "Jogador" pelo nome da pessoa quando ele chega.
  [/^\/jogadores\/.+/, 'Jogador'],
  [/^\/jogadores/, 'Jogadores'],
  [/^\/entrar/, 'Entrar'],
  [/^\/criar-conta/, 'Criar conta'],
  [/^\/conta/, 'Sua conta'],
  [/^\/ajuda/, 'Como funciona'],
];

/** "Ranking · InHouse LoL"; só o nome do site numa rota que ninguém conhece. */
export function tituloDaRota(caminho: string): string {
  const tela = TELAS.find(([regra]) => regra.test(caminho));
  return tela ? tituloDaTela(tela[1]) : SITE;
}

export function tituloDaTela(nome: string): string {
  return `${nome} · ${SITE}`;
}
