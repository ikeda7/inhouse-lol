/**
 * Limite de tentativas por chave (IP + rota), em memória.
 *
 * Não é cofre: na Vercel cada instância tem a própria memória e ela zera no
 * cold start. É freio de rajada -- o bastante para um robô não testar mil
 * senhas por minuto contra o login, sem trazer Redis para um app de amigos.
 */

export interface Limitador {
  /** true se a tentativa cabe na janela (e fica contada); false se estourou. */
  tentar(chave: string, agora?: number): boolean;
}

/** Acima disso, cada tentativa varre e descarta as chaves que já saíram da janela. */
const LIMPAR_ACIMA_DE = 5000;

export function criarLimitador({
  maximo,
  janelaMs,
}: {
  maximo: number;
  janelaMs: number;
}): Limitador {
  const tentativas = new Map<string, number[]>();

  return {
    tentar(chave, agora = Date.now()) {
      const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
      if (recentes.length >= maximo) {
        tentativas.set(chave, recentes);
        return false;
      }
      tentativas.set(chave, [...recentes, agora]);

      if (tentativas.size > LIMPAR_ACIMA_DE) {
        for (const [outra, lista] of tentativas) {
          if (lista.every((t) => agora - t >= janelaMs)) tentativas.delete(outra);
        }
      }
      return true;
    },
  };
}
