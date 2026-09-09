import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, Share2, Trophy } from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardTitle, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon } from '../components/ChampionIcon';
import { useChampions } from '../hooks/useChampions';
import {
  baixarImagem,
  compartilharImagem,
  copiarImagem,
  ehTelaDeToque,
  gerarImagemDoRanking,
  podeCopiarImagem,
} from '../lib/rankingImage';
import { ROLE_LABEL, type LeaderboardEntry } from '../types';

type SortKey = 'wins' | 'winRate' | 'avgKda' | 'points';

const SORT_LABELS: Record<SortKey, string> = {
  wins: 'Vitórias',
  winRate: 'Winrate',
  avgKda: 'KDA',
  points: 'Pontos',
};

/** Ouro, prata e bronze nos três primeiros; o resto só o número. */
const MEDAL = ['text-gold', 'text-slate-300', 'text-amber-700'];

/**
 * Ranking geral. +3 por mapa vencido, +1 de bônus por vencer a MD3.
 *
 * Duas apresentações do mesmo dado: tabela no desktop, cartão no celular.
 *
 * A tabela mostra os campeões mais jogados de cada um. Não é enfeite para tapar
 * espaço: "quem é essa pessoa na tabela" se responde melhor com os campeões
 * dela do que com mais uma coluna de número -- e é o que o grupo usa para
 * reconhecer quem é quem antes mesmo de ler o nome.
 */
export function DashboardPage() {
  const [sortBy, setSortBy] = useState<SortKey>('wins');
  const { manifest } = useChampions();
  const [exportando, setExportando] = useState(false);
  const [erroDaImagem, setErroDaImagem] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(() => statsApi.leaderboard(sortBy), [sortBy]);

  const semDados = !data || data.length === 0;

  const nomeDoArquivo = `inhouse-lol-ranking-${new Date().toISOString().slice(0, 10)}.png`;

  const gerar = () => {
    if (!data || data.length === 0) throw new Error('Nada para exportar ainda.');
    return gerarImagemDoRanking(data, {
      // O ícone sai do manifesto que a tela já carregou; sem ele a imagem ainda
      // sai, só sem os campeões.
      iconeDoCampeao: (nome) =>
        manifest?.champions.find((c) => c.name.toLowerCase() === nome.toLowerCase())?.squareUrl ??
        null,
      ordenadoPor: SORT_LABELS[sortBy],
    });
  };

  /** Roda a ação cuidando de estado de carregamento, erro e aviso de sucesso. */
  const executar = async (acao: () => Promise<void>, sucesso?: string) => {
    setExportando(true);
    setErroDaImagem(null);
    setAviso(null);
    try {
      await acao();
      if (sucesso) setAviso(sucesso);
    } catch (erro) {
      setErroDaImagem(erro instanceof Error ? erro.message : 'Não consegui gerar a imagem.');
    } finally {
      setExportando(false);
    }
  };

  const copiar = () =>
    executar(() => copiarImagem(gerar), 'Imagem copiada — é só colar no grupo.');

  const baixar = () => executar(async () => baixarImagem(await gerar(), nomeDoArquivo));

  const compartilhar = () => executar(async () => compartilharImagem(await gerar(), nomeDoArquivo));

  return (
    <div className="space-y-5">
      <Card
        padding={false}
        title={<CardTitle icon={Trophy}>Classificação geral</CardTitle>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex gap-0.5 rounded-md bg-raised p-0.5"
              role="group"
              aria-label="Ordenar por"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  aria-pressed={sortBy === key}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                    sortBy === key
                      ? 'bg-overlay text-ink shadow-sm'
                      : 'text-ink-faint hover:text-ink-muted'
                  }`}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>

            {/* Uma ação por botão, em vez de um botão que adivinha.
                A imagem sai na ordem que está na tela: quem exporta ordenado
                por KDA quer mandar o ranking de KDA. */}
            <div className="flex items-center gap-1">
              {podeCopiarImagem() && (
                <BotaoDeImagem onClick={copiar} carregando={exportando} vazio={semDados}>
                  <Copy size={13} />
                  Copiar
                </BotaoDeImagem>
              )}
              <BotaoDeImagem onClick={baixar} carregando={exportando} vazio={semDados}>
                <Download size={13} />
                Baixar
              </BotaoDeImagem>
              {/* Só em tela de toque: no desktop essa folha lista aplicativos e
                  não oferece salvar nem copiar. */}
              {ehTelaDeToque() && (
                <BotaoDeImagem onClick={compartilhar} carregando={exportando} vazio={semDados}>
                  <Share2 size={13} />
                  Enviar
                </BotaoDeImagem>
              )}
            </div>
          </div>
        }
      >
        {loading && <LoadingState />}
        {error && (
          <div className="p-4">
            <ErrorState error={error} onRetry={reload} />
          </div>
        )}
        {data && data.length === 0 && (
          <EmptyState label="Nenhuma partida registrada. Abra uma MD3 na aba Série para começar." />
        )}

        {data && data.length > 0 && (
          <>
            {/* --- celular e tablet --- */}
            <ul className="divide-y divide-line/40 lg:hidden">
              {data.map((entry, index) => (
                <LinhaCelular key={entry.playerId} entry={entry} posicao={index} />
              ))}
            </ul>

            {/* --- desktop: a partir de lg, onde as 12 colunas cabem --- */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line/40 text-left text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="py-3 pl-5 pr-2 font-medium">#</th>
                    <th className="py-3 pr-2 font-medium">Jogador</th>
                    <th className="py-3 pr-2 font-medium">Campeões</th>
                    <th className="py-3 pr-2 font-medium">Role</th>
                    <th className="py-3 pr-3 text-right font-medium">V–D</th>
                    <th className="py-3 pr-4 font-medium">Winrate</th>
                    <th className="py-3 pr-2 text-right font-medium">KDA</th>
                    <th className="py-3 pr-2 text-right font-medium" title="Dano por minuto">
                      DPM
                    </th>
                    <th className="py-3 pr-2 text-right font-medium" title="Farm por minuto">
                      CS/min
                    </th>
                    <th className="py-3 pr-2 text-right font-medium" title="Visão média">
                      Visão
                    </th>
                    <th className="py-3 pr-2 text-right font-medium" title="MD3 vencidas">
                      MD3
                    </th>
                    <th className="py-3 pr-5 text-right font-medium">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/25">
                  {data.map((entry, index) => (
                    <LinhaTabela key={entry.playerId} entry={entry} posicao={index} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {erroDaImagem && (
        <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-center text-xs text-loss">
          {erroDaImagem}
        </p>
      )}
      {/* Copiar não tem retorno visível nenhum: sem esta confirmação, não dá
          para saber se funcionou a não ser tentando colar em algum lugar. */}
      {aviso && (
        <p className="rounded-lg border border-win/30 bg-win/10 px-3 py-2 text-center text-xs text-win">
          {aviso}
        </p>
      )}

      {data && data.length > 0 && (
        <div className="space-y-1 px-1 text-center text-xs text-ink-faint">
          <p>Empate se resolve por KDA, depois winrate, depois nº de jogos · 🏆 = MD3 vencida</p>
          {/* A ausência do selo precisa ser legível: sem esta linha, um selo que
              ninguém tem parece feature quebrada em vez de resultado honesto. */}
          {!data.some((entry) => entry.isKdaPlayer) && (
            <p className="text-ink-faint/70">
              O selo <span className="font-semibold">KDA player</span> vai para quem tem KDA acima
              da média do grupo com participação em abates abaixo. Hoje ninguém se qualifica.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaTabela({ entry, posicao }: { entry: LeaderboardEntry; posicao: number }) {
  return (
    <tr className="group transition hover:bg-raised/50">
      <td className={`tabular py-2.5 pl-5 pr-2 text-sm ${MEDAL[posicao] ?? 'text-ink-faint'}`}>
        {posicao + 1}
      </td>

      <td className="py-2.5 pr-2">
        <Link
          to={`/jogadores/${entry.playerId}`}
          className="text-[15px] font-medium text-ink transition group-hover:text-gold"
        >
          {entry.name}
        </Link>
        <Trofeus quantidade={entry.seriesWon} recente={entry.wonLastSeries} />
        {entry.isKdaPlayer && <SeloKdaPlayer />}
      </td>

      <td className="py-2.5 pr-2">
        <span className="flex items-center gap-1.5">
          {entry.topChampions.length === 0 && <span className="text-xs text-ink-faint">--</span>}
          {entry.topChampions.map((champion) => (
            <span key={champion.championName} className="relative">
              <ChampionIcon championName={champion.championName} size={28} />
              {/* Quantas vezes jogou, no canto. Três ícones sem número dizem
                  "joga esses"; com número dizem "esse é O campeão dele". */}
              {champion.games > 1 && (
                <span className="tabular absolute -bottom-1 -right-1 rounded bg-base px-1 text-[9px] font-bold leading-tight text-ink-muted ring-1 ring-line/60">
                  {champion.games}
                </span>
              )}
            </span>
          ))}
        </span>
      </td>

      <td className="py-2.5 pr-2 text-xs uppercase tracking-wide text-ink-faint">
        {entry.mainRole ? ROLE_LABEL[entry.mainRole] : '--'}
      </td>

      <td className="tabular py-2.5 pr-3 text-right text-[15px] font-bold text-gold">
        {entry.wins}–{entry.losses}
        <span className="ml-1 text-[11px] font-normal text-ink-faint">({entry.games})</span>
      </td>

      {/* Winrate com barra: o número sozinho exige leitura para comparar 52%
          com 48% linha a linha. A barra resolve de relance. */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-overlay">
            <span
              className={`block h-full rounded-full ${entry.winRate >= 50 ? 'bg-win' : 'bg-loss'}`}
              style={{ width: `${Math.min(Math.max(entry.winRate, 0), 100)}%` }}
            />
          </span>
          <span
            className={`tabular text-sm font-medium ${
              entry.winRate >= 50 ? 'text-win' : 'text-loss'
            }`}
          >
            {entry.winRate}%
          </span>
        </div>
      </td>

      <td className="tabular py-2.5 pr-2 text-right text-[15px] text-ink">
        {entry.avgKda.toFixed(2)}
      </td>
      <td className="tabular py-2.5 pr-2 text-right text-ink-muted">{entry.avgDamagePerMinute}</td>
      <td className="tabular py-2.5 pr-2 text-right text-ink-muted">{entry.avgCsPerMinute}</td>
      <td className="tabular py-2.5 pr-2 text-right text-ink-muted">{entry.avgVisionScore}</td>
      <td className="tabular py-2.5 pr-2 text-right text-ink-muted">
        {entry.seriesWon > 0 ? entry.seriesWon : '--'}
      </td>
      <td className="tabular py-2.5 pr-5 text-right text-lg font-bold text-gold">{entry.points}</td>
    </tr>
  );
}

function BotaoDeImagem({
  onClick,
  carregando,
  vazio,
  children,
}: {
  onClick: () => void;
  carregando: boolean;
  vazio: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={carregando || vazio}
      className="flex items-center gap-1.5 rounded-md border border-line/60 bg-raised px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * O selo de "KDA player" (issue #16, pedido do grupo).
 *
 * É zoeira, e a tela precisa deixar isso óbvio -- selo ambíguo num ranking de
 * verdade vira briga no grupo. Por isso não usa o ouro, que aqui significa
 * mérito, e o título explica a conta em vez de só rotular.
 */
function SeloKdaPlayer() {
  return (
    <span
      className="ml-1.5 rounded bg-overlay px-1.5 py-px text-[10px] font-bold text-ink-faint"
      title="KDA player: KDA acima da média do grupo, mas dano e participação em abates abaixo. É brincadeira."
    >
      KDA player
    </span>
  );
}

/**
 * Um troféu por MD3 vencida -- mesmo formato que o grupo já usa no zap
 * ("VINI 🏆🏆"). Acima de 4 vira "🏆xN" para não estourar a linha.
 */
function Trofeus({ quantidade, recente }: { quantidade: number; recente: boolean }) {
  if (quantidade <= 0) return null;

  const titulo =
    `${quantidade} MD3 vencida${quantidade > 1 ? 's' : ''}` +
    (recente ? ' · venceu a mais recente' : '');

  return (
    <span
      // Quem não venceu a mais recente aparece mais apagado: o troféu vira
      // histórico em vez de competir com quem ganhou na última noite.
      className={`ml-1.5 shrink-0 text-xs ${recente ? '' : 'opacity-50'}`}
      title={titulo}
    >
      {quantidade > 4 ? `🏆x${quantidade}` : '🏆'.repeat(quantidade)}
    </span>
  );
}

function LinhaCelular({ entry, posicao }: { entry: LeaderboardEntry; posicao: number }) {
  return (
    <li>
      <Link
        to={`/jogadores/${entry.playerId}`}
        className="flex items-center gap-3 px-4 py-3 transition active:bg-raised"
      >
        <span
          className={`tabular w-5 shrink-0 text-center text-base font-bold ${
            MEDAL[posicao] ?? 'text-ink-faint'
          }`}
        >
          {posicao + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">
            {entry.name}
            <Trofeus quantidade={entry.seriesWon} recente={entry.wonLastSeries} />
            {entry.isKdaPlayer && <SeloKdaPlayer />}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
            <span className="tabular">
              {entry.wins}–{entry.losses}
            </span>
            <span
              className={`tabular font-medium ${entry.winRate >= 50 ? 'text-win' : 'text-loss'}`}
            >
              {entry.winRate}%
            </span>
            <span className="tabular">KDA {entry.avgKda.toFixed(2)}</span>
            {entry.mainRole && (
              <span className="uppercase tracking-wide">{ROLE_LABEL[entry.mainRole]}</span>
            )}
          </p>
        </div>

        {/* Os campeões também aqui, menores. Some no telefone estreito, onde a
            linha já está cheia -- reconhecer a pessoa importa menos que ler o
            placar quando só cabe uma coisa. */}
        <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
          {entry.topChampions.slice(0, 3).map((champion) => (
            <ChampionIcon
              key={champion.championName}
              championName={champion.championName}
              size={24}
            />
          ))}
        </span>

        <span className="tabular shrink-0 text-xl font-bold text-gold">{entry.points}</span>
      </Link>
    </li>
  );
}
