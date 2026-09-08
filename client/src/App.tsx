import { NavLink, Route, Routes } from 'react-router-dom';
import { Trophy, Dices, Swords, Users, History } from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { DraftPage } from './pages/DraftPage';
import { SeriesPage } from './pages/SeriesPage';
import { PlayersPage } from './pages/PlayersPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { HistoryPage } from './pages/HistoryPage';

const NAV = [
  { to: '/', label: 'Classificacao', icon: Trophy, end: true },
  { to: '/sorteio', label: 'Sorteio', icon: Dices, end: false },
  { to: '/noite', label: 'Noite de jogos', icon: Swords, end: false },
  { to: '/historico', label: 'Historico', icon: History, end: false },
  { to: '/jogadores', label: 'Jogadores', icon: Users, end: true },
];

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hextech-700/60 bg-hextech-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-bold tracking-tight text-gold-400">
            InHouse <span className="text-gold-300">LoL</span>
          </h1>

          <nav className="flex flex-wrap gap-1" aria-label="Navegacao principal">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-gold-400/15 text-gold-400'
                      : 'text-gold-300/60 hover:text-gold-400'
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sorteio" element={<DraftPage />} />
          <Route path="/noite" element={<SeriesPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/jogadores" element={<PlayersPage />} />
          <Route path="/jogadores/:playerId" element={<PlayerProfilePage />} />
          <Route
            path="*"
            element={<p className="py-10 text-center text-sm text-gold-400/60">Pagina nao encontrada.</p>}
          />
        </Routes>
      </main>
    </div>
  );
}
