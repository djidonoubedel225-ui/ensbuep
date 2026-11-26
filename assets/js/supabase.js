
/* =========================================
   BUEP-ENS/PN — CLIENT SUPABASE
   ========================================= */

(() => {
    const config = window.BUEP_CONFIG;

    if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        console.error("Configuration Supabase introuvable.");
        return;
    }

    if (
        config.SUPABASE_URL.includes("COLLER_ICI") ||
        config.SUPABASE_ANON_KEY.includes("COLLER_ICI")
    ) {
        console.error("Les identifiants Supabase ne sont pas renseignés.");
        return;
    }

    if (!window.supabase || !window.supabase.createClient) {
        console.error("La bibliothèque Supabase n'est pas chargée.");
        return;
    }

    window.buepSupabase = window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY
    );

    console.info("Client Supabase initialisé.");
})();
