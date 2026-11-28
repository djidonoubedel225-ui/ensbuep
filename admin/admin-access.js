/* Droit d'accès à la gestion des administrateurs.
   Accordé à l'administrateur principal, et à tout compte qui reçoit le droit
   « view_admins » du module « administration ». Les autres comptes ne voient
   ni le lien dans le menu, ni le contenu de la page. */
(function () {
  async function canManageAdmins() {
    const db = window.buepSupabase;
    if (!db) return false;
    try {
      const { data: sessionData } = await db.auth.getSession();
      if (!sessionData || !sessionData.session) return false;

      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("user_id,is_principal_admin,account_status")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();
      if (profileError || !profile || profile.account_status !== "active") return false;
      if (profile.is_principal_admin) return true;

      const { data, error } = await db.rpc("has_permission", {
        p_module_slug: "administration",
        p_action_key: "view_admins"
      });
      return !error && data === true;
    } catch (e) {
      return false;
    }
  }

  window.buepCanManageAdmins = canManageAdmins;

  canManageAdmins().then(function (ok) {
    document.documentElement.dataset.canAdmins = ok ? "1" : "0";
  });
})();
