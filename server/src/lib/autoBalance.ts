/**
 * =============================================================================
 * AUTO-BALANCE / DRAFT AUTOMATICO  --  o coracao do InHouse LoL
 * =============================================================================
 *
 * Problema: dados 10 jogadores, cada um com um pool de roles, montar 2 times de
 * 5 com TOP/JUNGLE/MID/ADC/SUPPORT preenchidos exatamente uma vez em cada lado,
 * o mais equilibrados possivel.
 *
 * Isso e um problema de emparelhamento perfeito em grafo bipartido:
 *
 *     jogadores (10)  <-->  vagas (10 = 2 lados x 5 roles)
 *
 * onde existe aresta jogador->vaga se a role da vaga esta no pool do jogador.
 *
 * A estrategia tem 3 etapas:
 *
 *  1. VIABILIDADE (O(32 * n), instantaneo)
 *     Teorema de Hall: existe emparelhamento perfeito se, e somente se, para
 *     TODO subconjunto S de roles, a quantidade de jogadores cujo pool cabe
 *     inteiro dentro de S nao passa da capacidade de S (2 vagas por role).
 *     Sao apenas 2^5 = 32 subconjuntos, entao da pra checar tudo e ainda
 *     devolver uma mensagem util ("faltou gente que jogue TOP/SUP") em vez de
 *     um generico "nao foi possivel sortear".
 *
 *  2. BUSCA (backtracking com MRV + forward checking)
 *     Aqui mora o requisito do produto: "priorizar quem tem pool restrito e
 *     deixar o Fill por ultimo". A heuristica MRV (Minimum Remaining Values)
 *     faz exatamente isso, e faz DINAMICAMENTE: a cada passo escolhe o jogador
 *     com menos vagas ainda disponiveis. Quem so joga Top/ADC entra primeiro;
 *     o Fill, que aceita as 5, sobra naturalmente para o fim e tapa os buracos.
 *     Ordenar a lista uma vez so pelo tamanho do pool seria pior: nao reage ao
 *     que as escolhas anteriores ja consumiram.
 *
 *  3. PONTUACAO (com restarts aleatorios)
 *     Backtracking devolve UMA solucao valida; quase sempre existem varias.
 *     Ficamos com a de menor custo: diferenca de rating + desconforto de role +
 *     concentracao de autofill em um dos lados.
 *
 *     A amostragem e feita com RESTARTS INDEPENDENTES, nao com uma unica DFS
 *     longa. Motivo: as primeiras N folhas de uma DFS compartilham quase todo o
 *     prefixo entre si, entao "4000 solucoes" de um mergulho so exploram um
 *     canto do espaco. Com 10 jogadores Fill (3.6M+ arranjos), isso chegava a
 *     perder o arranjo perfeito. Varios mergulhos curtos e independentes cobrem
 *     muito mais terreno pelo mesmo orcamento.
 *
 *     Cada mergulho tambem e GULOSO: na hora de ramificar, as vagas sao
 *     ordenadas pelo custo que gerariam (role confortavel primeiro, e o lado
 *     que estiver mais fraco de rating primeiro), com um ruido aleatorio por
 *     cima para os restarts nao caminharem todos para o mesmo lugar.
 *
 * Quebra de simetria: BLUE/RED sao intercambiaveis, entao toda solucao tem uma
 * espelhada identica. Fixamos o jogador mais restrito no lado azul, o que corta
 * o espaco de busca pela metade sem perder nenhuma composicao real.
 */

import { ROLES, FILL, type Role, type RoleInput, type TeamSide, expandRolePool } from './roles.js';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface DraftablePlayer {
  id: string;
  name: string;
  /** Pool declarado, em ordem de preferencia. O primeiro item e a main. */
  roles: RoleInput[];
  /** Rating interno. Ausente = NEUTRAL_RATING. */
  rating?: number;
}

export interface AssignedPlayer {
  player: DraftablePlayer;
  role: Role;
  side: TeamSide;
  /** 0 = main declarada, 1 = secundaria, ... */
  preferenceIndex: number;
  /** true quando a role so entrou no pool por causa do FILL. */
  isAutofill: boolean;
  /** Custo em "pontos de rating" que essa alocacao pagou. */
  comfortCost: number;
}

export interface BalancedTeam {
  side: TeamSide;
  /** Acesso por posicao: slots.TOP, slots.JUNGLE, ... */
  slots: Record<Role, AssignedPlayer>;
  /** Mesma coisa em array, na ordem TOP -> SUPPORT. */
  players: AssignedPlayer[];
  totalRating: number;
  averageRating: number;
  comfortCost: number;
}

export interface AutoBalanceResult {
  blueTeam: BalancedTeam;
  redTeam: BalancedTeam;
  /** |ratingAzul - ratingVermelho|. Quanto menor, mais parelho. */
  ratingDiff: number;
  /** Soma do desconforto de role dos 10. 0 = todo mundo na main. */
  comfortCost: number;
  /** Custo final ponderado (o que o algoritmo minimiza). */
  score: number;
  /** Diagnostico: quantas composicoes validas foram avaliadas. */
  solutionsEvaluated: number;
  /** Semente usada. Repassar em `options.seed` reproduz o mesmo sorteio. */
  seed: number;
}

export interface AutoBalanceOptions {
  /** Semente do RNG. Default: aleatoria (sorteios diferentes a cada clique). */
  seed?: number;
  /** Quantas composicoes validas avaliar no total. Default 4000. */
  maxSolutions?: number;
  /** Teto de nos visitados, protege contra explosao combinatoria. Default 200k. */
  maxNodes?: number;
  /** Mergulhos independentes. Mais restarts = melhor cobertura. Default 250. */
  restarts?: number;
  /** Folhas avaliadas por mergulho antes de recomecar do zero. Default 16. */
  solutionsPerRestart?: number;
  /** Peso da diferenca de rating entre os times. Default 1. */
  ratingWeight?: number;
  /** Peso do desconforto total de roles. Default 1. */
  comfortWeight?: number;
  /** Peso da CONCENTRACAO de desconforto em um so time. Default 0.5. */
  fairnessWeight?: number;
  /** Custo por degrau abaixo da main (secundaria = 1x, terciaria = 2x). Default 40. */
  offRoleCost?: number;
  /** Custo de alocar alguem numa role que so existe via FILL. Default 10. */
  fillCost?: number;
}

export class DraftError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const TEAM_SIZE = 5;
export const REQUIRED_PLAYERS = TEAM_SIZE * 2;
export const NEUTRAL_RATING = 1000;

const DEFAULTS = {
  maxSolutions: 4000,
  maxNodes: 200_000,
  restarts: 250,
  solutionsPerRestart: 16,
  ratingWeight: 1,
  comfortWeight: 1,
  fairnessWeight: 0.5,
  offRoleCost: 40,
  fillCost: 10,
} as const;

// ---------------------------------------------------------------------------
// RNG deterministico (mulberry32)
//
// Math.random() nao aceita semente. Com semente da pra reproduzir um sorteio
// polemico ("roda de novo com seed 12345") e escrever teste estavel.
// ---------------------------------------------------------------------------

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Preparo do elenco
// ---------------------------------------------------------------------------

interface PreparedPlayer {
  index: number;
  source: DraftablePlayer;
  rating: number;
  /** Roles que ele aceita, ja com FILL expandido. */
  eligibleRoles: Role[];
  /** Bitmask das roles aceitas: bit i = ROLES[i]. Comparacao vira operacao inteira. */
  roleMask: number;
  /** Custo de conforto por role. */
  costByRole: Record<Role, number>;
  preferenceByRole: Record<Role, number>;
  autofillByRole: Record<Role, boolean>;
}

function roleBit(role: Role): number {
  return 1 << ROLES.indexOf(role);
}

function preparePlayer(
  player: DraftablePlayer,
  index: number,
  opts: Pick<Required<AutoBalanceOptions>, 'offRoleCost' | 'fillCost'>
): PreparedPlayer {
  if (!player.roles || player.roles.length === 0) {
    throw new DraftError(
      `Jogador "${player.name}" nao tem nenhuma role cadastrada.`,
      'PLAYER_WITHOUT_ROLES',
      { playerId: player.id }
    );
  }

  const declared = player.roles;
  const eligibleRoles = expandRolePool(declared);

  // Quais roles vieram de um FILL? Sao as que nao foram declaradas nominalmente.
  const explicitlyDeclared = new Set(declared.filter((r) => r !== FILL) as Role[]);

  const costByRole = {} as Record<Role, number>;
  const preferenceByRole = {} as Record<Role, number>;
  const autofillByRole = {} as Record<Role, boolean>;

  eligibleRoles.forEach((role, position) => {
    const isAutofill = !explicitlyDeclared.has(role);
    autofillByRole[role] = isAutofill;
    preferenceByRole[role] = position;
    // Quem marcou FILL nao "sofre" por jogar qualquer coisa: paga um custo fixo
    // baixo, uniforme entre as roles de preenchimento, para nao enviesar. Quem
    // declarou nominalmente paga por degrau de distancia da main.
    costByRole[role] = isAutofill ? opts.fillCost : position * opts.offRoleCost;
  });

  return {
    index,
    source: player,
    rating: Number.isFinite(player.rating) ? (player.rating as number) : NEUTRAL_RATING,
    eligibleRoles,
    roleMask: eligibleRoles.reduce((mask, role) => mask | roleBit(role), 0),
    costByRole,
    preferenceByRole,
    autofillByRole,
  };
}

// ---------------------------------------------------------------------------
// Etapa 1 - viabilidade (Teorema de Hall)
// ---------------------------------------------------------------------------

interface Slot {
  index: number;
  side: TeamSide;
  role: Role;
}

function buildSlots(sides: readonly TeamSide[]): Slot[] {
  const slots: Slot[] = [];
  for (const side of sides) {
    for (const role of ROLES) {
      slots.push({ index: slots.length, side, role });
    }
  }
  return slots;
}

/**
 * Checa a condicao de Hall e, se falhar, aponta EXATAMENTE qual gargalo estourou.
 *
 * Ex.: com 4 jogadores que so jogam {TOP, ADC} ainda passa (4 vagas). Com 5,
 * quebra -> "5 jogadores so jogam TOP/ADC, mas existem apenas 4 vagas".
 */
function assertFeasible(players: PreparedPlayer[], slots: Slot[]): void {
  const capacityByRole = {} as Record<Role, number>;
  for (const role of ROLES) capacityByRole[role] = 0;
  for (const slot of slots) capacityByRole[slot.role] += 1;

  const roleCount = ROLES.length;
  // Percorre os 2^5 subconjuntos de roles.
  for (let subset = 1; subset < 1 << roleCount; subset++) {
    let capacity = 0;
    const subsetRoles: Role[] = [];
    for (let i = 0; i < roleCount; i++) {
      if (subset & (1 << i)) {
        subsetRoles.push(ROLES[i]);
        capacity += capacityByRole[ROLES[i]];
      }
    }

    // Jogadores "presos" nesse subconjunto: o pool inteiro cabe dentro dele.
    const trapped = players.filter((p) => (p.roleMask & ~subset) === 0);
    if (trapped.length > capacity) {
      throw new DraftError(
        `Composicao impossivel: ${trapped.length} jogadores (${trapped
          .map((p) => p.source.name)
          .join(', ')}) so jogam ${subsetRoles.join('/')}, ` +
          `mas existem apenas ${capacity} vaga(s) nessas posicoes.`,
        'INFEASIBLE_ROLES',
        {
          roles: subsetRoles,
          capacity,
          players: trapped.map((p) => ({ id: p.source.id, name: p.source.name })),
        }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Etapas 2 e 3 - busca e pontuacao
// ---------------------------------------------------------------------------

interface Weights {
  ratingWeight: number;
  comfortWeight: number;
  fairnessWeight: number;
}

/** assignment[i] = indice do slot que o jogador i ocupa. */
type Assignment = number[];

function scoreAssignment(
  assignment: Assignment,
  players: PreparedPlayer[],
  slots: Slot[],
  weights: Weights
): { score: number; ratingDiff: number; comfortCost: number } {
  let blueRating = 0;
  let redRating = 0;
  let blueComfort = 0;
  let redComfort = 0;

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const slot = slots[assignment[i]];
    const cost = player.costByRole[slot.role];
    if (slot.side === 'BLUE') {
      blueRating += player.rating;
      blueComfort += cost;
    } else {
      redRating += player.rating;
      redComfort += cost;
    }
  }

  const ratingDiff = Math.abs(blueRating - redRating);
  const comfortCost = blueComfort + redComfort;
  // Penaliza jogar todo o autofill em cima de um time so.
  const comfortSpread = Math.abs(blueComfort - redComfort);

  const score =
    weights.ratingWeight * ratingDiff +
    weights.comfortWeight * comfortCost +
    weights.fairnessWeight * comfortSpread;

  return { score, ratingDiff, comfortCost };
}

interface SearchOutcome {
  best: Assignment | null;
  bestScore: number;
  bestRatingDiff: number;
  bestComfortCost: number;
  solutionsEvaluated: number;
}

/**
 * Backtracking com MRV + forward checking.
 *
 * MRV: a cada nivel escolhe o jogador AINDA NAO ALOCADO com menos vagas livres
 * compativeis. E o que implementa "gargalo primeiro, Fill por ultimo".
 *
 * Forward checking: se algum jogador ficou com zero vagas, corta o ramo na hora
 * em vez de descobrir isso 5 niveis abaixo.
 */
function search(
  players: PreparedPlayer[],
  slots: Slot[],
  weights: Weights,
  limits: {
    maxSolutions: number;
    maxNodes: number;
    restarts: number;
    solutionsPerRestart: number;
  },
  rng: () => number,
  breakSymmetry: boolean
): SearchOutcome {
  const playerCount = players.length;
  const slotTaken = new Array<boolean>(slots.length).fill(false);
  const assignment: Assignment = new Array<number>(playerCount).fill(-1);

  /** Rating acumulado por lado, para a ordenacao gulosa saber quem esta fraco. */
  const sideRating: Record<TeamSide, number> = { BLUE: 0, RED: 0 };

  // Vagas compativeis de cada jogador. Fixas durante toda a busca -- o que muda
  // entre restarts e a ORDEM em que sao tentadas.
  const candidateSlots: number[][] = players.map((player) =>
    slots
      .filter((slot) => {
        if ((player.roleMask & roleBit(slot.role)) === 0) return false;
        // Quebra de simetria: o jogador 0 (o mais restrito, ver ordenacao em
        // autoBalanceTeams) fica preso no lado azul. Elimina o espelho
        // BLUE<->RED de toda solucao.
        if (breakSymmetry && player.index === 0 && slot.side !== 'BLUE') return false;
        return true;
      })
      .map((slot) => slot.index)
  );

  const outcome: SearchOutcome = {
    best: null,
    bestScore: Number.POSITIVE_INFINITY,
    bestRatingDiff: Number.POSITIVE_INFINITY,
    bestComfortCost: Number.POSITIVE_INFINITY,
    solutionsEvaluated: 0,
  };

  let nodes = 0;
  let assigned = 0;
  let solutionsThisRestart = 0;

  /** Quantas vagas livres o jogador ainda tem. -1 se ja esta alocado. */
  function freeSlotCount(playerIdx: number): number {
    if (assignment[playerIdx] !== -1) return -1;
    let count = 0;
    for (const slotIdx of candidateSlots[playerIdx]) {
      if (!slotTaken[slotIdx]) count++;
    }
    return count;
  }

  function globalBudgetExhausted(): boolean {
    return outcome.solutionsEvaluated >= limits.maxSolutions || nodes >= limits.maxNodes;
  }

  /**
   * Custo estimado de colocar `player` nesta vaga AGORA. Guia o mergulho para
   * uma boa solucao logo na primeira descida, em vez de depender de sorte.
   *
   * O ruido (`noise`) e o que diferencia um restart do outro: sem ele, todos os
   * mergulhos seguiriam exatamente o mesmo caminho guloso.
   */
  function branchCost(player: PreparedPlayer, slot: Slot, noise: number): number {
    const comfort = weights.comfortWeight * player.costByRole[slot.role];

    const other: TeamSide = slot.side === 'BLUE' ? 'RED' : 'BLUE';
    const projectedDiff = Math.abs(sideRating[slot.side] + player.rating - sideRating[other]);
    // 0.05 traz a escala de rating (centenas) para perto da de conforto (dezenas).
    const balance = weights.ratingWeight * projectedDiff * 0.05;

    return comfort + balance + noise;
  }

  function dive(): void {
    if (globalBudgetExhausted() || solutionsThisRestart >= limits.solutionsPerRestart) {
      return;
    }

    if (assigned === playerCount) {
      outcome.solutionsEvaluated++;
      solutionsThisRestart++;
      const { score, ratingDiff, comfortCost } = scoreAssignment(
        assignment,
        players,
        slots,
        weights
      );
      if (score < outcome.bestScore) {
        outcome.best = assignment.slice();
        outcome.bestScore = score;
        outcome.bestRatingDiff = ratingDiff;
        outcome.bestComfortCost = comfortCost;
      }
      return;
    }

    nodes++;

    // --- MRV + forward checking numa passada so ---
    let target = -1;
    let targetFree = Number.POSITIVE_INFINITY;
    for (let i = 0; i < playerCount; i++) {
      const free = freeSlotCount(i);
      if (free === -1) continue;
      if (free === 0) return; // forward checking: ramo morto
      if (free < targetFree) {
        targetFree = free;
        target = i;
        if (free === 1) break; // nao existe candidato melhor que um forcado
      }
    }
    if (target === -1) return;

    const player = players[target];

    // Ordenacao gulosa + ruido, recalculada a cada no porque `sideRating` muda.
    const ordered = candidateSlots[target]
      .filter((slotIdx) => !slotTaken[slotIdx])
      .map((slotIdx) => ({
        slotIdx,
        cost: branchCost(player, slots[slotIdx], rng() * NOISE_AMPLITUDE),
      }))
      .sort((a, b) => a.cost - b.cost);

    for (const { slotIdx } of ordered) {
      const slot = slots[slotIdx];

      slotTaken[slotIdx] = true;
      assignment[target] = slotIdx;
      sideRating[slot.side] += player.rating;
      assigned++;

      dive();

      assigned--;
      sideRating[slot.side] -= player.rating;
      assignment[target] = -1;
      slotTaken[slotIdx] = false;

      if (globalBudgetExhausted() || solutionsThisRestart >= limits.solutionsPerRestart) {
        return;
      }
    }
  }

  for (let restart = 0; restart < limits.restarts; restart++) {
    if (globalBudgetExhausted()) break;
    solutionsThisRestart = 0;
    dive();
  }

  return outcome;
}

/**
 * Amplitude do ruido na ordenacao gulosa, em "pontos de rating".
 *
 * Precisa ser da ordem de grandeza do custo de sair da main (offRoleCost = 40)
 * para conseguir trocar a ordem de duas opcoes proximas, mas nao tao grande a
 * ponto de transformar o mergulho guloso em sorteio puro.
 */
const NOISE_AMPLITUDE = 25;

// ---------------------------------------------------------------------------
// Montagem do resultado
// ---------------------------------------------------------------------------

function buildTeam(
  side: TeamSide,
  assignment: Assignment,
  players: PreparedPlayer[],
  slots: Slot[]
): BalancedTeam {
  const slotsByRole = {} as Record<Role, AssignedPlayer>;
  let totalRating = 0;
  let comfortCost = 0;

  for (let i = 0; i < players.length; i++) {
    const slot = slots[assignment[i]];
    if (slot.side !== side) continue;

    const player = players[i];
    const entry: AssignedPlayer = {
      player: player.source,
      role: slot.role,
      side,
      preferenceIndex: player.preferenceByRole[slot.role],
      isAutofill: player.autofillByRole[slot.role],
      comfortCost: player.costByRole[slot.role],
    };
    slotsByRole[slot.role] = entry;
    totalRating += player.rating;
    comfortCost += entry.comfortCost;
  }

  const ordered = ROLES.map((role) => slotsByRole[role]);

  return {
    side,
    slots: slotsByRole,
    players: ordered,
    totalRating,
    averageRating: Math.round(totalRating / TEAM_SIZE),
    comfortCost,
  };
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Divide 10 jogadores em dois times de 5 com as roles TOP/JUNGLE/MID/ADC/SUPPORT
 * preenchidas exatamente uma vez em cada lado.
 *
 * Lanca `DraftError` se o elenco nao tiver 10 jogadores distintos, se alguem
 * estiver sem role cadastrada ou se a composicao de roles for impossivel
 * (com a explicacao de qual gargalo travou).
 */
export function autoBalanceTeams(
  roster: DraftablePlayer[],
  options: AutoBalanceOptions = {}
): AutoBalanceResult {
  const opts = { ...DEFAULTS, ...options };

  // --- validacao de entrada ---
  if (roster.length !== REQUIRED_PLAYERS) {
    throw new DraftError(
      `O sorteio precisa de exatamente ${REQUIRED_PLAYERS} jogadores. Recebi ${roster.length}.`,
      'INVALID_ROSTER_SIZE',
      { received: roster.length, required: REQUIRED_PLAYERS }
    );
  }

  const seenIds = new Set<string>();
  for (const player of roster) {
    if (seenIds.has(player.id)) {
      throw new DraftError(`Jogador duplicado no elenco: "${player.name}".`, 'DUPLICATE_PLAYER', {
        playerId: player.id,
      });
    }
    seenIds.add(player.id);
  }

  const seed = options.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const rng = createRng(seed);

  // --- preparo ---
  // Ordena por pool crescente ANTES de reindexar: assim o jogador de indice 0 e
  // o mais restrito, que e quem a quebra de simetria prende no lado azul.
  // Prender um Fill no azul cortaria composicoes de verdade, nao so espelhos.
  const prepared = roster
    .map((player, i) => preparePlayer(player, i, opts))
    .sort((a, b) => a.eligibleRoles.length - b.eligibleRoles.length)
    .map((player, i) => ({ ...player, index: i }));

  const slots = buildSlots(['BLUE', 'RED']);

  // --- etapa 1 ---
  assertFeasible(prepared, slots);

  // --- etapas 2 e 3 ---
  const outcome = search(
    prepared,
    slots,
    {
      ratingWeight: opts.ratingWeight,
      comfortWeight: opts.comfortWeight,
      fairnessWeight: opts.fairnessWeight,
    },
    {
      maxSolutions: opts.maxSolutions,
      maxNodes: opts.maxNodes,
      restarts: opts.restarts,
      solutionsPerRestart: opts.solutionsPerRestart,
    },
    rng,
    true
  );

  if (!outcome.best) {
    // Hall garantiu que existe solucao, entao chegar aqui significa que o teto
    // de nos foi baixo demais. Nao mentimos dizendo "impossivel".
    throw new DraftError(
      'A busca estourou o limite de exploracao antes de fechar um time valido. Aumente `maxNodes`.',
      'SEARCH_BUDGET_EXHAUSTED',
      { maxNodes: opts.maxNodes }
    );
  }

  return {
    blueTeam: buildTeam('BLUE', outcome.best, prepared, slots),
    redTeam: buildTeam('RED', outcome.best, prepared, slots),
    ratingDiff: outcome.bestRatingDiff,
    comfortCost: outcome.bestComfortCost,
    score: outcome.bestScore,
    solutionsEvaluated: outcome.solutionsEvaluated,
    seed,
  };
}

/**
 * Distribui as 5 roles dentro de um time JA formado.
 *
 * Usado no Modo Capitaes: os capitaes escolhem as pessoas, e o sistema so
 * resolve quem joga o que. Mesma maquinaria, com 5 vagas de um lado so.
 */
export function assignRolesWithinTeam(
  teamPlayers: DraftablePlayer[],
  side: TeamSide = 'BLUE',
  options: AutoBalanceOptions = {}
): BalancedTeam {
  const opts = { ...DEFAULTS, ...options };

  if (teamPlayers.length !== TEAM_SIZE) {
    throw new DraftError(
      `Um time precisa de exatamente ${TEAM_SIZE} jogadores. Recebi ${teamPlayers.length}.`,
      'INVALID_TEAM_SIZE',
      { received: teamPlayers.length }
    );
  }

  const seed = options.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const rng = createRng(seed);

  const prepared = teamPlayers
    .map((player, i) => preparePlayer(player, i, opts))
    .sort((a, b) => a.eligibleRoles.length - b.eligibleRoles.length)
    .map((player, i) => ({ ...player, index: i }));

  const slots = buildSlots([side]);
  assertFeasible(prepared, slots);

  const outcome = search(
    prepared,
    slots,
    {
      ratingWeight: 0, // um time so: nao ha o que balancear entre lados
      comfortWeight: opts.comfortWeight,
      fairnessWeight: 0,
    },
    {
      maxSolutions: opts.maxSolutions,
      maxNodes: opts.maxNodes,
      restarts: opts.restarts,
      solutionsPerRestart: opts.solutionsPerRestart,
    },
    rng,
    false
  );

  if (!outcome.best) {
    throw new DraftError('Nao consegui distribuir as roles nesse time.', 'SEARCH_BUDGET_EXHAUSTED');
  }

  return buildTeam(side, outcome.best, prepared, slots);
}
