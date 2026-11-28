/* =========================================
   BUEP-ENS/PN — SUIVI ANONYME DE FRÉQUENTATION
   Enregistre les pages consultées et les téléchargements de documents.
   Aucun nom, aucune adresse e-mail, aucune donnée de compte.
   ========================================= */

(() => {
    const VISITOR_KEY = "buep_visitor";

    // Identifiant anonyme aléatoire, gardé dans le navigateur.
    function visitorId() {
        try {
            let id = localStorage.getItem(VISITOR_KEY);
            if (!id) {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
                localStorage.setItem(VISITOR_KEY, id);
            }
            return id;
        } catch (error) {
            return null;
        }
    }

    // Pas de suivi : espace de gestion, ou visiteur qui demande de ne pas être suivi.
    function trackingAllowed() {
        if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return false;
        if (location.pathname.includes("/admin/")) return false;
        return true;
    }

    function deviceType() {
        return window.matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop";
    }

    function contentType(path) {
        if (path.includes("publication")) return "publication";
        if (path.includes("activite")) return "activity";
        return "page";
    }

    // L'envoi ne bloque jamais la page : en cas d'échec, rien ne se passe.
    function send(table, row) {
        const client = window.buepSupabase;
        const visitor = visitorId();
        if (!client || !visitor || !trackingAllowed()) return;

        try {
            client
                .from(table)
                .insert({ visitor_id: visitor, ...row })
                .then(() => {}, () => {});
        } catch (error) {
            /* Suivi indisponible : sans effet sur le portail. */
        }
    }

    function trackPageView() {
        const path = location.pathname.replace(/index\.html$/, "");
        send("page_views", {
            page_path: path.slice(0, 300),
            page_title: (document.title || "").slice(0, 200),
            content_type: contentType(path),
            device_type: deviceType()
        });
    }

    // Téléchargement d'un document : lien avec l'attribut download.
    function trackDownload(link) {
        const name = (link.getAttribute("download") || "document").slice(0, 200);
        const href = link.getAttribute("href") || "";
        const match = href.match(/\/object\/sign\/buep-documents-public\/([^?]+)/);
        const resourceId = match ? decodeURIComponent(match[1]).slice(0, 300) : null;
        const format = (name.split(".").pop() || "").toLowerCase().slice(0, 10);

        send("download_events", {
            resource_id: resourceId,
            resource_title: name,
            resource_type: "document",
            file_format: format
        });
    }

    document.addEventListener("click", event => {
        const link = event.target.closest ? event.target.closest("a[download]") : null;
        if (link) trackDownload(link);
    }, true);

    trackPageView();
})();
