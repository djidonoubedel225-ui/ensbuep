/* =========================================
   BUEP-ENS/PN — LIAISONS DYNAMIQUES
   Relie au site : le menu de navigation,
   les blocs de la page d'accueil et les
   coordonnées de contact.
   En cas d'erreur ou d'absence de données,
   le contenu d'origine du site reste affiché.
   ========================================= */

(() => {
    "use strict";

    const supabase = window.buepSupabase;
    if (!supabase) return;

    const isSubpage = /\/pages\//.test(window.location.pathname);

    /* -----------------------------------------
    Outils
    ----------------------------------------- */

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    // Adresse d'un lien, corrigée selon la page où l'on se trouve
    function resolveHref(url) {
        const value = String(url || "").trim();
        if (!value) return "#";
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(value)) return value;
        return isSubpage ? "../" + value.replace(/^\.\//, "") : value;
    }

    function isCurrentPage(href) {
        const file = href.split("#")[0].split("?")[0].split("/").pop();
        if (!file) return false;
        if (file === "index.html") {
            return !isSubpage;
        }
        return window.location.pathname.endsWith("/" + file);
    }

    // Réutilise la lecture unique faite par site-settings.js
    async function loadSettings(keys) {
        const all = await window.buepSettingsReady;

        if (!all) throw new Error("Paramètres indisponibles");

        return Object.fromEntries(
            keys.filter(key => key in all).map(key => [key, all[key]])
        );
    }

    /* -----------------------------------------
    1. Menu de navigation (module Navigation)
    ----------------------------------------- */

    const NAV_CACHE_KEY = "buep-nav-cache";

    function readNavCache() {
        try {
            return JSON.parse(localStorage.getItem(NAV_CACHE_KEY) || "null");
        } catch (error) {
            return null;
        }
    }

    function writeNavCache(items) {
        try {
            localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(items));
        } catch (error) {
            /* Stockage indisponible : pas de cache. */
        }
    }

    async function buildNavigation() {
        const nav = document.getElementById("mainNav");
        if (!nav) return;

        // Menu déjà connu : affiché tout de suite, sans attendre la base.
        const cached = readNavCache();
        if (cached && cached.length) {
            renderNavigation(nav, cached);
            if (window.buepReleaseBrand) window.buepReleaseBrand();
        }

        const { data: items, error } = await supabase
            .from("navigation_items")
            .select("id, parent_id, label_fr, item_type, url, open_in_new_tab, display_order, is_active, is_visible")
            .eq("is_active", true)
            .eq("is_visible", true)
            .order("display_order");

        if (error) {
            if (cached) return;
            throw error;
        }

        // Sans données, on garde le menu d'origine.
        if (!items || !items.length) return;

        const changed = !cached || JSON.stringify(cached) !== JSON.stringify(items);
        writeNavCache(items);
        if (changed) renderNavigation(nav, items);
        if (window.buepReleaseBrand) window.buepReleaseBrand();
    }

    function renderNavigation(nav, items) {
        const linkHtml = (item, extraClass = "") => {
            const href = resolveHref(item.url);
            const target = item.open_in_new_tab ? ' target="_blank" rel="noopener"' : "";
            const active = isCurrentPage(href) ? " active" : "";
            return `<a href="${esc(href)}" class="${extraClass}${active}"${target}>${esc(item.label_fr)}</a>`;
        };

        const topLevel = items.filter(item => !item.parent_id);
        const children = items.filter(item => item.parent_id);

        const html = topLevel.map(item => {
            if (item.item_type === "section") {
                const subLinks = children
                    .filter(child => child.parent_id === item.id && child.item_type === "link");

                if (!subLinks.length) return "";

                const anyActive = subLinks.some(child => isCurrentPage(resolveHref(child.url)));

                return `
                    <div class="nav-dropdown${anyActive ? " has-active" : ""}">
                        <button type="button" class="nav-dropdown-toggle" aria-haspopup="true">
                            ${esc(item.label_fr)} <span aria-hidden="true">▾</span>
                        </button>
                        <div class="nav-dropdown-menu">
                            ${subLinks.map(child => linkHtml(child)).join("")}
                        </div>
                    </div>
                `;
            }

            return item.item_type === "link" ? linkHtml(item) : "";
        }).join("");

        if (html.trim()) {
            nav.innerHTML = html;
            nav.classList.add("nav-ready");
        }
    }

    /* -----------------------------------------
    2. Blocs de la page d'accueil (module Pages d'accueil)
    ----------------------------------------- */

    const BLOCK_STYLES = {
        activities: { label: "Activités", icon: "◆", href: "pages/activites.html" },
        clubs: { label: "Vie associative", icon: "✦", href: "pages/vie-associative.html" },
        gallery: { label: "Galerie", icon: "❖", href: "pages/galerie.html" },
        publications: { label: "Publications", icon: "✎", href: "pages/documents.html" }
    };

    function isInDisplayWindow(block, now) {
        if (block.display_start && new Date(block.display_start) > now) return false;
        if (block.display_end && new Date(block.display_end) < now) return false;
        return true;
    }

    async function buildHomeBlocks() {
        const container = document.getElementById("homeBlocks");
        if (!container) return;

        const { data, error } = await supabase
            .from("homepage_blocks")
            .select("id, block_type, title_fr, content_fr, display_order, is_featured, display_start, display_end, status")
            .eq("status", "published")
            .in("block_type", Object.keys(BLOCK_STYLES))
            .order("display_order");

        if (error) throw error;

        const now = new Date();
        const blocks = (data || []).filter(block => isInDisplayWindow(block, now));

        if (!blocks.length) {
            container.hidden = true;
            return;
        }

        const cards = blocks.map(block => {
            const style = BLOCK_STYLES[block.block_type];
            const content = block.content_fr || {};
            const href = content.button_url ? resolveHref(content.button_url) : resolveHref(style.href);
            const buttonLabel = content.button_label || "Découvrir";

            return `
                <article class="home-block-card${block.is_featured ? " is-featured" : ""}">
                    <span class="home-block-tag">${esc(style.label)}</span>
                    <span class="home-block-icon" aria-hidden="true">${style.icon}</span>
                    <h3>${esc(block.title_fr || style.label)}</h3>
                    ${content.text ? `<p>${esc(content.text)}</p>` : ""}
                    <a class="home-block-link" href="${esc(href)}">
                        ${esc(buttonLabel)} <span aria-hidden="true">→</span>
                    </a>
                </article>
            `;
        }).join("");

        container.innerHTML = `
            <div class="container">
                <div class="section-top">
                    <div class="section-heading">
                        <span class="eyebrow">À LA UNE</span>
                        <h2>Au cœur du BUEP</h2>
                        <p>Les temps forts et les rendez-vous de la communauté normalienne.</p>
                    </div>
                </div>
                <div class="home-blocks-grid">${cards}</div>
            </div>
        `;

        container.hidden = false;
    }

    /* -----------------------------------------
    3. Coordonnées et réseaux (page Contact)
    ----------------------------------------- */

    const CONTACT_LABELS = {
        email: "E-mail",
        phone: "Téléphone",
        whatsapp: "WhatsApp",
        address: "Adresse",
        office_hours: "Horaires"
    };

    const SOCIAL_LABELS = {
        facebook: "Facebook",
        instagram: "Instagram",
        youtube: "YouTube",
        telegram: "Telegram",
        linkedin: "LinkedIn",
        x: "X",
        tiktok: "TikTok"
    };

    function contactHref(key, value) {
        if (key === "email") return `mailto:${value}`;
        if (key === "phone") return `tel:${String(value).replace(/\s/g, "")}`;
        if (key === "whatsapp") return `https://wa.me/${String(value).replace(/\D/g, "")}`;
        return "";
    }

    async function buildContacts() {
        const contactBox = document.querySelector("[data-contact-list]");
        const socialBox = document.querySelector("[data-social-list]");

        if (!contactBox && !socialBox) return;

        const settings = await loadSettings(["official_contacts", "social_networks"]);
        const contacts = settings.official_contacts || {};
        const social = settings.social_networks || {};

        if (contactBox) {
            const items = Object.keys(CONTACT_LABELS)
                .filter(key => contacts[key])
                .map(key => {
                    const href = contactHref(key, contacts[key]);
                    const inner = `
                        <span class="contact-chip-body">
                            <span class="label">${esc(CONTACT_LABELS[key])}</span>
                            <span>${esc(contacts[key])}</span>
                        </span>
                    `;
                    return href
                        ? `<a class="contact-chip" href="${esc(href)}"${key === "whatsapp" ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`
                        : `<div class="contact-chip">${inner}</div>`;
                });

            contactBox.innerHTML = items.join("");
            contactBox.hidden = !items.length;
            const contactTitle = document.querySelector("[data-contact-title]");
            if (contactTitle) contactTitle.hidden = !items.length;
        }

        if (socialBox) {
            const items = [];
            const socialLinks = [
                ...Object.keys(SOCIAL_LABELS).filter(key => social[key]).map(key => ({ key, href: social[key], label: SOCIAL_LABELS[key] })),
            ];

            if (social.whatsapp_channel) {
                socialLinks.push({ key: "whatsapp", href: social.whatsapp_channel, label: "WhatsApp" });
            }

            socialLinks.forEach(item => {
                items.push(`
                    <a class="social-chip" href="${esc(item.href)}" target="_blank" rel="noopener">
                        <span class="social-chip-icon net-${item.key}">${window.buepSocialIcon ? window.buepSocialIcon(item.key) : ""}</span>
                        <span>${esc(item.label)}</span>
                    </a>
                `);
            });

            (social.other || []).forEach(entry => {
                const url = typeof entry === "string" ? entry : entry?.url;
                const label = typeof entry === "string" ? entry : (entry?.label || entry?.url);
                if (url) {
                    items.push(`<a class="social-chip" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(label)}</span></a>`);
                }
            });

            socialBox.innerHTML = items.join("");
            socialBox.hidden = !items.length;
            const socialTitle = document.querySelector("[data-social-title]");
            if (socialTitle) socialTitle.hidden = !items.length;
        }
    }

    /* -----------------------------------------
    4. Accès rapide au tableau de bord (raccourcis clavier)
    ----------------------------------------- */

    const ADMIN_TARGET = "admin/gestion.html";

    function goToAdmin() {
        window.location.href = resolveHref(ADMIN_TARGET);
    }

    function isTyping(target) {
        return target instanceof HTMLElement &&
            (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    }

    function addAdminShortcuts() {
        // 1. Alt + Maj + B (fonctionne quel que soit le clavier)
        // 2. Taper le mot « buep » sur la page, sans champ de saisie actif
        let typed = "";
        let lastKey = 0;

        window.addEventListener("keydown", event => {
            // Raccourcis acceptés (quel que soit le clavier) :
            //   Alt + Maj + B      ou   Alt + Verr Maj + B      ou   Ctrl + Alt + B
            const capsOn = event.getModifierState && event.getModifierState("CapsLock");
            const altShift = event.altKey && (event.shiftKey || capsOn) && !event.ctrlKey && !event.metaKey;
            const ctrlAlt = event.ctrlKey && event.altKey && !event.metaKey;

            if ((altShift || ctrlAlt) && event.code === "KeyB") {
                event.preventDefault();
                goToAdmin();
                return;
            }

            if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.length !== 1) return;

            const now = Date.now();
            if (now - lastKey > 1500) typed = "";
            lastKey = now;

            typed = (typed + event.key.toLowerCase()).slice(-4);

            if (typed === "buep") {
                typed = "";
                goToAdmin();
            }
        });
    }

    /* -----------------------------------------
    Démarrage : chaque liaison est indépendante
    ----------------------------------------- */

    function run(name, task) {
        // Une erreur (synchrone ou non) ne doit jamais bloquer les autres liaisons.
        try {
            Promise.resolve(task()).catch(error => {
                console.error(`Liaison « ${name} » indisponible :`, error?.message || error);
            });
        } catch (error) {
            console.error(`Liaison « ${name} » indisponible :`, error?.message || error);
        }
    }

    function start() {
        // Raccourci d'accès à l'administration branché en premier, sur toutes les pages.
        try {
            addAdminShortcuts();
        } catch (error) {
            console.error("Raccourci administration indisponible :", error);
        }

        // Menu fixe : il reste tel qu'écrit dans le HTML de chaque page (aucun rechargement depuis la base).
        run("blocs d'accueil", buildHomeBlocks);
        run("coordonnées", buildContacts);
    }

    // Scripts en fin de page : le menu est là, on le remplit tout de suite depuis le cache.
    if (document.getElementById("mainNav") || document.readyState !== "loading") {
        start();
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
