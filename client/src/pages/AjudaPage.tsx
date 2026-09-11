import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleHelp,
  Compass,
  Dices,
  Flame,
  History,
  KeyRound,
  LifeBuoy,
  ListChecks,
  LogIn,
  Scale,
  Sparkles,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardTitle } from '../components/ui';

/**
 * Como funciona -- o "?" do cabeçalho.
 *
 * Escrita para quem chega pela primeira vez pelo link do zap, não para quem
 * mexe no código: o que fazer na noite, o que precisa estar pronto, o que cada
 * aba faz e o que fazer quando dá errado. O detalhe técnico mora em
 * NOITE-DE-JOGOS.md; aqui fica o que alguém precisa saber com o LoL aberto.
 *
 * Cada seção tem âncora, para dar para mandar no grupo o link direto de uma
 * parte ("/ajuda#problemas").
 */

const API = 'https://inhouse-lol.vercel.app/api';
const AGENTE = 'https://github.com/ikeda7/inhouse-lol/blob/main/companion/inhouse-companion.mjs';

const SECOES = [
  { id: 'noite', titulo: 'A noite em 4 passos' },
  { id: 'precisa', titulo: 'O que precisa' },
  { id: 'abas', titulo: 'Cada aba' },
  { id: 'regras', titulo: 'Regras e pontos' },
  { id: 'legais', titulo: 'Coisas legais' },
  { id: 'problemas', titulo: 'Deu ruim?' },
];

export function AjudaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink">
          <CircleHelp size={22} className="text-gold" />
          Como funciona
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          O InHouse LoL cuida da noite de custom do grupo: tira times equilibrados, controla a MD3
          com Fearless e guarda o placar de cada jogo para o ranking. Ver é aberto para todo mundo;
          quem grava é o grupo.
        </p>
        <nav aria-label="Seções da ajuda" className="flex flex-wrap gap-1.5">
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="rounded-full border border-line/60 bg-raised px-3 py-1 text-xs font-medium text-ink-muted transition hover:border-gold/50 hover:text-ink"
            >
              {secao.titulo}
            </a>
          ))}
        </nav>
      </header>

      <Secao id="noite" icone={ListChecks}>
        <ol className="space-y-4">
          <Passo n={1} titulo="Tirem os times">
            Em <Aba to="/sorteio">Sorteio</Aba>, marque os 10 que vão jogar e escolha um jeito:
            <ul className="mt-2 space-y-1.5">
              <Item titulo="Sorteio automático">
                equilibra os dois times pelo nível e pelas roles de cada um.
              </Item>
              <Item titulo="Modo capitães">
                draft 1-2-2-2-1. O capitão sai por maior winrate, por quem perdeu a última, no
                aleatório ou em <strong className="text-ink">Escolher</strong>, onde vocês clicam em
                quem tira o time (o primeiro fica com o lado azul).
              </Item>
              <Item titulo="Draft ao vivo (com link)">
                o mesmo draft, mas com um link para mandar no grupo e todo mundo acompanhar as
                escolhas na hora.
              </Item>
            </ul>
          </Passo>
          <Passo n={2} titulo="Abram a MD3">
            <Aba to="/serie">Série</Aba> → <strong className="text-ink">Abrir nova MD3</strong>,
            antes do primeiro jogo. Sem MD3 aberta nenhum jogo entra: é isso que impede um custom
            qualquer de cair no ranking.
          </Passo>
          <Passo n={3} titulo="Joguem">
            Alguém que está jogando deixa o agente rodando no PC (veja{' '}
            <a href="#precisa" className="font-medium text-ink underline decoration-line">
              O que precisa
            </a>
            ). Uns 15 segundos depois de cada jogo, o placar completo aparece no site: K/D/A, dano,
            build, bans e objetivos.
          </Passo>
          <Passo n={4} titulo="Fim">
            A MD3 fecha sozinha quando um time chega a 2 vitórias. Se pararem antes, use{' '}
            <Aba to="/serie">Série</Aba> → <strong className="text-ink">Encerrar</strong>.
          </Passo>
        </ol>
      </Secao>

      <Secao id="precisa" icone={KeyRound}>
        <ul className="space-y-4">
          <Item titulo="Riot ID de todo mundo">
            Em <Aba to="/jogadores">Jogadores</Aba>, cada um com o <code>Nick#TAG</code> igual ao do
            cliente. É assim que o jogo sabe quem é quem no placar. Quem está sem aparece com o selo{' '}
            <strong className="text-ink">sem Riot ID</strong>, e o Sorteio avisa antes de vocês
            jogarem.
          </Item>
          <Item titulo="A chave do grupo, para gravar">
            Abrir MD3, cadastrar jogador ou registrar jogo pedem a chave do grupo (está no zap). O
            site pede uma vez e guarda no navegador. Quem entrou na conta não precisa.
          </Item>
          <Item titulo="Um PC com o LoL, para importar os jogos">
            A Riot não deixa ninguém puxar custom game pela internet: quem sabe dos jogos é o
            cliente do LoL. Por isso existe um agente que roda no PC de quem joga. Precisa do{' '}
            <a
              href="https://nodejs.org"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink underline decoration-line"
            >
              Node
            </a>{' '}
            instalado e do arquivo do{' '}
            <a
              href={AGENTE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink underline decoration-line"
            >
              agente
            </a>
            . No PowerShell, na pasta do arquivo:
            <Comando>
              {`$env:INHOUSE_CHAVE = "a-chave-do-grupo"\nnode inhouse-companion.mjs --watch --api ${API}`}
            </Comando>
            Deixe a janela aberta a noite toda. Qualquer um dos dez pode rodar, não precisa ser quem
            criou a sala; se dois rodarem, o segundo envio é ignorado.
          </Item>
          <Item titulo="Conta é opcional">
            Serve para pôr foto e ter seu perfil. Em <Aba to="/entrar">Entrar</Aba> → Criar conta,
            escolha seu nome na lista e o seu histórico já vem junto. A foto padrão é o seu ícone do
            LoL, que entra sozinho. Você fica logado 30 dias no mesmo navegador; trocar a senha
            desloga todos os aparelhos.
          </Item>
        </ul>
      </Secao>

      <Secao id="abas" icone={Compass}>
        <ul className="space-y-3">
          <AbaExplicada to="/" icone={Trophy} nome="Ranking">
            classificação geral, com ordenação por critério e imagem para mandar no grupo.
          </AbaExplicada>
          <AbaExplicada to="/sorteio" icone={Dices} nome="Sorteio">
            quem joga e como tirar os times. O painel de cobertura de roles fica vermelho quando
            falta gente para alguma role.
          </AbaExplicada>
          <AbaExplicada to="/serie" icone={Swords} nome="Série">
            a MD3 em andamento: placar, campeões queimados e o registro de jogo à mão.
          </AbaExplicada>
          <AbaExplicada to="/destaques" icone={Flame} nome="Destaques">
            recordes do grupo (mais abates, melhor KDA, mais dano…) e os momentos de cada noite.
          </AbaExplicada>
          <AbaExplicada to="/historico" icone={History} nome="Histórico">
            todas as séries. Abra uma série, depois um jogo, depois um jogador para ver build, runas
            e feitiços, sem precisar do LoL aberto.
          </AbaExplicada>
          <AbaExplicada to="/jogadores" icone={Users} nome="Jogadores">
            cadastro, roles e Riot ID. Clique num nome para ver o perfil: campeões mais jogados e
            desempenho por role. Os filtros Sem Riot ID e Sem conta mostram quem falta.
          </AbaExplicada>
          <AbaExplicada to="/entrar" icone={LogIn} nome="Conta">
            sua foto e sua senha.
          </AbaExplicada>
        </ul>
      </Secao>

      <Secao id="regras" icone={Scale}>
        <ul className="space-y-3">
          <Item titulo="Pontos">
            +3 por mapa vencido e +1 por MD3 vencida. O ranking soma tudo.
          </Item>
          <Item titulo="Exatamente 10">
            Com mais de 10, marque só quem joga a rodada; o resto continua no cadastro. Com menos, o
            sorteio não monta time torto.
          </Item>
          <Item titulo="Fearless">
            Campeão jogado numa MD3 fica queimado: ninguém pega de novo nos jogos seguintes da mesma
            MD3.
          </Item>
          <Item titulo="Placar por elenco, não por cor">
            Os times trocam de lado entre os jogos, então o placar segue as pessoas. Se trocarem um
            jogador no meio da MD3, vale a maioria dos 5.
          </Item>
        </ul>
      </Secao>

      <Secao id="legais" icone={Sparkles}>
        <ul className="space-y-3">
          <Item titulo="Imagem para o zap">
            Ranking, cada jogo, cada série e os Destaques têm Copiar e Baixar (e Enviar, no
            celular). A imagem já sai no tamanho de ler no telefone.
          </Item>
          <Item titulo="Draft ao vivo">
            Um link só: quem é capitão clica em “sou capitão” no próprio navegador, e o resto
            assiste as escolhas acontecendo.
          </Item>
          <Item titulo="Momentos com o grito do jogo">
            PENTAKILL, QUADRA KILL, LEGENDARY, quem carregou, quem segurou a linha de frente: os
            Destaques guardam a noite de cada um.
          </Item>
          <Item titulo="A build de qualquer jogo">
            Histórico → jogo → jogador mostra itens, runas e feitiços do jogo, mesmo semanas depois.
          </Item>
          <Item titulo="Foto sem fazer nada">
            Quando um jogo entra, o ícone do LoL de cada um vira a foto no site. Quem subiu foto
            própria não perde a dela.
          </Item>
        </ul>
      </Secao>

      <Secao id="problemas" icone={LifeBuoy}>
        <ul className="space-y-3">
          <Item titulo="“Não há MD3 em andamento”">
            Abra a MD3 na <Aba to="/serie">Série</Aba> e mande de novo com <code>--last</code>.
          </Item>
          <Item titulo="“Participante não vinculado”">
            Falta o Riot ID de alguém. Preencha em <Aba to="/jogadores">Jogadores</Aba> e mande de
            novo.
          </Item>
          <Item titulo="Esqueceram de ligar o agente">
            <code>--last</code> manda o último jogo. Para vários, <code>--list</code> mostra os IDs
            e <code>--games id1,id2</code> manda, na ordem em que foram jogados.
          </Item>
          <Item titulo="Ninguém com o agente">
            <Aba to="/serie">Série</Aba> → <strong className="text-ink">Registrar jogo</strong>,
            digitando o placar. Não é gambiarra: é um caminho normal.
          </Item>
          <Item titulo="O site pediu uma chave">
            É a chave do grupo, a do zap. Digite uma vez e o navegador guarda.
          </Item>
          <Item titulo="Quer testar sem gravar nada">
            Acrescente <code>--dry-run</code> a qualquer comando do agente.
          </Item>
        </ul>
      </Secao>
    </div>
  );
}

function Secao({
  id,
  icone,
  titulo,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo?: string;
  children: ReactNode;
}) {
  const nome = titulo ?? SECOES.find((secao) => secao.id === id)?.titulo ?? id;
  return (
    // scroll-mt: o cabeçalho é fixo, e sem a folga o título da seção
    // aberta pela âncora ficaria escondido embaixo dele.
    <div id={id} className="scroll-mt-20">
      <Card title={<CardTitle icon={icone}>{nome}</CardTitle>}>
        <div className="text-sm leading-relaxed text-ink-muted">{children}</div>
      </Card>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-gold ring-1 ring-gold/40">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{titulo}</p>
        <div>{children}</div>
      </div>
    </li>
  );
}

function Item({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <li>
      <span className="font-semibold text-ink">{titulo}</span>
      {' — '}
      {children}
    </li>
  );
}

function Aba({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-ink underline decoration-line hover:text-gold">
      {children}
    </Link>
  );
}

function AbaExplicada({
  to,
  icone: Icone,
  nome,
  children,
}: {
  to: string;
  icone: LucideIcon;
  nome: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icone size={16} className="mt-0.5 shrink-0 text-ink-faint" />
      <p>
        <Aba to={to}>{nome}</Aba> — {children}
      </p>
    </li>
  );
}

/** Comando para copiar: rola de lado no celular em vez de quebrar no meio. */
function Comando({ children }: { children: string }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-line/60 bg-canvas p-3 text-[11px] leading-relaxed text-emerald-300">
      {children}
    </pre>
  );
}
