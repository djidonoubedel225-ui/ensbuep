
/* =========================================
   BUEP-ENS/PN — APPLICATION PRINCIPALE
   ========================================= */

/* =========================================
   AFFICHAGE PAR TRANCHES DE 9 (« Voir plus »)
   ========================================= */

const PAGE_SIZE = 9;

// Barre de navigation d'une liste : « Voir moins » et « Revenir au début » à gauche,
// « Voir plus » à droite, et la mention « Fin » quand tout est affiché.
function loadMoreFor(container) {
    let wrap = container.nextElementSibling;

    if (!wrap || !wrap.classList.contains("load-more")) {
        wrap = document.createElement("div");
        wrap.className = "load-more";
        wrap.hidden = true;
        wrap.innerHTML = `
            <div class="load-more-bar">
                <div class="load-more-left">
                    <button type="button" class="load-more-btn load-less-btn" hidden>Voir moins</button>
                    <button type="button" class="load-more-btn load-top-btn" hidden>Revenir au début</button>
                </div>
                <button type="button" class="load-more-btn load-next-btn">Voir plus</button>
            </div>
            <p class="load-end" hidden>Fin</p>
        `;
        container.insertAdjacentElement("afterend", wrap);
    }

    return wrap;
}

function setLoadMoreControls(wrap, shown, total, actions) {
    const less = wrap.querySelector(".load-less-btn");
    const top = wrap.querySelector(".load-top-btn");
    const next = wrap.querySelector(".load-next-btn");
    const end = wrap.querySelector(".load-end");
    const canBack = shown > PAGE_SIZE;

    wrap.hidden = total === 0;
    less.hidden = !canBack;
    top.hidden = !canBack;
    next.hidden = shown >= total;
    end.hidden = total === 0 || shown < total;

    less.onclick = actions.less;
    top.onclick = actions.top;
    next.onclick = actions.next;
}

// Rendu à partir de chaînes HTML (publications, activités) : 9 au départ, puis 9 de plus à chaque clic.
function showPagedHtml(container, htmlItems, emptyHtml = "") {
    const items = htmlItems.filter(Boolean);
    const wrap = loadMoreFor(container);

    container._paged = { items, wrap };

    if (!items.length) {
        container.innerHTML = emptyHtml;
        setLoadMoreControls(wrap, 0, 0, {});
        return;
    }

    showHtmlCount(container, PAGE_SIZE);
}

function showHtmlCount(container, count) {
    const state = container._paged;
    const shown = Math.min(count, state.items.length);

    container.innerHTML = state.items.slice(0, shown).join("");

    setLoadMoreControls(state.wrap, shown, state.items.length, {
        less: () => showHtmlCount(container, Math.max(PAGE_SIZE, shown - PAGE_SIZE)),
        top: () => showHtmlCount(container, PAGE_SIZE),
        next: () => showHtmlCount(container, shown + PAGE_SIZE)
    });
}

// Affichage d'éléments déjà présents dans le DOM (documents, galerie, clubs) :
// seuls les éléments correspondants sont comptés, et `state.limit` en montre au plus.
function pageElements(container, elements, isMatch, state) {
    let count = 0;

    elements.forEach(element => {
        const match = isMatch(element);
        const inPage = match && count < state.limit;
        if (match) count++;
        element.hidden = !inPage;
    });

    const shown = Math.min(state.limit, count);
    const wrap = loadMoreFor(container);

    setLoadMoreControls(wrap, shown, count, {
        less: () => {
            state.limit = Math.max(PAGE_SIZE, state.limit - PAGE_SIZE);
            pageElements(container, elements, isMatch, state);
        },
        top: () => {
            state.limit = PAGE_SIZE;
            pageElements(container, elements, isMatch, state);
        },
        next: () => {
            state.limit += PAGE_SIZE;
            pageElements(container, elements, isMatch, state);
        }
    });

    return count;
}

document.addEventListener("DOMContentLoaded", () => {

    const supabase = window.buepSupabase;

    // =========================================
    // 1. MENU MOBILE
    // =========================================

    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    if (menuToggle && mainNav) {

        menuToggle.addEventListener("click", () => {
            const isOpen = mainNav.classList.toggle("open");

            menuToggle.setAttribute("aria-expanded", String(isOpen));
            menuToggle.setAttribute(
                "aria-label",
                isOpen ? "Fermer le menu" : "Ouvrir le menu"
            );
        });

        mainNav.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mainNav.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
                menuToggle.setAttribute("aria-label", "Ouvrir le menu");
            });
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                mainNav.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
                menuToggle.setAttribute("aria-label", "Ouvrir le menu");
            }
        });
    }

    // =========================================
    // 2. ANNÉE AUTOMATIQUE
    // =========================================

    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    // =========================================
    // 3. LIEN ACTIF DE NAVIGATION
    // =========================================

    const currentPage = window.location.pathname;

    if (mainNav) {
        mainNav.querySelectorAll("a").forEach(link => {
            const linkUrl = new URL(link.href, window.location.origin);

            if (linkUrl.pathname === currentPage) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    // =========================================
    // 4. CONNEXION SUPABASE
    // =========================================

    if (supabase) {

        supabase
            .from("site_languages")
            .select("language_code, language_name, is_default, is_active")
            .limit(5)
            .then(({ data, error }) => {

                if (error) {
                    console.error("Erreur Supabase :", error.message);
                    return;
                }

                console.info("Connexion Supabase réussie.");
                console.table(data);
            });

    } else {
        console.error("Client Supabase indisponible.");
    }

    // =========================================
    // 5. OUTIL DE PROTECTION HTML
    // =========================================

    const escapeHTML = (value) => {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    };

    // =========================================
    // Dates et heures des activités, en français
    function hasTimePart(value) {
        return typeof value === "string" && value.length > 10;
    }

    function formatFrHour(date) {
        const h = String(date.getHours()).padStart(2, "0");
        const m = String(date.getMinutes()).padStart(2, "0");
        return `${h} h ${m}`;
    }

    function formatFrDate(date) {
        return date.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    // Ex. : « 20 novembre 2026 · 10 h 00 – 12 h 00 »
    // ou « 20 novembre 2026, 10 h 00 → 21 novembre 2026, 12 h 00 »
    function formatEventRange(start, end) {
        if (!start) return "";

        const s = new Date(start);
        if (isNaN(s)) return "";

        const e = end ? new Date(end) : null;
        const hasEnd = e && !isNaN(e);

        const startDay = formatFrDate(s);
        const startTime = hasTimePart(start) ? formatFrHour(s) : "";

        if (!hasEnd) {
            return startTime ? `${startDay} · ${startTime}` : startDay;
        }

        const sameDay = s.toDateString() === e.toDateString();
        const endTime = hasTimePart(end) ? formatFrHour(e) : "";

        if (sameDay) {
            const range = [startTime, endTime].filter(Boolean).join(" – ");
            return range ? `${startDay} · ${range}` : startDay;
        }

        const left = startTime ? `${startDay}, ${startTime}` : startDay;
        const right = endTime ? `${formatFrDate(e)}, ${endTime}` : formatFrDate(e);
        return `${left} → ${right}`;
    }

    // 6. ORGANIGRAMME DYNAMIQUE
    // =========================================

    const organigramContainer =
        document.getElementById("organigramContainer");

    const hierarchyButton =
        document.getElementById("hierarchyView");

    const listButton =
        document.getElementById("listView");

    if (organigramContainer && supabase) {

        let currentView = "hierarchy";
        let positions = [];
        let members = [];
        let assignments = [];

        function getMemberPhoto(member) {

            if (!member.photo_path) return "";

            const { data, error } = supabase.storage
                .from("buep-public-assets")
                .getPublicUrl(member.photo_path);

            if (error || !data?.publicUrl) return "";

            return data.publicUrl;
        }

        async function loadOrganigram() {

            organigramContainer.innerHTML =
                "<p>Chargement de l'organigramme...</p>";

            try {

                const [
                    positionsResult,
                    membersResult,
                    assignmentsResult
                ] = await Promise.all([

                    supabase
                        .from("organigram_positions")
                        .select("id, parent_position_id, title_fr, description_fr, display_order")
                        .eq("is_active", true)
                        .order("display_order"),

                    supabase
                        .from("organigram_members")
                        .select("id, full_name, photo_path, biography_fr, academic_year, mandate_label, display_order")
                        .eq("is_visible", true)
                        .order("display_order"),

                    supabase
                        .from("organigram_assignments")
                        .select("id, member_id, position_id, assignment_label, display_order")
                        .eq("is_current", true)
                        .eq("is_visible", true)
                        .order("display_order")
                ]);

                if (positionsResult.error) throw positionsResult.error;
                if (membersResult.error) throw membersResult.error;
                if (assignmentsResult.error) throw assignmentsResult.error;

                positions = positionsResult.data || [];
                members = membersResult.data || [];
                assignments = assignmentsResult.data || [];

                const mandate = members.find(item => item.mandate_label)?.mandate_label || "";
                const mandateBox = document.querySelector(".mandate-label");

                if (mandateBox) {
                    mandateBox.textContent = mandate;
                    mandateBox.hidden = !mandate;
                }

                renderOrganigram();

            } catch (error) {

                console.error("Erreur organigramme :", error);

                organigramContainer.innerHTML = `
                    <p class="organigram-empty">
                        Impossible de charger l'organigramme pour le moment.
                    </p>
                `;
            }
        }

        function initialsOf(name) {
            return String(name || "")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map(part => part.charAt(0))
                .join("")
                .toUpperCase();
        }

        function positionEntries(positionId) {
            return assignments
                .filter(item => item.position_id === positionId)
                .map(item => ({
                    item,
                    member: members.find(person => person.id === item.member_id)
                }))
                .filter(entry => entry.member);
        }

        // Carte d'un poste. "note" remplace la mention sous le nom (chaîne vide = aucune)
        function positionCard(position, isHead = false, isVp = false, note = undefined) {

            const entries = positionEntries(position.id);
            const first = entries[0];
            const photoUrl = first ? getMemberPhoto(first.member) : "";
            const extra = entries.length - 1;

            const classes = ["on-node"];
            if (isHead) classes.push("is-head");
            if (isVp) classes.push("is-vp");

            const parent = positions.find(item => item.id === position.parent_position_id);
            const mention = note === undefined ? (parent ? `Rattaché à ${parent.title_fr}` : "") : note;
            const mentionHtml = mention ? `<span class="on-parent">${escapeHTML(mention)}</span>` : "";

            return `
                <article class="${classes.join(" ")}"
                    data-position="${escapeHTML(position.id)}"
                    tabindex="0"
                    role="button"
                    aria-label="Voir le détail : ${escapeHTML(position.title_fr)}">

                    <div class="on-avatar">
                        ${first
                            ? (photoUrl
                                ? `<img loading="lazy" decoding="async" src="${escapeHTML(photoUrl)}"
                                        alt="Photo de ${escapeHTML(first.member.full_name)}"
                                        loading="lazy">`
                                : `<span class="on-initials" aria-hidden="true">${escapeHTML(initialsOf(first.member.full_name))}</span>`)
                            : `<span class="on-initials" aria-hidden="true">?</span>`
                        }
                    </div>

                    <div class="on-text">
                        <p class="on-title">${escapeHTML(position.title_fr)}</p>

                        ${first
                            ? `
                                <strong class="on-name">${escapeHTML(first.member.full_name)}</strong>
                                ${mentionHtml}
                                ${extra > 0
                                    ? `<span class="on-more">+ ${extra} autre${extra > 1 ? "s" : ""}</span>`
                                    : ""
                                }
                            `
                            : `
                                ${mentionHtml}
                                <span class="on-vacant">Poste à pourvoir</span>
                            `
                        }
                    </div>

                </article>
            `;
        }

        // Ordre de préséance : tête, puis premier niveau (vice-présidents),
        // puis chaque poste de niveau suivant suivi de ses subordonnés.
        function precedenceOrder() {
            const seen = new Set();
            const out = [];

            const add = position => {
                if (!seen.has(position.id)) {
                    seen.add(position.id);
                    out.push(position);
                }
            };

            const childrenOf = id => positions.filter(
                item => item.parent_position_id === id
            );

            const roots = positions.filter(
                position => !position.parent_position_id ||
                    !positions.some(item => item.id === position.parent_position_id)
            );

            // 1. Têtes (ex. : Président)
            roots.forEach(add);

            // 2. Premier niveau (ex. : Premier et Deuxième Vice-Président)
            const firstLevel = [];
            roots.forEach(root => childrenOf(root.id).forEach(child => {
                add(child);
                firstLevel.push(child);
            }));

            // 3. Chaque poste suivi de ses subordonnés, en profondeur
            const deep = position => childrenOf(position.id).forEach(child => {
                if (!seen.has(child.id)) {
                    add(child);
                    deep(child);
                }
            });

            firstLevel.forEach(head => childrenOf(head.id).forEach(child => {
                if (!seen.has(child.id)) {
                    add(child);
                    deep(child);
                }
            }));

            // Filet de sécurité : postes restants
            positions.forEach(add);

            return out;
        }

        // Niveau d'un poste : 0 pour la tête, 1 pour ses rattachés, etc.
        function positionDepth(position, seen = new Set()) {
            if (!position.parent_position_id || seen.has(position.id)) return 0;
            const parent = positions.find(item => item.id === position.parent_position_id);
            if (!parent) return 0;
            seen.add(position.id);
            return positionDepth(parent, seen) + 1;
        }

        // Fiche détaillée (tous les occupants d'un poste)
        function ensureOrgDialog() {

            let dialog = document.getElementById("orgDialog");
            if (dialog) return dialog;

            dialog = document.createElement("dialog");
            dialog.id = "orgDialog";
            dialog.className = "org-dialog";
            dialog.innerHTML = `
                <div class="org-dialog-inner">
                    <button type="button" class="org-dialog-close" aria-label="Fermer">×</button>
                    <div class="org-dialog-content"></div>
                </div>
            `;
            document.body.appendChild(dialog);

            dialog.addEventListener("click", event => {
                if (event.target === dialog || event.target.closest(".org-dialog-close")) {
                    dialog.close();
                }
            });

            return dialog;
        }

        function openPositionDialog(positionId) {

            const position = positions.find(item => item.id === positionId);
            if (!position) return;

            const entries = positionEntries(positionId);
            const dialog = ensureOrgDialog();

            dialog.querySelector(".org-dialog-content").innerHTML = `
                <p class="org-dialog-kicker">Organigramme du Bureau</p>
                <h3>${escapeHTML(position.title_fr)}</h3>
                ${position.description_fr
                    ? `<p class="org-dialog-desc">${escapeHTML(position.description_fr)}</p>`
                    : ""
                }

                ${entries.length
                    ? entries.map(({ item, member }) => {
                        const photoUrl = getMemberPhoto(member);
                        return `
                            <div class="org-dialog-person">
                                ${photoUrl
                                    ? `<a class="org-dialog-photo-link" href="${escapeHTML(photoUrl)}" target="_blank" rel="noopener" title="Voir la photo en entier">
                                            <img class="org-dialog-photo" loading="lazy" decoding="async" src="${escapeHTML(photoUrl)}" alt="Photo de ${escapeHTML(member.full_name)}" loading="lazy">
                                       </a>`
                                    : `<span class="org-dialog-photo org-photo-placeholder">${escapeHTML(initialsOf(member.full_name))}</span>`
                                }
                                <div>
                                    <strong>${escapeHTML(member.full_name)}</strong>
                                    ${item.assignment_label ? `<span class="org-role">${escapeHTML(item.assignment_label)}</span>` : ""}
                                    ${member.mandate_label ? `<small>${escapeHTML(member.mandate_label)}</small>` : ""}
                                    ${member.academic_year ? `<small>${escapeHTML(member.academic_year)}</small>` : ""}
                                    ${member.biography_fr ? `<p>${escapeHTML(member.biography_fr)}</p>` : ""}
                                </div>
                            </div>
                        `;
                    }).join("")
                    : `<p class="org-vacant">Ce poste n'est pas encore pourvu.</p>`
                }
            `;

            if (typeof dialog.showModal === "function") {
                dialog.showModal();
            } else {
                dialog.setAttribute("open", "");
            }
        }

        function bindOrgCards() {

            organigramContainer.querySelectorAll(".on-node").forEach(card => {

                const open = () => openPositionDialog(card.dataset.position);

                card.addEventListener("click", open);
                card.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open();
                    }
                });
            });
        }

        function normalizeText(value) {
            return String(value || "")
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .toLowerCase();
        }

        // Présidence : le président et les vice-présidents
        function isPresidency(position) {
            return /president|vice/.test(normalizeText(position.title_fr));
        }

        // Bloc présidence : président au centre, vice-présidents de chaque côté
        function presidencyBlockHtml(leaders) {

            const president =
                leaders.find(item => /president/.test(normalizeText(item.title_fr)) && !/vice/.test(normalizeText(item.title_fr))) ||
                leaders[0];

            const others = leaders.filter(item => item !== president);
            const half = Math.ceil(others.length / 2);
            const left = others.slice(0, half);
            const right = others.slice(half);

            return `
                <div class="on-presidency">
                    <p class="on-group-label">Présidence</p>
                    <div class="on-leaders">
                        <div class="on-side">${left.map(item => positionCard(item, false, true, "")).join("")}</div>
                        <div class="on-centre">${positionCard(president, true, false, "")}</div>
                        <div class="on-side">${right.map(item => positionCard(item, false, true, "")).join("")}</div>
                    </div>
                </div>
            `;
        }

        // Postes rattachés : trois colonnes, un poste général en haut et son adjoint dessous.
        // L'adjoint suit d'abord son intitulé de base (sans accents ni formes féminines), puis le lien parent.
        function teamGridHtml(team) {

            const isAdjoint = position => /\badjoint(e|es|s)?\b/.test(normalizeText(position.title_fr));

            // Clé de rapprochement : « Sécrétaire générale » et « Secrétaire général » donnent la même
            const keyOf = position => normalizeText(position.title_fr)
                .replace(/\badjoint(e|es|s)?\b/g, "")
                .split(/\s+/)
                .filter(Boolean)
                .map(word => word.replace(/e$/, ""))
                .join(" ");

            const generals = team.filter(position => !isAdjoint(position));
            const adjoints = team.filter(isAdjoint);

            const columns = generals.map(general => ({ head: general, subs: [] }));

            adjoints.forEach(adjoint => {
                const column =
                    columns.find(col => keyOf(col.head) === keyOf(adjoint)) ||
                    columns.find(col => col.head.id === adjoint.parent_position_id) ||
                    columns.find(col => col.subs.length === 0) ||
                    null;

                if (column) {
                    column.subs.push(adjoint);
                } else {
                    columns.push({ head: adjoint, subs: [] });
                }
            });

            const slot = (position, column, row, isSub) => `
                <div class="on-slot${isSub ? " on-slot--adj" : ""}"
                    style="grid-column:${column + 1};grid-row:${row + 1}">
                    ${positionCard(position, false, false, "")}
                </div>`;

            const html = columns.map((column, c) => [
                slot(column.head, c, 0, false),
                ...column.subs.map((sub, r) => slot(sub, c, r + 1, true))
            ].join("")).join("");

            return { cols: Math.max(columns.length, 3), html };
        }

        function renderOrganigram() {

            if (!positions.length) {

                organigramContainer.innerHTML = `
                    <div class="organigram-empty">
                        <p>Aucun poste n'est actuellement publié.</p>
                    </div>
                `;

                return;
            }

            if (currentView === "list") {

                organigramContainer.innerHTML = `
                    <div class="on-list">
                        ${precedenceOrder().map(position => positionCard(position, false, false, "")).join("")}
                    </div>
                `;

                bindOrgCards();
                return;
            }

            const ordered = precedenceOrder();

            // Présidence : président et vice-présidents. Sans eux, les postes de tête.
            let leaders = ordered.filter(isPresidency);
            if (!leaders.length) {
                leaders = ordered.filter(position => positionDepth(position) === 0);
            }

            // Tous les autres postes sont rattachés à la présidence dans son ensemble
            const team = ordered.filter(position => !leaders.includes(position));

            const teamGrid = teamGridHtml(team);

            organigramContainer.innerHTML = `
                <div class="on-board">
                    ${presidencyBlockHtml(leaders)}
                    ${team.length
                        ? `
                            <div class="on-stem-down" aria-hidden="true"></div>
                            <div class="on-team-label"><span>Rattachés à la présidence</span></div>
                            <div class="on-team" style="--cols:${teamGrid.cols}">
                                ${teamGrid.html}
                            </div>
                        `
                        : ""}
                </div>
            `;

            bindOrgCards();
        }

        if (hierarchyButton) {

            hierarchyButton.addEventListener("click", () => {

                currentView = "hierarchy";

                hierarchyButton.classList.add("active");
                hierarchyButton.setAttribute("aria-pressed", "true");

                if (listButton) {
                    listButton.classList.remove("active");
                    listButton.setAttribute("aria-pressed", "false");
                }

                renderOrganigram();
            });
        }

        if (listButton) {

            listButton.addEventListener("click", () => {

                currentView = "list";

                listButton.classList.add("active");
                listButton.setAttribute("aria-pressed", "true");

                if (hierarchyButton) {
                    hierarchyButton.classList.remove("active");
                    hierarchyButton.setAttribute("aria-pressed", "false");
                }

                renderOrganigram();
            });
        }

        loadOrganigram();
    }

    // =========================================
    // 7. ACTUALITÉS DYNAMIQUES
    // =========================================

    const newsContainer =
        document.getElementById("newsContainer");

    const newsFilters =
        document.querySelectorAll("[data-category]");

    if (newsContainer && supabase) {

        let publications = [];
        let currentCategory = "all";

        // PostgREST renvoie parfois un objet, parfois un tableau
        function firstOf(value) {
            return Array.isArray(value) ? value[0] : value;
        }

        // Reconnaît la catégorie (actualité, communiqué, annonce)
        // d'après son nom ou son identifiant, quel que soit le libellé saisi.
        function publicationKind(category) {
            const text = `${category?.slug || ""} ${category?.name || ""}`
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();

            if (text.includes("actualit")) return "actualite";
            if (text.includes("communiq")) return "communique";
            if (text.includes("annonce")) return "annonce";
            return "autre";
        }

        function publicationKindLabel(category) {
            const labels = {
                actualite: "Actualité",
                communique: "Communiqué",
                annonce: "Annonce officielle"
            };

            return labels[publicationKind(category)] || category?.name || "Publication";
        }

        // Page de lecture : même dossier que la liste, ou dossier pages/
        const publicationPageUrl =
            window.location.pathname.includes("/pages/")
                ? "publication.html"
                : "pages/publication.html";

        function formatDate(dateValue) {

            if (!dateValue) return "";

            return new Date(dateValue).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }

        async function getPublicationImage(contentId) {

            const { data, error } = await supabase
                .from("content_media")
                .select("storage_path, is_main, display_order")
                .eq("content_id", contentId)
                .eq("media_type", "image")
                .order("is_main", { ascending: false })
                .order("display_order")
                .limit(1);

            if (error) {
                console.error("Erreur média :", error.message);
                return "";
            }

            if (!data || !data.length) return "";

            const { data: signedData, error: signedError } =
                await supabase.storage
                    .from("buep-publications")
                    .createSignedUrl(data[0].storage_path, 3600);

            if (signedError) {
                console.error("Erreur URL image :", signedError.message);
                return "";
            }

            return signedData?.signedUrl || "";
        }

        let publicationsLoaded = false;

        async function loadPublications() {

            newsContainer.innerHTML = `
                <p class="news-empty">
                    Chargement des actualités...
                </p>
            `;

            try {

                const { data, error } = await supabase
                    .from("contents")
                    .select(`
                        id,
                        published_at,
                        is_featured,
                        content_translations (
                            language_code,
                            title,
                            summary,
                            body
                        ),
                        publications (
                            reference,
                            publication_categories (
                                name,
                                slug
                            )
                        ),
                        content_media (
                            id,
                            storage_path,
                            media_type,
                            is_main,
                            display_order
                        )
                    `)
                    .eq("content_type", "publication")
                    .eq("status", "published")
                    .or("published_at.is.null,published_at.lte." + new Date().toISOString())
                    .or("display_from.is.null,display_from.lte." + new Date().toISOString())
                    .or("display_until.is.null,display_until.gte." + new Date().toISOString())
                    .order("published_at", {
                        ascending: false,
                        nullsFirst: false
                    });

                if (error) throw error;

                publications = data || [];
                publicationsLoaded = true;

                await renderPublications();

            } catch (error) {

                console.error("Erreur actualités :", error);

                newsContainer.innerHTML = `
                    <div class="news-empty">
                        <p>Impossible de charger les actualités pour le moment.</p>
                    </div>
                `;
            }
        }

        async function renderPublications() {
            await window.buepLang.ready;

            // Tant que les données ne sont pas arrivées, seul le message de chargement reste affiché.
            if (!publicationsLoaded) {
                showPagedHtml(newsContainer, [], `
                    <p class="news-empty">
                        Chargement des actualités...
                    </p>
                `);
                return;
            }

            const filteredPublications = publications.filter(item => {

                const publication = firstOf(item.publications);

                return currentCategory === "all" ||
                    publicationKind(firstOf(publication?.publication_categories)) === currentCategory;
            });

            if (!filteredPublications.length) {

                showPagedHtml(newsContainer, [], `
                    <div class="news-empty">
                        <p>
                            Aucune publication n'est disponible dans cette catégorie pour le moment.
                        </p>
                    </div>
                `);

                return;
            }

            showPagedHtml(newsContainer, [], `
                <p class="news-loading">
                    Chargement des publications...
                </p>
            `);

            const cards = await Promise.all(
                filteredPublications.map(async item => {

                    const translation = window.buepLang.pick(item.content_translations);

                    if (!translation) return "";

                    const publication = firstOf(item.publications);
                    const category = firstOf(publication?.publication_categories);
                    const kind = publicationKind(category);

                    const imageUrl = await getPublicationImage(item.id);

                    const href = `${publicationPageUrl}?id=${encodeURIComponent(item.id)}`;

                    return `
                        <a class="news-card" href="${escapeHTML(href)}"
                            target="_blank" rel="noopener">

                            <div class="news-card-image">
                                ${imageUrl
                                    ? `<img src="${escapeHTML(imageUrl)}" alt="" loading="lazy">`
                                    : `<div class="news-card-placeholder" aria-hidden="true">✦</div>`
                                }
                                <span class="news-kind news-kind-${kind}">
                                    ${escapeHTML(publicationKindLabel(category))}
                                </span>
                            </div>

                            <div class="news-card-content">

                                <h3>${escapeHTML(translation.title)}</h3>

                                ${translation.summary
                                    ? `<p>${escapeHTML(translation.summary)}</p>`
                                    : ""
                                }

                                <div class="news-card-meta">
                                    ${item.published_at
                                        ? `<time datetime="${escapeHTML(item.published_at)}">${escapeHTML(formatDate(item.published_at))}</time>`
                                        : ""
                                    }
                                </div>

                                <span class="news-card-cta">
                                    Lire la suite <span aria-hidden="true">→</span>
                                </span>

                            </div>

                        </a>
                    `;
                })
            );

            showPagedHtml(newsContainer, cards, `
                <div class="news-empty">
                    <p>Aucune publication disponible.</p>
                </div>
            `);
        }

        newsFilters.forEach(button => {

            button.addEventListener("click", () => {

                currentCategory =
                    button.dataset.category || "all";

                newsFilters.forEach(filter => {
                    const isActive =
                        filter.dataset.category === currentCategory;

                    filter.classList.toggle("active", isActive);
                    filter.setAttribute(
                        "aria-pressed",
                        String(isActive)
                    );
                });

                renderPublications();
            });
        });

        loadPublications();
    }

    // =========================================
    // 8. ACTIVITÉS DYNAMIQUES
    // =========================================

    const activitiesContainer =
        document.getElementById("activitiesContainer");

    if (activitiesContainer && supabase) {

        function formatActivityDate(startDate, endDate) {
            return formatEventRange(startDate, endDate);
        }

        function formatEventStatus(status) {

            if (!status) return "";

            const labels = {
                planned: "À venir",
                upcoming: "À venir",
                ongoing: "En cours",
                in_progress: "En cours",
                completed: "Réalisée",
                finished: "Terminée",
                cancelled: "Annulée",
                postponed: "Reportée"
            };

            const normalized = String(status).toLowerCase();

            return labels[normalized] ||
                String(status)
                    .replace(/[_-]/g, " ")
                    .replace(/\b\w/g, letter => letter.toUpperCase());
        }

        async function getActivityImage(media) {

            if (!media || !media.length) return "";

            const images = media
                .filter(item => item.media_type === "image")
                .sort((a, b) => {

                    if (a.is_main !== b.is_main) {
                        return a.is_main ? -1 : 1;
                    }

                    return (a.display_order || 0) -
                        (b.display_order || 0);
                });

            if (!images.length) return "";

            const bucket = supabase.storage.from("buep-activities");
            const { data, error } = await bucket.createSignedUrl(images[0].storage_path, 3600);

            if (error || !data?.signedUrl) {
                // Repli : URL publique (fonctionne si le bucket est public).
                console.error("Erreur image activité (signature) :", error?.message || "réponse vide");
                return bucket.getPublicUrl(images[0].storage_path).data?.publicUrl || "";
            }

            return data?.signedUrl || "";
        }

        async function loadActivities() {
            await window.buepLang.ready;

            activitiesContainer.innerHTML = `
                <div class="activities-empty">
                    <p>Chargement des activités...</p>
                </div>
            `;

            try {

                const { data, error } = await supabase
                    .from("contents")
                    .select(`
                        id,
                        published_at,
                        is_featured,
                        content_translations (
                            language_code,
                            title,
                            summary,
                            body
                        ),
                        activities (
                            category_id,
                            academic_year_id,
                            is_project,
                            event_status,
                            start_date,
                            end_date,
                            location,
                            objectives_fr,
                            target_audience_fr,
                            bilan_fr
                        ),
                        content_media (
                            id,
                            storage_path,
                            media_type,
                            is_main,
                            display_order
                        )
                    `)
                    .eq("content_type", "activity")
                    .eq("status", "published")
                    .order("published_at", {
                        ascending: false,
                        nullsFirst: false
                    });

                if (error) throw error;

                const activities = data || [];

                await renderActivities(activities);

            } catch (error) {

                console.error("Erreur activités :", error);

                activitiesContainer.innerHTML = `
                    <div class="activities-empty">
                        <h3>Chargement momentanément impossible</h3>
                        <p>
                            Les activités ne peuvent pas être affichées pour le moment.
                        </p>
                    </div>
                `;
            }
        }

        // Filtres : type (activité ou projet) et statut
        const activityFilters = { type: "all", status: "all" };
        let activityModels = [];

        function activityStatusGroup(status) {
            if (status === "upcoming" || status === "planned") return "upcoming";
            if (status === "ongoing" || status === "in_progress") return "ongoing";
            if (status === "completed" || status === "finished") return "done";
            return "other";
        }

        function activityPageLink(id) {
            const page = window.location.pathname.includes("/pages/")
                ? "activite.html"
                : "pages/activite.html";
            return `${page}?id=${encodeURIComponent(id)}`;
        }

        function bindActivityFilters() {
            document.querySelectorAll("[data-activity-filter]").forEach(button => {
                button.addEventListener("click", () => {
                    const key = button.dataset.activityFilter;
                    activityFilters[key] = button.dataset.value;

                    document.querySelectorAll(`[data-activity-filter="${key}"]`)
                        .forEach(other => other.classList.toggle("active", other === button));

                    paintActivities();
                });
            });
        }

        function paintActivities() {
            const visible = activityModels.filter(model =>
                (activityFilters.type === "all" ||
                    (activityFilters.type === "project") === model.isProject) &&
                (activityFilters.status === "all" ||
                    activityFilters.status === model.group)
            );

            showPagedHtml(activitiesContainer, visible.map(model => `
                <a class="activity-card" href="${escapeHTML(model.href)}" target="_blank" rel="noopener">

                    <div class="activity-card-image">
                        ${model.imageUrl
                            ? `<img src="${escapeHTML(model.imageUrl)}" alt="" loading="lazy">`
                            : `<div class="activity-card-placeholder" aria-hidden="true">✦</div>`
                        }
                        ${model.photoCount > 1
                            ? `<span class="activity-photos">${model.photoCount} photos</span>`
                            : ""
                        }
                    </div>

                    <div class="activity-card-content">

                        <div class="activity-card-labels">
                            <span class="activity-type">${model.isProject ? "Projet" : "Activité"}</span>
                            ${model.statusLabel
                                ? `<span class="activity-status">${escapeHTML(model.statusLabel)}</span>`
                                : ""
                            }
                        </div>

                        <h3>${escapeHTML(model.title)}</h3>

                        ${model.description
                            ? `<p class="activity-description">${escapeHTML(model.description)}</p>`
                            : ""
                        }

                        <div class="activity-meta">
                            ${model.dateLabel
                                ? `<p><strong>Date :</strong> ${escapeHTML(model.dateLabel)}</p>`
                                : ""
                            }
                            ${model.location
                                ? `<p><strong>Lieu :</strong> ${escapeHTML(model.location)}</p>`
                                : ""
                            }
                        </div>

                        <span class="activity-cta">Voir les détails <span aria-hidden="true">→</span></span>

                    </div>

                </a>
            `), `
                <div class="activities-empty">
                    <h3>Aucune activité dans cette sélection</h3>
                    <p>Essayez un autre filtre pour voir les autres activités et projets.</p>
                </div>
            `);
        }

        async function renderActivities(activities) {

            if (!activities.length) {

                activityModels = [];
                activitiesContainer.innerHTML = `
                    <div class="activities-empty">
                        <div class="empty-icon">✦</div>

                        <h3>Nos activités seront bientôt présentées</h3>

                        <p>
                            Les projets et activités du BUEP seront
                            publiés dans cet espace au fur et à mesure
                            de leur programmation et de leur réalisation.
                        </p>
                    </div>
                `;

                return;
            }

            const models = await Promise.all(
                activities.map(async item => {

                    // Relation un-à-un : objet (ou tableau selon la version de l'API)
                    const activity = Array.isArray(item.activities)
                        ? item.activities[0]
                        : item.activities;

                    if (!activity) return null;

                    const translation = window.buepLang.pick(item.content_translations);

                    if (!translation) return null;

                    const media = item.content_media || [];
                    const imageUrl = await getActivityImage(media);

                    return {
                        id: item.id,
                        href: activityPageLink(item.id),
                        isProject: activity.is_project === true,
                        group: activityStatusGroup(activity.event_status),
                        statusLabel: formatEventStatus(activity.event_status),
                        title: translation.title,
                        description:
                            translation.summary ||
                            activity.objectives_fr ||
                            "",
                        imageUrl,
                        photoCount: media.filter(m => m.media_type === "image").length,
                        dateLabel: formatActivityDate(activity.start_date, activity.end_date),
                        location: activity.location || ""
                    };
                })
            );

            activityModels = models.filter(Boolean);

            if (!activityModels.length) {
                activitiesContainer.innerHTML = `
                    <div class="activities-empty">
                        <h3>Aucune activité disponible</h3>
                        <p>Les activités publiées apparaîtront ici.</p>
                    </div>
                `;
                return;
            }

            paintActivities();
        }

        bindActivityFilters();
        loadActivities();
    }

    // =========================================
    // 9. VIE ASSOCIATIVE — CLUBS DYNAMIQUES
    // =========================================

    const clubsContainer =
        document.getElementById("clubsContainer");

    if (clubsContainer && supabase) {

        // Récupération d'une URL publique d'image
        function getClubImage(path) {

            if (!path) return "";

            const { data, error } = supabase.storage
                .from("buep-public-assets")
                .getPublicUrl(path);

            if (error || !data?.publicUrl) return "";

            return data.publicUrl;
        }

        // Formatage des dates des activités
        function formatClubDate(dateValue) {

            if (!dateValue) return "";

            return new Date(dateValue).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }

        // Affichage des activités d'un club
        // Texte réduit à 3 lignes, avec un bouton « Voir plus » si le texte est long
        function clubExpandableText(text) {
            if (!text) return "";

            const isLong = String(text).length > 140;

            return `
                <div class="club-text${isLong ? " is-clamped" : ""}">
                    <p>${escapeHTML(text)}</p>
                </div>
                ${isLong
                    ? `<button type="button" class="club-toggle" data-club-toggle aria-expanded="false">Voir plus</button>`
                    : ""
                }
            `;
        }

        // Badge de date (jour + mois) pour les cartes d'activités
        function clubDateBadge(value) {
            const date = new Date(value);
            if (isNaN(date)) return "";

            const day = String(date.getDate()).padStart(2, "0");
            const month = date
                .toLocaleDateString("fr-FR", { month: "short" })
                .replace(".", "");

            return `
                <span class="club-date-badge">
                    <b>${day}</b>
                    <small>${escapeHTML(month)}</small>
                </span>
            `;
        }

        // 3 éléments visibles, les autres dans un bloc déployable
        function clubItemsWithMore(items, renderItem, moreLabel) {
            const visible = items.slice(0, 3).map(renderItem).join("");
            const hidden = items.slice(3).map(renderItem).join("");

            if (!hidden) {
                return `<div class="club-items">${visible}</div>`;
            }

            return `
                <div class="club-items">${visible}</div>
                <details class="club-more">
                    <summary>${escapeHTML(moreLabel)} (${items.length - 3})</summary>
                    <div class="club-items">${hidden}</div>
                </details>
            `;
        }

        // Activités : à venir d'abord (la plus proche en premier), puis les passées
        function renderClubActivities(activities) {

            if (!activities || !activities.length) return "";

            const now = Date.now();
            const time = value => new Date(value || 0).getTime();

            const upcoming = activities
                .filter(item => time(item.activity_date) >= now)
                .sort((a, b) => time(a.activity_date) - time(b.activity_date));

            const past = activities
                .filter(item => time(item.activity_date) < now)
                .sort((a, b) => time(b.activity_date) - time(a.activity_date));

            const ordered = [...upcoming, ...past];

            const renderActivity = activity => {
                const isPast = time(activity.activity_date) < now;

                return `
                    <article class="club-activity-card${isPast ? " is-past" : ""}">
                        ${clubDateBadge(activity.activity_date)}
                        <div class="club-activity-body">
                            <span class="club-state">${isPast ? "Passée" : "À venir"}</span>
                            <h5>${escapeHTML(activity.title_fr || "Activité")}</h5>
                            <p class="club-meta">
                                ${escapeHTML(formatEventRange(activity.activity_date, activity.end_date))}
                                ${activity.location ? ` · Lieu : ${escapeHTML(activity.location)}` : ""}
                            </p>
                            ${activity.description_fr
                                ? clubExpandableText(activity.description_fr)
                                : ""
                            }
                        </div>
                    </article>
                `;
            };

            return `
                <div class="club-modal-block club-activities">
                    <h4>Activités</h4>
                    ${clubItemsWithMore(ordered, renderActivity, "Voir les autres activités")}
                </div>
            `;
        }

        // Publications : les publiées, les plus récentes d'abord
        function renderClubPublications(publications) {

            if (!publications || !publications.length) return "";

            const published = publications
                .filter(item => item.status === "published")
                .sort((a, b) =>
                    new Date(b.published_at || b.created_at || 0) -
                    new Date(a.published_at || a.created_at || 0)
                );

            if (!published.length) return "";

            const renderPublication = publication => `
                <article class="club-pub-row">
                    <span class="club-pub-icon" aria-hidden="true">▤</span>
                    <div class="club-pub-body">
                        <h5>${escapeHTML(publication.title_fr || "Publication")}</h5>
                        ${publication.published_at
                            ? `<p class="club-meta">${escapeHTML(formatClubDate(publication.published_at))}</p>`
                            : ""
                        }
                        ${publication.summary_fr
                            ? clubExpandableText(publication.summary_fr)
                            : ""
                        }
                    </div>
                </article>
            `;

            return `
                <div class="club-modal-block club-publications">
                    <h4>Publications</h4>
                    ${clubItemsWithMore(published, renderPublication, "Voir les autres publications")}
                </div>
            `;
        }

        // Chargement des clubs publiés
        async function loadClubs() {

            clubsContainer.innerHTML = `
                <div class="clubs-empty">
                    <p>Chargement des clubs...</p>
                </div>
            `;

            try {

                const { data, error } = await supabase
                    .from("clubs")
                    .select(`
                        id,
                        category_id,
                        name_fr,
                        slug,
                        description_fr,
                        history_fr,
                        objectives_fr,
                        logo_path,
                        cover_path,
                        contact_email,
                        contact_phone,
                        whatsapp_number,
                        responsible_name,
                        responsible_title,
                        status,
                        display_order,
                        is_featured,
                        club_categories (
                            name_fr,
                            slug
                        ),
                        club_activities (
                            id,
                            title_fr,
                            description_fr,
                            activity_date,
                            end_date,
                            location,
                            status
                        ),
                        club_publications (
                            id,
                            title_fr,
                            summary_fr,
                            status,
                            published_at,
                            created_at
                        ),
                        club_images (
                            id,
                            storage_path,
                            caption_fr,
                            alt_text_fr,
                            display_order
                        )
                    `)
                    .eq("status", "published")
                    .order("display_order", {
                        ascending: true
                    });

                if (error) throw error;

                renderClubs(data || []);

            } catch (error) {

                console.error("Erreur vie associative :", error);

                clubsContainer.innerHTML = `
                    <div class="clubs-empty">
                        <h3>Informations momentanément indisponibles</h3>
                        <p>
                            Les informations des clubs ne peuvent pas
                            être chargées pour le moment.
                        </p>
                    </div>
                `;
            }
        }

        // Construction des cartes des clubs : une carte par club,
        // les informations complètes s'ouvrent à la sélection.
        const clubsById = new Map();
        let clubsEventsBound = false;

        function getClubContact(club) {
            const email = String(club.contact_email || "").trim();
            const phone = String(club.contact_phone || "").trim();
            const whatsapp = String(club.whatsapp_number || "").replace(/\D/g, "");

            return {
                email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
                phone,
                whatsapp
            };
        }

        function clubImages(club) {
            return (club.club_images || [])
                .slice()
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        }

        function clubCoverUrl(club) {
            const images = clubImages(club);
            return getClubImage(club.cover_path || images[0]?.storage_path || "");
        }

        function clubTileHtml(club) {
            const category = club.club_categories?.name_fr || "";
            const coverUrl = clubCoverUrl(club);
            const logoUrl = getClubImage(club.logo_path || "");

            return `
                <article class="club-tile" data-club-id="${escapeHTML(club.id)}"
                    tabindex="0" role="button"
                    aria-label="Voir les informations du club ${escapeHTML(club.name_fr)}">

                    <div class="club-tile-media">
                        ${coverUrl
                            ? `<img src="${escapeHTML(coverUrl)}" alt="" loading="lazy">`
                            : `<div class="club-tile-placeholder">✦</div>`
                        }
                        ${logoUrl
                            ? `<img class="club-tile-logo" src="${escapeHTML(logoUrl)}" alt="" loading="lazy">`
                            : ""
                        }
                    </div>

                    <div class="club-tile-body">
                        ${category ? `<span class="club-tag">${escapeHTML(category)}</span>` : ""}
                        <h3>${escapeHTML(club.name_fr)}</h3>
                        ${club.description_fr
                            ? `<p class="club-tile-excerpt">${escapeHTML(club.description_fr)}</p>`
                            : ""
                        }
                        <span class="club-tile-cta">Voir les informations <span aria-hidden="true">→</span></span>
                    </div>
                </article>
            `;
        }

        function clubDetailHtml(club) {
            const contact = getClubContact(club);
            const images = clubImages(club);
            const category = club.club_categories?.name_fr || "";
            const logoUrl = getClubImage(club.logo_path || "");

            const contactLines = [
                contact.email ? `<a href="mailto:${escapeHTML(contact.email)}">${escapeHTML(contact.email)}</a>` : "",
                contact.phone ? `<a href="tel:${escapeHTML(contact.phone.replace(/[^\d+]/g, ""))}">${escapeHTML(contact.phone)}</a>` : "",
                contact.whatsapp ? `<a href="https://wa.me/${escapeHTML(contact.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""
            ].filter(Boolean);

            return `
                <header class="club-modal-head">
                    ${logoUrl ? `<img class="club-modal-logo" loading="lazy" decoding="async" src="${escapeHTML(logoUrl)}" alt="">` : ""}
                    <div>
                        ${category ? `<span class="club-tag">${escapeHTML(category)}</span>` : ""}
                        <h2 id="clubModalTitle">${escapeHTML(club.name_fr)}</h2>
                        ${club.responsible_name
                            ? `<p class="club-modal-resp">Responsable : <strong>${escapeHTML(club.responsible_name)}</strong>${club.responsible_title ? ` · ${escapeHTML(club.responsible_title)}` : ""}</p>`
                            : ""
                        }
                    </div>
                </header>

                ${club.description_fr ? `<p class="club-modal-text">${escapeHTML(club.description_fr)}</p>` : ""}

                ${club.objectives_fr
                    ? `<div class="club-modal-block"><h4>Nos objectifs</h4><p>${escapeHTML(club.objectives_fr)}</p></div>`
                    : ""
                }

                ${renderClubActivities(club.club_activities)}
                ${renderClubPublications(club.club_publications)}

                ${images.length > 1
                    ? `<div class="club-modal-block"><h4>Photos</h4><div class="club-modal-photos">
                        ${images.map(image => {
                            const url = getClubImage(image.storage_path);
                            return url ? `<img src="${escapeHTML(url)}" alt="" loading="lazy">` : "";
                        }).join("")}
                       </div></div>`
                    : ""
                }

                ${contactLines.length
                    ? `<div class="club-modal-block club-modal-contact"><h4>Contact</h4>${contactLines.map(line => `<span>${line}</span>`).join("")}</div>`
                    : ""
                }
            `;
        }

        function ensureClubModal() {
            let modal = document.getElementById("clubModal");
            if (modal) return modal;

            modal = document.createElement("div");
            modal.id = "clubModal";
            modal.className = "club-modal";
            modal.hidden = true;
            modal.innerHTML = `
                <div class="club-modal-panel" role="dialog" aria-modal="true" aria-labelledby="clubModalTitle">
                    <button type="button" class="club-modal-close" aria-label="Fermer">×</button>
                    <div id="clubModalBody"></div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.addEventListener("click", event => {
                if (event.target === modal || event.target.closest(".club-modal-close")) {
                    closeClubModal();
                    return;
                }

                const toggle = event.target.closest("[data-club-toggle]");

                if (toggle) {
                    const text = toggle.previousElementSibling;
                    const open = text.classList.toggle("is-open");
                    toggle.textContent = open ? "Voir moins" : "Voir plus";
                    toggle.setAttribute("aria-expanded", String(open));
                }
            });

            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && !modal.hidden) closeClubModal();
            });

            return modal;
        }

        function openClubModal(club) {
            if (!club) return;

            const modal = ensureClubModal();
            document.getElementById("clubModalBody").innerHTML = clubDetailHtml(club);
            modal.hidden = false;
            document.body.classList.add("club-open");
            modal.querySelector(".club-modal-panel").scrollTop = 0;
        }

        function closeClubModal() {
            const modal = document.getElementById("clubModal");
            if (modal) modal.hidden = true;
            document.body.classList.remove("club-open");
        }

        function bindClubEvents() {
            if (clubsEventsBound) return;
            clubsEventsBound = true;

            clubsContainer.addEventListener("click", event => {
                const tile = event.target.closest("[data-club-id]");
                if (tile) openClubModal(clubsById.get(tile.dataset.clubId));
            });

            clubsContainer.addEventListener("keydown", event => {
                const tile = event.target.closest("[data-club-id]");
                if (tile && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openClubModal(clubsById.get(tile.dataset.clubId));
                }
            });
        }

        function renderClubs(clubs) {

            if (!clubs.length) {
                clubsContainer.innerHTML = `
                    <div class="clubs-empty">
                        <div class="empty-icon">✦</div>
                        <h3>Nos clubs seront bientôt présentés</h3>
                        <p>Découvrez prochainement les clubs de l'ENS et les possibilités d'engagement.</p>
                    </div>
                `;
                return;
            }

            clubsById.clear();
            clubs.forEach(club => clubsById.set(club.id, club));

            clubsContainer.innerHTML = `
                <div class="clubs-grid">
                    ${clubs.map(clubTileHtml).join("")}
                </div>
            `;

            bindClubEvents();

            pageElements(
                clubsContainer,
                [...clubsContainer.querySelectorAll("[data-club-id]")],
                () => true,
                { limit: PAGE_SIZE }
            );
        }

        loadClubs();
    }

    // =========================================
    // 10. GALERIE PHOTOS DYNAMIQUE
    // =========================================

    const galleryContainer =
        document.getElementById("galleryContainer");

    if (galleryContainer && supabase) {

        // Génération des URL signées des photos
        async function getGalleryImage(path) {

            if (!path) return "";

            const { data, error } = await supabase.storage
                .from("buep-gallery")
                .createSignedUrl(path, 3600);

            if (error) {
                console.error("Erreur image galerie :", error.message);
                return "";
            }

            return data?.signedUrl || "";
        }

        // URL signées de toutes les photos, en une seule requête
        async function getGalleryImages(paths) {

            const unique = [...new Set(paths.filter(Boolean))];
            const urls = new Map();

            if (!unique.length) return urls;

            const { data, error } = await supabase.storage
                .from("buep-gallery")
                .createSignedUrls(unique, 3600);

            if (error) {
                console.error("Erreur images galerie :", error.message);
                return urls;
            }

            (data || []).forEach(item => {
                if (item.signedUrl) urls.set(item.path, item.signedUrl);
            });

            return urls;
        }

        // Formatage de la date
        function formatGalleryDate(dateValue) {

            if (!dateValue) return "";

            return new Date(dateValue + "T00:00:00").toLocaleDateString(
                "fr-FR",
                {
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                }
            );
        }

        // Chargement des albums
        async function loadGallery() {

            galleryContainer.innerHTML = `
                <div class="gallery-empty">
                    <p>Chargement de la galerie...</p>
                </div>
            `;

            try {

                // Récupération des albums publiés
                const { data: albums, error: albumsError } =
                    await supabase
                        .from("albums")
                        .select(`
                            id,
                            category_id,
                            title_fr,
                            description_fr,
                            slug,
                            cover_media_id,
                            event_date,
                            location,
                            status,
                            published_at,
                            display_order,
                            gallery_categories (
                                name_fr,
                                slug
                            )
                        `)
                        .eq("status", "published")
                        .order("display_order", {
                            ascending: true
                        })
                        .order("event_date", {
                            ascending: false,
                            nullsFirst: false
                        });

                if (albumsError) throw albumsError;

                if (!albums || !albums.length) {
                    renderGallery([]);
                    return;
                }

                // Récupération des photos des albums
                const albumIds = albums.map(album => album.id);

                const { data: media, error: mediaError } =
                    await supabase
                        .from("media_items")
                        .select(`
                            id,
                            album_id,
                            media_type,
                            storage_path,
                            title_fr,
                            caption_fr,
                            alt_text_fr,
                            event_date,
                            display_order,
                            is_featured
                        `)
                        .in("album_id", albumIds)
                        .eq("media_type", "image")
                        .order("display_order", {
                            ascending: true
                        });

                if (mediaError) throw mediaError;

                // Une seule requête pour toutes les URL signées
                const signedUrls = await getGalleryImages((media || []).map(item => item.storage_path));
                const mediaWithUrls = (media || []).map(item => ({
                    ...item,
                    imageUrl: signedUrls.get(item.storage_path) || ""
                }));

                // Association des photos à leurs albums
                const galleryAlbums = albums.map(album => {

                    const albumMedia = mediaWithUrls.filter(
                        item => item.album_id === album.id
                    );

                    return {
                        ...album,
                        media: albumMedia
                    };
                });

                renderGallery(galleryAlbums);

            } catch (error) {

                console.error("Erreur galerie :", error);

                galleryContainer.innerHTML = `
                    <div class="gallery-empty">
                        <h3>Galerie momentanément indisponible</h3>

                        <p>
                            Les albums photos ne peuvent pas être
                            chargés pour le moment.
                        </p>
                    </div>
                `;
            }
        }

        // Affichage dynamique : cartes d'albums, filtres, album et visionneuse
        const albumsById = new Map();
        let galleryListenersBound = false;
        let currentAlbumPhotos = [];
        let currentPhotoIndex = 0;

        function galleryAlbumMeta(album) {
            const parts = [];
            if (album.event_date) parts.push(formatGalleryDate(album.event_date));
            if (album.location) parts.push(album.location);
            return parts.join(" · ");
        }

        function ensureGalleryModal() {
            let modal = document.getElementById("galleryModal");
            if (modal) return modal;

            modal = document.createElement("div");
            modal.id = "galleryModal";
            modal.className = "gallery-modal";
            modal.hidden = true;
            modal.innerHTML = `
                <div class="gallery-modal-panel" role="dialog" aria-modal="true" aria-labelledby="galleryModalTitle">
                    <button type="button" class="gallery-close" data-gallery-close aria-label="Fermer l'album">×</button>
                    <div id="galleryModalBody"></div>
                </div>

                <div class="gallery-viewer" id="galleryViewer" hidden>
                    <button type="button" class="gallery-close" data-viewer-close aria-label="Fermer la photo">×</button>
                    <button type="button" class="gallery-nav gallery-prev" data-viewer-prev aria-label="Photo précédente">‹</button>
                    <figure>
                        <img id="galleryViewerImg" alt="">
                        <figcaption id="galleryViewerCaption"></figcaption>
                    </figure>
                    <button type="button" class="gallery-nav gallery-next" data-viewer-next aria-label="Photo suivante">›</button>
                    <span class="gallery-counter" id="galleryViewerCounter"></span>
                </div>
            `;

            document.body.appendChild(modal);

            modal.addEventListener("click", event => {
                const target = event.target;

                if (target === modal || target.closest("[data-gallery-close]")) {
                    closeGalleryModal();
                    return;
                }

                if (target.id === "galleryViewer" || target.closest("[data-viewer-close]")) {
                    closeGalleryViewer();
                    return;
                }

                if (target.closest("[data-viewer-prev]")) {
                    stepGalleryPhoto(-1);
                    return;
                }

                if (target.closest("[data-viewer-next]")) {
                    stepGalleryPhoto(1);
                    return;
                }

                const thumb = target.closest("[data-photo-index]");

                if (thumb) {
                    openGalleryPhoto(Number(thumb.dataset.photoIndex));
                }
            });

            document.addEventListener("keydown", event => {
                if (modal.hidden) return;

                const viewer = document.getElementById("galleryViewer");
                const viewerOpen = !viewer.hidden;

                if (event.key === "Escape") {
                    viewerOpen ? closeGalleryViewer() : closeGalleryModal();
                } else if (viewerOpen && event.key === "ArrowLeft") {
                    stepGalleryPhoto(-1);
                } else if (viewerOpen && event.key === "ArrowRight") {
                    stepGalleryPhoto(1);
                }
            });

            return modal;
        }

        function openGalleryAlbum(album) {
            if (!album) return;

            const modal = ensureGalleryModal();
            const body = document.getElementById("galleryModalBody");
            const photos = album.media || [];
            const category = album.gallery_categories?.name_fr || "";

            currentAlbumPhotos = photos;

            body.innerHTML = `
                <header class="gallery-modal-head">
                    ${category ? `<span class="album-tag">${escapeHTML(category)}</span>` : ""}
                    <h2 id="galleryModalTitle">${escapeHTML(album.title_fr)}</h2>
                    ${galleryAlbumMeta(album) ? `<p>${escapeHTML(galleryAlbumMeta(album))}</p>` : ""}
                    ${album.description_fr ? `<p class="gallery-modal-desc">${escapeHTML(album.description_fr)}</p>` : ""}
                </header>

                ${photos.length
                    ? `
                        <div class="gallery-thumbs">
                            ${photos.map((photo, index) => `
                                <button type="button" class="gallery-thumb"
                                    data-photo-index="${index}"
                                    aria-label="Ouvrir la photo ${index + 1}">
                                    <img loading="lazy" decoding="async" src="${escapeHTML(photo.imageUrl)}"
                                        alt="${escapeHTML(photo.alt_text_fr || photo.caption_fr || album.title_fr)}"
                                        loading="lazy">
                                </button>
                            `).join("")}
                        </div>
                    `
                    : `<p class="gallery-modal-desc">Aucune photo dans cet album pour le moment.</p>`
                }
            `;

            modal.hidden = false;
            document.body.classList.add("gallery-open");
            modal.querySelector(".gallery-modal-panel").scrollTop = 0;
        }

        function openGalleryPhoto(index) {
            const total = currentAlbumPhotos.length;
            if (!total) return;

            currentPhotoIndex = (index + total) % total;

            const photo = currentAlbumPhotos[currentPhotoIndex];
            const viewer = document.getElementById("galleryViewer");

            document.getElementById("galleryViewerImg").src = photo.imageUrl;
            document.getElementById("galleryViewerImg").alt =
                photo.alt_text_fr || photo.caption_fr || "";
            document.getElementById("galleryViewerCaption").textContent =
                photo.caption_fr || photo.title_fr || "";
            document.getElementById("galleryViewerCounter").textContent =
                `${currentPhotoIndex + 1} / ${total}`;

            viewer.querySelectorAll("[data-viewer-prev], [data-viewer-next]").forEach(button => {
                button.hidden = total < 2;
            });

            viewer.hidden = false;
        }

        function stepGalleryPhoto(delta) {
            openGalleryPhoto(currentPhotoIndex + delta);
        }

        function closeGalleryViewer() {
            const viewer = document.getElementById("galleryViewer");
            if (viewer) viewer.hidden = true;
        }

        function closeGalleryModal() {
            const modal = document.getElementById("galleryModal");
            closeGalleryViewer();
            if (modal) modal.hidden = true;
            document.body.classList.remove("gallery-open");
        }

        let galleryActiveFilter = "all";
        let galleryItems = [];

        // Seules les cartes de la tranche en cours sont écrites dans la page (9 au départ)
        function paintGalleryPage() {
            const cardsBox = galleryContainer.querySelector(".gallery-cards");
            if (!cardsBox) return;

            const html = galleryItems
                .filter(item => galleryActiveFilter === "all" || item.key === galleryActiveFilter)
                .map((item, index) => index % 5 === 0
                    ? item.html.replace('class="album-tile"', 'class="album-tile is-large"')
                    : item.html);

            showPagedHtml(cardsBox, html, `
                <div class="gallery-empty">
                    <p>Aucun album dans cette catégorie pour le moment.</p>
                </div>
            `);
        }

        function bindGalleryEvents() {
            if (galleryListenersBound) return;
            galleryListenersBound = true;

            galleryContainer.addEventListener("click", event => {
                const filter = event.target.closest("[data-filter]");

                if (filter) {
                    const value = filter.dataset.filter;

                    galleryContainer.querySelectorAll("[data-filter]").forEach(button => {
                        button.classList.toggle("active", button === filter);
                    });

                    galleryActiveFilter = value;
                    paintGalleryPage();

                    return;
                }

                const card = event.target.closest("[data-album-id]");

                if (card) {
                    openGalleryAlbum(albumsById.get(card.dataset.albumId));
                }
            });

            galleryContainer.addEventListener("change", event => {
                const select = event.target.closest("#galleryCategorySelect");
                if (!select) return;

                galleryActiveFilter = select.value;
                paintGalleryPage();
            });

            galleryContainer.addEventListener("keydown", event => {
                const card = event.target.closest("[data-album-id]");

                if (card && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openGalleryAlbum(albumsById.get(card.dataset.albumId));
                }
            });
        }

        function renderGallery(albums) {

            if (!albums.length) {

                galleryContainer.innerHTML = `
                    <div class="gallery-empty">

                        <div class="empty-icon">✦</div>

                        <h3>La galerie est en préparation</h3>

                        <p>
                            Les albums photos et les souvenirs
                            des activités seront progressivement
                            publiés dans cet espace.
                        </p>

                    </div>
                `;

                return;
            }

            albumsById.clear();
            albums.forEach(album => albumsById.set(album.id, album));

            // Catégories présentes, pour les filtres
            const categories = new Map();

            albums.forEach(album => {
                const category = album.gallery_categories;
                if (category?.name_fr) {
                    categories.set(category.slug || category.name_fr, category.name_fr);
                }
            });

            const filters = categories.size
                ? `
                    <div class="gallery-filters">
                        <select id="galleryCategorySelect" class="dynamic-select" aria-label="Filtrer par catégorie">
                            <option value="all"${galleryActiveFilter === "all" ? " selected" : ""}>Toutes les catégories</option>
                            ${[...categories].map(([key, label]) => `
                                <option value="${escapeHTML(key)}"${galleryActiveFilter === key ? " selected" : ""}>${escapeHTML(label)}</option>
                            `).join("")}
                        </select>
                    </div>
                `
                : "";

            const cards = albums.map(album => {

                const photos = album.media || [];

                const cover =
                    photos.find(photo => photo.id === album.cover_media_id) ||
                    photos[0];

                const category = album.gallery_categories?.name_fr || "";
                const categoryKey = album.gallery_categories?.slug || category;
                const count = `${photos.length} ${photos.length > 1 ? "photos" : "photo"}`;

                // Tuile de mosaïque : photo plein cadre, légende en surimpression
                return `
                    <article class="album-tile"
                        data-album-id="${escapeHTML(album.id)}"
                        data-category="${escapeHTML(categoryKey)}"
                        tabindex="0"
                        role="button"
                        aria-label="Ouvrir l'album ${escapeHTML(album.title_fr)}">

                        <div class="album-tile-media">
                            ${cover?.imageUrl
                                ? `<img loading="lazy" decoding="async" src="${escapeHTML(cover.imageUrl)}"
                                        alt="${escapeHTML(cover.alt_text_fr || album.title_fr)}"
                                        loading="lazy">`
                                : `<div class="album-cover-empty">✦</div>`
                            }
                        </div>

                        <span class="album-count">${count}</span>

                        <div class="album-tile-info">
                            ${category ? `<span class="album-tag">${escapeHTML(category)}</span>` : ""}
                            <h3>${escapeHTML(album.title_fr)}</h3>
                            ${galleryAlbumMeta(album)
                                ? `<p>${escapeHTML(galleryAlbumMeta(album))}</p>`
                                : ""}
                        </div>

                    </article>
                `;
            });

            galleryItems = albums.map((album, index) => ({
                key: album.gallery_categories?.slug || album.gallery_categories?.name_fr || "",
                html: cards[index]
            }));

            galleryActiveFilter = "all";

            galleryContainer.innerHTML = `
                ${filters}
                <div class="gallery-cards gallery-mosaic"></div>
            `;

            bindGalleryEvents();
            paintGalleryPage();
        }

        loadGallery();
    }
    
    // =========================================
    // 11. DOCUMENTS DYNAMIQUES
    // =========================================

    const documentsContainer =
        document.getElementById("documentsContainer");

    if (documentsContainer && supabase) {

        // Formatage de la date
        function formatDocumentDate(dateValue) {

            if (!dateValue) return "";

            return new Date(dateValue).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }

        // Formatage de la taille du fichier
        function formatFileSize(size) {

            if (!size || size <= 0) return "";

            if (size < 1024) return `${size} octets`;

            if (size < 1024 * 1024) {
                return `${(size / 1024).toFixed(1)} Ko`;
            }

            return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
        }

        // Génération d'une URL signée
        async function getDocumentFileUrl(path) {

            if (!path) return "";

            const { data, error } = await supabase.storage
                .from("buep-documents-public")
                .createSignedUrl(path, 3600);

            if (error) {
                console.error("Erreur fichier documentaire :", error.message);
                return "";
            }

            return data?.signedUrl || "";
        }

        // Chargement des documents
        async function loadDocuments() {

            documentsContainer.innerHTML = `
                <div class="documents-empty">
                    <p>Chargement des documents...</p>
                </div>
            `;

            try {

                const { data: documents, error } = await supabase
                    .from("documents")
                    .select(`
                        id,
                        category_id,
                        title_fr,
                        description_fr,
                        academic_year_id,
                        promotion,
                        study_stream,
                        access_type,
                        status,
                        published_at,
                        display_order,
                        document_categories (
                            name_fr,
                            slug
                        )
                    `)
                    .eq("status", "published")
                    .in("access_type", ["public", "conditional"])
                    .order("display_order", {
                        ascending: true
                    })
                    .order("published_at", {
                        ascending: false,
                        nullsFirst: false
                    });

                if (error) throw error;

                if (!documents || !documents.length) {
                    renderDocuments([]);
                    return;
                }

                // Seuls les documents publics peuvent fournir
                // leurs fichiers à la consultation publique.
                const publicDocuments = documents.filter(
                    document => document.access_type === "public"
                );

                let files = [];

                if (publicDocuments.length) {

                    const publicIds = publicDocuments.map(
                        document => document.id
                    );

                    const { data: filesData, error: filesError } =
                        await supabase
                            .from("document_files")
                            .select(`
                                id,
                                document_id,
                                storage_path,
                                original_file_name,
                                display_file_name,
                                mime_type,
                                file_extension,
                                file_size,
                                language_code,
                                display_order
                            `)
                            .in("document_id", publicIds)
                            .order("display_order", {
                                ascending: true
                            });

                    if (filesError) throw filesError;

                    files = await Promise.all(
                        (filesData || []).map(async file => ({
                            ...file,
                            fileUrl: await getDocumentFileUrl(
                                file.storage_path
                            )
                        }))
                    );
                }

                // Association des fichiers aux documents
                const preparedDocuments = documents.map(document => ({
                    ...document,
                    files: files.filter(
                        file => file.document_id === document.id
                    )
                }));

                renderDocuments(preparedDocuments);

            } catch (error) {

                console.error("Erreur documents :", error);

                documentsContainer.innerHTML = `
                    <div class="documents-empty">
                        <h3>Documents momentanément indisponibles</h3>

                        <p>
                            Les ressources documentaires ne peuvent pas
                            être chargées pour le moment.
                        </p>
                    </div>
                `;
            }
        }

        // Formulaire de demande d'accès
        // Fenêtre centrée pour la demande d'accès : le formulaire y est déplacé,
        // puis remis à sa place à la fermeture.
        let accessDialogHome = null;

        function ensureAccessDialog() {
            let dialog = document.getElementById("accessDialog");

            if (dialog) return dialog;

            dialog = document.createElement("div");
            dialog.id = "accessDialog";
            dialog.className = "access-dialog";
            dialog.hidden = true;
            dialog.innerHTML = `
                <div class="access-dialog-backdrop"></div>
                <div class="access-dialog-box" role="dialog" aria-modal="true"
                    aria-label="Demande d'accès à un document">
                    <button type="button" class="access-dialog-close" aria-label="Fermer">×</button>
                    <div class="access-dialog-body"></div>
                </div>
            `;

            document.body.appendChild(dialog);

            dialog.querySelector(".access-dialog-backdrop")
                .addEventListener("click", closeAccessDialog);
            dialog.querySelector(".access-dialog-close")
                .addEventListener("click", closeAccessDialog);

            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && !dialog.hidden) closeAccessDialog();
            });

            return dialog;
        }

        function openAccessDialog(form, button) {
            const dialog = ensureAccessDialog();

            closeAccessDialog();

            accessDialogHome = {
                form,
                button,
                parent: form.parentNode,
                next: form.nextSibling
            };

            const body = dialog.querySelector(".access-dialog-body");
            body.replaceChildren(form);
            form.hidden = false;

            // Rappel du document concerné en tête de la fenêtre
            const documentTitle =
                button.closest(".document-card")?.querySelector("h3")?.textContent.trim();

            form.querySelector(".document-request-doc")?.remove();

            if (documentTitle) {
                const label = document.createElement("p");
                label.className = "document-request-doc";
                label.textContent = documentTitle;
                form.querySelector("h4").after(label);
            }

            dialog.hidden = false;
            document.body.classList.add("access-open");

            const firstField = form.querySelector("input, textarea");
            if (firstField) firstField.focus();
        }

        function closeAccessDialog() {
            const dialog = document.getElementById("accessDialog");

            if (accessDialogHome) {
                const { form, button, parent, next } = accessDialogHome;

                form.hidden = true;
                parent.insertBefore(form, next);
                if (button) button.textContent = "Demander l'accès";

                accessDialogHome = null;
            }

            if (dialog) dialog.hidden = true;
            document.body.classList.remove("access-open");
        }

        function renderAccessRequestForm(documentId) {

            return `
                <form
                    class="document-request-form"
                    data-document-id="${escapeHTML(documentId)}"
                >

                    <h4>Demander l'accès à ce document</h4>

                    <p class="document-request-note">
                        Votre demande est transmise au BUEP. La réponse
                        vous sera envoyée par e-mail à l'adresse indiquée.
                    </p>

                    <label>
                        Nom et prénoms
                        <input
                            type="text"
                            name="requester_name"
                            required
                            maxlength="150"
                        >
                    </label>

                    <label>
                        Adresse e-mail
                        <input
                            type="email"
                            name="requester_email"
                            required
                            maxlength="254"
                        >
                    </label>

                    <label>
                        Matricule ou identification
                        <input
                            type="text"
                            name="requester_identity"
                            required
                            maxlength="150"
                        >
                    </label>

                    <label>
                        Motif de la demande
                        <textarea
                            name="request_reason"
                            required
                            maxlength="1000"
                            rows="3"
                        ></textarea>
                    </label>

                    <button type="submit">
                        Envoyer la demande
                    </button>

                    <p
                        class="document-request-status"
                        aria-live="polite"
                    ></p>

                </form>
            `;
        }

        // Affichage des documents
        // Filtres : catégorie et type d'accès
        const documentFilters = { category: "all", access: "all" };

        function documentCategoryKey(category) {
            const key = String(category?.name_fr || "Document")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
            return key || "document";
        }

        function buildDocumentFilters(documents) {
            const box = document.getElementById("documentsFilters");
            if (!box) return;

            const categories = new Map();
            documents.forEach(doc => {
                const category = Array.isArray(doc.document_categories)
                    ? doc.document_categories[0]
                    : doc.document_categories;
                const key = documentCategoryKey(category);
                if (!categories.has(key)) {
                    categories.set(key, category?.name_fr || "Document");
                }
            });

            const btn = (key, value, label) => `
                <button class="news-filter${documentFilters[key] === value ? " active" : ""}"
                    type="button" data-doc-filter="${key}" data-value="${escapeHTML(value)}">
                    ${escapeHTML(label)}
                </button>
            `;

            box.hidden = false;
            box.innerHTML = `
                <div class="activity-filter-group">
                    <label class="activity-filter-label" for="documentCategorySelect">Catégorie</label>
                    <select id="documentCategorySelect" class="dynamic-select">
                        <option value="all"${documentFilters.category === "all" ? " selected" : ""}>Toutes les catégories</option>
                        ${[...categories].map(([key, label]) => `
                            <option value="${escapeHTML(key)}"${documentFilters.category === key ? " selected" : ""}>${escapeHTML(label)}</option>
                        `).join("")}
                    </select>
                </div>
                <div class="activity-filter-group">
                    <span class="activity-filter-label">Accès</span>
                    <div class="activity-filter-options">
                    ${btn("access", "all", "Tous")}
                    ${btn("access", "public", "Accès public")}
                    ${btn("access", "conditional", "Sur demande")}
                    </div>
                </div>
            `;

            box.querySelector("#documentCategorySelect")?.addEventListener("change", event => {
                documentFilters.category = event.target.value;
                applyDocumentFilters();
            });

            box.querySelectorAll("[data-doc-filter]").forEach(button => {
                button.addEventListener("click", () => {
                    const key = button.dataset.docFilter;
                    documentFilters[key] = button.dataset.value;
                    box.querySelectorAll(`[data-doc-filter="${key}"]`)
                        .forEach(other => other.classList.toggle("active", other === button));
                    applyDocumentFilters();
                });
            });
        }

        const documentPaging = { limit: PAGE_SIZE, key: "" };

        function applyDocumentFilters() {
            const cards = [...documentsContainer.querySelectorAll(".document-card")];

            // Un changement de filtre repart de la première tranche de 9
            const key = JSON.stringify(documentFilters);
            if (key !== documentPaging.key) {
                documentPaging.limit = PAGE_SIZE;
                documentPaging.key = key;
            }

            const visible = pageElements(
                documentsContainer,
                cards,
                card =>
                    (documentFilters.category === "all" ||
                        card.dataset.category === documentFilters.category) &&
                    (documentFilters.access === "all" ||
                        card.dataset.access === documentFilters.access),
                documentPaging
            );

            let note = documentsContainer.querySelector(".documents-no-match");
            if (cards.length && !visible) {
                if (!note) {
                    note = document.createElement("div");
                    note.className = "documents-empty documents-no-match";
                    note.innerHTML = `
                        <h3>Aucun document pour ce filtre</h3>
                        <p>Essayez une autre catégorie ou un autre type d'accès.</p>
                    `;
                    documentsContainer.appendChild(note);
                }
            } else if (note) {
                note.remove();
            }
        }

        function renderDocuments(documents) {

            if (!documents.length) {

                documentsContainer.innerHTML = `
                    <div class="documents-empty">

                        <div class="empty-icon">✦</div>

                        <h3>Aucun document disponible pour le moment</h3>

                        <p>
                            Les documents publiés par le BUEP seront
                            progressivement classés et présentés
                            dans cet espace.
                        </p>

                    </div>
                `;

                document.getElementById("documentsFilters")?.setAttribute("hidden", "");
                return;
            }

            buildDocumentFilters(documents);

            documentsContainer.innerHTML = documents.map(document => {

                const category = Array.isArray(
                    document.document_categories
                )
                    ? document.document_categories[0]
                    : document.document_categories;

                const isConditional =
                    document.access_type === "conditional";

                const files = (document.files || []).filter(
                    file => file.fileUrl
                );

                return `
                    <article class="document-card"
                        data-category="${escapeHTML(documentCategoryKey(category))}"
                        data-access="${isConditional ? "conditional" : "public"}">

                        <div class="document-card-content">

                            <div class="document-card-header">

                                <span class="document-category">
                                    ${escapeHTML(
                                        category?.name_fr || "Document"
                                    )}
                                </span>

                                <span class="document-access">
                                    ${isConditional
                                        ? "Accès sur demande"
                                        : "Accès public"
                                    }
                                </span>

                            </div>

                            <h3>
                                ${escapeHTML(document.title_fr)}
                            </h3>

                            ${document.description_fr
                                ? `
                                    <p class="document-description">
                                        ${escapeHTML(document.description_fr)}
                                    </p>
                                `
                                : ""
                            }

                            <div class="document-meta">

                                ${document.published_at
                                    ? `
                                        <span>
                                            Publié le
                                            ${escapeHTML(
                                                formatDocumentDate(document.published_at)
                                            )}
                                        </span>
                                    `
                                    : ""
                                }

                                ${document.promotion
                                    ? `
                                        <span>
                                            ${escapeHTML(document.promotion)}
                                        </span>
                                    `
                                    : ""
                                }

                                ${document.study_stream
                                    ? `
                                        <span>
                                            ${escapeHTML(document.study_stream)}
                                        </span>
                                    `
                                    : ""
                                }

                            </div>

                            ${!isConditional && files.length
                                ? `
                                    <div class="document-files">

                                        <h4>Fichiers disponibles</h4>

                                        ${files.map(file => `

                                            <div class="document-file">

                                                <div class="document-file-info">

                                                    <strong>
                                                        ${escapeHTML(
                                                            file.display_file_name ||
                                                            file.original_file_name ||
                                                            "Fichier documentaire"
                                                        )}
                                                    </strong>

                                                    <small>
                                                        ${escapeHTML(
                                                            file.file_extension
                                                                ? file.file_extension.toUpperCase()
                                                                : "Fichier"
                                                        )}

                                                        ${file.file_size
                                                            ? " · " + escapeHTML(
                                                                formatFileSize(file.file_size)
                                                            )
                                                            : ""
                                                        }

                                                        ${file.language_code
                                                            ? " · " + escapeHTML(
                                                                file.language_code.toUpperCase()
                                                            )
                                                            : ""
                                                        }
                                                    </small>

                                                </div>

                                                <div class="document-file-actions">

                                                    <a
                                                        href="${escapeHTML(file.fileUrl)}"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        Consulter
                                                    </a>

                                                    <a
                                                        href="${escapeHTML(file.fileUrl)}"
                                                        download="${escapeHTML(
                                                            file.display_file_name ||
                                                            file.original_file_name ||
                                                            "document"
                                                        )}"
                                                    >
                                                        Télécharger
                                                    </a>

                                                </div>

                                            </div>

                                        `).join("")}

                                    </div>
                                `
                                : ""
                            }

                            ${!isConditional && !files.length
                                ? `
                                    <p class="document-no-file">
                                        Aucun fichier n'est actuellement associé à ce document.
                                    </p>
                                `
                                : ""
                            }

                            ${isConditional
                                ? `
                                    <div class="document-access-request">

                                        <p>
                                            L'accès à cette ressource
                                            nécessite une autorisation
                                            préalable du BUEP.
                                        </p>

                                        <button
                                            type="button"
                                            class="document-request-toggle"
                                        >
                                            Demander l'accès
                                        </button>

                                        ${renderAccessRequestForm(document.id)}

                                    </div>
                                `
                                : ""
                            }

                        </div>

                    </article>
                `;

            }).join("");

            applyDocumentFilters();

            // Gestion de l'ouverture des formulaires
            documentsContainer
                .querySelectorAll(".document-request-form")
                .forEach(form => {
                    form.hidden = true;
                });

            documentsContainer
                .querySelectorAll(".document-request-toggle")
                .forEach(button => {

                    button.addEventListener("click", () => {

                        const form = button.nextElementSibling;

                        if (!form) return;

                        openAccessDialog(form, button);
                    });
                });

            // Envoi des demandes d'accès
            documentsContainer
                .querySelectorAll(".document-request-form")
                .forEach(form => {

                    form.addEventListener("submit", async event => {

                        event.preventDefault();

                        const submitButton =
                            form.querySelector('button[type="submit"]');

                        const statusElement =
                            form.querySelector(".document-request-status");

                        const formData = new FormData(form);

                        const request = {
                            document_id: form.dataset.documentId,
                            requester_name: String(
                                formData.get("requester_name") || ""
                            ).trim(),
                            requester_email: String(
                                formData.get("requester_email") || ""
                            ).trim(),
                            requester_identity: String(
                                formData.get("requester_identity") || ""
                            ).trim(),
                            request_reason: String(
                                formData.get("request_reason") || ""
                            ).trim(),
                            status: "pending",
                            decided_by: null,
                            decided_at: null
                        };

                        if (
                            !request.requester_name ||
                            !request.requester_email ||
                            !request.requester_identity ||
                            !request.request_reason
                        ) {
                            statusElement.textContent =
                                "Veuillez remplir tous les champs.";

                            return;
                        }

                        submitButton.disabled = true;
                        submitButton.textContent = "Envoi en cours...";

                        statusElement.textContent = "";

                        try {

                            const { error } = await supabase
                                .from("document_access_requests")
                                .insert([request]);

                            if (error) throw error;

                            form.reset();

                            statusElement.className = "document-request-status is-success";
                            statusElement.textContent =
                                "Votre demande a été envoyée. Elle sera examinée par le BUEP.";

                            submitButton.textContent = "Demande envoyée";

                        } catch (error) {

                            console.error(
                                "Erreur demande d'accès :",
                                error
                            );

                            statusElement.textContent =
                                "Impossible d'envoyer la demande. Veuillez réessayer.";

                            submitButton.disabled = false;
                            submitButton.textContent = "Envoyer la demande";
                        }
                    });
                });
        }

        loadDocuments();
    }


// ============================================
// 12. FORMULAIRE DE CONTACT
// ============================================

{
    const contactForm = document.getElementById("contactForm");

    if (contactForm) {
        const feedback = document.getElementById("contactFeedback");
        const submitButton = contactForm.querySelector('button[type="submit"]');

        // Pièces jointes : PDF ou image, 5 Mo maximum, 3 fichiers au plus
        const ATTACH_BUCKET = "buep-message-attachments";
        const ATTACH_MAX_SIZE = 5 * 1024 * 1024;
        const ATTACH_MAX_COUNT = 3;
        const ATTACH_EXTENSIONS = {
            "application/pdf": "pdf",
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };
        const attachInput = document.getElementById("contactFiles");
        const attachList = document.getElementById("contactFilesList");
        let selectedFiles = [];

        function newUuid() {
            if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
            });
        }

        function renderAttachments() {
            attachList.innerHTML = selectedFiles.map((file, index) =>
                `<li>
                    <span>${escapeHTML(file.name)}</span>
                    <small>${Math.max(1, Math.round(file.size / 1024))} Ko</small>
                    <button type="button" class="contact-file-remove" data-file-index="${index}" aria-label="Retirer ${escapeHTML(file.name)}">×</button>
                </li>`
            ).join("");
        }

        if (attachInput) {
            attachInput.addEventListener("change", () => {
                const incoming = Array.from(attachInput.files || []);
                const problems = [];

                incoming.forEach(file => {
                    if (!ATTACH_EXTENSIONS[file.type]) {
                        problems.push(`« ${file.name} » : seuls les PDF et les images (JPG, PNG, WebP) sont acceptés.`);
                    } else if (file.size > ATTACH_MAX_SIZE) {
                        problems.push(`« ${file.name} » dépasse 5 Mo.`);
                    } else if (selectedFiles.length >= ATTACH_MAX_COUNT) {
                        problems.push("Trois fichiers au maximum.");
                    } else {
                        selectedFiles.push(file);
                    }
                });

                attachInput.value = "";
                renderAttachments();

                feedback.className = problems.length ? "contact-feedback is-error" : "";
                feedback.textContent = problems.join(" ");
            });

            attachList.addEventListener("click", event => {
                const button = event.target.closest("[data-file-index]");
                if (!button) return;
                selectedFiles.splice(Number(button.dataset.fileIndex), 1);
                renderAttachments();
            });
        }

        contactForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const supabase = window.buepSupabase;

            if (!supabase) {
                feedback.textContent = "Service momentanément indisponible. Veuillez réessayer.";
                return;
            }

            const senderName = document.getElementById("contactName").value.trim();
            const senderEmail = document.getElementById("contactEmail").value.trim();
            const subject = document.getElementById("contactSubject").value.trim();
            const senderPhone = document.getElementById("contactPhone").value.trim();
            const messageBody = document.getElementById("contactMessage").value.trim();

            if (!senderName || !senderEmail || !subject || !messageBody) {
                feedback.textContent = selectedFiles.length
                    ? "Un fichier ne suffit pas : remplissez votre nom, votre e-mail, le sujet et le message avant d'envoyer."
                    : "Veuillez remplir tous les champs.";
                feedback.className = "contact-feedback is-error";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Envoi en cours...";
            feedback.textContent = "";

            try {
                // Les fichiers sont déposés d'abord, puis le message les rattache.
                const uploaded = [];

                for (const file of selectedFiles) {
                    const path = `${newUuid()}/${newUuid()}.${ATTACH_EXTENSIONS[file.type]}`;
                    const { error: uploadError } = await supabase.storage
                        .from(ATTACH_BUCKET)
                        .upload(path, file, { contentType: file.type, cacheControl: "3600" });

                    if (uploadError) throw uploadError;

                    uploaded.push({ path, name: file.name, type: file.type, size: file.size });
                }

                const { data: reference, error } = await supabase.rpc("submit_contact_message", {
                    p_sender_name: senderName,
                    p_sender_email: senderEmail,
                    p_sender_phone: senderPhone || null,
                    p_subject: subject,
                    p_message_body: messageBody,
                    p_attachments: uploaded
                });

                if (error) {
                    throw error;
                }

                contactForm.reset();
                selectedFiles = [];
                renderAttachments();
                feedback.className = "contact-feedback is-success";
                feedback.innerHTML =
                    "Votre message a bien été envoyé. Merci de nous avoir contactés !<br>" +
                    "Votre référence : <strong class=\"ref-code\">" + escapeHTML(reference) + "</strong>. " +
                    "Conservez-la pour suivre votre message sur la page " +
                    "<a href=\"suivi-message.html?ref=" + encodeURIComponent(reference) + "\">Suivre mon message</a>.";

            } catch (error) {
                console.error("Erreur lors de l'envoi du message :", error);
                feedback.className = "contact-feedback is-error";
                feedback.textContent = "L'envoi a échoué. Veuillez réessayer plus tard.";

            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Envoyer le message";
            }
        });
    }
}

});

// =========================================
// 12. MOUVEMENT : transitions entre pages et apparition au défilement
// =========================================

(() => {

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Fondu de sortie avant de quitter une page du site
    document.addEventListener("click", event => {

        const link = event.target.closest("a[href]");

        if (!link || reduceMotion) return;
        if (link.target || link.hasAttribute("download")) return;
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return;

        const url = new URL(link.href, location.href);

        if (url.origin !== location.origin) return;
        if (url.href === location.href) return;

        event.preventDefault();
        document.body.classList.add("is-leaving");

        setTimeout(() => {
            window.location.href = url.href;
        }, 260);
    });

    // Retour depuis l'historique : la page ne doit pas rester invisible
    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-leaving");
    });

    if (reduceMotion || !("IntersectionObserver" in window)) return;

    document.documentElement.classList.add("motion");

    const SELECTORS = [
        "main section:not(.hero) > .container > *",
        "main .on-node",
        "main .album-tile"
    ].join(", ");

    const seen = new WeakSet();

    const io = new IntersectionObserver(entries => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            const el = entry.target;
            el.classList.add("is-visible");
            io.unobserve(el);

            // Une fois l'apparition terminée, l'élément reprend son comportement normal
            // (survol, focus) sans transition résiduelle.
            setTimeout(() => {
                el.removeAttribute("data-reveal");
                el.classList.remove("is-visible");
                el.style.removeProperty("--reveal-delay");
            }, 1400);
        });

    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    function markReveals(scope) {

        scope.querySelectorAll(SELECTORS).forEach(el => {

            if (seen.has(el)) return;
            seen.add(el);

            const siblings = el.parentElement ? [...el.parentElement.children] : [el];
            const index = Math.max(0, siblings.indexOf(el));

            el.setAttribute("data-reveal", "");
            el.style.setProperty("--reveal-delay", `${(index % 6) * 70}ms`);
            io.observe(el);
        });
    }

    const main = document.querySelector("main") || document.body;

    markReveals(main);

    // Contenus chargés après coup (Supabase) : on surveille l'arrivée de nouveaux éléments
    let scheduled = false;

    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            markReveals(main);
        });
    }).observe(main, { childList: true, subtree: true });

})();
