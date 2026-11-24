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

    if (!supabase) return;

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
        const path = window.location.pathname;
        return path === "/" || path.endsWith("/index.html") || path.endsWith("index.html");
    }

    function createEl(tag, text, className) {
        const el = document.createElement(tag);
        if (text !== undefined && text !== null) el.textContent = text;
        if (className) el.className = className;
        return el;
    }

    async function loadSettings() {
        const { data, error } = await supabase
            .from("site_settings")
            .select("setting_key, setting_value");

        if (error) throw error;

        return Object.fromEntries(
            (data || []).map(row => [row.setting_key, row.setting_value || {}])
        );
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

        const logo = publicUrl(branding.logo_path);

        if (logo) {
            document.querySelectorAll(".brand-logo").forEach(box => {
                box.textContent = "";
                box.classList.add("has-logo");

                const img = createEl("img");
                img.src = logo;
                img.alt = branding.logo_alt || "";
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "contain";

                box.appendChild(img);
            });
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
        const brandName = document.querySelector(".brand-text strong");
        const brandMotto = document.querySelector(".brand-text small");

        if (brandName && institution.acronym) {
            brandName.textContent = institution.acronym;
        }

        if (brandMotto && institution.motto) {
            brandMotto.textContent = institution.motto;
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

        if (footerInfo.show_contacts !== false) {
            const items = [];

            if (contacts.email) items.push({ label: contacts.email, href: `mailto:${contacts.email}` });
            if (contacts.phone) items.push({ label: contacts.phone, href: `tel:${contacts.phone.replace(/\s/g, "")}` });
            if (contacts.whatsapp) items.push({ label: "WhatsApp", href: `https://wa.me/${String(contacts.whatsapp).replace(/\D/g, "")}`, external: true });
            if (contacts.address) items.push({ label: contacts.address });
            if (contacts.office_hours) items.push({ label: contacts.office_hours });

            if (items.length) {
                grid.appendChild(buildFooterColumn("Contact", items));
            }
        }

        if (footerInfo.show_social_networks !== false) {
            const items = [];

            if (social.facebook) items.push({ label: "Facebook", href: social.facebook, external: true });
            if (social.instagram) items.push({ label: "Instagram", href: social.instagram, external: true });
            if (social.youtube) items.push({ label: "YouTube", href: social.youtube, external: true });
            if (social.telegram) items.push({ label: "Telegram", href: social.telegram, external: true });
            if (social.linkedin) items.push({ label: "LinkedIn", href: social.linkedin, external: true });
            if (social.x) items.push({ label: "X", href: social.x, external: true });
            if (social.tiktok) items.push({ label: "TikTok", href: social.tiktok, external: true });

            (social.other || []).forEach(entry => {
                if (typeof entry === "string") {
                    items.push({ label: entry, href: entry, external: true });
                } else if (entry?.url) {
                    items.push({ label: entry.label || entry.url, href: entry.url, external: true });
                }
            });

            if (items.length) {
                grid.appendChild(buildFooterColumn("Réseaux", items));
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
        if (!header || header.querySelector(".search-toggle")) return;

        const toggle = createEl("button", "", "search-toggle");
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

        header.insertBefore(toggle, header.querySelector(".lang-switch") || header.querySelector(".menu-toggle"));
        document.body.append(overlay);
    }

    async function applySiteSettings() {
        let settings;

        try {
            settings = await loadSettings();
        } catch (error) {
            console.error("Paramètres du site indisponibles :", error.message);
            resolveLangReady();
            return;
        }

        const englishOn = (settings.language_settings || {}).english_enabled === true;
        const lang = englishOn && storedLang() === "en" ? "en" : "fr";

        window.buepLang.current = lang;
        document.documentElement.lang = lang;
        resolveLangReady();

        const display = { show_search: true, show_language_switch: true };

        try {
            const { data } = await supabase
                .from("navigation_settings")
                .select("setting_value")
                .eq("setting_key", "display")
                .maybeSingle();

            const value = data?.setting_value || {};
            display.show_search = value.show_search !== false;
            display.show_language_switch = value.show_language_switch !== false;
        } catch (error) {
            // Réglage illisible : les valeurs par défaut restent affichées.
        }

        if (englishOn && display.show_language_switch) addLanguageSwitch(lang);
        if (display.show_search) addSearch();

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
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySiteSettings);
    } else {
        applySiteSettings();
    }
})();
