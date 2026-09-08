import { ChampionIcon } from './ChampionIcon';
import type { MatchBan, MatchTeamStat } from '../types';

/**
 * Objetivos e bans de uma partida.
 *
 * Os objetivos aparecem como um confronto direto -- azul à esquerda, vermelho à
 * direita, o rótulo no meio -- em vez de duas listas separadas. Placar de
 * objetivo só significa algo em comparação: "3 dragões" isolado não conta a
 * história, "3 a 1" conta.
 */

/** Ícone em texto: emoji carrega bem em qualquer tamanho e não pesa asset. */
const OBJETIVOS: { chave: keyof MatchTeamStat; icone: string; rotulo: string }[] = [
  { chave: 'towerKills', icone: '🗼', rotulo: 'Torres' },
  { chave: 'dragonKills', icone: '🐉', rotulo: 'Dragões' },
  { chave: 'baronKills', icone: '👾', rotulo: 'Barões' },
  { chave: 'riftHeraldKills', icone: '🦀', rotulo: 'Heralds' },
  { chave: 'voidgrubKills', icone: '🪲', rotulo: 'Larvas' },
  { chave: 'inhibitorKills', icone: '💠', rotulo: 'Inibidores' },
];

export function MatchObjectives({ teams }: { teams: MatchTeamStat[] }) {
  const azul = teams.find((team) => team.teamSide === 'BLUE');
  const vermelho = teams.find((team) => team.teamSide === 'RED');

  // Sem os dois lados não existe confronto para mostrar. Acontece nas partidas
  // importadas antes desta coluna existir -- some em silêncio em vez de
  // desenhar uma tabela pela metade.
  if (!azul || !vermelho) return null;

  return (
    <div className="rounded-lg border border-line/40 bg-base/40 p-2.5">
      <ul className="space-y-1">
        {OBJETIVOS.map(({ chave, icone, rotulo }) => {
          const a = Number(azul[chave] ?? 0);
          const v = Number(vermelho[chave] ?? 0);
          if (a === 0 && v === 0) return null;

          return (
            <li key={chave} className="flex items-center gap-2 text-xs">
              <span
                className={`tabular w-6 text-right font-bold ${
                  a > v ? 'text-blue' : 'text-ink-faint'
                }`}
              >
                {a}
              </span>
              <span className="flex flex-1 items-center justify-center gap-1.5 text-[10px] text-ink-faint">
                <span aria-hidden="true">{icone}</span>
                {rotulo}
              </span>
              <span
                className={`tabular w-6 font-bold ${v > a ? 'text-red' : 'text-ink-faint'}`}
              >
                {v}
              </span>
            </li>
          );
        })}
      </ul>

      <Primeiros azul={azul} vermelho={vermelho} />
    </div>
  );
}

/**
 * Os "primeiros" da partida.
 *
 * Não são contagem, são marcos -- e por isso ficam separados dos números acima.
 * Cada um pinta na cor de quem levou.
 */
function Primeiros({ azul, vermelho }: { azul: MatchTeamStat; vermelho: MatchTeamStat }) {
  type Dono = 'BLUE' | 'RED' | null;
  const quem = (azulTem: boolean, vermelhoTem: boolean): Dono =>
    azulTem ? 'BLUE' : vermelhoTem ? 'RED' : null;

  const marcos: { rotulo: string; dono: Dono }[] = [
    { rotulo: 'First blood', dono: quem(azul.firstBlood, vermelho.firstBlood) },
    { rotulo: '1ª torre', dono: quem(azul.firstTower, vermelho.firstTower) },
    { rotulo: '1º dragão', dono: quem(azul.firstDragon, vermelho.firstDragon) },
    { rotulo: '1º barão', dono: quem(azul.firstBaron, vermelho.firstBaron) },
  ].filter((marco) => marco.dono !== null);

  if (marcos.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-1 border-t border-line/30 pt-2">
      {marcos.map((marco) => (
        <li
          key={marco.rotulo}
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
            marco.dono === 'BLUE' ? 'bg-blue/15 text-blue' : 'bg-red/15 text-red'
          }`}
        >
          {marco.rotulo}
        </li>
      ))}
    </ul>
  );
}

/**
 * Os bans do draft, na ordem em que foram feitos.
 *
 * Ficam apagados e riscados: banido é campeão que NÃO jogou, e a tela precisa
 * dizer isso de relance -- senão viram só mais dez ícones competindo com os
 * campeões que de fato entraram.
 */
export function MatchBans({ bans }: { bans: MatchBan[] }) {
  if (bans.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-ink-faint">
        Bans
      </span>
      {bans.map((ban) => (
        <span
          key={`${ban.teamSide}-${ban.pickTurn}`}
          className="relative"
          title={`${ban.championName ?? `Campeão ${ban.championId}`} · banido pelo time ${
            ban.teamSide === 'BLUE' ? 'azul' : 'vermelho'
          } (${ban.pickTurn}º)`}
        >
          <ChampionIcon
            championName={ban.championName ?? String(ban.championId)}
            size={18}
            className="opacity-40 grayscale"
          />
          {/* Risco na diagonal: lê como "proibido" sem precisar de legenda. */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-bold leading-none ${
              ban.teamSide === 'BLUE' ? 'text-blue/70' : 'text-red/70'
            }`}
          >
            /
          </span>
        </span>
      ))}
    </div>
  );
}
