// Gryfix Experience v3 – vanilla JS: hlavička, menu, odhalení, karty programů + rozvrh, test pozornosti, okruhy, galerie, formulář.
document.documentElement.classList.add('js');

(function () {
  var klid = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- hlavička ----------
  var hl = document.querySelector('[data-hl]');
  function hlavicka() { hl.classList.toggle('je-dole', window.scrollY > 40); }
  if (hl) { hlavicka(); window.addEventListener('scroll', hlavicka, { passive: true }); }

  // ---------- burger ----------
  var burger = document.querySelector('.burger'), menu = document.getElementById('menu');
  function zavri() { burger.setAttribute('aria-expanded', 'false'); menu.classList.remove('je-otevrene'); hl.classList.remove('je-otevrene'); }
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var o = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', String(o));
      menu.classList.toggle('je-otevrene', o); hl.classList.toggle('je-otevrene', o);
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) zavri(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') zavri(); });
  }

  // ---------- odhalení ----------
  var odhal = document.querySelectorAll('.odhal');
  if ('IntersectionObserver' in window && !klid) {
    var io = new IntersectionObserver(function (zaznamy) {
      zaznamy.forEach(function (z) { if (z.isIntersecting) { z.target.classList.add('je-videt'); io.unobserve(z.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    odhal.forEach(function (el) { io.observe(el); });
  } else {
    odhal.forEach(function (el) { el.classList.add('je-videt'); });
  }

  // ---------- programy: karty + rozvrh ----------
  var karty = Array.prototype.slice.call(document.querySelectorAll('[data-karta]'));
  var panely = Array.prototype.slice.call(document.querySelectorAll('[data-rozvrh-panel]'));
  function vyberProgram(id, posun) {
    karty.forEach(function (k) {
      var ano = k.getAttribute('data-karta') === id;
      k.classList.toggle('je-vybrana', ano);
      var t = k.querySelector('[data-rozvrh]'); if (t) t.setAttribute('aria-expanded', String(ano));
    });
    panely.forEach(function (p) {
      var ano = p.getAttribute('data-rozvrh-panel') === id;
      p.hidden = !ano;
      p.classList.remove('je-zivy');
      if (ano && !klid) { void p.offsetWidth; p.classList.add('je-zivy'); }
      if (ano && posun) p.scrollIntoView({ behavior: klid ? 'auto' : 'smooth', block: 'start' });
    });
  }
  karty.forEach(function (k) {
    var t = k.querySelector('[data-rozvrh]');
    if (t) t.addEventListener('click', function () { vyberProgram(k.getAttribute('data-karta'), true); });
  });
  document.querySelectorAll('[data-vyber-program]').forEach(function (a) {
    a.addEventListener('click', function () { vyberProgram(a.getAttribute('data-vyber-program')); });
  });
  var prvni = document.querySelector('.karta.je-vybrana');
  if (prvni) karty.forEach(function (k) { var t = k.querySelector('[data-rozvrh]'); if (t) t.setAttribute('aria-expanded', String(k === prvni)); });

  // ---------- formulář: předvyplnění ----------
  var form = document.querySelector('form.formular');
  function nastavProgram(hodnota) {
    if (!form) return;
    form.querySelectorAll('input[name="program"]').forEach(function (r) { r.checked = r.value === hodnota; });
  }
  document.querySelectorAll('[data-poptat]').forEach(function (a) {
    a.addEventListener('click', function () { nastavProgram(a.getAttribute('data-poptat')); });
  });

  // ---------- test pozornosti ----------
  var test = document.querySelector('[data-test]');
  if (test) {
    var sekundy = parseInt(test.getAttribute('data-sekundy'), 10) || 8;
    var faze = test.querySelectorAll('[data-test-faze]');
    var krok = test.querySelector('[data-test-krok]');
    var otazky = test.querySelectorAll('.test__otazka');
    var body = 0, casovac = null, tik = null;
    var cas = test.querySelector('[data-test-cas]');
    test.style.setProperty('--sekundy', sekundy + 's');
    test.setAttribute('data-stav', 'start');

    function ukaz(nazev) {
      faze.forEach(function (f) { f.hidden = f.getAttribute('data-test-faze') !== nazev; });
    }
    function otazka(i) {
      if (i >= otazky.length) return vysledek();
      test.setAttribute('data-stav', 'otazky');
      krok.textContent = 'Otázka ' + (i + 1) + ' ze ' + otazky.length;
      ukaz('q' + i);
      var prvni = otazky[i].querySelector('button'); if (prvni) prvni.focus({ preventScroll: true });
    }
    function vysledek() {
      test.setAttribute('data-stav', 'vysledek');
      krok.textContent = 'Hotovo';
      test.querySelector('[data-test-skore]').textContent = body;
      var zprava = body === otazky.length
        ? 'Výborně. Situační pozornost máte v pořádku. V terénu, pod tlakem a v týmu je to ale jiná zkouška.'
        : body === 0
          ? 'Za osm sekund toho mozek moc neuloží, pokud ho to nikdo nenaučí. Přesně tohle se dá trénovat.'
          : 'Něco vám uteklo. Pod stresem si člověk všimne ještě méně. Situační pozornost se dá trénovat.';
      test.querySelector('[data-test-zprava]').textContent = zprava;
      ukaz('vysledek');
      var li = document.querySelector('[data-schopnost="situační pozornost"]');
      if (li) li.classList.add('je-overeno');
      test.querySelector('[data-test-znovu]').focus({ preventScroll: true });
    }
    function start() {
      body = 0;
      clearTimeout(casovac);
      faze.forEach(function (f) { f.hidden = true; });
      test.setAttribute('data-stav', 'pozoruj');
      krok.textContent = 'Dívejte se pozorně';
      var zbyva = sekundy; if (cas) cas.textContent = zbyva;
      clearInterval(tik);
      tik = setInterval(function () { zbyva--; if (cas) cas.textContent = Math.max(zbyva, 0); if (zbyva <= 0) clearInterval(tik); }, 1000);
      casovac = setTimeout(function () { clearInterval(tik); otazka(0); }, sekundy * 1000);
    }
    test.querySelector('[data-test-spustit]').addEventListener('click', start);
    test.querySelector('[data-test-znovu]').addEventListener('click', start);
    otazky.forEach(function (o, i) {
      o.querySelectorAll('[data-odpoved]').forEach(function (b) {
        b.addEventListener('click', function () { if (b.getAttribute('data-odpoved') === '1') body++; otazka(i + 1); });
      });
    });
  }

  // ---------- galerie místa ----------
  var pas = document.querySelector('[data-pas-plocha]');
  if (pas) {
    document.querySelectorAll('[data-pas]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = pas.querySelector('.pas__f');
        var krok = f ? f.getBoundingClientRect().width + 20 : pas.clientWidth * .6;
        pas.scrollBy({ left: krok * parseInt(b.getAttribute('data-pas'), 10), behavior: klid ? 'auto' : 'smooth' });
      });
    });
  }

  // ---------- vlastní program: okruhy ----------
  var okruhy = document.querySelectorAll('[data-okruh]');
  var vlastni = document.querySelector('[data-okruh-vlastni]');
  var pocet = document.querySelector('[data-souhrn-pocet]');
  var slovo = document.querySelector('[data-souhrn-slovo]');
  var prenest = document.querySelector('[data-prenest]');
  function vybrane() {
    var v = Array.prototype.filter.call(okruhy, function (c) { return c.checked; }).map(function (c) { return c.value; });
    var t = vlastni ? vlastni.value.trim() : '';
    if (t) v.push(t);
    return v;
  }
  function tvar(n) { return n === 1 ? 'okruh vybrán' : (n >= 2 && n <= 4) ? 'okruhy vybrány' : 'okruhů vybráno'; }
  function souhrn() {
    var n = vybrane().length;
    if (pocet) pocet.textContent = n;
    if (slovo) slovo.textContent = tvar(n);
    if (prenest) prenest.setAttribute('aria-disabled', n ? 'false' : 'true');
  }
  okruhy.forEach(function (c) { c.addEventListener('change', souhrn); });
  if (vlastni) {
    vlastni.addEventListener('input', function () { vlastni.closest('.dl').classList.toggle('je-vyplneno', !!vlastni.value.trim()); souhrn(); });
    vlastni.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (prenest) prenest.click(); } });
  }
  souhrn();
  if (prenest && form) {
    prenest.addEventListener('click', function (e) {
      var v = vybrane();
      if (!v.length) { e.preventDefault(); return; }
      var box = form.querySelector('[data-form-okruhy]');
      form.querySelector('[data-form-okruhy-text]').textContent = v.join(', ');
      form.querySelector('[data-form-okruhy-pole]').value = v.join(', ');
      box.hidden = false;
      nastavProgram('Vlastní program');
    });
  }
})();

// Formulář: demo režim neodesílá nic, ostrý režim posílá na endpoint ze site.json (data-endpoint).
(function () {
  document.querySelectorAll('form.formular').forEach(function (f) {
    var stav = f.querySelector('.formular-stav');
    var start = Date.now();
    f.addEventListener('submit', function (e) {
      var endpoint = f.getAttribute('data-endpoint');
      var demo = f.getAttribute('data-demo') === '1';
      if (f.querySelector('.past input').value) { e.preventDefault(); return; }   // robot
      if (demo || !endpoint) {
        e.preventDefault();
        stav.textContent = 'Ukázka formuláře: nic se neodesílá. Po spuštění webu bude zpráva doručena na e-mail firmy.';
        return;
      }
      e.preventDefault();
      stav.textContent = 'Odesílám…';
      var fd = new FormData(f), fields = {};
      [['program', 'Program'], ['okruhy', 'Vybrané okruhy'], ['jmeno', 'Jméno'], ['firma', 'Firma'], ['email', 'E-mail'], ['telefon', 'Telefon'],
       ['pocet', 'Počet lidí'], ['termin', 'Termín'], ['zprava', 'Zpráva']].forEach(function (p) {
        var v = String(fd.get(p[0]) || '').trim(); if (v) fields[p[1]] = v;
      });
      var tlacitko = f.querySelector('[type=submit]'); if (tlacitko) tlacitko.disabled = true;
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dopyt', fields: fields, hp: '', ms: Date.now() - start, page: location.href.split('#')[0], lang: 'cs' }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || r.status); }); })
        .then(function () { f.reset(); stav.textContent = 'Děkujeme, poptávka je odeslaná. Ozveme se Vám co nejdřív.'; })
        .catch(function (err) { stav.textContent = (err && err.message && isNaN(err.message) ? err.message + ' ' : '') + 'Případně napište na ' + f.getAttribute('data-email') + '.'; })
        .then(function () { if (tlacitko) tlacitko.disabled = false; });
    });
  });
})();
