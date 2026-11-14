// Servidor local para probar sin Vercel: sirve public/ y las funciones de api/.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const publico = __dirname;

http.createServer((req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  const m = ruta.match(/^\/api\/([a-z]+)$/);
  if (m && fs.existsSync(path.join(__dirname, 'api', m[1] + '.js'))) return require('./api/' + m[1] + '.js')(req, res);
  const archivo = path.join(publico, ruta === '/' ? 'index.html' : ruta === '/mapa' ? 'mapa.html' : ruta);
  if (!archivo.startsWith(publico) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.statusCode = 404;
    return res.end('No encontrado');
  }
  res.setHeader('content-type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
  fs.createReadStream(archivo).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
