/* =========================================
   BUEP-ENS/PN — PARAMÈTRES DU SITE
   Applique les réglages enregistrés dans
   l'administration (table site_settings).
   En cas d'erreur, le site reste affiché
   avec son contenu par défaut.
   ========================================= */

(() => {
    "use strict";

    const supabase = window.buepSupabase;
    const PUBLIC_BUCKET = "buep-public-assets";
    const SETTINGS_CACHE_KEY = "buep-settings-cache";

    if (!supabase) return;

    // Icônes des réseaux (SVG intégrés, aucune ressource externe).
    const SOCIAL_ICONS = {
        facebook: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 8h2.4V4.6H14c-2.5 0-4 1.6-4 4.2V11H8v3.3h2V21h3.4v-6.7h2.6l.4-3.3h-3V9.2c0-.7.3-1.2 1-1.2z"/></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M4 20l1.3-3.9A8.5 8.5 0 1 1 8.2 19z"/><path fill="currentColor" d="M9 8.5c.2-.4.5-.4.7-.4.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.6l-.4.5c.5 1 1.3 1.8 2.3 2.3l.5-.5c.2-.2.4-.2.6-.1l1.4.7c.3.1.4.3.3.6 0 .2-.4 1.2-1.4 1.4-1 .2-2.6-.2-4.3-1.9S8.6 9.4 9 8.5z"/></svg>',
        instagram: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.8" cy="7.2" r="1.1" fill="currentColor"/></svg>',
        youtube: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12.5" rx="3.5" fill="currentColor"/><path d="M10 9.5v5.5l4.8-2.75z" fill="#0b1f3a"/></svg>',
        tiktok: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M14 3v11.2a3.6 3.6 0 1 1-3.6-3.6M14 3c.4 2.6 2.2 4.2 4.6 4.4"/></svg>',
        telegram: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3.5 11.2l16.4-6.3c.8-.3 1.5.2 1.2 1.4l-2.8 13.2c-.2.9-.8 1.1-1.6.7l-4.2-3.1-2 2c-.2.2-.4.4-.8.4l.3-4.3 7.8-7c.3-.3-.1-.5-.5-.2L7.7 13.9l-4.1-1.3c-.9-.3-.9-.9.2-1.4z"/></svg>',
        linkedin: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 9h3v10H5zM6.5 4.5a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM10 9h2.9v1.4c.4-.8 1.4-1.6 3-1.6 3.1 0 3.6 2 3.6 4.6V19h-3v-5c0-1.2 0-2.7-1.7-2.7-1.7 0-2 1.3-2 2.6V19h-2.8z"/></svg>',
        x: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4.5 4.5l15 15M19.5 4.5l-15 15"/></svg>'
    };

    window.buepSocialIcon = key => SOCIAL_ICONS[key] || "";

    if (!supabase) return;

    // Logo : affiché tout de suite à partir du dernier logo mémorisé dans
    // le navigateur, sinon la pastille reste vide (sans « B ») jusqu'à la
    // réponse de la base. Ce cache est une simple commodité d'affichage.
    const LOGO_CACHE_KEY = "buep-logo-cache";

    function readLogoCache() {
        try {
            return JSON.parse(localStorage.getItem(LOGO_CACHE_KEY) || "null");
        } catch (error) {
            return null;
        }
    }

    function writeLogoCache(logo) {
        try {
            if (logo) {
                localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(logo));
            } else {
                localStorage.removeItem(LOGO_CACHE_KEY);
            }
        } catch (error) {
            /* Stockage indisponible : le site fonctionne sans cache. */
        }
    }

    // Réduit le logo à 400 px au plus (PNG) : il reste net sur l'écran de chargement
    // et l'en-tête, et se lit immédiatement, même quand le fichier d'origine est lourd.
    async function shrinkLogo(blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL("image/png");
            return data.length <= 400000 ? data : null;
        } catch (error) {
            return null;
        }
    }

    // Copie l'image du logo dans le navigateur (une seule fois par logo).
    // Les pages suivantes l'affichent sans la retélécharger.
    async function ensureLogoData(url, alt) {
        const cached = readLogoCache();
        if (cached && cached.url === url && cached.data) return;

        try {
            const response = await fetch(url, { cache: "force-cache" });
            if (!response.ok) return;
            const blob = await response.blob();
            const data = await shrinkLogo(blob);
            if (!data) {
                writeLogoCache({ url, alt });
                return;
            }
            writeLogoCache({ url, alt, data });
        } catch (error) {
            /* Pas de copie : le logo reste chargé depuis son adresse. */
        }
    }

    function setBrandLogo(url, alt) {
        document.querySelectorAll(".brand-logo").forEach(box => {
            box.classList.remove("is-pending");
            if (!url) return;

            box.textContent = "";
            box.classList.add("has-logo");

            const img = createEl("img");
            img.src = url;
            img.alt = alt || "";
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "contain";

            box.appendChild(img);
        });
    }

    const cachedLogo = readLogoCache();

    if (cachedLogo && (cachedLogo.data || cachedLogo.url)) {
        // L'image enregistrée dans le navigateur s'affiche sans téléchargement.
        setBrandLogo(cachedLogo.data || cachedLogo.url, cachedLogo.alt);
    } else {
        document.querySelectorAll(".brand-logo").forEach(box => {
            box.classList.add("is-pending");
        });
    }

    // Lecture unique des paramètres, lancée dès le chargement du script
    // et partagée avec site-links.js. La lecture de navigation part en parallèle.
    window.buepSettingsReady = loadSettings().catch(error => {
        console.error("Paramètres du site indisponibles :", error.message);
        return null;
    });

    // Si la lecture échoue, on retire l'état d'attente : le « B » reprend sa place.
    window.buepSettingsReady.then(settings => {
        if (!settings) {
            document.querySelectorAll(".brand-logo.is-pending").forEach(box => {
                box.classList.remove("is-pending");
            });
        }
    });

    // Identité (sigle, devise) de l'en-tête et du pied de page : appliquée
    // tout de suite depuis le cache, avant même la réponse de la base.
    function applyCachedIdentity() {
        const cached = readSettingsCache();

        if (cached && cached.institution_identity) {
            try {
                applyInstitutionIdentity(cached.institution_identity);
            } catch (error) {
                console.error("Identité en cache non appliquée :", error);
            }
        }
    }

    // Le script est en fin de page : l'en-tête existe déjà, on applique tout de suite.
    applyCachedIdentity();

    // Loupe de recherche : créée tout de suite, avant toute donnée (en-tête figé).
    try { addSearch(); } catch (error) { console.error("Loupe indisponible :", error); }

    window.buepDisplayReady = supabase
        .from("navigation_settings")
        .select("setting_value")
        .eq("setting_key", "display")
        .maybeSingle()
        .then(result => {
            try {
                if (result && result.data) localStorage.setItem("buep-display-cache", JSON.stringify(result.data));
            } catch (error) { /* pas de cache */ }
            return result;
        }, () => ({ data: null }));

    /* -----------------------------------------
    Langue : français par défaut, anglais si la version anglaise
    est activée dans l'administration et choisie par le visiteur.
    Les autres scripts attendent window.buepLang.ready.
    ----------------------------------------- */

    const LANG_KEY = "buep_lang";
    let resolveLangReady;

    window.buepLang = {
        ready: new Promise(resolve => { resolveLangReady = resolve; }),
        current: "fr",
        pick(translations) {
            const list = Array.isArray(translations) ? translations : [];
            const lang = window.buepLang.current;

            return list.find(item => item.language_code === lang)
                || list.find(item => item.language_code === "fr")
                || list[0]
                || null;
        }
    };

    function storedLang() {
        try {
            return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr";
        } catch (error) {
            return "fr";
        }
    }

    function storeLang(lang) {
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch (error) {
            // Stockage indisponible : le site reste en français.
        }
    }

    /* -----------------------------------------
    Outils
    ----------------------------------------- */

    function publicUrl(path) {
        if (!path) return "";

        const { data } = supabase.storage
            .from(PUBLIC_BUCKET)
            .getPublicUrl(path);

        return data?.publicUrl || "";
    }

    function cssValue(value) {
        return String(value).replace(/[;{}<>]/g, "");
    }

    function isRealFont(value) {
        const name = String(value || "").trim().toLowerCase();
        return name !== "" && name !== "default";
    }

    // Luminosité relative d'une couleur hexadécimale (0 = noir, 1 = blanc)
    function luminance(hex) {
        let value = String(hex).replace("#", "");
        if (value.length === 3) value = value.split("").map(c => c + c).join("");

        const [r, g, b] = [0, 2, 4].map(i => parseInt(value.substr(i, 2), 16) / 255);
        const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }

    // Vérifie qu'une couleur est exploitable :
    // "dark" = fond principal (texte blanc lisible),
    // "accent" = couleur d'accent (lisible sur fond blanc, ni trop claire).
    function isUsableColor(value, role) {
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim())) return false;

        const lum = luminance(value);

        if (role === "dark") return lum <= 0.25;
        if (role === "accent") return lum >= 0.12 && lum <= 0.5;

        return false;
    }

    // Version plus claire d'une couleur (mélange avec du blanc à 35 %)
    function lighten(hex) {
        let value = String(hex).replace("#", "");
        if (value.length === 3) value = value.split("").map(c => c + c).join("");

        const mix = i => {
            const c = parseInt(value.substr(i, 2), 16);
            return Math.round(c + (255 - c) * 0.35).toString(16).padStart(2, "0");
        };

        return `#${mix(0)}${mix(2)}${mix(4)}`;
    }

    function isHomePage() {
        // L'accueil est la racine du site, où qu'elle soit publiée (ex. /ensbuep/),
        // ou index.html. Les pages des dossiers pages/ et admin/ ne sont pas l'accueil.
        const path = window.location.pathname;
        if (/\/(pages|admin)\//.test(path)) return false;
        return path.endsWith("/") || path.endsWith("/index.html");
    }

    function createEl(tag, text, className) {
        const el = document.createElement(tag);
        if (text !== undefined && text !== null) el.textContent = text;
        if (className) el.className = className;
        return el;
    }

    // Cache du navigateur : les réglages reçus une fois servent aux pages suivantes,
    // dès l'ouverture, sans afficher de texte d'attente.
    function readSettingsCache() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || "null");
        } catch (error) {
            return null;
        }
    }

    function writeSettingsCache(settings) {
        try {
            const text = JSON.stringify(settings);
            if (text.length < 900000) localStorage.setItem(SETTINGS_CACHE_KEY, text);
        } catch (error) {
            /* Stockage indisponible : le site fonctionne sans cache. */
        }
    }

    // Retire l'état d'attente de la marque, du menu et du pied de page.
    function releaseBrand() {
        document.documentElement.classList.remove("brand-pending");
    }

    window.buepReleaseBrand = releaseBrand;

    async function loadSettings() {
        const { data, error } = await supabase
            .from("site_settings")
            .select("setting_key, setting_value");

        if (error) throw error;

        const settings = Object.fromEntries(
            (data || []).map(row => [row.setting_key, row.setting_value || {}])
        );

        writeSettingsCache(settings);
        return settings;
    }

    /* -----------------------------------------
    1. Identité visuelle : couleurs, polices, logo, favicon
    ----------------------------------------- */

    function applyVisualIdentity(theme, branding) {
        const root = document.documentElement.style;

        // Couleur principale : bleu institutionnel. Couleur d'accent : or.
        // Une couleur n'est appliquée que si elle est valide et lisible.
        // Sinon, la couleur d'origine du site est conservée.
        if (isUsableColor(theme.primary_color, "dark")) {
            root.setProperty("--navy", cssValue(theme.primary_color));
        }

        if (isUsableColor(theme.accent_color, "accent")) {
            root.setProperty("--gold", cssValue(theme.accent_color));
            root.setProperty("--gold-light", cssValue(lighten(theme.accent_color)));
        }

        // Police choisie dans l'administration, pour les titres et le texte.
        if (theme.font_family) {
            root.setProperty("--font-main", cssValue(theme.font_family));
            root.setProperty("--font-title", cssValue(theme.font_family));
        }

        const favicon = publicUrl(branding.favicon_path);

        if (favicon) {
            let link = document.querySelector('link[rel="icon"]');

            if (!link) {
                link = createEl("link");
                link.rel = "icon";
                document.head.appendChild(link);
            }

            link.href = favicon;
        }
    }

/* -----------------------------------------
    2. Identité de l'institution : sigle et devise
    ----------------------------------------- */

    function applyInstitutionIdentity(institution) {
        // En-tête et pied de page : nom et devise écrits en dur, jamais réécrits depuis la base.

        // Devise affichée sur la page « Le BUEP »
        const mottoBox = document.querySelector("[data-motto]");

        if (mottoBox) {
            const motto = String(institution.motto || "").trim();
            mottoBox.textContent = motto;
            mottoBox.hidden = !motto;
        }
    }

    /* -----------------------------------------
    Version anglaise des contenus : chaque champ « _en » non vide
    remplace son équivalent « _fr ». Le reste reste en français.
    ----------------------------------------- */

    function englishView(settings) {
        const view = {};

        Object.entries(settings).forEach(([groupKey, group]) => {
            const copy = { ...group };

            Object.keys(group || {}).forEach(field => {
                if (!field.endsWith("_en")) return;

                const english = group[field];

                if (typeof english === "string" && english.trim()) {
                    copy[field.slice(0, -3) + "_fr"] = english;
                }
            });

            view[groupKey] = copy;
        });

        return view;
    }

    /* -----------------------------------------
    Bouton FR / EN dans l'en-tête
    ----------------------------------------- */

    function addLanguageSwitch(lang) {
        const header = document.querySelector(".header-content");

        if (!header || header.querySelector(".lang-switch")) return;

        const button = createEl(
            "button",
            lang === "en" ? "Français" : "English",
            "lang-switch"
        );

        button.type = "button";
        button.setAttribute(
            "aria-label",
            lang === "en" ? "Passer au français" : "Switch to English"
        );

        button.addEventListener("click", () => {
            storeLang(lang === "en" ? "fr" : "en");
            window.location.reload();
        });

        header.insertBefore(button, header.querySelector(".menu-toggle"));
    }

    /* -----------------------------------------
    2 bis. Page « Le BUEP » : présentation et photos
    Le texte de l'administration remplace entièrement le texte d'origine.
    Sans texte renseigné, le texte d'origine reste affiché.
    ----------------------------------------- */

    function applyBureauPresentation(identity) {
        const content = document.querySelector("[data-presentation]");
        const photosBox = document.querySelector("[data-presentation-photos]");

        if (content) {
            const text = String(identity.presentation_fr || "").trim();

            if (text) {
                const paragraphs = text
                    .split(/\n\s*\n/)
                    .map(par => par.trim())
                    .filter(Boolean);

                content.textContent = "";

                paragraphs.forEach(par => {
                    const p = document.createElement("p");
                    p.className = "presentation-paragraph";
                    p.textContent = par;
                    content.append(p);
                });
            }
        }

        if (photosBox) {
            photosBox.textContent = "";

            ["presentation_photo_1", "presentation_photo_2", "presentation_photo_3"]
                .map(key => publicUrl(identity[key]))
                .filter(Boolean)
                .forEach(url => {
                    const figure = document.createElement("figure");
                    const img = document.createElement("img");

                    img.src = url;
                    img.alt = "";
                    img.loading = "lazy";
                    figure.append(img);
                    photosBox.append(figure);
                });
        }
    }

    /* -----------------------------------------
    3. Page d'accueil : bannière et mot du président
    ----------------------------------------- */

    function applyHomepageHero(hero) {
        const title = document.querySelector(".hero h1");
        const subtitle = document.querySelector(".hero h1 span");
        const button = document.querySelector(".hero-actions .btn-gold");

        if (title && hero.title_fr) {
            const span = createEl("span", hero.subtitle_fr || "");
            title.textContent = "";
            title.append(document.createTextNode(hero.title_fr));
            title.append(document.createElement("br"));
            title.append(span);
        } else if (subtitle && hero.subtitle_fr) {
            subtitle.textContent = hero.subtitle_fr;
        }

        if (button && hero.button_label_fr) {
            button.textContent = hero.button_label_fr;
        }

        if (button && hero.button_url) {
            button.href = hero.button_url;
        }

        const image = publicUrl(hero.image_path);

        if (image) {
            document.documentElement.style.setProperty(
                "--hero-image",
                `url("${image}")`
            );
        }
    }

    function applyHomepageWelcome(welcome) {
        // Message de bienvenue : paragraphe sous le titre de la bannière.
        const message = document.querySelector(".hero-content > p");

        // Si le message est vide, on affiche le titre saisi dans les Paramètres.
        const text = welcome.message_fr || welcome.title_fr;

        if (message && text) {
            message.textContent = text;
        }
    }

    function applyPresidentMessage(president) {
        const heading = document.querySelector(".president-section h2");
        const content = document.querySelector(".president-content");
        const name = document.getElementById("presidentName");
        const role = document.getElementById("presidentRole");
        const photoBox = document.getElementById("presidentPhotoBox");
        const photo = document.getElementById("presidentPhoto");

        if (heading && president.title_fr) {
            heading.textContent = president.title_fr;
        }

        // Nom et fonction, dans la signature.
        if (name && president.name) {
            name.textContent = president.name;
        }

        if (role && president.role_fr) {
            role.textContent = president.role_fr;
        }

        // Mandature : affichée seulement si elle est renseignée.
        const mandate = document.getElementById("presidentMandate");
        const mandateText = String(president.mandate_fr || "").trim();

        if (mandate) {
            mandate.textContent = mandateText;
            mandate.hidden = !mandateText;
        }

        // Photo : affichée seulement si une image est enregistrée.
        const photoUrl = publicUrl(president.photo_path);

        if (photoBox && photo && photoUrl) {
            photo.src = photoUrl;
            photo.alt = president.name ? `Photo de ${president.name}` : "Photo du Président";
            photoBox.hidden = false;
        }

        // Paragraphes du message : on remplace uniquement les <p>,
        // la signature (nom et fonction) reste en place.
        if (content && president.content_fr) {
            const paragraphs = president.content_fr
                .split(/\n\s*\n/)
                .map(text => text.trim())
                .filter(Boolean);

            content.querySelectorAll(":scope > p").forEach(p => p.remove());

            const signature = content.querySelector(".president-signature");

            paragraphs.forEach(text => {
                const p = createEl("p", text);
                if (signature) {
                    content.insertBefore(p, signature);
                } else {
                    content.appendChild(p);
                }
            });
        }
    }

    /* -----------------------------------------
    4. Pied de page : contacts, liens, réseaux, droits
    ----------------------------------------- */

    function buildFooterColumn(title, items) {
        const column = createEl("div", null, "footer-column");
        column.appendChild(createEl("h3", title));

        items.forEach(item => {
            if (item.href) {
                const link = createEl("a", item.label);
                link.href = item.href;
                if (item.external) {
                    link.target = "_blank";
                    link.rel = "noopener";
                }
                column.appendChild(link);
            } else {
                column.appendChild(createEl("span", item.label));
            }
        });

        return column;
    }

    function applyFooter(footerInfo, contacts, social) {
        const grid = document.querySelector(".main-footer .footer-grid");
        if (!grid) return;

        const columns = [...grid.querySelectorAll(".footer-column")];
        const quickLinks = columns.find(col => col.querySelector("h3")?.textContent.trim() === "Navigation");

        if (quickLinks && footerInfo.show_quick_links === false) {
            quickLinks.remove();
        }

        // Pied de page : seulement les icônes des réseaux dont le lien est renseigné.
        if (footerInfo.show_social_networks !== false) {
            const links = [
                { key: "facebook", href: social.facebook },
                { key: "instagram", href: social.instagram },
                { key: "tiktok", href: social.tiktok },
                { key: "youtube", href: social.youtube },
                { key: "whatsapp", href: social.whatsapp_channel },
                { key: "telegram", href: social.telegram },
                { key: "linkedin", href: social.linkedin },
                { key: "x", href: social.x }
            ].filter(item => item.href);

            if (links.length) {
                const row = createEl("div", "", "footer-social");

                links.forEach(item => {
                    const label = { facebook: "Facebook", whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", telegram: "Telegram", linkedin: "LinkedIn", x: "X" }[item.key];
                    const link = createEl("a");
                    link.href = item.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.title = label;
                    link.setAttribute("aria-label", label);
                    link.className = `net-${item.key}`;
                    link.innerHTML = SOCIAL_ICONS[item.key];
                    row.appendChild(link);
                });

                const brand = grid.querySelector(".footer-brand");
                if (brand) brand.appendChild(row);
            }
        }

        const copyright = document.querySelector(".footer-bottom p");

        if (copyright && footerInfo.copyright_name) {
            const year = createEl("span", String(new Date().getFullYear()));
            year.id = "currentYear";

            copyright.textContent = "© ";
            copyright.append(year, document.createTextNode(` ${footerInfo.copyright_name}. Tous droits réservés.`));
        }
    }

    /* -----------------------------------------
    5. Référencement de la page d'accueil
    ----------------------------------------- */

    function applySeo(seo) {
        if (!isHomePage()) return;

        if (seo.meta_title) {
            document.title = seo.meta_title;
        }

        if (seo.meta_description) {
            let meta = document.querySelector('meta[name="description"]');

            if (!meta) {
                meta = createEl("meta");
                meta.name = "description";
                document.head.appendChild(meta);
            }

            meta.content = seo.meta_description;
        }
    }

    /* -----------------------------------------
    6. Mode maintenance
    ----------------------------------------- */

    function applyMaintenance(maintenance) {
        if (maintenance.enabled !== true) return;

        const overlay = createEl("div");
        overlay.style.cssText = [
            "position:fixed", "inset:0", "z-index:9999",
            "display:flex", "align-items:center", "justify-content:center",
            "padding:24px", "background:#102744", "color:#ffffff",
            "text-align:center", "font-family:var(--font-main, sans-serif)"
        ].join(";");

        const box = createEl("div");
        box.style.maxWidth = "560px";

        box.appendChild(createEl("h1", "Site en maintenance"));
        box.appendChild(createEl(
            "p",
            maintenance.message_fr || "Le site est temporairement indisponible. Merci de revenir plus tard."
        ));

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";
    }

    /* -----------------------------------------
    Démarrage
    ----------------------------------------- */

    /* -----------------------------------------
    Recherche : publications, activités, documents et pages.
    Les données sont chargées à la première ouverture.
    ----------------------------------------- */

    let searchIndex = null;

    function normalizeText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function firstItem(value) {
        return Array.isArray(value) ? value[0] || null : value || null;
    }

    function pagesBase() {
        const inPages = window.location.pathname.includes("/pages/");
        return new URL(inPages ? "./" : "pages/", window.location.href);
    }

    async function buildSearchIndex() {
        const entries = [];

        // Pages du site, reprises du menu principal
        document.querySelectorAll("#mainNav a").forEach(link => {
            const title = link.textContent.trim();
            if (title) entries.push({ type: "Page", title, summary: "", href: link.href });
        });

        const [contents, documents] = await Promise.all([
            supabase
                .from("contents")
                .select(`
                    id,
                    content_translations ( language_code, title, summary ),
                    publications ( id ),
                    activities ( id )
                `)
                .eq("status", "published")
                .order("published_at", { ascending: false })
                .limit(400),
            supabase
                .from("documents")
                .select("id, title_fr, description_fr")
                .eq("status", "published")
                .in("access_type", ["public", "conditional"])
                .limit(400)
        ]);

        (contents.data || []).forEach(item => {
            const translation = window.buepLang.pick(item.content_translations);
            if (!translation) return;

            const isPublication = firstItem(item.publications);
            const isActivity = firstItem(item.activities);
            const base = pagesBase();

            if (isPublication) {
                entries.push({
                    type: "Publication",
                    title: translation.title || "",
                    summary: translation.summary || "",
                    href: new URL(`publication.html?id=${encodeURIComponent(item.id)}`, base).href
                });
            } else if (isActivity) {
                entries.push({
                    type: "Activité",
                    title: translation.title || "",
                    summary: translation.summary || "",
                    href: new URL(`activite.html?id=${encodeURIComponent(item.id)}`, base).href
                });
            }
        });

        (documents.data || []).forEach(doc => {
            entries.push({
                type: "Document",
                title: doc.title_fr || "",
                summary: doc.description_fr || "",
                href: new URL("documents.html", pagesBase()).href
            });
        });

        return entries;
    }

    function searchResultsFor(query) {
        const terms = normalizeText(query).split(/\s+/).filter(Boolean);
        if (!searchIndex || !terms.length) return [];

        return searchIndex
            .filter(entry => {
                const haystack = normalizeText(`${entry.title} ${entry.summary}`);
                return terms.every(term => haystack.includes(term));
            })
            .slice(0, 25);
    }

    function addSearch() {
        const header = document.querySelector(".header-content");
        if (!header || document.querySelector(".search-overlay")) return;

        // Loupe présente dans le HTML de la page : on la garde telle quelle, sans rien insérer.
        const staticToggle = header.querySelector(".search-toggle");
        const toggle = staticToggle || createEl("button", "", "search-toggle");
        toggle.type = "button";
        toggle.setAttribute("aria-label", "Rechercher sur le site");
        toggle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

        const overlay = createEl("div", "", "search-overlay");
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="search-card" role="dialog" aria-modal="true" aria-label="Recherche">
                <div class="search-bar">
                    <input type="search" class="search-input" placeholder="Rechercher une publication, une activité, un document…" autocomplete="off">
                    <button type="button" class="search-close" aria-label="Fermer">×</button>
                </div>
                <p class="search-status"></p>
                <ul class="search-results"></ul>
            </div>`;

        const input = overlay.querySelector(".search-input");
        const status = overlay.querySelector(".search-status");
        const list = overlay.querySelector(".search-results");

        function close() {
            overlay.hidden = true;
            document.body.classList.remove("search-open");
        }

        function renderResults() {
            const query = input.value;
            list.textContent = "";

            if (normalizeText(query).length < 2) {
                status.textContent = "Saisissez au moins deux lettres.";
                return;
            }

            const results = searchResultsFor(query);
            status.textContent = results.length
                ? `${results.length} résultat(s)`
                : "Aucun résultat pour cette recherche.";

            results.forEach(entry => {
                const item = document.createElement("li");
                const link = document.createElement("a");
                const kind = createEl("span", entry.type, "search-kind");
                const title = createEl("strong", entry.title || "Sans titre");

                link.href = entry.href;
                link.append(kind, title);

                if (entry.summary) {
                    link.append(createEl("small", entry.summary.slice(0, 140)));
                }

                item.append(link);
                list.append(item);
            });
        }

        async function open() {
            overlay.hidden = false;
            document.body.classList.add("search-open");
            input.focus();

            if (!searchIndex) {
                status.textContent = "Chargement…";

                try {
                    searchIndex = await buildSearchIndex();
                } catch (error) {
                    console.error("Recherche indisponible :", error);
                    status.textContent = "La recherche est momentanément indisponible.";
                    return;
                }
            }

            renderResults();
        }

        toggle.addEventListener("click", open);
        overlay.querySelector(".search-close").addEventListener("click", close);
        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });
        input.addEventListener("input", renderResults);
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !overlay.hidden) close();
        });

        if (!staticToggle) header.insertBefore(toggle, header.querySelector(".menu-toggle"));
        document.body.append(overlay);
    }

    // Blocs de contenu sans donnée en base : on les masque au lieu
    // d'afficher un texte de secours écrit en dur.
    function hideEmptyDataBlocks() {
        document.querySelectorAll("[data-db]").forEach(el => {
            if (!el.textContent.trim() && !el.querySelector("img")) {
                el.hidden = true;
            }
        });

        // Une section sans message ni présentation ne garde pas son titre seul
        const president = document.querySelector(".president-content");
        if (president?.hidden) {
            document.querySelector(".president-section")?.setAttribute("hidden", "");
        }

        const presentation = document.querySelector("[data-presentation]");
        if (presentation?.hidden) {
            presentation.closest("section")?.setAttribute("hidden", "");
        }
    }

    async function applySiteSettings() {
        const settings = await window.buepSettingsReady;

        if (!settings) {
            resolveLangReady();
            hideEmptyDataBlocks();
            releaseBrand();
            return;
        }

        const englishOn = (settings.language_settings || {}).english_enabled === true;
        const lang = englishOn && storedLang() === "en" ? "en" : "fr";

        window.buepLang.current = lang;
        document.documentElement.lang = lang;
        resolveLangReady();

        const display = { show_search: true, show_language_switch: true };

        try {
            const { data } = await window.buepDisplayReady;

            const value = data?.setting_value || {};
            display.show_search = value.show_search !== false;
            display.show_language_switch = value.show_language_switch !== false;
        } catch (error) {
            // Réglage illisible : les valeurs par défaut restent affichées.
        }

        // En-tête figé : ni bascule de langue ni loupe ajoutées après coup.
        addSearch();

        if (lang === "en") {
            settings = englishView(settings);
        }

        // Chaque réglage est appliqué séparément : une erreur sur un
        // réglage n'empêche pas les autres (ex. le message de bienvenue).
        function step(name, action) {
            try {
                action();
            } catch (error) {
                console.error(`Paramètre « ${name} » non appliqué :`, error);
            }
        }

        step("identité visuelle", () => {
            if (settings.site_theme || settings.site_branding) {
                applyVisualIdentity(settings.site_theme || {}, settings.site_branding || {});
            }
        });

        // Logo : traité à part, pour que la pastille sorte de son état
        // d'attente même si aucun réglage d'identité visuelle n'existe.
        step("logo", () => {
            const branding = settings.site_branding || {};
            const logo = publicUrl(branding.logo_path);

            if (logo) {
                const cached = readLogoCache();
                const sameLogo = cached && cached.url === logo && cached.data;
                if (!sameLogo) setBrandLogo(logo, branding.logo_alt);
                ensureLogoData(logo, branding.logo_alt || "");
            } else {
                setBrandLogo("");
                writeLogoCache(null);
            }
        });

        step("identité institution", () => {
            if (settings.institution_identity) applyInstitutionIdentity(settings.institution_identity);
        });

        step("présentation du BUEP", () => {
            if (settings.institution_identity) applyBureauPresentation(settings.institution_identity);
        });

        if (isHomePage()) {
            step("bannière", () => {
                if (settings.homepage_hero) applyHomepageHero(settings.homepage_hero);
            });
            step("message de bienvenue", () => {
                if (settings.homepage_welcome) applyHomepageWelcome(settings.homepage_welcome);
            });
            step("mot du président", () => {
                if (settings.president_message) applyPresidentMessage(settings.president_message);
            });
        }

        step("pied de page", () => {
            applyFooter(
                settings.footer_information || {},
                settings.official_contacts || {},
                settings.social_networks || {}
            );
        });

        step("référencement", () => {
            if (settings.seo_defaults) applySeo(settings.seo_defaults);
        });

        step("maintenance", () => {
            if (settings.maintenance_mode) applyMaintenance(settings.maintenance_mode);
        });

        hideEmptyDataBlocks();
        releaseBrand();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySiteSettings);
    } else {
        applySiteSettings();
    }

    // La loupe de recherche est présente dès l'ouverture (réglage mémorisé),
    // sans attendre la base. Elle n'est jamais retirée ensuite.
    try {
        const cachedDisplay = JSON.parse(localStorage.getItem("buep-display-cache") || "null");
        const showSearch = !(cachedDisplay && cachedDisplay.show_search === false);
        addSearch();
    } catch (error) {
        addSearch();
    }
})();

/* -----------------------------------------
    Devise sous le nom : même longueur que « BUEP-ENS/PN »
    La taille de la devise est calculée pour que sa largeur
    corresponde exactement à celle du nom (en-tête et pied de page).
    ----------------------------------------- */

(() => {
    // Devise lisible : taille fixe, le nom est ajusté à sa longueur.
    function taglineSize() {
        return window.innerWidth <= 780 ? 10 : 11;
    }

    function fitTagline(block) {
        const strong = block.querySelector("strong");
        const small = block.querySelector("small");

        // Bloc masqué (devise cachée sur certaines largeurs) : rien à mesurer.
        if (!strong || !small || !small.textContent.trim() || !small.offsetParent) return;

        small.style.fontSize = `${taglineSize()}px`;
        const taglineWidth = small.getBoundingClientRect().width;

        // Trois passes de correction : l'espacement entre lettres empêche une proportion exacte du premier coup.
        let size = 16;

        for (let pass = 0; pass < 3; pass++) {
            strong.style.fontSize = `${size}px`;
            const nameWidth = strong.getBoundingClientRect().width;
            if (!nameWidth || !taglineWidth) return;
            size = Math.min(28, Math.max(12, size * (taglineWidth / nameWidth)));
        }

        strong.style.fontSize = `${Math.round(size * 100) / 100}px`;
    }

    function fitAll() {
        document.querySelectorAll(".brand-text").forEach(fitTagline);
    }

    let frame = 0;
    function scheduleFit() {
        /* Tailles figées dans la feuille de style : aucun ajustement après le chargement. */
    }

    window.buepFitTaglines = scheduleFit;

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleFit);
    }

    window.addEventListener("load", scheduleFit);
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("pageshow", scheduleFit);


})();
