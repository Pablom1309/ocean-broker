const { comuna } = require('./_lib/osm');

// Límite de la comuna de Santiago (dato público, no requiere clave).
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.end(JSON.stringify(comuna));
};
