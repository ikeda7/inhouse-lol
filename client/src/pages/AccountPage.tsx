import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Image, KeyRound, LogOut, Upload, User } from 'lucide-react';
import { accountApi, riotApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAction, useAsync } from '../hooks/useAsync';
import { resizeToDataUrl } from '../lib/imageResize';
import { Avatar, Button, Card, CardTitle, ErrorState, Input, LoadingState } from '../components/ui';
import type { Account } from '../types';

/** Cada seção recebe o jogador e como avisar o resto do app que ele mudou. */
interface SecaoProps {
  player: Account;
  onChanged: (player: Account) => void;
}

export function AccountPage() {
  const { player, loading, logout, setPlayer } = useAuth();

  if (loading) return <LoadingState />;
  if (!player) return <Navigate to="/entrar" replace />;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 py-2 sm:py-6">
      {/* Três cartões empilhados numa coluna de 672px estouravam a altura da
          tela enquanto sobrava metade da largura vazia dos dois lados. A partir
          de `lg` eles dividem em duas colunas e a página deixa de rolar.
          `items-start` é o que impede o cartão da foto (curto) de esticar até a
          altura da coluna dos formulários. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <SecaoFoto player={player} onChanged={setPlayer} />

        <div className="space-y-4">
          <SecaoPerfil player={player} onChanged={setPlayer} />
          <SecaoSenha />
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => void logout()}>
          <LogOut size={14} />
          Sair
        </Button>
      </div>
    </div>
  );
}

function SecaoFoto({ player, onChanged }: SecaoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erroLocal, setErroLocal] = useState<Error | null>(null);

  const enviar = useAction(accountApi.uploadPhoto);
  const usarLol = useAction(accountApi.syncLolPhoto);

  /**
   * O ícone do LoL depende da `RIOT_API_KEY`, e em produção ela não está
   * configurada. O botão ficava habilitado prometendo "busca o ícone atual da
   * sua conta" -- e a pessoa só descobria depois de clicar, num erro genérico.
   *
   * Este endpoint já existia e não era consumido por ninguém, apesar de o
   * comentário dele dizer que a UI usava. Agora usa.
   *
   * Enquanto carrega, NÃO assume indisponível: `enabled === false` só vale
   * depois da resposta chegar, senão o botão piscaria bloqueado a cada visita.
   */
  const riot = useAsync(() => riotApi.status());
  const semChave = riot.data ? !riot.data.enabled : false;

  const escolherArquivo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    // Zera o input para permitir reescolher o MESMO arquivo depois de um erro:
    // sem isso o onChange nao dispara de novo.
    evento.target.value = '';
    if (!arquivo) return;

    setErroLocal(null);
    try {
      const redimensionada = await resizeToDataUrl(arquivo);
      const atualizado = await enviar.run(redimensionada);
      if (atualizado) onChanged(atualizado);
    } catch (erro) {
      setErroLocal(erro instanceof Error ? erro : new Error(String(erro)));
    }
  };

  const trocarPeloLol = async () => {
    const atualizado = await usarLol.run();
    if (atualizado) onChanged(atualizado);
  };

  const erro = enviar.error ?? usarLol.error ?? erroLocal;

  return (
    <Card>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
        <Avatar photoUrl={player.photoUrl} name={player.name} size="lg" />

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-lg font-bold tracking-tight text-ink">{player.name}</p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{player.email}</p>

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={escolherArquivo}
              className="hidden"
            />
            <Button
              size="sm"
              variant="ghost"
              loading={enviar.loading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={13} />
              Enviar foto
            </Button>

            <Button
              size="sm"
              variant="ghost"
              loading={usarLol.loading}
              disabled={!player.riotId || semChave}
              title={
                semChave
                  ? 'Indisponível: a chave da Riot não está configurada no servidor'
                  : player.riotId
                    ? 'Busca o ícone de invocador atual da sua conta do LoL'
                    : 'Preencha o Riot ID abaixo para usar o ícone do LoL'
              }
              onClick={() => void trocarPeloLol()}
            >
              <Image size={13} />
              Usar ícone do LoL
            </Button>
          </div>

          <p className="mt-2 text-[11px] text-ink-faint">
            A imagem é recortada em quadrado e reduzida no seu navegador antes de subir.
          </p>

          {/* Diz o motivo ANTES do clique, e diz que o outro caminho funciona --
              o recado útil não é "faltou uma chave", é "sobe a foto e segue". */}
          {semChave && (
            <p className="mt-1 text-[11px] text-ink-faint">
              O ícone do LoL está indisponível: o servidor está sem a chave da Riot. Enviar foto
              funciona normalmente.
            </p>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-3">
          <ErrorState error={erro} />
        </div>
      )}
    </Card>
  );
}

function SecaoPerfil({ player, onChanged }: SecaoProps) {
  const [nome, setNome] = useState(player.name);
  const [riotId, setRiotId] = useState(player.riotId ?? '');
  const [salvo, setSalvo] = useState(false);

  const salvar = useAction(accountApi.update);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvo(false);
    const atualizado = await salvar.run({ name: nome.trim(), riotId: riotId.trim() || null });
    if (atualizado) {
      onChanged(atualizado);
      setSalvo(true);
    }
  };

  return (
    <Card title={<CardTitle icon={User}>Perfil</CardTitle>}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            required
          />
          <Input
            label="Riot ID"
            value={riotId}
            onChange={(evento) => setRiotId(evento.target.value)}
            placeholder="Cangosul#PCBR"
          />
        </div>

        <p className="text-[11px] text-ink-faint">
          O Riot ID é o que liga você ao histórico do cliente do LoL: sem ele, a importação
          automática não sabe quem é quem no scoreboard. Ele também é o que libera o ícone do LoL
          como foto.
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={salvar.loading}>
            <Check size={14} />
            Salvar
          </Button>
          {salvo && !salvar.loading && <span className="text-xs text-win">Salvo.</span>}
        </div>

        {salvar.error && <ErrorState error={salvar.error} />}
      </form>
    </Card>
  );
}

function SecaoSenha() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [trocada, setTrocada] = useState(false);

  const trocar = useAction(accountApi.changePassword);
  const senhasBatem = nova === confirmacao;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!senhasBatem) return;
    setTrocada(false);

    if (await trocar.run({ currentPassword: atual, newPassword: nova })) {
      setAtual('');
      setNova('');
      setConfirmacao('');
      setTrocada(true);
    }
  };

  return (
    <Card title={<CardTitle icon={KeyRound}>Senha</CardTitle>}>
      <form onSubmit={enviar} className="space-y-4">
        <Input
          label="Senha atual"
          type="password"
          value={atual}
          onChange={(evento) => setAtual(evento.target.value)}
          autoComplete="current-password"
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nova senha"
            type="password"
            value={nova}
            onChange={(evento) => setNova(evento.target.value)}
            autoComplete="new-password"
            minLength={8}
            placeholder="pelo menos 8 caracteres"
            required
          />
          <div>
            <Input
              label="Repita a nova"
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
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={trocar.loading} disabled={!senhasBatem}>
            <Check size={14} />
            Trocar senha
          </Button>
          {trocada && !trocar.loading && <span className="text-xs text-win">Senha trocada.</span>}
        </div>

        {trocar.error && <ErrorState error={trocar.error} />}
      </form>
    </Card>
  );
}
