import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Highlights } from '../components/Highlights';
import { ItemRow } from '../components/BuildIcons';
import { MatchObjectives, MatchBans } from '../components/MatchObjectives';
import type { MatchBan, MatchTeamStat } from '../types';

/**
 * Comportamento de componente.
 *
 * O que está aqui não dá para verificar chamando função pura: são regras que só
 * existem na renderização -- o selo que aparece ou não, a build que diz
 * "indisponível" em vez de mostrar sete quadrados vazios, o bloco de objetivos
 * que some quando falta um lado.
 *
 * As consultas usam texto acessível, não classe CSS: assim o teste quebra
 * quando o comportamento muda, não quando o Tailwind muda.
 *
 * Nota: nada aqui espera o Data Dragon. Em jsdom o `fetch` do manifesto falha, e
 * isso é proposital -- os componentes têm que funcionar com o CDN fora do ar, e
 * o teste passa a cobrir esse caminho de graça.
 */

describe('Highlights', () => {
  it('mostra quadra e penta, mas ignora triple', () => {
    // O corte é regra de negócio: triple num custom de 10 acontece toda
    // partida. Se tudo vira selo, nada é destaque.
    render(<Highlights stat={{ largestMultiKill: 3, largestKillingSpree: 0, firstBloodKill: false }} />);
    expect(screen.queryByText(/quadra/i)).not.toBeInTheDocument();

    render(<Highlights stat={{ largestMultiKill: 4, largestKillingSpree: 0, firstBloodKill: false }} />);
    expect(screen.getByText('Quadra kill')).toBeInTheDocument();

    render(<Highlights stat={{ largestMultiKill: 5, largestKillingSpree: 0, firstBloodKill: false }} />);
    expect(screen.getByText('Pentakill')).toBeInTheDocument();
  });

  it('mostra sequência só a partir de 6', () => {
    render(<Highlights stat={{ largestMultiKill: 0, largestKillingSpree: 5, firstBloodKill: false }} />);
    expect(screen.queryByText(/abates sem morrer/i)).not.toBeInTheDocument();

    render(<Highlights stat={{ largestMultiKill: 0, largestKillingSpree: 6, firstBloodKill: false }} />);
    expect(screen.getByText(/6 abates sem morrer/)).toBeInTheDocument();
  });

  it('não renderiza nada quando não há destaque', () => {
    const { container } = render(
      <Highlights stat={{ largestMultiKill: 2, largestKillingSpree: 3, firstBloodKill: false }} />
    );

    // Um span vazio abriria espaço na linha do scoreboard sem motivo.
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra first blood', () => {
    render(<Highlights stat={{ largestMultiKill: 0, largestKillingSpree: 0, firstBloodKill: true }} />);
    expect(screen.getByText('First blood')).toBeInTheDocument();
  });
});

describe('ItemRow', () => {
  it('diz que a build está indisponível quando a origem não sabe', () => {
    // Sete quadrados vazios pareceriam alguém que jogou a partida inteira sem
    // comprar nada. É o caso do replay, que não guarda build.
    render(<ItemRow items={null} />);

    expect(screen.getByText(/build indisponível/i)).toBeInTheDocument();
  });

  it('desenha os slots quando a origem trouxe a build, mesmo vazios', () => {
    render(<ItemRow items="3084,0,0,0,0,0,3340" />);

    expect(screen.queryByText(/build indisponível/i)).not.toBeInTheDocument();
    // Sem o Data Dragon os slots viram o placeholder, e "slot vazio" continua
    // sendo informação: esse jogador terminou com um item só.
    expect(screen.getAllByTitle('Slot vazio').length).toBeGreaterThan(0);
  });
});

function time(overrides: Partial<MatchTeamStat>): MatchTeamStat {
  return {
    teamSide: 'BLUE',
    win: true,
    towerKills: 0,
    inhibitorKills: 0,
    dragonKills: 0,
    baronKills: 0,
    riftHeraldKills: 0,
    voidgrubKills: 0,
    firstBlood: false,
    firstTower: false,
    firstInhibitor: false,
    firstBaron: false,
    firstDragon: false,
    ...overrides,
  };
}

describe('MatchObjectives', () => {
  it('some quando falta um dos lados', () => {
    // Acontece nas partidas importadas antes de MatchTeamStat existir. Melhor
    // sumir do que desenhar meia tabela de confronto.
    const { container } = render(<MatchObjectives teams={[time({ teamSide: 'BLUE' })]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o confronto quando os dois lados existem', () => {
    render(
      <MatchObjectives
        teams={[
          time({ teamSide: 'BLUE', dragonKills: 3, towerKills: 9 }),
          time({ teamSide: 'RED', dragonKills: 1, towerKills: 2, win: false }),
        ]}
      />
    );

    expect(screen.getByText('Dragões')).toBeInTheDocument();
    expect(screen.getByText('Torres')).toBeInTheDocument();
  });

  it('esconde objetivo que ninguém pegou', () => {
    // Linha "Barões 0 a 0" é ruído: não aconteceu, não precisa aparecer.
    render(
      <MatchObjectives
        teams={[time({ teamSide: 'BLUE', dragonKills: 2 }), time({ teamSide: 'RED', win: false })]}
      />
    );

    expect(screen.getByText('Dragões')).toBeInTheDocument();
    expect(screen.queryByText('Barões')).not.toBeInTheDocument();
  });

  it('marca os "primeiros" na cor de quem levou', () => {
    render(
      <MatchObjectives
        teams={[
          time({ teamSide: 'BLUE', firstBlood: true, towerKills: 1 }),
          time({ teamSide: 'RED', firstTower: true, win: false }),
        ]}
      />
    );

    expect(screen.getByText('First blood')).toBeInTheDocument();
    expect(screen.getByText('1ª torre')).toBeInTheDocument();
    // Ninguém pegou barão: o marco não existe.
    expect(screen.queryByText('1º barão')).not.toBeInTheDocument();
  });
});

function ban(pickTurn: number, teamSide: 'BLUE' | 'RED', championName: string | null): MatchBan {
  return { teamSide, championId: 100 + pickTurn, championName, pickTurn };
}

describe('MatchBans', () => {
  it('não renderiza nada sem bans', () => {
    const { container } = render(<MatchBans bans={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('separa por time e diz quem baniu o quê', () => {
    render(
      <MatchBans
        bans={[ban(1, 'BLUE', 'Aatrox'), ban(2, 'RED', 'Ahri'), ban(3, 'BLUE', 'Jax')]}
      />
    );

    expect(screen.getByTitle(/Aatrox · banido pelo time azul/)).toBeInTheDocument();
    expect(screen.getByTitle(/Ahri · banido pelo time vermelho/)).toBeInTheDocument();
  });

  it('mostra o id quando o nome não resolveu', () => {
    // O nome é gravado junto com o id justamente porque o Data Dragon muda de
    // versão; se mesmo assim faltar, o ban aparece pelo número em vez de sumir.
    render(<MatchBans bans={[ban(1, 'BLUE', null)]} />);

    expect(screen.getByTitle(/Campeão 101/)).toBeInTheDocument();
  });
});
