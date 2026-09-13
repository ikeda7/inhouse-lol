import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESPERA_DA_FONTE_MS, fonte, fontesProntas } from '../lib/imagem/canvas';

/** Troca `document.fonts` só neste teste; o jsdom não tem FontFaceSet. */
function simularFontes(load: (descricao: string) => Promise<unknown>) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts');
  vi.useRealTimers();
});

describe('fonte das imagens exportadas', () => {
  it('desenha com a mesma Inter da tela, com a do sistema de reserva', () => {
    expect(fonte(34, 700)).toMatch(/^700 34px "Inter Variable", .*sans-serif$/);
  });

  it('pede os três pesos que as imagens usam antes de desenhar', async () => {
    const load = vi.fn((_descricao: string) => Promise.resolve([]));
    simularFontes(load);
    await fontesProntas();
    expect(load.mock.calls.map(([descricao]) => descricao)).toEqual([
      '400 16px "Inter Variable"',
      '600 16px "Inter Variable"',
      '700 16px "Inter Variable"',
    ]);
  });

  it('sem suporte a document.fonts, segue sem travar', async () => {
    await expect(fontesProntas()).resolves.toBeUndefined();
  });

  it('se a fonte falhar, a imagem sai na fonte do sistema em vez de não sair', async () => {
    simularFontes(() => Promise.reject(new Error('sem rede')));
    await expect(fontesProntas()).resolves.toBeUndefined();
  });

  it('se a fonte demorar, desiste no prazo em vez de prender o botão', async () => {
    vi.useFakeTimers();
    simularFontes(() => new Promise(() => {}));
    let pronta = false;
    const espera = fontesProntas().then(() => {
      pronta = true;
    });

    await vi.advanceTimersByTimeAsync(ESPERA_DA_FONTE_MS - 1);
    expect(pronta).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await espera;
    expect(pronta).toBe(true);
  });
});
