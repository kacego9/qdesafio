/**
 * Configuración de producción.
 * En el build de production Angular reemplaza environment.ts por este archivo.
 *
 * IMPORTANTE: como el cliente y el servidor se sirven desde el MISMO dominio
 * (Nginx hace proxy de /socket.io/ al Node), el serverUrl puede quedarse vacío
 * — Socket.IO se conectará a la misma origen automáticamente. Igualmente
 * dejamos la URL absoluta por claridad.
 */
export const environment = {
  production: true,
  serverUrl: 'https://qdesafio.com'
};
