const { query, COLUMNAS } = require('./_lib/db');
const { conClave, leerCuerpo, responder, error } = require('./_lib/http');
const { dentroDeComuna } = require('./_lib/osm');

const ESTADOS = ['pendiente', 'visitado', 'cliente', 'descartado'];
const RUBROS = ['sushi', 'peruano', 'mariscos', 'poke', 'asiatico', 'internacional', 'pescaderia', 'otro'];
const CAMPOS_PROPIOS = ['contacto', 'contacto_telefono', 'proveedor', 'consumo', 'precio', 'notas'];
const CAMPOS_LOCAL = ['nombre', 'direccion', 'telefono', 'web'];

function texto(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

module.exports = conClave(async (req, res) => {
  if (req.method === 'GET') {
    const r = await query(`select ${COLUMNAS} from locales order by nombre`);
    return responder(res, 200, { locales: r.rows });
  }

  const b = await leerCuerpo(req);

  if (req.method === 'POST') {
    const nombre = texto(b.nombre, 200);
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!nombre) throw error(400, 'Falta el nombre del local');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw error(400, 'Falta la ubicación del local');
    if (!dentroDeComuna(lat, lon)) throw error(400, 'Ese punto está fuera de la comuna de Santiago');
    const r = await query(
      `insert into locales (origen, nombre, direccion, telefono, web, lat, lon, rubro)
       values ('manual', $1, $2, $3, $4, $5, $6, $7) returning ${COLUMNAS}`,
      [nombre, texto(b.direccion, 300), texto(b.telefono, 100), texto(b.web, 300), lat, lon, RUBROS.includes(b.rubro) ? b.rubro : 'otro']
    );
    return responder(res, 201, { local: r.rows[0] });
  }

  const id = Number(b.id);
  if (!Number.isInteger(id)) throw error(400, 'Falta el local');

  if (req.method === 'PATCH') {
    const actual = await query('select origen from locales where id = $1', [id]);
    if (!actual.rows.length) throw error(404, 'Ese local ya no existe');
    const sets = [];
    const valores = [];
    const poner = (col, v) => { valores.push(v); sets.push(`${col} = $${valores.length}`); };

    if ('estado' in b) {
      if (!ESTADOS.includes(b.estado)) throw error(400, 'Estado no válido');
      poner('estado', b.estado);
    }
    if ('fecha_visita' in b) {
      const f = texto(b.fecha_visita, 10);
      if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw error(400, 'Fecha no válida');
      poner('fecha_visita', f);
    }
    if ('rubro' in b) {
      if (!RUBROS.includes(b.rubro)) throw error(400, 'Rubro no válido');
      poner('rubro', b.rubro);
    }
    for (const c of CAMPOS_PROPIOS) if (c in b) poner(c, texto(b[c], c === 'notas' ? 5000 : 300));
    if (actual.rows[0].origen === 'manual') {
      for (const c of CAMPOS_LOCAL) {
        if (!(c in b)) continue;
        const v = texto(b[c], 300);
        if (c === 'nombre' && !v) throw error(400, 'Falta el nombre del local');
        poner(c, v);
      }
    }
    if (!sets.length) throw error(400, 'Nada que guardar');
    valores.push(id);
    const r = await query(
      `update locales set ${sets.join(', ')}, actualizado = now() where id = $${valores.length} returning ${COLUMNAS}`,
      valores
    );
    return responder(res, 200, { local: r.rows[0] });
  }

  if (req.method === 'DELETE') {
    const r = await query(`delete from locales where id = $1 and origen = 'manual' returning id`, [id]);
    if (!r.rows.length) throw error(400, 'Solo se pueden eliminar los locales agregados a mano');
    return responder(res, 200, { ok: true });
  }

  throw error(405, 'Método no permitido');
});
