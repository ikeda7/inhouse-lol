import { ChampionIcon, ICONE_INDISPONIVEL } from './ChampionIcon';
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
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
        Objetivos
      </p>
      <ul className="space-y-1.5">
        {OBJETIVOS.map(({ chave, icone, rotulo }) => {
          const a = Number(azul[chave] ?? 0);
          const v = Number(vermelho[chave] ?? 0);
          if (a === 0 && v === 0) return null;

          return (
            <li key={chave} className="flex items-center gap-3 text-sm">
              <span
                className={`tabular w-7 text-right text-base font-bold ${
                  a > v ? 'text-blue' : 'text-ink-faint'
                }`}
              >
                {a}
              </span>
              <span className="flex flex-1 items-center justify-center gap-2 text-[12px] text-ink-faint">
                <span aria-hidden="true">{icone}</span>
                {rotulo}
              </span>
              <span
                className={`tabular w-7 text-base font-bold ${v > a ? 'text-red' : 'text-ink-faint'}`}
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
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
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
 * Riscados na cor de quem baniu: banido é campeão que NÃO jogou, e a tela
 * precisa dizer isso de relance -- senão viram só mais dez ícones competindo
 * com os campeões que de fato entraram.
 *
 * O risco carrega esse recado sozinho. A primeira versão apagava o ícone junto
 * (`opacity-45 grayscale`) e o resultado foi um bloco onde dava para ver que
 * houve ban, mas não qual -- ver `ICONE_INDISPONIVEL`.
 */
export function MatchBans({ bans }: { bans: MatchBan[] }) {
  if (bans.length === 0) return null;

  const porLado = (side: 'BLUE' | 'RED') => bans.filter((ban) => ban.teamSide === side);

  return (
    <div className="rounded-lg border border-line/40 bg-base/40 p-2.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
        Bans do draft
      </p>

      {/* Separados por time em vez de uma fila só de dez: o que interessa num
          ban é QUEM tirou o quê do adversário, e uma fila única perde isso. */}
      <div className="space-y-2">
        {(['BLUE', 'RED'] as const).map((side) => (
          <div key={side} className="flex items-center gap-2">
            <span
              className={`w-16 shrink-0 text-[11px] font-bold uppercase ${
                side === 'BLUE' ? 'text-blue' : 'text-red'
              }`}
            >
              {side === 'BLUE' ? 'Azul' : 'Vermelho'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {porLado(side).map((ban) => (
                <BanIcon key={ban.pickTurn} ban={ban} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BanIcon({ ban }: { ban: MatchBan }) {
  const nome = ban.championName ?? `Campeão ${ban.championId}`;

  return (
    <span
      className="relative inline-block"
      title={`${nome} · banido pelo time ${
        ban.teamSide === 'BLUE' ? 'azul' : 'vermelho'
      } (${ban.pickTurn}º do draft)`}
    >
      {/* Indisponível NÃO é invisível.
          Estava em `opacity-45 grayscale`, e num fundo escuro isso apaga o
          ícone: dava para ver que houve um ban, não QUAL foi -- que é a única
          informação que o bloco carrega. O sinal de "não jogou" vem do risco e
          de uma dessaturação leve; o campeão continua reconhecível. */}
      <ChampionIcon
        championName={ban.championName ?? String(ban.championId)}
        size={34}
        className={ICONE_INDISPONIVEL}
      />
      {/* Barra diagonal cobrindo o ícone: lê como "proibido" de relance, sem
          precisar de legenda. Em 18px isso era um risco ilegível. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded"
      >
        <span
          className={`absolute left-1/2 top-1/2 h-[2px] w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-45 ${
            ban.teamSide === 'BLUE' ? 'bg-blue/80' : 'bg-red/80'
          }`}
        />
      </span>
    </span>
  );
}
