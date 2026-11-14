const crypto = require('crypto');

function igual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function claveCorrecta(req) {
  const usuario = process.env.APP_USER;
  const clave = process.env.APP_PASSWORD;
  if (!usuario || !clave) {
    const e = new Error('Falta definir el acceso: agrega las variables APP_USER y APP_PASSWORD en Vercel y vuelve a publicar.');
    e.status = 500;
    throw e;
  }
  // Los encabezados llegan en base64 para admitir tildes y símbolos.
  const leer = (h) => Buffer.from(String(req.headers[h] || ''), 'base64').toString('utf8');
  const okUsuario = igual(leer('x-usuario').trim().toLowerCase(), usuario.trim().toLowerCase());
  const okClave = igual(leer('x-clave'), clave);
  return okUsuario && okClave;
}

async function leerCuerpo(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let texto = '';
  for await (const parte of req) texto += parte;
  return texto ? JSON.parse(texto) : {};
}

function responder(res, estado, datos) {
  res.statusCode = estado;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(datos));
}

// Envuelve una función: exige la clave y convierte los errores en respuestas.
function conClave(fn) {
  return async (req, res) => {
    try {
      if (!claveCorrecta(req)) return responder(res, 401, { error: 'Usuario o clave incorrectos' });
      await fn(req, res);
    } catch (e) {
      const estado = e.status || 500;
      if (estado === 500) console.error(e);
      responder(res, estado, { error: e.status ? e.message : 'Error del servidor: ' + e.message });
    }
  };
}

function error(estado, mensaje) {
  const e = new Error(mensaje);
  e.status = estado;
  return e;
}

module.exports = { conClave, leerCuerpo, responder, error };
