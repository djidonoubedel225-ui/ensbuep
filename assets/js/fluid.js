/* =========================================
   BUEP-ENS/PN — NAVIGATION FLUIDE
   Précharge la page vers laquelle le visiteur va cliquer
   (au survol ou au toucher), pour qu'elle s'affiche aussitôt.
   ========================================= */
(() => {
    const done = new Set();

    function prefetch(link) {
        const href = link.getAttribute("href");
        if (!href || /^(mailto:|tel:|sms:|https?:\/\/)/i.test(href) || href.startsWith("#")) return;
        if (!/\.html(\?|#|$)/.test(href)) return;

        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin || done.has(url.href)) return;
        done.add(url.href);

        const hint = document.createElement("link");
        hint.rel = "prefetch";
        hint.as = "document";
        hint.href = url.href;
        document.head.appendChild(hint);
    }

    const anchorOf = event => event.target && event.target.closest ? event.target.closest("a[href]") : null;

    document.addEventListener("pointerover", event => {
        const link = anchorOf(event);
        if (link) prefetch(link);
    }, { passive: true });

    document.addEventListener("touchstart", event => {
        const link = anchorOf(event);
        if (link) prefetch(link);
    }, { passive: true });
})();
