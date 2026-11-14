const { query } = require('./_lib/db');
const { conClave, responder, error } = require('./_lib/http');
const { descargarLocales } = require('./_lib/osm');

// Trae los locales desde OpenStreetMap. Agrega los nuevos y refresca los datos
// públicos de los existentes; nunca toca estado, notas ni datos de venta.
module.exports = conClave(async (req, res) => {
  if (req.method !== 'POST') throw error(405, 'Método no permitido');
  const { locales, fuente } = await descargarLocales();
  if (!locales.length) throw error(502, 'OpenStreetMap no respondió. Intenta de nuevo en unos minutos.');

  const col = (k) => locales.map((l) => l[k]);
  const r = await query(
    `insert into locales (osm_id, origen, nombre, direccion, telefono, web, horario, cocina, lat, lon, rubro)
     select osm_id, 'osm', nombre, direccion, telefono, web, horario, cocina, lat, lon, rubro
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::float8[], $9::float8[], $10::text[])
       as t(osm_id, nombre, direccion, telefono, web, horario, cocina, lat, lon, rubro)
     on conflict (osm_id) do update set
       nombre = excluded.nombre, direccion = excluded.direccion, telefono = excluded.telefono,
       web = excluded.web, horario = excluded.horario, cocina = excluded.cocina,
       lat = excluded.lat, lon = excluded.lon
     returning (xmax = 0) as nuevo`,
    [col('osm_id'), col('nombre'), col('direccion'), col('telefono'), col('web'), col('horario'), col('cocina'), col('lat'), col('lon'), col('rubro')]
  );
  const nuevos = r.rows.filter((x) => x.nuevo).length;
  responder(res, 200, { total: locales.length, nuevos, fuente });
});
