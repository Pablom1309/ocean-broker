# ocean-broker
Pagina Ocean Broker

## Mapa de clientes (privado)

`/mapa.html` es una herramienta interna: un mapa de la comuna de Santiago con
los locales que pueden comprar salmón (sushi, peruanos, pescados y mariscos,
asiáticos, internacionales y pescaderías). Permite marcar cada local
como visitado y guardar notas de venta. Pide usuario y clave, y no está
enlazada desde el sitio público.

### Configuración en Vercel (una sola vez)

1. **Base de datos:** en el proyecto, pestaña **Storage** → *Create Database* →
   **Neon (Postgres)**, plan gratuito → *Connect* al proyecto.
2. **Usuario y clave:** *Settings* → *Environment Variables* → agrega
   `APP_USER` (tu usuario) y `APP_PASSWORD` (tu clave).
3. **Volver a publicar:** *Deployments* → menú `⋯` del último → *Redeploy*.

Al entrar por primera vez se cargan solos los locales desde OpenStreetMap.

### Archivos

- `mapa.html`, `mapa.css`, `mapa.js` — la pantalla del mapa.
- `api/` — funciones de Vercel (`locales`, `importar`, `comuna`) y su código
  de apoyo en `api/_lib/`.
