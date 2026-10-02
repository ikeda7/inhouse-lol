import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../api/client';
import type { Account } from '../types';

/**
 * Sessao do jogador logado (issue #3).
 *
 * E o primeiro estado global do app -- ate aqui cada tela se virava com
 * useState. Nao guarda nada em localStorage de proposito: a sessao vive no
 * cookie httpOnly, que o JS nem enxerga, e o estado em memoria e reidratado
 * com GET /auth/me a cada carregamento.
 */

interface AuthValue {
  player: Account | null;
  /**
   * true enquanto o /auth/me e as permissoes iniciais nao responderam -- evita
   * piscar "Entrar" e evita mostrar "so o admin" ao proprio admin.
   */
  loading: boolean;
  /**
   * Se a tela deve oferecer os controles de admin (cadastro de jogadores,
   * registro manual, encerrar a MD3). Só esconde botão: quem recusa de verdade
   * é o servidor. Enquanto não respondeu é `false`, para o botão não piscar
   * para quem não pode usar.
   */
  podeAdministrar: boolean;
  /** Se ainda dá para criar conta pelo site (com admin nomeado, não dá). */
  cadastroAberto: boolean;
  login: (input: { email: string; password: string }) => Promise<Account>;
  register: (input: { playerId: string; email: string; password: string }) => Promise<Account>;
  logout: () => Promise<void>;
  /** Atualiza o jogador em memoria depois de mexer no proprio perfil. */
  setPlayer: (player: Account) => void;
}

type Permissoes = Pick<AuthValue, 'podeAdministrar' | 'cadastroAberto'>;

const SEM_RESPOSTA: Permissoes = { podeAdministrar: false, cadastroAberto: false };
const TUDO_LIBERADO: Permissoes = { podeAdministrar: true, cadastroAberto: true };

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissoes, setPermissoes] = useState(SEM_RESPOSTA);

  // Depende de quem está logado, então é refeita a cada entrada e saída. Se a
  // pergunta falhar, mostra os botões: a tela não decide nada, e esconder por
  // engano deixaria o admin sem ter onde clicar.
  const conferirPermissoes = useCallback(async () => {
    try {
      return await authApi.permissoes();
    } catch {
      return TUDO_LIBERADO;
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    // Servidor fora do ar nao deve travar o app inteiro numa tela de erro: as
    // telas publicas (ranking, historico) continuam funcionando.
    const quemSou = authApi.me().catch(() => null);

    // `loading` so cai quando as duas respostas chegaram: uma tela que e
    // inteira do admin (o Sorteio) nao pode mostrar "so o admin" ao proprio
    // admin enquanto a permissao dele ainda esta a caminho.
    Promise.all([quemSou, conferirPermissoes()]).then(([atual, atuais]) => {
      if (cancelado) return;
      setPlayer(atual);
      setPermissoes(atuais);
      setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, [conferirPermissoes]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const logado = await authApi.login(input);
      setPlayer(logado);
      setPermissoes(await conferirPermissoes());
      return logado;
    },
    [conferirPermissoes]
  );

  const register = useCallback(
    async (input: { playerId: string; email: string; password: string }) => {
      const criado = await authApi.register(input);
      setPlayer(criado);
      setPermissoes(await conferirPermissoes());
      return criado;
    },
    [conferirPermissoes]
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setPlayer(null);
    setPermissoes(await conferirPermissoes());
  }, [conferirPermissoes]);

  return (
    <AuthContext.Provider
      value={{ player, loading, ...permissoes, login, register, logout, setPlayer }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return value;
}
