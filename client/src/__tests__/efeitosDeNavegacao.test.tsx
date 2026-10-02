import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { EfeitosDeNavegacao } from '../components/EfeitosDeNavegacao';
import { tituloDaRota, tituloDaTela } from '../lib/titulos';

describe('tituloDaRota', () => {
  it('cada tela tem o próprio título, com o nome dela na frente', () => {
    expect(tituloDaRota('/')).toBe('Ranking · InHouse LoL');
    expect(tituloDaRota('/serie')).toBe('Série · InHouse LoL');
    expect(tituloDaRota('/historico')).toBe('Histórico · InHouse LoL');
    expect(tituloDaRota('/draft/ABC23')).toBe('Draft ao vivo · InHouse LoL');
    expect(tituloDaRota('/ajuda')).toBe('Como funciona · InHouse LoL');
  });

  it('a lista de jogadores e o perfil de um jogador não se confundem', () => {
    expect(tituloDaRota('/jogadores')).toBe('Jogadores · InHouse LoL');
    expect(tituloDaRota('/jogadores/p1')).toBe('Jogador · InHouse LoL');
  });

  it('rota desconhecida fica só com o nome do site', () => {
    expect(tituloDaRota('/nao-existe')).toBe('InHouse LoL');
    // "/serieX" não é a Série... mas "/series" antiga também não tem tela.
    expect(tituloDaRota('/conta-de-outro')).toBe('Sua conta · InHouse LoL');
  });

  it('o perfil monta o título com o nome da pessoa', () => {
    expect(tituloDaTela('Ikeda')).toBe('Ikeda · InHouse LoL');
  });
});

function Tela({ nome, para }: { nome: string; para: string }) {
  const navegar = useNavigate();
  return (
    <div>
      <h1>{nome}</h1>
      <Link to={para}>ir</Link>
      <Link to="?serie=s1">abrir série</Link>
      <button onClick={() => navegar(-1)}>voltar</button>
    </div>
  );
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/jogadores']}>
      <EfeitosDeNavegacao />
      <Routes>
        <Route path="/jogadores" element={<Tela nome="Lista" para="/jogadores/p1" />} />
        <Route path="/jogadores/:id" element={<Tela nome="Perfil" para="/jogadores" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EfeitosDeNavegacao', () => {
  const rolar = vi.fn();

  beforeEach(() => {
    rolar.mockClear();
    window.scrollTo = rolar as unknown as typeof window.scrollTo;
  });

  it('põe o título da rota na aba e troca junto com a tela', async () => {
    const usuario = userEvent.setup();
    montar();
    expect(document.title).toBe('Jogadores · InHouse LoL');

    await usuario.click(screen.getByRole('link', { name: 'ir' }));
    expect(document.title).toBe('Jogador · InHouse LoL');
  });

  it('indo para outra tela, ela começa do topo', async () => {
    const usuario = userEvent.setup();
    montar();
    rolar.mockClear();

    await usuario.click(screen.getByRole('link', { name: 'ir' }));

    expect(await screen.findByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    expect(rolar).toHaveBeenCalledWith(0, 0);
  });

  it('voltando, deixa a posição que o navegador lembra', async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(screen.getByRole('link', { name: 'ir' }));
    rolar.mockClear();

    await usuario.click(screen.getByRole('button', { name: 'voltar' }));

    expect(await screen.findByRole('heading', { name: 'Lista' })).toBeInTheDocument();
    expect(rolar).not.toHaveBeenCalled();
  });

  it('mudar só a consulta (abrir uma série) não mexe na rolagem', async () => {
    const usuario = userEvent.setup();
    montar();
    rolar.mockClear();

    await usuario.click(screen.getByRole('link', { name: 'abrir série' }));

    expect(rolar).not.toHaveBeenCalled();
  });
});
