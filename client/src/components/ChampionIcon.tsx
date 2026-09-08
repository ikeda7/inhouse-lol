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
}: {
  championName: string;
  size?: number;
  className?: string;
}) {
  const { manifest } = useChampions();

  const champion = manifest?.champions.find(
    (c) => c.name.toLowerCase() === championName.toLowerCase()
  );

  if (!champion) {
    return (
      <span
        title={championName}
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center rounded bg-raised text-[8px] font-semibold text-ink-faint ${className}`}
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
      style={{ width: size, height: size }}
      className={`shrink-0 rounded ${className}`}
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
