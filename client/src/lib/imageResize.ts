/**
 * Redimensiona a foto escolhida ANTES de mandar para a API.
 *
 * A foto e guardada como `data:` URI numa coluna do banco -- nao ha disco nem
 * storage externo, porque em serverless o filesystem e efemero (mesma razao
 * pela qual o banco em producao e o Turso, e nao um arquivo). Por isso o
 * tamanho tem que cair AQUI: 256px de lado em JPEG 0.82 costuma dar menos de
 * 50 KB, bem abaixo do limite de 300 KB que o servidor recusa.
 *
 * Recorte quadrado a partir do centro: um avatar circular corta as bordas de
 * qualquer jeito, e deixar o `object-fit` fazer isso desperdicaria bytes com
 * pixel que ninguem ve.
 */

const LADO_MAXIMO = 256;
const QUALIDADE = 0.82;

export async function resizeToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const lado = Math.min(bitmap.width, bitmap.height, LADO_MAXIMO);
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;

    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Nao consegui processar a imagem neste navegador.');

    const recorte = Math.min(bitmap.width, bitmap.height);
    const origemX = (bitmap.width - recorte) / 2;
    const origemY = (bitmap.height - recorte) / 2;

    contexto.drawImage(bitmap, origemX, origemY, recorte, recorte, 0, 0, lado, lado);

    return canvas.toDataURL('image/jpeg', QUALIDADE);
  } finally {
    bitmap.close();
  }
}
