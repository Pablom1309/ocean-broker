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

// Carrusel: flechas que avanzan una foto y se desactivan en los extremos.
(function () {
  var track = document.getElementById('carTrack');
  if (!track) return;
  var btns = document.querySelectorAll('.car-btn');
  function step() { var s = track.querySelector('.slide'); return s ? s.getBoundingClientRect().width + 22 : 300; }
  function sync() {
    var max = track.scrollWidth - track.clientWidth - 2;
    btns.forEach(function (b) { b.disabled = b.dataset.dir === '-1' ? track.scrollLeft <= 2 : track.scrollLeft >= max; });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { track.scrollBy({ left: step() * Number(b.dataset.dir), behavior: 'smooth' }); }); });
  track.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: step() * (e.key === 'ArrowRight' ? 1 : -1), behavior: 'smooth' }); }
  });
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
})();
