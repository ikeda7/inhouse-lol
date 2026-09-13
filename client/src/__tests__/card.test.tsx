import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Trophy } from 'lucide-react';
import { Card, CardTitle } from '../components/ui';

describe('Card e CardTitle', () => {
  it('título em texto vira o mesmo cabeçalho de seção do CardTitle', () => {
    render(<Card title="Jogadores (3)">conteúdo</Card>);
    expect(screen.getByRole('heading', { level: 2, name: 'Jogadores (3)' })).toBeInTheDocument();
  });

  it('o ícone do título é decoração: o leitor de tela lê só o nome da seção', () => {
    const { container } = render(<CardTitle icon={Trophy}>Classificação geral</CardTitle>);
    expect(screen.getByRole('heading', { name: 'Classificação geral' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('o fio dourado do bloco principal não acrescenta nada ao que é lido', () => {
    const { container } = render(
      <Card destaque title="Recordes">
        conteúdo
      </Card>
    );
    const secao = container.querySelector('section');
    expect(secao?.textContent).toBe('Recordesconteúdo');
    expect(secao?.querySelectorAll('[aria-hidden]')).toHaveLength(1);
  });
});
