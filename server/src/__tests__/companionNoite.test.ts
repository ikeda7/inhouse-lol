import { describe, expect, it } from 'vitest';
// @ts-expect-error -- o agente é JS puro e sem dependências, de propósito: não tem tipos.
import * as agente from '../../../companion/inhouse-companion.mjs';

/**
 * `--noite` do agente local (#131): importar a noite inteira na ordem, abrindo
 * a MD3 quando falta e parando na primeira recusa.
 *
 * O cliente do LoL não roda no CI, então o fluxo recebe `enviar` e `abrirMd3`
 * por parâmetro. Aqui eles são um servidor de mentira com as mesmas respostas
 * da API de verdade (`/ingest/lcu` e `/series/garantir`).
 */

type Jogo = { gameId: number; gameCreation: number };
type Resposta = { ok: boolean; payload: { code?: string; data?: Record<string, unknown> } };

// Quinta 10/09/2026, horário local da máquina que roda o teste.
const quinta = (hora: number, minuto = 0) => new Date(2026, 8, 10, hora, minuto).getTime();

/** Um servidor que fecha a MD3 em 2 vitórias do mesmo time, como o de verdade. */
function servidorDeMentira({
  md3Aberta = true,
  jaImportados = [] as number[],
  semVinculo = [] as number[],
} = {}) {
  let serie: { id: string; vitorias: number } | null = md3Aberta ? { id: 's1', vitorias: 0 } : null;
  let proxima = md3Aberta ? 2 : 1;
  const chamadas: string[] = [];

  const enviar = async (jogo: Jogo, extras: { refreshStats?: boolean }): Promise<Resposta> => {
    chamadas.push(`${jogo.gameId}${extras.refreshStats ? ':refresh' : ''}`);
    if (semVinculo.includes(jogo.gameId)) {
      return { ok: false, payload: { code: 'UNMATCHED_PARTICIPANTS' } };
    }
    if (jaImportados.includes(jogo.gameId)) {
      return extras.refreshStats
        ? { ok: true, payload: { data: { saved: true, refreshed: true } } }
        : {
            ok: true,
            payload: {
              data: { saved: false, alreadyImported: true, match: { seriesId: 'antiga' } },
            },
          };
    }
    if (!serie) return { ok: false, payload: { code: 'NO_ONGOING_SERIES' } };
    serie.vitorias++;
    const gravada = { id: serie.id, blueScore: serie.vitorias, redScore: 0 };
    if (serie.vitorias === 2) serie = null;
    return { ok: true, payload: { data: { saved: true, series: gravada } } };
  };

  const abertas: string[] = [];
  const abrirMd3 = async (nome: string): Promise<Resposta> => {
    abertas.push(nome);
    serie = { id: `s${proxima++}`, vitorias: 0 };
    return { ok: true, payload: { data: { criada: true } } };
  };

  return { enviar, abrirMd3, chamadas, abertas };
}

describe('noite no agente local', () => {
  it('0h30 de sexta ainda é a noite de quinta, com o mesmo nome que o site dá', () => {
    expect(agente.nomeDaNoite(quinta(21))).toBe('Quinta 10/09');
    expect(agente.nomeDaNoite(new Date(2026, 8, 11, 0, 30).getTime())).toBe('Quinta 10/09');
    expect(agente.nomeDaNoite(new Date(2026, 8, 11, 7).getTime())).toBe('Sexta 11/09');
  });

  it('pega só a noite mais recente, na ordem em que os jogos foram jogados', () => {
    const semanaPassada = new Date(2026, 8, 3, 22).getTime();
    const jogos = agente.jogosDaUltimaNoite([
      { gameId: 3, gameCreation: new Date(2026, 8, 11, 0, 40).getTime() },
      { gameId: 9, gameCreation: semanaPassada },
      { gameId: 1, gameCreation: quinta(22) },
      { gameId: 2, gameCreation: quinta(23) },
      { gameId: 7, gameCreation: 0 },
    ]);
    expect(jogos.map((j: Jogo) => j.gameId)).toEqual([1, 2, 3]);
  });

  it('com a MD3 aberta, grava tudo na ordem', async () => {
    const servidor = servidorDeMentira();
    const jogos = [1, 2].map((id) => ({ gameId: id, gameCreation: quinta(21 + id) }));
    const resumo = await agente.importarNoite({ jogos, ...servidor });
    expect(servidor.chamadas).toEqual(['1', '2']);
    expect(resumo).toMatchObject({ gravadas: 2, atualizadas: 0, parouEm: null, md3Abertas: [] });
  });

  it('sem MD3 aberta, abre a da noite; quando ela fecha em 2 vitórias, abre a segunda', async () => {
    const servidor = servidorDeMentira({ md3Aberta: false });
    const jogos = [1, 2, 3, 4].map((id) => ({ gameId: id, gameCreation: quinta(20 + id) }));
    const resumo = await agente.importarNoite({ jogos, ...servidor });
    expect(servidor.abertas).toEqual(['Quinta 10/09', 'Quinta 10/09 · MD3 2']);
    expect(resumo.gravadas).toBe(4);
  });

  it('o que já entrou é atualizado no lugar, sem duplicar', async () => {
    const servidor = servidorDeMentira({ jaImportados: [1] });
    const jogos = [1, 2].map((id) => ({ gameId: id, gameCreation: quinta(21 + id) }));
    const resumo = await agente.importarNoite({ jogos, ...servidor });
    expect(servidor.chamadas).toEqual(['1', '1:refresh', '2']);
    expect(resumo).toMatchObject({ gravadas: 1, atualizadas: 1 });
  });

  it('para na primeira recusa: o jogo 3 nunca entra como jogo 2 da MD3', async () => {
    const servidor = servidorDeMentira({ semVinculo: [2] });
    const jogos = [1, 2, 3].map((id) => ({ gameId: id, gameCreation: quinta(20 + id) }));
    const resumo = await agente.importarNoite({ jogos, ...servidor });
    expect(servidor.chamadas).toEqual(['1', '2']);
    expect(resumo.parouEm.jogo.gameId).toBe(2);
    expect(resumo.parouEm.resultado.payload.code).toBe('UNMATCHED_PARTICIPANTS');
  });

  it('em dry-run não abre MD3 nem atualiza nada: só confere', async () => {
    const servidor = servidorDeMentira({ md3Aberta: false, jaImportados: [2] });
    const jogos = [1, 2].map((id) => ({ gameId: id, gameCreation: quinta(21 + id) }));
    const resumo = await agente.importarNoite({ jogos, ...servidor, dryRun: true });
    expect(servidor.abertas).toEqual([]);
    expect(servidor.chamadas).toEqual(['1', '2']);
    expect(resumo).toMatchObject({ gravadas: 0, atualizadas: 0, conferidas: 2, parouEm: null });
  });
});
