import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAction } from '../hooks/useAsync';
import { nomeDaNoite } from '../lib/nomeDaNoite';
import { Button, ErrorState } from './ui';

/**
 * "Usar esses times na série" -- o fim do Sorteio, do draft e da sala ao vivo.
 *
 * Além de guardar os times para o registro manual, GARANTE a MD3 da noite
 * (issue #77): abre uma se não houver, usa a em andamento se houver. Antes, os
 * times chegavam numa Série vazia, e quem esquecia de abrir a MD3 via o
 * agente do LoL recusar todos os jogos com NO_ONGOING_SERIES.
 *
 * Um componente só nos três lugares, com o próprio estado: a lógica não se
 * repete e as páginas não precisam de hook novo.
 */
export function UsarTimesNaSerie({ salvar }: { salvar: () => void }) {
  const navigate = useNavigate();
  const garantir = useAction(seriesApi.garantir);
  const [pronto, setPronto] = useState(false);

  const usar = async () => {
    salvar();
    const garantida = await garantir.run({ name: nomeDaNoite(), fearless: true });
    // Sem a MD3 (faltou a chave do grupo, servidor fora), fica aqui mostrando
    // o erro -- ir para a Série vazia seria esconder o problema.
    if (!garantida) return;
    setPronto(true);
    navigate('/serie');
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={usar} loading={garantir.loading}>
        {pronto ? <Check size={16} /> : <ArrowRight size={16} />}
        Usar esses times na série
      </Button>
      <p className="text-center text-[11px] text-ink-faint">
        Abre a MD3 da noite, ou usa a que já está em andamento.
      </p>
      {garantir.error && <ErrorState error={garantir.error} />}
    </div>
  );
}
