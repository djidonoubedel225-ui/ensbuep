/* =========================================
   BUEP-ENS/PN — DÉTAIL D'UNE ACTIVITÉ OU D'UN PROJET
   Affiche l'activité (paramètre ?id=...) avec
   ses dates, ses objectifs, son bilan, ses images
   et les boutons de partage.
   ========================================= */

(() => {
    "use strict";

    const supabase = window.buepSupabase;
    const box = document.getElementById("actContent");

    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");
    if (menuToggle && mainNav) {
        menuToggle.addEventListener("click", () => {
            const open = mainNav.classList.toggle("open");
            menuToggle.setAttribute("aria-expanded", String(open));
        });
    }

    const STATUS_LABELS = {
        planned: "À venir",
        upcoming: "À venir",
        ongoing: "En cours",
        in_progress: "En cours",
        completed: "Terminée",
        finished: "Terminée",
        postponed: "Reportée",
        cancelled: "Annulée"
    };

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    function firstOf(value) {
        return Array.isArray(value) ? value[0] : value;
    }

    function show(html) {
        if (box) box.innerHTML = html;
    }

    function setMeta(title, description) {
        document.title = `${title} | BUEP-ENS/PN`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta && description) meta.setAttribute("content", description.slice(0, 160));
    }

    /* ----- Dates et heures (format français) ----- */

    function dayLabel(value) {
        return new Date(value).toLocaleDateString("fr-FR", {
            day: "numeric", month: "long", year: "numeric"
        });
    }

    function hasTime(value) {
        const d = new Date(value);
        return d.getHours() !== 0 || d.getMinutes() !== 0;
    }

    function hourLabel(value) {
        const d = new Date(value);
        return `${String(d.getHours()).padStart(2, "0")} h ${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function rangeLabel(start, end) {
        if (!start) return "";

        const sameDay = !end || new Date(start).toDateString() === new Date(end).toDateString();

        if (sameDay) {
            let text = dayLabel(start);
            const times = [];
            if (hasTime(start)) times.push(hourLabel(start));
            if (end && hasTime(end)) times.push(hourLabel(end));
            if (times.length) text += " · " + times.join(" – ");
            return text;
        }

        let text = `Du ${dayLabel(start)}`;
        if (hasTime(start)) text += ` à ${hourLabel(start)}`;
        text += ` au ${dayLabel(end)}`;
        if (hasTime(end)) text += ` à ${hourLabel(end)}`;
        return text;
    }

    function paragraphs(text) {
        return String(text || "")
            .split(/\n\s*\n|\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => `<p>${esc(line)}</p>`)
            .join("");
    }

    function listItems(text) {
        return String(text || "")
            .split(/\n/)
            .map(line => line.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .map(line => `<li>${esc(line)}</li>`)
            .join("");
    }

    /* ----- Données ----- */

    // Toutes les images, la principale en premier
    async function publicationImages(contentId) {
        const { data, error } = await supabase
            .from("content_media")
            .select("storage_path")
            .eq("content_id", contentId)
            .eq("media_type", "image")
            .order("is_main", { ascending: false })
            .order("display_order");

        if (error || !data || !data.length) return [];

        const urls = await Promise.all(data.map(async row => {
            const { data: signed, error: signError } = await supabase.storage
                .from("buep-activities")
                .createSignedUrl(row.storage_path, 3600);
            return signError ? "" : (signed?.signedUrl || "");
        }));

        return urls.filter(Boolean);
    }

    // Nom de la catégorie (facultatif : la page reste complète sans lui)
    async function categoryName(categoryId) {
        if (!categoryId) return "";
        try {
            const { data } = await supabase
                .from("activity_categories")
                .select("name")
                .eq("id", categoryId)
                .maybeSingle();
            return data?.name || "";
        } catch (error) {
            return "";
        }
    }

    /* ----- Partage ----- */

    function shareBar(title, kindWord = "activité") {
        const url = window.location.href;
        const encUrl = encodeURIComponent(url);
        const encTitle = encodeURIComponent(title);

        return `
            <div class="pub-share">
                <h2>Partager ce ${esc(kindWord)}</h2>
                <div class="pub-share-buttons">
                    <button type="button" data-copy-link>Copier le lien</button>
                    <a href="https://wa.me/?text=${encTitle}%20${encUrl}" target="_blank" rel="noopener">WhatsApp</a>
                    <a href="https://www.facebook.com/sharer/sharer.php?u=${encUrl}" target="_blank" rel="noopener">Facebook</a>
                    <a href="mailto:?subject=${encTitle}&body=${encUrl}">E-mail</a>
                    <button type="button" data-print>Imprimer</button>
                </div>
            </div>
        `;
    }

    function bindShare() {
        if (!box) return;

        box.addEventListener("click", async event => {
            if (event.target.closest("[data-print]")) {
                window.print();
                return;
            }

            const copy = event.target.closest("[data-copy-link]");
            if (copy) {
                const url = window.location.href;
                try {
                    await navigator.clipboard.writeText(url);
                    copy.textContent = "Lien copié ✓";
                } catch (error) {
                    window.prompt("Copiez ce lien :", url);
                }
            }
        });
    }

    /* ----- Affichage ----- */

    // Libellés de la page selon le type : activité ou projet
    function setPageKind(isProject) {
        const label = isProject ? "projet" : "activité";
        const title = document.getElementById("actPageTitle");
        const crumb = document.getElementById("actCrumb");
        if (title) title.textContent = isProject ? "Détail du projet" : "Détail de l'activité";
        if (crumb) crumb.textContent = isProject ? "Détail du projet" : "Détail de l'activité";
        return label;
    }

    function fact(label, value) {
        if (!value) return "";
        return `
            <div class="activity-fact">
                <span>${esc(label)}</span>
                <p>${esc(value)}</p>
            </div>
        `;
    }

    async function load() {
        const id = new URLSearchParams(window.location.search).get("id");

        if (!id) {
            show(`<div class="pub-state"><p>Activité introuvable.</p></div>`);
            return;
        }

        show(`<div class="pub-state"><p>Chargement de l'activité…</p></div>`);

        const { data, error } = await supabase
            .from("contents")
            .select(`
                id, published_at,
                content_translations ( language_code, title, summary, body ),
                activities (
                    category_id, is_project, event_status,
                    start_date, end_date, location,
                    objectives_fr, target_audience_fr, bilan_fr
                )
            `)
            .eq("id", id)
            .eq("content_type", "activity")
            .eq("status", "published")
            .maybeSingle();

        if (error) throw error;

        const translations = data?.content_translations || [];
        await window.buepLang.ready;
        const translation = window.buepLang.pick(translations);
        const activity = firstOf(data?.activities);

        if (!data || !translation || !activity) {
            show(`<div class="pub-state"><p>Cette activité n'est pas disponible.</p></div>`);
            return;
        }

        const [images, category] = await Promise.all([
            publicationImages(data.id),
            categoryName(activity.category_id)
        ]);

        const kindWord = setPageKind(activity.is_project === true);
        const statusLabel = STATUS_LABELS[activity.event_status] || "";
        const typeLabel = activity.is_project ? "Projet" : "Activité";
        const period = rangeLabel(activity.start_date, activity.end_date);

        setMeta(translation.title, translation.summary || translation.body);

        const cover = images.length
            ? `<figure class="pub-cover" style="--cover: url('${esc(images[0])}')">
                    <a href="${esc(images[0])}" target="_blank" rel="noopener" aria-label="Ouvrir l'image en grand dans un nouvel onglet">
                        <img src="${esc(images[0])}" alt="">
                    </a>
                </figure>`
            : "";

        const objectives = listItems(activity.objectives_fr);
        const report = paragraphs(activity.bilan_fr);

        show(`
            <article class="pub-article">
                <div class="pub-body">

                    <div class="pub-meta">
                        <span class="news-kind-badge">${esc(typeLabel)}</span>
                        ${statusLabel ? `<span class="activity-status">${esc(statusLabel)}</span>` : ""}
                    </div>

                    <h1 class="pub-title">${esc(translation.title)}</h1>

                    ${translation.summary
                        ? `<p class="pub-summary">${esc(translation.summary)}</p>`
                        : ""
                    }

                    ${cover}

                    <div class="activity-facts">
                        ${fact("Date", period)}
                        ${fact("Lieu", activity.location)}
                        ${fact("Public cible", activity.target_audience_fr)}
                        ${fact("Catégorie", category)}
                    </div>

                    ${objectives
                        ? `<section class="act-section">
                                <h2>Objectifs</h2>
                                <ul class="act-list">${objectives}</ul>
                           </section>`
                        : ""
                    }

                    ${translation.body
                        ? `<section class="act-section">
                                <h2>Présentation</h2>
                                <div class="pub-text">${paragraphs(translation.body)}</div>
                           </section>`
                        : ""
                    }

                    ${report
                        ? `<section class="act-section">
                                <h2>Bilan</h2>
                                <div class="pub-text">${report}</div>
                           </section>`
                        : ""
                    }

                    ${images.length > 1
                        ? `<div class="pub-gallery">${images.slice(1).map((url, i) => `
                            <a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Ouvrir l'image ${i + 2}">
                                <img src="${esc(url)}" alt="" loading="lazy">
                            </a>`).join("")}</div>`
                        : ""
                    }

                    ${shareBar(translation.title, kindWord)}

                </div>
            </article>
        `);

        bindShare();
    }

    if (!supabase) {
        show(`<div class="pub-state"><p>Impossible de charger l'activité pour le moment.</p></div>`);
        return;
    }

    load().catch(error => {
        console.error("Erreur activité :", error.message || error);
        show(`<div class="pub-state"><p>Impossible de charger l'activité pour le moment.</p></div>`);
    });
})();
