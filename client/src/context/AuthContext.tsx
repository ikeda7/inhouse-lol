import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../api/client';
import type { Player } from '../types';

/**
 * Sessao do jogador logado (issue #3).
 *
 * E o primeiro estado global do app -- ate aqui cada tela se virava com
 * useState. Nao guarda nada em localStorage de proposito: a sessao vive no
 * cookie httpOnly, que o JS nem enxerga, e o estado em memoria e reidratado
 * com GET /auth/me a cada carregamento.
 */

interface AuthValue {
  player: Player | null;
  /** true enquanto o /auth/me inicial nao respondeu -- evita piscar "Entrar". */
  loading: boolean;
  login: (input: { email: string; password: string }) => Promise<Player>;
  register: (input: { playerId: string; email: string; password: string }) => Promise<Player>;
  logout: () => Promise<void>;
  /** Atualiza o jogador em memoria depois de mexer no proprio perfil. */
  setPlayer: (player: Player) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    authApi
      .me()
      .then((atual) => {
        if (!cancelado) setPlayer(atual);
      })
      .catch(() => {
        // Servidor fora do ar nao deve travar o app inteiro numa tela de erro:
        // as telas publicas (ranking, historico) continuam funcionando.
        if (!cancelado) setPlayer(null);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const logado = await authApi.login(input);
    setPlayer(logado);
    return logado;
  }, []);

  const register = useCallback(
    async (input: { playerId: string; email: string; password: string }) => {
      const criado = await authApi.register(input);
      setPlayer(criado);
      return criado;
    },
    []
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setPlayer(null);
  }, []);

  return (
    <AuthContext.Provider value={{ player, loading, login, register, logout, setPlayer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return value;
}
