/**
 * Formatação do projeto (issue #47).
 *
 * Estes valores DESCREVEM o estilo que o código já tinha -- não impõem um novo.
 * Foram escolhidos medindo, rodando o prettier sobre todos os arquivos
 * versionados e contando quantas linhas cada candidata mudaria:
 *
 *   100 colunas, trailingComma es5    357 linhas   <- esta
 *   100 colunas, trailingComma all    572 linhas   (vírgula em argumento de função)
 *   110 colunas                       845 linhas   (junta linhas quebradas de propósito)
 *   120 colunas                      1333 linhas
 *
 * Aspas simples: 366 imports com simples, zero com duplas. Ponto e vírgula e
 * fim de linha LF são o padrão do prettier e já eram o do código
 * (o `.gitattributes` força LF).
 *
 * Opções testadas e descartadas por aumentarem o diff: `bracketSameLine`,
 * `arrowParens: 'avoid'`, `objectWrap: 'collapse'`.
 *
 * Sem este arquivo, `npx prettier` baixa a versão avulsa e aplica os padrões
 * dele -- aspas duplas no arquivo inteiro. Aconteceu: uma mudança de 20 linhas
 * virou um diff de 221.
 */

/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'es5',
};
