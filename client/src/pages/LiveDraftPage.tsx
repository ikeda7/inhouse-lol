import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Copy, Radio, WifiOff } from 'lucide-react';
import { useDraftRoom } from '../hooks/useDraftRoom';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { CaptainsDraft } from '../components/CaptainsDraft';
import { TeamCard } from '../components/TeamCard';
import { fromCaptains, saveActiveDraft } from '../lib/activeDraft';

/**
 * Draft ao vivo (issue #6): todo mundo com o link vê a escolha acontecer.
 *
 * A tela é a mesma do modo Capitães -- o que muda é de onde vem o estado. Aqui
 * ele vem do servidor, atualizado por consulta a cada 2s, então a escolha de um
 * capitão aparece na tela dos outros nove.
 *
 * NÃO HÁ LOGIN. Quem tem o link escolhe. É o mesmo nível de confiança do
 * próprio saguão do jogo, e o servidor ainda garante o que importa: a escolha
 * entra no time da VEZ, e duas pessoas clicando junto não fazem duas escolhas.
 */
export function LiveDraftPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { sala, carregando, erro, conectado, escolher, escolhendo } = useDraftRoom(code);
  const [copiado, setCopiado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  if (carregando) return <LoadingState label="Entrando na sala..." />;
  if (erro && !sala) return <ErrorState error={erro} />;
  if (!sala) return <EmptyState label="Sala não encontrada ou expirada." />;

  const copiarLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const usarTimes = () => {
    if (!sala.teams) return;
    saveActiveDraft(fromCaptains(sala.teams));
    setConfirmado(true);
    navigate('/serie');
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Radio size={18} className={conectado ? 'text-win' : 'text-ink-faint'} />
              Draft ao vivo
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">
              Manda o link pro grupo. Todo mundo vê as escolhas acontecendo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* O código grande existe para ser LIDO EM VOZ ALTA numa call antes
                de o link chegar no zap. Por isso o alfabeto não tem 0/O/1/I. */}
            <span className="tabular rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-2xl font-bold tracking-[0.2em] text-gold">
              {sala.code}
            </span>
            <button
              onClick={copiarLink}
              className="flex items-center gap-1.5 rounded-md border border-line/60 bg-raised px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-gold/50 hover:text-gold"
            >
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar link'}
            </button>
          </div>
        </div>

        {/* Perder a conexão não apaga o draft -- a tela só avisa que o que está
            vendo pode estar velho, e volta sozinha quando a rede voltar. */}
        {!conectado && (
          <p className="mt-3 flex items-center justify-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            <WifiOff size={13} />
            Sem conexão com a sala. O que está na tela pode estar desatualizado.
          </p>
        )}
      </Card>

      <CaptainsDraft
        state={sala.state}
        onPick={escolher}
        escolhendo={escolhendo}
        erro={erro}
        onReiniciar={() => navigate('/sorteio')}
        reiniciarRotulo="Sair da sala"
      />

      {sala.teams && (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <TeamCard team={sala.teams.blueTeam} />
            <TeamCard team={sala.teams.redTeam} />
          </div>

          <div className="flex justify-center">
            <Button onClick={usarTimes}>
              {confirmado ? <Check size={16} /> : <ArrowRight size={16} />}
              Usar esses times na série
            </Button>
          </div>

          <p className="text-center text-xs text-ink-faint">
            Os capitães escolheram os times; as roles foram distribuídas dentro de cada um pelo
            pool declarado. ·{' '}
            <Link to="/sorteio" className="hover:text-gold">
              novo sorteio
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
