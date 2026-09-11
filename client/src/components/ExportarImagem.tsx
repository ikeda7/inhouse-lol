import { useState, type ReactNode } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import {
  baixarImagem,
  compartilharImagem,
  copiarImagem,
  ehTelaDeToque,
  podeCopiarImagem,
} from '../lib/imagem/canvas';

/**
 * Copiar, baixar e enviar uma imagem desenhada em canvas -- ranking, partida,
 * série, destaques.
 *
 * Uma ação por botão, em vez de um botão que adivinha (ver a nota de entrega
 * em lib/imagem/canvas.ts): copiar é o caminho curto no desktop, baixar
 * funciona em qualquer lugar, e enviar só aparece em tela de toque.
 *
 * Recebe a FUNÇÃO que gera, não o blob: gerar a imagem baixa ícones, e só
 * vale a pena fazer isso quando alguém clica.
 */
export function ExportarImagem({
  gerar,
  nomeDoArquivo,
  titulo,
  vazio = false,
}: {
  gerar: () => Promise<Blob>;
  nomeDoArquivo: string;
  /** Título da folha de compartilhamento do celular. */
  titulo: string;
  vazio?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const executar = async (acao: () => Promise<void>, sucesso?: string) => {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      if (sucesso) setAviso(sucesso);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não consegui gerar a imagem.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {podeCopiarImagem() && (
          <Botao
            onClick={() =>
              executar(() => copiarImagem(gerar), 'Imagem copiada — é só colar no grupo.')
            }
            desligado={ocupado || vazio}
          >
            <Copy size={13} />
            Copiar
          </Botao>
        )}
        <Botao
          onClick={() => executar(async () => baixarImagem(await gerar(), nomeDoArquivo))}
          desligado={ocupado || vazio}
        >
          <Download size={13} />
          Baixar
        </Botao>
        {ehTelaDeToque() && (
          <Botao
            onClick={() =>
              executar(async () => compartilharImagem(await gerar(), nomeDoArquivo, titulo))
            }
            desligado={ocupado || vazio}
          >
            <Share2 size={13} />
            Enviar
          </Botao>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-[11px] text-loss">
          {erro}
        </p>
      )}
      {/* Copiar não tem retorno visível nenhum: sem esta confirmação, não dá
          para saber se funcionou a não ser tentando colar em algum lugar. */}
      {aviso && <p className="text-[11px] text-win">{aviso}</p>}
    </div>
  );
}

function Botao({
  onClick,
  desligado,
  children,
}: {
  onClick: () => void;
  desligado: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desligado}
      className="flex items-center gap-1.5 rounded-md border border-line/60 bg-raised px-2.5 py-1.5 text-xs font-semibold normal-case tracking-normal text-ink-muted transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
    >
      {children}
    </button>
  );
}
