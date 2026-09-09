import { useChampions } from '../hooks/useChampions';
import { ROLES, type Role } from '../types';

/**
 * Ícone oficial do campeão, resolvido pelo Data Dragon.
 *
 * Recebe o NOME (é o que fica gravado no scoreboard) e busca a chave do arquivo
 * no manifesto -- o nome do arquivo nem sempre é o nome do campeão: "Wukong" é
 * MonkeyKing.png, "Cho'Gath" é Chogath.png. Resolver por slugify erraria.
 *
 * Sem o manifesto (CDN fora do ar), cai para as iniciais em vez de sumir: a
 * linha do scoreboard continua legível.
 */
export function ChampionIcon({
  championName,
  size = 24,
  className = '',
  fluid = false,
}: {
  championName: string;
  size?: number;
  className?: string;
  /**
   * Deixa o CSS mandar no tamanho em vez do `size`.
   *
   * O padrão crava `style={{width,height}}`, e estilo inline ganha de qualquer
   * classe -- então sem isto um ícone dentro de um grid responsivo ficaria preso
   * no número. Os atributos `width`/`height` continuam saindo: eles não pintam
   * tamanho aqui, só entregam a proporção ao navegador antes da imagem chegar,
   * o que evita a linha pular quando ela carrega.
   */
  fluid?: boolean;
}) {
  const { manifest } = useChampions();

  const champion = manifest?.champions.find(
    (c) => c.name.toLowerCase() === championName.toLowerCase()
  );
  const medida = fluid ? undefined : { width: size, height: size };

  if (!champion) {
    return (
      <span
        title={championName}
        style={medida}
        className={`inline-flex items-center justify-center rounded bg-raised text-[8px] font-semibold text-ink-faint ${
          fluid ? 'aspect-square w-full' : 'shrink-0'
        } ${className}`}
      >
        {championName.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={champion.squareUrl}
      alt={championName}
      title={championName}
      width={size}
      height={size}
      loading="lazy"
      style={medida}
      className={`rounded ${fluid ? 'aspect-square w-full' : 'shrink-0'} ${className}`}
    />
  );
}

/**
 * Ordena qualquer lista com `rolePlayed` na ordem da Fenda: Top no topo,
 * Support embaixo -- como aparece em transmissão de campeonato.
 *
 * Sem isso a ordem vem do banco, que é arbitrária, e o time fica embaralhado
 * a cada partida.
 */
export function ordenarPorLane<T extends { rolePlayed: Role }>(itens: T[]): T[] {
  return [...itens].sort(
    (a, b) => ROLES.indexOf(a.rolePlayed) - ROLES.indexOf(b.rolePlayed)
  );
}

/**
 * Tratamento visual de campeão INDISPONÍVEL -- banido no draft, queimado pelo
 * Fearless, ou bloqueado no seletor.
 *
 * A regra: indisponível não é invisível. As três telas usavam algo perto de
 * `opacity-40 grayscale`, e num tema escuro isso apaga o ícone -- dava para ver
 * que existia um ban, não QUAL era, que é a única informação que aquele bloco
 * carrega. Um campeão queimado que ninguém reconhece não impede ninguém de
 * escolher ele.
 *
 * O sinal de "não dá para usar" tem que vir de outra coisa: o risco por cima,
 * a posição na tela, o cursor. A dessaturação aqui é só um empurrão, não o
 * recado inteiro.
 */
export const ICONE_INDISPONIVEL = 'opacity-90 grayscale-40';
