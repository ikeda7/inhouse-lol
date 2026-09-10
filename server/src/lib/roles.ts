/**
 * Fonte da verdade das roles. O SQLite nao tem enum no Prisma, entao a
 * validacao vive aqui e na borda da API.
 */

export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];

/** Pseudo-role: quem escolhe FILL joga qualquer uma das 5. */
export const FILL = 'FILL' as const;
export type RoleInput = Role | typeof FILL;

export const TEAM_SIDES = ['BLUE', 'RED'] as const;
export type TeamSide = (typeof TEAM_SIDES)[number];

/** Rotulos curtos para a UI. */
export const ROLE_LABEL: Record<Role, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MID: 'Mid',
  ADC: 'ADC',
  SUPPORT: 'Support',
};

/**
 * Aceita as variacoes que aparecem na vida real (seed em portugues, resposta da
 * Riot API, digitacao do usuario) e devolve a role canonica.
 *
 *   normalizeRole('Jungle')  -> 'JUNGLE'
 *   normalizeRole('UTILITY') -> 'SUPPORT'   // nome que a Riot usa no match-v5
 *   normalizeRole('bot')     -> 'ADC'
 */
const ROLE_ALIASES: Record<string, RoleInput> = {
  TOP: 'TOP',
  TOPLANE: 'TOP',
  JUNGLE: 'JUNGLE',
  JG: 'JUNGLE',
  JUNGLER: 'JUNGLE',
  SELVA: 'JUNGLE',
  MID: 'MID',
  MIDDLE: 'MID',
  MIDLANE: 'MID',
  ADC: 'ADC',
  BOT: 'ADC',
  BOTTOM: 'ADC',
  CARRY: 'ADC',
  ATIRADOR: 'ADC',
  SUPPORT: 'SUPPORT',
  SUP: 'SUPPORT',
  SUPP: 'SUPPORT',
  UTILITY: 'SUPPORT',
  SUPORTE: 'SUPPORT',
  FILL: FILL,
  ALL: FILL,
  TODAS: FILL,
};

export function normalizeRole(raw: string): RoleInput {
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[\s_-]/g, '');
  const found = ROLE_ALIASES[key];
  if (!found) {
    throw new Error(`Role invalida: "${raw}". Use ${ROLES.join(', ')} ou ${FILL}.`);
  }
  return found;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Expande o pool declarado para as roles concretas que o jogador aceita,
 * preservando a ordem de preferencia. FILL vira as 5 roles.
 */
export function expandRolePool(pool: readonly RoleInput[]): Role[] {
  const out: Role[] = [];
  for (const entry of pool) {
    const roles = entry === FILL ? ROLES : [entry];
    for (const role of roles) {
      if (!out.includes(role)) out.push(role);
    }
  }
  return out;
}
