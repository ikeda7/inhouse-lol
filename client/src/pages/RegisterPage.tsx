import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAction, useAsync } from '../hooks/useAsync';
import { Select } from '../components/Select';
import { Avatar, Button, Card, EmptyState, ErrorState, Input, LoadingState } from '../components/ui';

/**
 * Criar conta = reivindicar um jogador que JA existe no elenco.
 *
 * Nao existe cadastro paralelo: o elenco e curado na aba Jogadores, e a conta
 * so da login a alguem que ja joga. Por isso o primeiro passo e escolher quem
 * voce e, e nao digitar um nome novo -- assim a conta ja nasce ligada ao
 * historico de partidas da pessoa.
 */
export function RegisterPage() {
  const { player, loading, register } = useAuth();
  const navegar = useNavigate();

  const disponiveis = useAsync(() => authApi.claimable());
  const [playerId, setPlayerId] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  const criar = useAction(register);

  if (!loading && player) return <Navigate to="/conta" replace />;

  const escolhido = disponiveis.data?.find((candidato) => candidato.id === playerId) ?? null;
  const senhasBatem = senha === confirmacao;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!senhasBatem) return;
    if (await criar.run({ playerId, email: email.trim(), password: senha })) navegar('/conta');
  };

  return (
    <div className="mx-auto w-full max-w-sm py-6 sm:py-12">
      <Card title="Criar conta">
        {disponiveis.loading ? (
          <LoadingState label="Carregando o elenco..." />
        ) : disponiveis.error ? (
          <ErrorState error={disponiveis.error} onRetry={disponiveis.reload} />
        ) : disponiveis.data?.length === 0 ? (
          <EmptyState label="Todo mundo do elenco já tem conta. Se você é novo no grupo, peça para alguém te cadastrar na aba Jogadores primeiro." />
        ) : (
          <form onSubmit={enviar} className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Quem é você
              </span>
              <Select
                value={playerId}
                onChange={setPlayerId}
                ariaLabel="Escolha o seu jogador no elenco"
                placeholder="Escolha o seu nome..."
                options={(disponiveis.data ?? []).map((candidato) => ({
                  value: candidato.id,
                  label: candidato.name,
                  hint: candidato.riotId ?? 'sem Riot ID',
                }))}
              />
              {escolhido && (
                <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
                  <Avatar name={escolhido.name} size="sm" />
                  Sua conta vai ficar ligada ao histórico de {escolhido.name}.
                </p>
              )}
            </div>

            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="voce@exemplo.com"
              required
            />

            <Input
              label="Senha"
              type="password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              autoComplete="new-password"
              minLength={8}
              placeholder="pelo menos 8 caracteres"
              required
            />

            <div>
              <Input
                label="Repita a senha"
                type="password"
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                autoComplete="new-password"
                invalid={confirmacao.length > 0 && !senhasBatem}
                required
              />
              {confirmacao.length > 0 && !senhasBatem && (
                <p className="mt-1.5 text-[11px] text-warn">As duas senhas não são iguais.</p>
              )}
            </div>

            <Button
              type="submit"
              loading={criar.loading}
              disabled={!playerId || !senhasBatem}
              className="w-full"
            >
              <UserPlus size={15} />
              Criar conta
            </Button>

            {criar.error && <ErrorState error={criar.error} />}
          </form>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-ink-muted">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-semibold text-gold hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
