import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Trophy, Dices, Swords, Users, History, Flame, LogIn, CircleHelp } from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { DraftPage } from './pages/DraftPage';
import { SeriesPage } from './pages/SeriesPage';
import { PlayersPage } from './pages/PlayersPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { HistoryPage } from './pages/HistoryPage';
import { HighlightsPage } from './pages/HighlightsPage';
import { LiveDraftPage } from './pages/LiveDraftPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccountPage } from './pages/AccountPage';
import { AjudaPage } from './pages/AjudaPage';
import { useAuth } from './context/AuthContext';
import { Avatar } from './components/ui';

const NAV = [
  { to: '/', label: 'Ranking', short: 'Ranking', icon: Trophy, end: true },
  { to: '/sorteio', label: 'Sorteio', short: 'Sorteio', icon: Dices, end: false },
  { to: '/serie', label: 'Série', short: 'Série', icon: Swords, end: false },
  { to: '/destaques', label: 'Destaques', short: 'Destaques', icon: Flame, end: false },
  { to: '/historico', label: 'Histórico', short: 'Histórico', icon: History, end: false },
  { to: '/jogadores', label: 'Jogadores', short: 'Jogadores', icon: Users, end: true },
];

/**
 * Atalho da conta (issue #3).
 *
 * Fica no cabeçalho nos DOIS tamanhos de tela, e não na barra de baixo: com 6
 * abas, uma sétima deixaria cada item com ~45px num celular de 320px e
 * "Destaques" quebraria em duas linhas (ver o comentário da barra inferior).
 * O cabeçalho já existe nos dois e tem espaço sobrando à direita.
 */
function AtalhoDaConta() {
  const { player, loading } = useAuth();

  // Enquanto o /auth/me não responde, não mostra nada: piscar "Entrar" e
  // depois trocar pelo avatar é pior que aparecer meio segundo depois.
  if (loading) return <div className="h-6 w-6" aria-hidden="true" />;

  if (!player) {
    return (
      <NavLink
        to="/entrar"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-faint transition hover:text-ink-muted"
      >
        <LogIn size={15} />
        Entrar
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/conta"
      title={`Conta de ${player.name}`}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition ${
          isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`
      }
    >
      <Avatar photoUrl={player.photoUrl} name={player.name} size="sm" />
      {/* O nome some em telas estreitas: o avatar já identifica, e o espaço
          do cabeçalho é disputado com a marca. */}
      <span className="hidden max-w-24 truncate sm:inline">{player.name}</span>
    </NavLink>
  );
}

/**
 * Navegação em dois formatos:
 *  - no desktop, no topo junto do título;
 *  - no celular, barra fixa embaixo, onde o polegar alcança.
 *
 * Repetir a lista em duas marcações é mais simples e mais legível do que
 * espremer um menu só nos dois contextos com CSS.
 */
export function App() {
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-line/50 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <NavLink to="/" className="group flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight text-ink">InHouse</span>
            <span className="text-lg font-bold tracking-tight text-gold">LoL</span>
          </NavLink>

          <div className="flex items-center gap-1">
            {/* Entre 640 e 1023px, só ícone. Com rótulo, os seis itens mais
                "Entrar" pedem ~830px: a 768 a página inteira rolava de lado e o
                "Entrar" ficava cortado na borda -- em todo tablet e em todo
                notebook com a janela dividida. Achado pela verificação de telas
                no CI, não por olho. O rótulo continua no DOM como nome
                acessível do link (sr-only) e vira `title` para o mouse. */}
            <nav className="hidden gap-0.5 sm:flex" aria-label="Navegação principal">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={label}
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={15} />
                      <span className="sr-only lg:not-sr-only">{label}</span>
                      {/* Sublinhado do item ativo: marca a posição sem pintar
                          um bloco inteiro de cor. */}
                      {isActive && (
                        <span className="absolute inset-x-3 -bottom-[14px] h-px bg-gold" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* A ajuda fica no cabeçalho pelo mesmo motivo da conta: uma
                sétima aba na barra de baixo não cabe num celular de 320px. */}
            <NavLink
              to="/ajuda"
              title="Como funciona"
              aria-label="Ajuda: como funciona"
              className={({ isActive }) =>
                `flex h-8 w-8 items-center justify-center rounded-md transition ${
                  isActive ? 'text-gold' : 'text-ink-faint hover:text-ink-muted'
                }`
              }
            >
              <CircleHelp size={17} />
            </NavLink>

            <AtalhoDaConta />
          </div>
        </div>
      </header>

      {/* A largura acompanha a tela ate 1536px. Antes travava em 1024 e num
          monitor de 1080p sobrava meia tela vazia dos dois lados -- parecia
          layout de celular esticado. As paginas preenchem essa largura
          ganhando COLUNA, nao esticando a mesma coluna. */}
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sorteio" element={<DraftPage />} />
          <Route path="/serie" element={<SeriesPage />} />
          {/* Rota antiga: quem tiver o link salvo continua chegando. */}
          <Route path="/noite" element={<Navigate to="/serie" replace />} />
          {/* Sala de draft ao vivo: rota propria porque o link vai pro grupo
              e precisa abrir direto no draft, sem passar pelo sorteio. */}
          <Route path="/draft/:code" element={<LiveDraftPage />} />
          <Route path="/destaques" element={<HighlightsPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/jogadores" element={<PlayersPage />} />
          <Route path="/jogadores/:playerId" element={<PlayerProfilePage />} />
          {/* Contas de jogador (issue #3). */}
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/criar-conta" element={<RegisterPage />} />
          <Route path="/conta" element={<AccountPage />} />
          <Route path="/ajuda" element={<AjudaPage />} />
          <Route
            path="*"
            element={
              <p className="py-16 text-center text-sm text-ink-faint">Página não encontrada.</p>
            }
          />
        </Routes>
      </main>

      {/* Barra inferior no celular. `pb-safe` via padding-bottom evita que o
          gesto de home do iOS cubra os rótulos. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/50 bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
        aria-label="Navegação principal"
      >
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              // whitespace-nowrap: com 6 abas cada uma fica com ~53px num
              // celular de 320px, e "Destaques" quebraria em duas linhas,
              // desalinhando a barra inteira.
              `flex min-w-0 flex-1 flex-col items-center gap-1 whitespace-nowrap py-2.5 text-[10px] font-medium transition ${
                isActive ? 'text-gold' : 'text-ink-faint'
              }`
            }
          >
            <Icon size={18} />
            {short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
