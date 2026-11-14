const { Pool } = require('pg');

let pool;
let lista;

function url() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
}

function getPool() {
  if (!pool) {
    const cadena = url();
    if (!cadena) {
      const e = new Error('Falta la base de datos: crea una en Vercel (pestaña Storage) y vuelve a publicar.');
      e.status = 500;
      throw e;
    }
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(cadena) || cadena.includes('host=/');
    pool = new Pool({ connectionString: cadena, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}

const ESQUEMA = `
create table if not exists locales (
  id serial primary key,
  osm_id text unique,
  origen text not null default 'osm',
  nombre text not null,
  direccion text,
  telefono text,
  web text,
  horario text,
  cocina text,
  lat double precision not null,
  lon double precision not null,
  estado text not null default 'pendiente',
  fecha_visita date,
  contacto text,
  contacto_telefono text,
  proveedor text,
  consumo text,
  precio text,
  notas text,
  actualizado timestamptz not null default now()
);
alter table locales add column if not exists rubro text not null default 'otro'`;

const COLUMNAS = `id, osm_id, origen, rubro, nombre, direccion, telefono, web, horario, cocina, lat, lon,
  estado, to_char(fecha_visita, 'YYYY-MM-DD') as fecha_visita, contacto, contacto_telefono,
  proveedor, consumo, precio, notas, actualizado`;

async function query(texto, valores) {
  const p = getPool();
  if (!lista) lista = p.query(ESQUEMA).catch((e) => { lista = null; throw e; });
  await lista;
  return p.query(texto, valores);
}

module.exports = { query, COLUMNAS };
