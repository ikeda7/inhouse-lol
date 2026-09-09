import { useCallback, useEffect, useRef, useState } from 'react';
import { draftApi } from '../api/client';
import type { DraftRoom } from '../types';

/**
 * Acompanha uma sala de draft ao vivo.
 *
 * Consulta em intervalo em vez de assinar eventos. O caminho "certo" seria SSE,
 * mas a produção roda em função serverless: conexão longa é cortada pelo limite
 * de duração, e não existe processo vivo para segurar assinatura. Consultar é
 * feio no papel e funciona hoje, sem mudar de hospedagem.
 *
 * Três coisas tornam isso barato o bastante:
 *
 * 1. A consulta manda a versão que já tem e recebe só "não mudou" quando nada
 *    aconteceu -- o corpo da resposta é minúsculo na maior parte do tempo.
 * 2. Para quando a aba sai da frente. Um draft aberto e esquecido numa aba de
 *    fundo consultaria para sempre sem ninguém olhando.
 * 3. Para quando o draft fecha. Depois do oitavo pick não há mais o que mudar.
 */

/** Intervalo entre consultas. Um draft ao vivo tolera bem 2s de atraso. */
const INTERVALO_MS = 2000;

export interface EstadoDaSala {
  sala: DraftRoom | null;
  carregando: boolean;
  erro: Error | null;
  /** Falso enquanto a última consulta falhou -- a tela avisa que desconectou. */
  conectado: boolean;
  escolher: (playerId: string) => Promise<void>;
  escolhendo: boolean;
}

export function useDraftRoom(code: string | undefined): EstadoDaSala {
  const [sala, setSala] = useState<DraftRoom | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<Error | null>(null);
  const [conectado, setConectado] = useState(true);
  const [escolhendo, setEscolhendo] = useState(false);

  // A versão vive em ref, não em estado: o laço de consulta precisa do valor
  // mais recente sem se reinscrever a cada mudança -- com estado, o efeito
  // reiniciaria o intervalo a cada escolha.
  const versao = useRef<number | null>(null);
  const pickOrder = useRef<DraftRoom['pickOrder']>(undefined);

  const aplicar = useCallback((nova: DraftRoom) => {
    versao.current = nova.version;
    // `pickOrder` só vem na criação da sala; guardamos para não perder o
    // desenho da fila snake nas atualizações seguintes.
    if (nova.pickOrder) pickOrder.current = nova.pickOrder;
    setSala({ ...nova, pickOrder: nova.pickOrder ?? pickOrder.current });
  }, []);

  useEffect(() => {
    if (!code) return;

    let ativo = true;
    let timer: number | undefined;

    const consultar = async () => {
      if (!ativo) return;

      // Aba escondida não precisa de dado fresco. Quando voltar, o
      // visibilitychange abaixo consulta na hora.
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(consultar, INTERVALO_MS);
        return;
      }

      try {
        const resposta = await draftApi.verSala(code, versao.current ?? undefined);
        if (!ativo) return;

        if (!('unchanged' in resposta)) aplicar(resposta);
        setConectado(true);
        setErro(null);
      } catch (falha) {
        if (!ativo) return;
        // Consulta que falha não vira erro de tela: rede oscila, e apagar o
        // draft por causa de uma consulta perdida seria pior que o problema.
        // Só quando ainda não há sala nenhuma é que a falha é fatal.
        setConectado(false);
        if (versao.current === null) setErro(falha as Error);
      } finally {
        if (ativo) {
          setCarregando(false);
          // Reagenda sozinho em vez de setInterval: assim uma consulta lenta
          // não empilha com a próxima.
          timer = window.setTimeout(consultar, INTERVALO_MS);
        }
      }
    };

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') consultar();
    };

    consultar();
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      ativo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [code, aplicar]);

  const escolher = useCallback(
    async (playerId: string) => {
      if (!code || versao.current === null) return;
      setEscolhendo(true);
      setErro(null);
      try {
        aplicar(await draftApi.escolherNaSala(code, playerId, versao.current));
      } catch (falha) {
        // Conflito de versão significa que outro capitão escolheu primeiro. A
        // próxima consulta já traz o estado certo, então a mensagem aparece e
        // a tela se corrige sozinha.
        setErro(falha as Error);
      } finally {
        setEscolhendo(false);
      }
    },
    [code, aplicar]
  );

  return { sala, carregando, erro, conectado, escolher, escolhendo };
}
