import { parseItems, useBuild } from '../hooks/useBuild';

/**
 * Ícones de build: itens, feitiços e runa principal.
 *
 * Todos caem para um quadrado vazio quando o Data Dragon não resolve, em vez de
 * sumir: o slot vazio faz parte da informação -- "esse cara terminou o jogo com
 * 4 itens" é diferente de "não sei o que ele tinha".
 */

/** Tamanho padrão dos slots. Item e feitiço usam a mesma grade. */
const SLOT = 30;

function Vazio({ size = SLOT, titulo }: { size?: number; titulo?: string }) {
  return (
    <span
      title={titulo}
      style={{ width: size, height: size }}
      className="inline-block shrink-0 rounded border border-line/40 bg-base/60"
    />
  );
}

function Icone({
  url,
  nome,
  size = SLOT,
  arredondado = 'rounded',
}: {
  url: string;
  nome: string;
  size?: number;
  arredondado?: string;
}) {
  return (
    <img
      src={url}
      alt={nome}
      title={nome}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className={`shrink-0 ${arredondado}`}
    />
  );
}

/**
 * A build em ordem: 6 itens e o trinket separado por um espaço.
 *
 * `items === null` significa que a origem não trouxe build (replay). Nesse caso
 * a linha diz isso, em vez de mostrar 7 quadrados vazios -- que pareceria
 * alguém que jogou a partida inteira sem comprar nada.
 */
export function ItemRow({ items, size = SLOT }: { items: string | null; size?: number }) {
  const { build } = useBuild();
  const slots = parseItems(items);

  if (!slots) {
    return <span className="text-[11px] italic text-ink-faint">build indisponível</span>;
  }

  const principais = slots.slice(0, 6);
  const trinket = slots[6] ?? 0;

  return (
    <span className="flex items-center gap-1">
      {principais.map((id, index) => {
        const item = id ? build?.item(id) : undefined;
        return item ? (
          <Icone key={index} url={item.iconUrl} nome={item.name} size={size} />
        ) : (
          <Vazio key={index} size={size} titulo={id ? `Item ${id}` : 'Slot vazio'} />
        );
      })}

      {/* O trinket não compete com os itens de build: entra depois de um vão. */}
      <span className="ml-1">
        {trinket && build?.item(trinket) ? (
          <Icone
            url={build.item(trinket)!.iconUrl}
            nome={build.item(trinket)!.name}
            size={size}
            arredondado="rounded-full"
          />
        ) : (
          <Vazio size={size} titulo="Sem sentinela" />
        )}
      </span>
    </span>
  );
}

export function SpellPair({
  spell1Id,
  spell2Id,
  size = 22,
}: {
  spell1Id: number | null;
  spell2Id: number | null;
  size?: number;
}) {
  const { build } = useBuild();
  if (spell1Id === null && spell2Id === null) return null;

  return (
    <span className="flex shrink-0 flex-col gap-0.5">
      {[spell1Id, spell2Id].map((id, index) => {
        const spell = id ? build?.spell(id) : undefined;
        return spell ? (
          <Icone key={index} url={spell.iconUrl} nome={spell.name} size={size} />
        ) : (
          <Vazio key={index} size={size} />
        );
      })}
    </span>
  );
}

/** Runa principal com o símbolo da árvore secundária ao lado. */
export function RunePair({
  keystoneId,
  subStyleId,
  size = 26,
}: {
  keystoneId: number | null;
  subStyleId: number | null;
  size?: number;
}) {
  const { build } = useBuild();
  if (keystoneId === null && subStyleId === null) return null;

  const keystone = keystoneId ? build?.rune(keystoneId) : undefined;
  const sub = subStyleId ? build?.rune(subStyleId) : undefined;

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {keystone ? (
        <Icone url={keystone.iconUrl} nome={keystone.name} size={size} arredondado="rounded-full" />
      ) : (
        <Vazio size={size} />
      )}
      {sub && (
        <Icone url={sub.iconUrl} nome={sub.name} size={size * 0.7} arredondado="rounded-full" />
      )}
    </span>
  );
}
