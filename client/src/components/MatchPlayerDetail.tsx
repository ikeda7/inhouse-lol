import { ItemRow, RunePair, SpellPair } from './BuildIcons';
import type { MatchStat } from '../types';

/**
 * Scoreboard completo de UM jogador numa partida.
 *
 * Abre embaixo da linha dele no histórico. A ideia é responder sem o cliente do
 * LoL aberto: o que ele construiu, quanto de dano fez e de que tipo, de onde
 * veio o farm, quanto contribuiu de visão.
 *
 * Duas decisões que valem explicação:
 *
 * 1. Todo número grande vem com uma BARRA comparando com o melhor da partida.
 *    "37 mil de dano" não diz nada sozinho -- 37 mil sendo o maior da partida
 *    diz tudo. É o que transforma número em informação.
 *
 * 2. Nada aqui é média nem acumulado. É uma partida, um jogador. Média já existe
 *    no perfil; aqui a pergunta é "o que aconteceu naquele jogo".
 */

interface Props {
  stat: MatchStat;
  /** Duração do jogo, para os por-minuto. */
  gameDurationSec: number | null;
  /** Maiores valores da partida, para as barras de comparação. */
  maximos: Maximos;
}

export interface Maximos {
  damage: number;
  totalDamageDealt: number;
  damageTaken: number;
  goldEarned: number;
  cs: number;
  visionScore: number;
  damageSelfMitigated: number;
  totalHeal: number;
  timeCCingOthers: number;
}

/** Calcula os maiores valores de cada métrica entre os 10 jogadores. */
export function calcularMaximos(stats: MatchStat[]): Maximos {
  const maior = (pegar: (stat: MatchStat) => number) =>
    stats.reduce((acumulado, stat) => Math.max(acumulado, pegar(stat)), 0);

  return {
    damage: maior((s) => s.damage),
    totalDamageDealt: maior((s) => s.totalDamageDealt),
    damageTaken: maior((s) => s.damageTaken),
    goldEarned: maior((s) => s.goldEarned),
    cs: maior((s) => s.cs),
    visionScore: maior((s) => s.visionScore),
    damageSelfMitigated: maior((s) => s.damageSelfMitigated),
    totalHeal: maior((s) => s.totalHeal),
    timeCCingOthers: maior((s) => s.timeCCingOthers),
  };
}

function milhar(valor: number): string {
  if (valor >= 10000) return `${Math.round(valor / 1000)}k`;
  if (valor >= 1000) return `${(valor / 1000).toFixed(1)}k`;
  return String(valor);
}

function porMinuto(valor: number, duracaoSec: number | null): string {
  if (!duracaoSec || duracaoSec <= 0) return '--';
  return (valor / (duracaoSec / 60)).toFixed(1);
}

function minutos(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const sec = segundos % 60;
  return min > 0 ? `${min}m${String(sec).padStart(2, '0')}s` : `${sec}s`;
}

export function MatchPlayerDetail({ stat, gameDurationSec, maximos }: Props) {
  const danoTotalAChampions =
    stat.physicalDamageToChampions + stat.magicDamageToChampions + stat.trueDamageToChampions;

  return (
    <div className="space-y-3 border-l-2 border-gold/30 bg-base/40 px-3 py-3">
      {/* --- build --- */}
      <div className="flex flex-wrap items-center gap-2">
        <SpellPair spell1Id={stat.spell1Id} spell2Id={stat.spell2Id} />
        <RunePair keystoneId={stat.keystoneId} subStyleId={stat.subStyleId} />
        <span className="mx-1 h-6 w-px bg-line/50" />
        <ItemRow items={stat.items} />
        {stat.champLevel > 0 && (
          <span className="ml-auto rounded bg-overlay px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
            nível {stat.champLevel}
          </span>
        )}
      </div>

      {/* --- dano --- */}
      <Bloco titulo="Dano">
        <Metrica
          rotulo="a campeões"
          valor={milhar(stat.damage)}
          proporcao={stat.damage / (maximos.damage || 1)}
          detalhe={`${porMinuto(stat.damage, gameDurationSec)}/min`}
          destaque
        />
        {danoTotalAChampions > 0 && (
          <QuebraDeDano
            fisico={stat.physicalDamageToChampions}
            magico={stat.magicDamageToChampions}
            verdadeiro={stat.trueDamageToChampions}
          />
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Metrica
            rotulo="total (tudo)"
            valor={milhar(stat.totalDamageDealt)}
            proporcao={stat.totalDamageDealt / (maximos.totalDamageDealt || 1)}
          />
          <Metrica rotulo="a objetivos" valor={milhar(stat.damageToObjectives)} />
          <Metrica rotulo="a torres" valor={milhar(stat.damageToTurrets)} />
          <Metrica
            rotulo="maior crítico"
            valor={stat.largestCriticalStrike > 0 ? milhar(stat.largestCriticalStrike) : '--'}
          />
        </div>
      </Bloco>

      {/* --- aguentou --- */}
      <Bloco titulo="Aguentou">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Metrica
            rotulo="dano sofrido"
            valor={milhar(stat.damageTaken)}
            proporcao={stat.damageTaken / (maximos.damageTaken || 1)}
          />
          <Metrica
            rotulo="mitigado"
            valor={milhar(stat.damageSelfMitigated)}
            proporcao={stat.damageSelfMitigated / (maximos.damageSelfMitigated || 1)}
          />
          <Metrica
            rotulo="cura/escudo"
            valor={milhar(stat.totalHeal)}
            proporcao={stat.totalHeal / (maximos.totalHeal || 1)}
          />
          <Metrica
            rotulo="maior sobrevida"
            valor={stat.longestTimeSpentLiving > 0 ? minutos(stat.longestTimeSpentLiving) : '--'}
          />
        </div>
      </Bloco>

      {/* --- economia e farm --- */}
      <Bloco titulo="Ouro e farm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Metrica
            rotulo="ouro ganho"
            valor={milhar(stat.goldEarned)}
            proporcao={stat.goldEarned / (maximos.goldEarned || 1)}
            detalhe={`${porMinuto(stat.goldEarned, gameDurationSec)}/min`}
          />
          <Metrica
            rotulo="ouro gasto"
            valor={milhar(stat.goldSpent)}
            detalhe={
              stat.goldEarned > stat.goldSpent
                ? `sobrou ${milhar(stat.goldEarned - stat.goldSpent)}`
                : undefined
            }
          />
          <Metrica
            rotulo="farm"
            valor={String(stat.cs)}
            proporcao={stat.cs / (maximos.cs || 1)}
            detalhe={`${porMinuto(stat.cs, gameDurationSec)}/min`}
          />
          {/* Rota x selva separados: 200 de farm de um jungler e de um ADC são
              coisas diferentes, e o total sozinho esconde isso. */}
          <Metrica
            rotulo="rota / selva"
            valor={`${stat.laneMinionsKilled} / ${stat.neutralMinionsKilled}`}
          />
        </div>
      </Bloco>

      {/* --- visão e utilidade --- */}
      <Bloco titulo="Visão e utilidade">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Metrica
            rotulo="pontos de visão"
            valor={String(stat.visionScore)}
            proporcao={stat.visionScore / (maximos.visionScore || 1)}
          />
          <Metrica
            rotulo="wards"
            valor={`+${stat.wardsPlaced} / -${stat.wardsKilled}`}
            detalhe={stat.controlWardsBought > 0 ? `${stat.controlWardsBought} de controle` : undefined}
          />
          <Metrica
            rotulo="CC aplicado"
            valor={stat.timeCCingOthers > 0 ? `${stat.timeCCingOthers}s` : '--'}
            proporcao={stat.timeCCingOthers / (maximos.timeCCingOthers || 1)}
          />
          <Metrica
            rotulo="torres / inibidores"
            valor={`${stat.turretKills} / ${stat.inhibitorKills}`}
          />
        </div>
      </Bloco>

      {/* --- abates --- */}
      {(stat.doubleKills > 0 ||
        stat.tripleKills > 0 ||
        stat.quadraKills > 0 ||
        stat.pentaKills > 0 ||
        stat.killingSprees > 0 ||
        stat.firstBloodKill ||
        stat.firstBloodAssist) && (
        <Bloco titulo="Abates">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {stat.pentaKills > 0 && <Pastilha destaque>{stat.pentaKills}× penta</Pastilha>}
            {stat.quadraKills > 0 && <Pastilha destaque>{stat.quadraKills}× quadra</Pastilha>}
            {stat.tripleKills > 0 && <Pastilha>{stat.tripleKills}× triple</Pastilha>}
            {stat.doubleKills > 0 && <Pastilha>{stat.doubleKills}× double</Pastilha>}
            {stat.killingSprees > 0 && (
              <Pastilha>
                {stat.killingSprees} sequência{stat.killingSprees > 1 ? 's' : ''}
                {stat.largestKillingSpree > 0 && ` (maior: ${stat.largestKillingSpree})`}
              </Pastilha>
            )}
            {stat.firstBloodKill && <Pastilha>first blood</Pastilha>}
            {stat.firstBloodAssist && !stat.firstBloodKill && <Pastilha>assist. no FB</Pastilha>}
          </div>
        </Bloco>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-ink-faint">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * Um número com rótulo e, quando faz sentido, uma barra do tamanho relativo ao
 * melhor da partida.
 */
function Metrica({
  rotulo,
  valor,
  detalhe,
  proporcao,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  proporcao?: number;
  destaque?: boolean;
}) {
  // Clamp: proporção sempre entre 0 e 1, senão a barra estoura o container
  // quando o divisor é 0 (partida sem nenhum dano registrado).
  const largura = proporcao === undefined ? null : Math.min(Math.max(proporcao, 0), 1) * 100;
  const ehOMaior = largura !== null && largura > 99.5;

  return (
    <div className={destaque ? 'space-y-1' : ''}>
      <p className="flex items-baseline gap-1.5">
        <span
          className={`tabular font-bold leading-none ${
            destaque ? 'text-lg text-ink' : 'text-sm text-ink'
          } ${ehOMaior ? 'text-gold' : ''}`}
        >
          {valor}
        </span>
        <span className="text-[10px] text-ink-faint">{rotulo}</span>
        {detalhe && <span className="ml-auto text-[10px] text-ink-faint">{detalhe}</span>}
      </p>
      {largura !== null && (
        <span className="block h-1 overflow-hidden rounded-full bg-overlay">
          <span
            className={`block h-full rounded-full ${ehOMaior ? 'bg-gold' : 'bg-ink-faint/50'}`}
            style={{ width: `${largura}%` }}
          />
        </span>
      )}
    </div>
  );
}

/**
 * Proporção físico / mágico / verdadeiro numa barra só.
 *
 * Vale mais que três números soltos: mostra de relance se o dano do cara veio de
 * AD ou AP, que é a informação que se procura quando se olha isso.
 */
function QuebraDeDano({
  fisico,
  magico,
  verdadeiro,
}: {
  fisico: number;
  magico: number;
  verdadeiro: number;
}) {
  const total = fisico + magico + verdadeiro;
  if (total === 0) return null;

  const partes = [
    { rotulo: 'físico', valor: fisico, classe: 'bg-red/70' },
    { rotulo: 'mágico', valor: magico, classe: 'bg-blue/70' },
    { rotulo: 'verdadeiro', valor: verdadeiro, classe: 'bg-ink-faint/60' },
  ].filter((parte) => parte.valor > 0);

  return (
    <div className="space-y-1">
      <span className="flex h-1.5 overflow-hidden rounded-full bg-overlay">
        {partes.map((parte) => (
          <span
            key={parte.rotulo}
            className={parte.classe}
            style={{ width: `${(parte.valor / total) * 100}%` }}
            title={`${parte.rotulo}: ${parte.valor.toLocaleString('pt-BR')}`}
          />
        ))}
      </span>
      <p className="flex flex-wrap gap-x-3 text-[10px] text-ink-faint">
        {partes.map((parte) => (
          <span key={parte.rotulo} className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${parte.classe}`} />
            {parte.rotulo} {Math.round((parte.valor / total) * 100)}%
          </span>
        ))}
      </p>
    </div>
  );
}

function Pastilha({
  children,
  destaque = false,
}: {
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-semibold ${
        destaque ? 'bg-gold/15 text-gold' : 'bg-overlay text-ink-muted'
      }`}
    >
      {children}
    </span>
  );
}
