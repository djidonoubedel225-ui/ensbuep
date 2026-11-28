/* Écran de chargement de la première page.
   Le trait doré du fond se remplit (jusqu'à 90 %) pendant l'attente, puis passe à 100 %
   quand les données de l'accueil sont arrivées (plus aucune requête Supabase en cours,
   polices chargées et images visibles prêtes). Durée minimale pour que le remplissage
   se voie, durée maximale pour ne jamais bloquer le site. */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("splash-on")) return;

  var line = document.getElementById("splashLine");
  var pctText = document.getElementById("splashPct");
  var caption = document.getElementById("splashCaption");
  var start = Date.now();
  var MIN_MS = 900;
  var MAX_MS = 4000;
  var finished = false;
  var quietSince = null;
  var stage = document.querySelector(".splash-stage");
  var lines = [];
  var lastMask = "";

  // Le trait doré s'interrompt derrière le bloc de texte : il ne traverse plus le logo ni les messages.
  function applyLineMask() {
    if (!stage || !lines.length) return;
    var r = stage.getBoundingClientRect();
    var top = Math.max(0, r.top - 18);
    var bot = Math.min(window.innerHeight, r.bottom + 18);
    var g = "linear-gradient(to bottom, #000 0px, #000 " + top + "px, transparent " + top + "px, transparent " + bot + "px, #000 " + bot + "px)";
    if (g === lastMask) return;
    lastMask = g;
    for (var i = 0; i < lines.length; i++) {
      lines[i].style.webkitMaskImage = g;
      lines[i].style.maskImage = g;
    }
  }
  window.addEventListener("resize", applyLineMask);

  function imagesReady() {
    var imgs = document.querySelectorAll("main img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.loading === "lazy" || !img.getAttribute("src")) continue;
      if (!img.complete) return false;
    }
    return true;
  }

  function setProgress(pct) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    if (line) line.style.clipPath = "inset(0 0 " + (100 - p) + "% 0)";
    if (pctText) pctText.textContent = p + " %";
    var fill = document.getElementById("splashFill");
    if (fill) fill.style.width = p + "%";
  }

  // Le message ne passe jamais en deux lignes : sa taille s'adapte à la largeur de la barre.
  function fitCaption() {
    if (!caption) return;
    var max = caption.clientWidth;
    var size = parseFloat(window.getComputedStyle(caption).fontSize) || 18;
    var guard = 0;
    while (caption.scrollWidth > max && size > 9 && guard < 60) {
      size -= 0.5;
      caption.style.fontSize = size + "px";
      guard++;
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    setProgress(100);
    applyLineMask();
    if (caption) caption.textContent = "BIENVENUE SUR LE PORTAIL DU BUEP !";
    fitCaption();
    setTimeout(function () {
      root.classList.add("splash-leave");
      setTimeout(function () {
        root.classList.remove("splash-on", "splash-leave");
        try { sessionStorage.setItem("buep-entered", "1"); } catch (e) {}
      }, 300);
    }, 350);
  }

  function tick() {
    if (finished) return;
    var elapsed = Date.now() - start;
    var fontsOk = !document.fonts || document.fonts.status === "loaded";
    var idle = document.readyState === "complete" && fontsOk && !(window.buepPending > 0) && imagesReady();

    if (idle && elapsed >= MIN_MS) {
      if (quietSince === null) quietSince = Date.now();
      if (Date.now() - quietSince >= 150) return finish();
    } else {
      quietSince = null;
    }

    setProgress(Math.min(90, (elapsed / MIN_MS) * 90));
    applyLineMask();

    if (elapsed >= MAX_MS) return finish();
    setTimeout(tick, 60);
  }

  tick();
})();
