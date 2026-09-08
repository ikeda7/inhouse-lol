/**
 * Entrypoint da Vercel.
 *
 * A plataforma importa este módulo e chama o export default por requisição --
 * não existe `listen()`. Um app Express é um `(req, res) => void`, então serve
 * de handler direto.
 *
 * O app é criado UMA vez por instância, fora do handler: assim invocações que
 * caem na mesma instância quente reaproveitam a conexão do banco em vez de
 * abrir uma por request.
 */
import { createApp } from '../server/src/app.js';

export default createApp();
