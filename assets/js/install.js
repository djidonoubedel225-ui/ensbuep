/* Raccourci sur l'écran d'accueil.
   - Enregistre le service worker minimal (sans cache) demandé pour l'installation.
   - Affiche un bouton discret « Installer » quand le navigateur le propose, puis le masque. */
(function () {
  var base = new URL("../../", document.currentScript ? document.currentScript.src : location.href);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register(new URL("sw.js", base).href).catch(function () {});
    });
  }

  var deferred = null;
  var button = null;

  function hideButton() {
    if (button) button.remove();
    button = null;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferred = event;
    if (button) return;
    button = document.createElement("button");
    button.type = "button";
    button.textContent = "Installer le raccourci";
    button.setAttribute("aria-label", "Installer le raccourci du portail sur l'écran d'accueil");
    button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9000;padding:10px 16px;border:0;border-radius:999px;background:#c9a24f;color:#0b1f3a;font:700 13px/1.2 'Plus Jakarta Sans',Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    button.addEventListener("click", function () {
      if (!deferred) return hideButton();
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; hideButton(); });
    });
    document.body.appendChild(button);
  });

  window.addEventListener("appinstalled", function () {
    deferred = null;
    hideButton();
  });
})();
