(() => {
  'use strict';

  const ESTADOS = [
    { id: 'pendiente', nombre: 'Pendiente', plural: 'Pendientes', color: '#f26b4e' },
    { id: 'visitado', nombre: 'Visitado', plural: 'Visitados', color: '#2f6fed' },
    { id: 'cliente', nombre: 'Cliente', plural: 'Clientes', color: '#17935a' },
    { id: 'descartado', nombre: 'Descartado', plural: 'Descartados', color: '#8c98a4' },
  ];
  const RUBROS = [
    ['sushi', 'Sushi y japonés'], ['peruano', 'Peruano'], ['mariscos', 'Pescados y mariscos'], ['poke', 'Poke'],
    ['asiatico', 'Asiático'], ['internacional', 'Internacional'], ['pescaderia', 'Pescadería'], ['otro', 'Otro'],
  ];
  const NOMBRE_RUBRO = Object.fromEntries(RUBROS);
  const COLOR = Object.fromEntries(ESTADOS.map((e) => [e.id, e.color]));
  const CAMPOS = [
    { id: 'fecha_visita', etiqueta: 'Fecha de visita', tipo: 'date' },
    { id: 'contacto', etiqueta: 'Persona de contacto' },
    { id: 'contacto_telefono', etiqueta: 'Teléfono del contacto', tipo: 'tel' },
    { id: 'proveedor', etiqueta: 'Proveedor actual de salmón' },
    { id: 'consumo', etiqueta: 'Consumo (kg/semana)' },
    { id: 'precio', etiqueta: 'Precio que paga ($/kg)' },
    { id: 'notas', etiqueta: 'Notas', tipo: 'area', ancho: true },
  ];

  const $ = (id) => document.getElementById(id);
  const esCelular = () => window.matchMedia('(max-width: 859px)').matches;

  const estado = {
    usuario: '',
    clave: '',
    locales: [],
    filtro: 'todos',
    rubro: 'todos',
    busqueda: '',
    seleccionado: null,
    sinGuardar: false,
    agregando: false,
  };
  let mapa;
  let capa;
  const marcadores = new Map();
  let marcadorNuevo = null;

  // ---------- utilidades ----------
  function h(etiqueta, props, ...hijos) {
    const el = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const hijo of hijos.flat()) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  }

  let temporizador;
  function avisar(mensaje, mal) {
    const t = $('toast');
    t.textContent = mensaje;
    t.classList.toggle('mal', !!mal);
    t.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { t.hidden = true; }, mal ? 6000 : 2600);
  }

  function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Base64 de texto con tildes o símbolos, para enviarlo en un encabezado.
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

  async function api(ruta, metodo, cuerpo) {
    let r;
    try {
      r = await fetch(ruta, {
        method: metodo || 'GET',
        headers: { 'x-usuario': b64(estado.usuario), 'x-clave': b64(estado.clave), 'content-type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (e) {
      throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
    }
    let datos = {};
    try { datos = await r.json(); } catch (e) { /* respuesta sin JSON */ }
    if (r.status === 401) {
      const err = new Error('Usuario o clave incorrectos');
      err.clave = true;
      throw err;
    }
    if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
    return datos;
  }

  // ---------- acceso ----------
  function guardarClave(u, c) {
    estado.usuario = u;
    estado.clave = c;
    try {
      if (c) localStorage.setItem('acceso', JSON.stringify({ u, c })); else localStorage.removeItem('acceso');
    } catch (e) { /* sin almacenamiento */ }
  }

  function pedirClave(mensaje) {
    $('app').hidden = true;
    $('acceso').hidden = false;
    $('acceso-error').textContent = mensaje || '';
    $('clave').value = '';
    ($('usuario').value ? $('clave') : $('usuario')).focus();
  }

  $('acceso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    guardarClave($('usuario').value.trim(), $('clave').value);
    await iniciar();
  });

  async function iniciar() {
    let datos;
    try {
      datos = await api('/api/locales');
    } catch (e) {
      if (e.clave) guardarClave('', '');
      return pedirClave(e.message);
    }
    $('acceso').hidden = true;
    $('app').hidden = false;
    crearMapa();
    estado.locales = datos.locales;
    pintarTodo();
    if (!estado.locales.length) await actualizarLocales(true);
  }

  // ---------- mapa ----------
  function crearMapa() {
    if (mapa) return mapa.invalidateSize();
    mapa = L.map('mapa', { zoomControl: false }).setView([-33.452, -70.658], 14);
    L.control.zoom({ position: 'topright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);

    fetch('/api/comuna').then((r) => r.json()).then((g) => {
      const borde = L.geoJSON(g, { style: { color: '#0b2a3f', weight: 2, fillOpacity: 0.03, dashArray: '6 6' }, interactive: false }).addTo(mapa);
      mapa.fitBounds(borde.getBounds(), { padding: [10, 10] });
    }).catch(() => {});

    mapa.on('click', (ev) => { if (estado.agregando) formularioNuevo(ev.latlng); });
    mapa.on('locationfound', (ev) => {
      L.circleMarker(ev.latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#111', fillOpacity: 1, interactive: false }).addTo(mapa);
    });
    mapa.on('locationerror', () => avisar('No se pudo obtener tu ubicación. Revisa los permisos del navegador.', true));
  }

  function estiloMarcador(l) {
    const elegido = l.id === estado.seleccionado;
    return {
      radius: elegido ? 12 : 8,
      color: elegido ? '#0b2a3f' : '#fff',
      weight: elegido ? 3 : 2,
      fillColor: COLOR[l.estado] || COLOR.pendiente,
      fillOpacity: l.estado === 'descartado' ? 0.6 : 1,
    };
  }

  function visibles() {
    const q = normalizar(estado.busqueda);
    return estado.locales.filter((l) => {
      if (estado.filtro !== 'todos' && l.estado !== estado.filtro) return false;
      if (estado.rubro !== 'todos' && l.rubro !== estado.rubro) return false;
      if (!q) return true;
      return normalizar(`${l.nombre} ${l.direccion || ''} ${l.notas || ''} ${l.contacto || ''}`).includes(q);
    });
  }

  function pintarMarcadores(lista) {
    capa.clearLayers();
    marcadores.clear();
    for (const l of lista) {
      const m = L.circleMarker([l.lat, l.lon], estiloMarcador(l));
      m.bindTooltip(l.nombre, { direction: 'top', offset: [0, -8] });
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (estado.agregando) formularioNuevo(ev.latlng); else abrirFicha(l.id);
      });
      m.addTo(capa);
      marcadores.set(l.id, m);
    }
    const elegido = marcadores.get(estado.seleccionado);
    if (elegido) elegido.bringToFront();
  }

  // ---------- cabecera, filtros y lista ----------
  function pintarAvance() {
    const delRubro = estado.locales.filter((l) => estado.rubro === 'todos' || l.rubro === estado.rubro);
    const total = delRubro.length;
    const hechos = delRubro.filter((l) => l.estado !== 'pendiente').length;
    $('avance').replaceChildren(h('b', null, `${hechos} de ${total}`), h('br'), 'visitados');
  }

  function pintarChips() {
    const delRubro = estado.locales.filter((l) => estado.rubro === 'todos' || l.rubro === estado.rubro);
    const cuenta = (id) => delRubro.filter((l) => l.estado === id).length;
    const chip = (id, texto, n, punto) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(estado.filtro === id),
      onclick: () => { estado.filtro = id; pintarTodo(); },
    }, punto && h('span', { class: `punto ${id}` }), `${texto} ${n}`);
    $('chips').replaceChildren(
      chip('todos', 'Todos', delRubro.length),
      ...ESTADOS.map((e) => chip(e.id, e.plural, cuenta(e.id), true))
    );
  }

  function pintarLista(lista) {
    const cabeza = h('div', { class: 'lista-cabeza' },
      `${lista.length} locales`,
      h('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar lista', onclick: cerrarPanel }, '✕'));
    const filas = lista.map((l) => h('button', { class: 'fila', type: 'button', onclick: () => abrirFicha(l.id, true) },
      h('span', { class: `punto ${l.estado}` }),
      h('span', null,
        h('strong', null, l.nombre),
        h('small', null, `${NOMBRE_RUBRO[l.rubro] || 'Otro'} · ${l.direccion || 'sin dirección'}`),
        l.notas && h('small', { class: 'nota' }, l.notas))));
    const vacio = !lista.length && h('p', { class: 'lista-vacia' },
      estado.locales.length ? 'Ningún local coincide con la búsqueda o el filtro.' : 'Todavía no hay locales cargados.');
    $('lista').replaceChildren(cabeza, ...filas, vacio || '');
  }

  function pintarRubros() {
    const sel = $('rubro');
    const opcion = (id, texto, n) => h('option', { value: id, selected: estado.rubro === id }, `${texto} (${n})`);
    sel.replaceChildren(
      opcion('todos', 'Todos los rubros', estado.locales.length),
      ...RUBROS.map(([id, nombre]) => [id, nombre, estado.locales.filter((l) => l.rubro === id).length])
        .filter(([id, , n]) => n || id === estado.rubro).map(([id, nombre, n]) => opcion(id, nombre, n)));
  }

  function pintarTodo() {
    const lista = visibles();
    pintarRubros();
    pintarAvance();
    pintarChips();
    pintarLista(lista);
    pintarMarcadores(lista);
  }

  // ---------- panel (lista / ficha) ----------
  function mostrarPanel(modo) {
    const p = $('panel');
    $('lista').hidden = modo !== 'lista';
    $('ficha').hidden = modo !== 'ficha';
    p.classList.toggle('modo-lista', modo === 'lista');
    p.classList.toggle('modo-ficha', modo === 'ficha');
    p.classList.add('abierto');
    p.scrollTop = 0;
  }

  function cerrarPanel() {
    $('panel').classList.remove('abierto');
  }

  function puedeSalir() {
    return !estado.sinGuardar || window.confirm('Tienes cambios sin guardar en este local. ¿Descartarlos?');
  }

  function cerrarFicha() {
    if (!puedeSalir()) return;
    const anterior = estado.seleccionado;
    estado.seleccionado = null;
    estado.sinGuardar = false;
    quitarMarcadorNuevo();
    const loc = estado.locales.find((l) => l.id === anterior);
    if (loc && marcadores.has(anterior)) marcadores.get(anterior).setStyle(estiloMarcador(loc));
    if (esCelular()) cerrarPanel(); else mostrarPanel('lista');
  }

  function enlaceWeb(web) {
    if (!web) return null;
    const url = /^https?:\/\//i.test(web) ? web : /^[\w-]+(\.[\w-]+)+/.test(web) ? `https://${web}` : null;
    return url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, web.replace(/^https?:\/\/(www\.)?/i, '')) : h('span', null, web);
  }

  function abrirFicha(id, centrar) {
    if (id !== estado.seleccionado && !puedeSalir()) return;
    const l = estado.locales.find((x) => x.id === id);
    if (!l) return;
    quitarMarcadorNuevo();
    const anterior = estado.seleccionado;
    estado.seleccionado = id;
    estado.sinGuardar = false;
    for (const i of [anterior, id]) {
      const loc = estado.locales.find((x) => x.id === i);
      if (loc && marcadores.has(i)) marcadores.get(i).setStyle(estiloMarcador(loc));
    }
    if (marcadores.has(id)) marcadores.get(id).bringToFront();

    const borrador = { estado: l.estado };
    const selRubro = h('select', { onchange: () => marcar() }, RUBROS.map(([id, nombre]) => h('option', { value: id, selected: (l.rubro || 'otro') === id }, nombre)));
    const marcar = () => { estado.sinGuardar = true; };

    const botonesEstado = h('div', { class: 'estados', role: 'group', 'aria-label': 'Estado del local' });
    const pintarEstados = () => botonesEstado.replaceChildren(...ESTADOS.map((e) => h('button', {
      class: 'estado-btn', type: 'button', 'aria-pressed': String(borrador.estado === e.id),
      onclick: () => {
        borrador.estado = e.id;
        const fecha = entradas.fecha_visita;
        if (e.id !== 'pendiente' && !fecha.value) fecha.value = hoy();
        marcar();
        pintarEstados();
      },
    }, h('span', { class: `punto ${e.id}` }), e.nombre)));

    const entradas = {};
    const campos = h('div', { class: 'campos' }, CAMPOS.map((c) => {
      const entrada = c.tipo === 'area'
        ? h('textarea', { placeholder: 'Con quién hablé, qué le interesa, cuándo volver…' })
        : h('input', { type: c.tipo || 'text', inputMode: c.id === 'consumo' ? 'decimal' : null });
      entrada.value = l[c.id] || '';
      entrada.addEventListener('input', marcar);
      entradas[c.id] = entrada;
      return h('label', { class: `campo${c.ancho ? ' ancho' : ''}` }, c.etiqueta, entrada);
    }));
    pintarEstados();

    const btnGuardar = h('button', { class: 'boton primario', type: 'submit' }, 'Guardar');
    const formulario = h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const cambios = { id: l.id, estado: borrador.estado, rubro: selRubro.value };
        for (const c of CAMPOS) cambios[c.id] = entradas[c.id].value;
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando…';
        try {
          const { local } = await api('/api/locales', 'PATCH', cambios);
          reemplazar(local);
          estado.sinGuardar = false;
          avisar('Guardado');
          pintarTodo();
          abrirFicha(local.id);
        } catch (e) {
          btnGuardar.disabled = false;
          btnGuardar.textContent = 'Guardar';
          avisar(e.message, true);
        }
      },
    },
    botonesEstado, campos,
    h('div', { class: 'campos', style: 'margin-top:10px' }, h('label', { class: 'campo ancho' }, 'Rubro', selRubro)),
    h('div', { class: 'pie' },
      btnGuardar,
      l.origen === 'manual' && h('button', { class: 'boton peligro', type: 'button', onclick: () => eliminar(l) }, 'Eliminar')),
    h('p', { class: 'guardado' }, `Última modificación: ${new Date(l.actualizado).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}`));

    const destino = `${l.lat},${l.lon}`;
    const busqueda = encodeURIComponent(`${l.nombre} ${l.direccion || ''} Santiago Chile`);
    $('ficha').replaceChildren(
      h('div', { class: 'ficha-cabeza' },
        h('h2', null, l.nombre),
        h('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar ficha', onclick: cerrarFicha }, '✕')),
      h('div', { class: 'datos' },
        h('span', { class: 'etiqueta' }, NOMBRE_RUBRO[l.rubro] || 'Otro'),
        h('span', null, l.direccion || 'Sin dirección registrada'),
        l.telefono && h('a', { href: `tel:${l.telefono.replace(/[^\d+]/g, '')}` }, l.telefono),
        enlaceWeb(l.web),
        l.horario && h('span', null, `Horario: ${l.horario}`),
        l.origen === 'manual' && h('span', null, 'Agregado a mano')),
      h('div', { class: 'acciones' },
        h('a', { class: 'boton oscuro', href: `https://www.google.com/maps/dir/?api=1&destination=${destino}`, target: '_blank', rel: 'noopener noreferrer' }, 'Cómo llegar'),
        h('a', { class: 'boton', href: `https://www.google.com/maps/search/?api=1&query=${busqueda}`, target: '_blank', rel: 'noopener noreferrer' }, 'Ver en Google Maps')),
      formulario);
    mostrarPanel('ficha');
    if (centrar) mapa.setView([l.lat, l.lon], Math.max(mapa.getZoom(), 17), { animate: false });
    if (esCelular()) {
      // En celular la ficha tapa la parte baja del mapa: deja el pin a la vista, arriba.
      const punto = mapa.latLngToContainerPoint([l.lat, l.lon]);
      const tam = mapa.getSize();
      mapa.panBy([punto.x - tam.x / 2, punto.y - tam.y * 0.12], { animate: true });
    }
  }

  function reemplazar(local) {
    const i = estado.locales.findIndex((x) => x.id === local.id);
    if (i >= 0) estado.locales[i] = local; else estado.locales.push(local);
    estado.locales.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function eliminar(l) {
    if (!window.confirm(`¿Eliminar "${l.nombre}" y sus notas? No se puede deshacer.`)) return;
    try {
      await api('/api/locales', 'DELETE', { id: l.id });
      estado.locales = estado.locales.filter((x) => x.id !== l.id);
      estado.sinGuardar = false;
      estado.seleccionado = null;
      pintarTodo();
      if (esCelular()) cerrarPanel(); else mostrarPanel('lista');
      avisar('Local eliminado');
    } catch (e) {
      avisar(e.message, true);
    }
  }

  // ---------- agregar local ----------
  function quitarMarcadorNuevo() {
    if (marcadorNuevo) { marcadorNuevo.remove(); marcadorNuevo = null; }
  }

  function modoAgregar(activo) {
    estado.agregando = activo;
    $('btn-agregar').classList.toggle('activo', activo);
    $('mapa').style.cursor = activo ? 'crosshair' : '';
    const aviso = $('aviso-mapa');
    aviso.hidden = !activo;
    if (activo) {
      aviso.replaceChildren(
        h('span', null, 'Toca el mapa en el lugar donde está el local.'),
        h('button', { type: 'button', onclick: () => modoAgregar(false) }, 'Cancelar'));
      if (esCelular()) cerrarPanel();
    }
  }

  function formularioNuevo(punto) {
    if (!puedeSalir()) return;
    modoAgregar(false);
    estado.seleccionado = null;
    estado.sinGuardar = false;
    quitarMarcadorNuevo();
    marcadorNuevo = L.circleMarker(punto, { radius: 12, color: '#0b2a3f', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(mapa);

    const nombre = h('input', { type: 'text', required: true, maxLength: 200 });
    const direccion = h('input', { type: 'text', maxLength: 300 });
    const telefono = h('input', { type: 'tel', maxLength: 100 });
    const rubro = h('select', null, RUBROS.map(([id, n]) => h('option', { value: id, selected: id === (estado.rubro === 'todos' ? 'sushi' : estado.rubro) }, n)));
    const btn = h('button', { class: 'boton primario', type: 'submit' }, 'Agregar local');
    const cancelar = () => { quitarMarcadorNuevo(); if (esCelular()) cerrarPanel(); else mostrarPanel('lista'); };

    $('ficha').replaceChildren(
      h('div', { class: 'ficha-cabeza' },
        h('h2', null, 'Nuevo local'),
        h('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cancelar', onclick: cancelar }, '✕')),
      h('form', {
        onsubmit: async (ev) => {
          ev.preventDefault();
          btn.disabled = true;
          try {
            const { local } = await api('/api/locales', 'POST', {
              nombre: nombre.value, direccion: direccion.value, telefono: telefono.value, rubro: rubro.value, lat: punto.lat, lon: punto.lng,
            });
            quitarMarcadorNuevo();
            reemplazar(local);
            estado.filtro = 'todos';
            if (estado.rubro !== local.rubro) estado.rubro = 'todos';
            pintarTodo();
            abrirFicha(local.id);
            avisar('Local agregado');
          } catch (e) {
            btn.disabled = false;
            avisar(e.message, true);
          }
        },
      },
      h('div', { class: 'campos' },
        h('label', { class: 'campo ancho' }, 'Nombre del local', nombre),
        h('label', { class: 'campo ancho' }, 'Rubro', rubro),
        h('label', { class: 'campo ancho' }, 'Dirección', direccion),
        h('label', { class: 'campo ancho' }, 'Teléfono', telefono)),
      h('div', { class: 'pie' }, btn)));
    mostrarPanel('ficha');
    nombre.focus();
  }

  // ---------- actualizar, exportar, sincronizar ----------
  async function actualizarLocales(primeraVez) {
    avisar(primeraVez ? 'Cargando los locales por primera vez…' : 'Buscando locales en OpenStreetMap…');
    try {
      const r = await api('/api/importar', 'POST');
      const datos = await api('/api/locales');
      estado.locales = datos.locales;
      pintarTodo();
      const origen = r.fuente === 'copia' ? ' (OpenStreetMap no respondió; se usó la copia guardada)' : '';
      avisar(`${r.total} locales encontrados, ${r.nuevos} nuevos${origen}`);
    } catch (e) {
      avisar(e.message, true);
    }
  }

  function exportar() {
    const columnas = ['nombre', 'rubro', 'direccion', 'telefono', 'web', 'horario', 'estado', 'fecha_visita', 'contacto',
      'contacto_telefono', 'proveedor', 'consumo', 'precio', 'notas', 'lat', 'lon'];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [columnas.join(';'), ...estado.locales.map((l) => columnas.map((c) => celda(l[c])).join(';'))];
    const archivo = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(archivo), download: `clientes-santiago-${hoy()}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Trae los cambios hechos en el otro dispositivo, sin pisar lo que se está escribiendo.
  async function sincronizar() {
    if (!estado.clave || $('app').hidden || estado.sinGuardar || estado.agregando || marcadorNuevo) return;
    try {
      const datos = await api('/api/locales');
      if (estado.sinGuardar) return;
      estado.locales = datos.locales;
      pintarTodo();
      if (estado.seleccionado && !$('ficha').hidden) {
        if (estado.locales.some((l) => l.id === estado.seleccionado)) {
          const foco = document.activeElement;
          if (!$('ficha').contains(foco)) abrirFicha(estado.seleccionado);
        } else {
          estado.seleccionado = null;
          if (esCelular()) cerrarPanel(); else mostrarPanel('lista');
        }
      }
    } catch (e) {
      if (e.clave) { guardarClave('', ''); pedirClave('El acceso cambió. Ingresa de nuevo.'); }
    }
  }

  // ---------- eventos ----------
  $('rubro').addEventListener('change', (ev) => { estado.rubro = ev.target.value; pintarTodo(); });
  $('buscar').addEventListener('input', (ev) => { estado.busqueda = ev.target.value; pintarTodo(); });
  $('btn-lista').addEventListener('click', () => mostrarPanel('lista'));
  $('btn-ubicacion').addEventListener('click', () => mapa.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true }));
  $('btn-agregar').addEventListener('click', () => modoAgregar(!estado.agregando));

  const menu = $('menu');
  const abrirMenu = (abierto) => { menu.hidden = !abierto; $('btn-menu').setAttribute('aria-expanded', String(abierto)); };
  $('btn-menu').addEventListener('click', (ev) => { ev.stopPropagation(); abrirMenu(menu.hidden); });
  document.addEventListener('click', () => abrirMenu(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') abrirMenu(false); });
  menu.addEventListener('click', (ev) => {
    const accion = ev.target.dataset.accion;
    if (accion === 'actualizar') actualizarLocales(false);
    if (accion === 'exportar') exportar();
    if (accion === 'salir' && puedeSalir()) { estado.sinGuardar = false; guardarClave('', ''); $('usuario').value = ''; pedirClave(); }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  setInterval(() => { if (!document.hidden) sincronizar(); }, 60000);
  window.addEventListener('beforeunload', (ev) => { if (estado.sinGuardar) ev.preventDefault(); });
  window.addEventListener('resize', () => { if (!esCelular() && estado.seleccionado === null) mostrarPanel('lista'); });

  // ---------- arranque ----------
  try {
    const a = JSON.parse(localStorage.getItem('acceso') || 'null');
    if (a) { estado.usuario = a.u || ''; estado.clave = a.c || ''; }
  } catch (e) { /* sin almacenamiento */ }
  if (!esCelular()) mostrarPanel('lista');
  if (estado.clave) iniciar(); else pedirClave();
})();
