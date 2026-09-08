import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Trophy, Dices, Swords, Users, History, Flame } from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { DraftPage } from './pages/DraftPage';
import { SeriesPage } from './pages/SeriesPage';
import { PlayersPage } from './pages/PlayersPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { HistoryPage } from './pages/HistoryPage';
import { HighlightsPage } from './pages/HighlightsPage';

const NAV = [
  { to: '/', label: 'Ranking', short: 'Ranking', icon: Trophy, end: true },
  { to: '/sorteio', label: 'Sorteio', short: 'Sorteio', icon: Dices, end: false },
  { to: '/serie', label: 'Série', short: 'Série', icon: Swords, end: false },
  { to: '/destaques', label: 'Destaques', short: 'Destaques', icon: Flame, end: false },
  { to: '/historico', label: 'Histórico', short: 'Histórico', icon: History, end: false },
  { to: '/jogadores', label: 'Jogadores', short: 'Jogadores', icon: Users, end: true },
];

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
      <header className="sticky top-0 z-30 border-b border-line/50 bg-base/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
          <NavLink to="/" className="group flex items-baseline gap-1.5">
            <span className="text-base font-bold tracking-tight text-ink">InHouse</span>
            <span className="text-base font-bold tracking-tight text-gold">LoL</span>
          </NavLink>

          <nav className="hidden gap-0.5 sm:flex" aria-label="Navegação principal">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                    isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={14} />
                    {label}
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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sorteio" element={<DraftPage />} />
          <Route path="/serie" element={<SeriesPage />} />
          {/* Rota antiga: quem tiver o link salvo continua chegando. */}
          <Route path="/noite" element={<Navigate to="/serie" replace />} />
          <Route path="/destaques" element={<HighlightsPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/jogadores" element={<PlayersPage />} />
          <Route path="/jogadores/:playerId" element={<PlayerProfilePage />} />
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
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/50 bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
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
