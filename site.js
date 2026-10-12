// Barra superior que se esconde al bajar y reaparece al subir (patrón "headroom").
(function () {
  var header = document.querySelector('header');
  if (!header) return;
  var lastY = window.scrollY, ticking = false;
  var TOP = 80;      // siempre visible cerca del inicio
  var DELTA = 6;     // ignora movimientos mínimos del dedo o trackpad

  function update() {
    var y = window.scrollY;
    var diff = y - lastY;
    if (y <= TOP) {
      header.classList.remove('hide');
    } else if (Math.abs(diff) > DELTA) {
      // no esconder si el usuario está navegando el menú con teclado
      if (diff > 0 && !header.contains(document.activeElement)) header.classList.add('hide');
      else if (diff < 0) header.classList.remove('hide');
    }
    if (Math.abs(diff) > DELTA || y <= TOP) lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  header.addEventListener('focusin', function () { header.classList.remove('hide'); });
})();
