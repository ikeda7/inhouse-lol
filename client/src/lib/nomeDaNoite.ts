/**
 * O nome que a MD3 ganha quando é aberta sozinha pelo "Usar esses times":
 * "Quinta 10/09" -- o mesmo formato que o grupo já usa no Histórico.
 *
 * A noite de jogo passa da meia-noite. Até as 6h ainda é a noite anterior:
 * um sorteio à 0h30 de sexta pertence à "Quinta", não à "Sexta".
 */

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
/** Até esta hora (exclusive), o sorteio ainda é da noite anterior. */
const VIRADA_DA_NOITE = 6;

export function nomeDaNoite(agora: Date = new Date()): string {
  const dia = new Date(agora);
  if (dia.getHours() < VIRADA_DA_NOITE) dia.setDate(dia.getDate() - 1);
  const dd = String(dia.getDate()).padStart(2, '0');
  const mm = String(dia.getMonth() + 1).padStart(2, '0');
  return `${DIAS[dia.getDay()]} ${dd}/${mm}`;
}
