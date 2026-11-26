/* =========================================
   BUEP-ENS/PN — LECTURE D'UNE PUBLICATION
   Affiche une actualité, un communiqué ou une
   annonce (paramètre ?id=...), avec partage.
   ========================================= */

(() => {
    "use strict";

    const supabase = window.buepSupabase;
    const box = document.getElementById("pubContent");

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    function firstOf(value) {
        return Array.isArray(value) ? value[0] : value;
    }

    function formatDate(value) {
        if (!value) return "";
        return new Date(value).toLocaleDateString("fr-FR", {
            day: "2-digit", month: "long", year: "numeric"
        });
    }

    function kindLabel(category) {
        const text = `${category?.slug || ""} ${category?.name || ""}`
            .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        if (text.includes("actualit")) return "Actualité";
        if (text.includes("communiq")) return "Communiqué";
        if (text.includes("annonce")) return "Annonce officielle";
        return category?.name || "Publication";
    }

    function show(html) {
        if (box) box.innerHTML = html;
    }

    function setMeta(title, description) {
        document.title = `${title} | BUEP-ENS/PN`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta && description) meta.setAttribute("content", description.slice(0, 160));
    }

    // Toutes les images de la publication, la principale en premier
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
                .from("buep-publications")
                .createSignedUrl(row.storage_path, 3600);
            return signError ? "" : (signed?.signedUrl || "");
        }));

        return urls.filter(Boolean);
    }

    function paragraphs(text) {
        return String(text || "")
            .split(/\n\s*\n|\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => `<p>${esc(line)}</p>`)
            .join("");
    }

    function shareBar(title) {
        const url = window.location.href;
        const encUrl = encodeURIComponent(url);
        const encTitle = encodeURIComponent(title);

        return `
            <div class="pub-share">
                <h2>Partager cette publication</h2>
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
            const copy = event.target.closest("[data-copy-link]");
            const print = event.target.closest("[data-print]");

            if (print) {
                window.print();
                return;
            }

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

    async function load() {
        const id = new URLSearchParams(window.location.search).get("id");

        if (!id) {
            show(`<div class="pub-state"><p>Publication introuvable.</p></div>`);
            return;
        }

        show(`<div class="pub-state"><p>Chargement de la publication…</p></div>`);

        const { data, error } = await supabase
            .from("contents")
            .select(`
                id, published_at,
                content_translations ( language_code, title, summary, body ),
                publications ( reference, publication_categories ( name, slug ) )
            `)
            .eq("id", id)
            .eq("content_type", "publication")
            .eq("status", "published")
            .maybeSingle();

        if (error) throw error;

        const translations = data?.content_translations || [];
        await window.buepLang.ready;
        const translation = window.buepLang.pick(translations);

        if (!data || !translation) {
            show(`<div class="pub-state"><p>Cette publication n'est pas disponible.</p></div>`);
            return;
        }

        const publication = firstOf(data.publications);
        const category = firstOf(publication?.publication_categories);
        const images = await publicationImages(data.id);

        setMeta(translation.title, translation.summary);

        const cover = images.length
            ? `<figure class="pub-cover" style="--cover: url('${esc(images[0])}')">
                    <a href="${esc(images[0])}" target="_blank" rel="noopener" aria-label="Ouvrir l'image en grand dans un nouvel onglet">
                        <img src="${esc(images[0])}" alt="">
                    </a>
                </figure>`
            : "";

        show(`
            <article class="pub-article">
                <div class="pub-body">
                    <div class="pub-meta">
                        <span class="news-kind-badge">${esc(kindLabel(category))}</span>
                        ${data.published_at ? `<time datetime="${esc(data.published_at)}">${esc(formatDate(data.published_at))}</time>` : ""}
                    </div>

                    <h1 class="pub-title">${esc(translation.title)}</h1>

                    ${translation.summary
                        ? `<p class="pub-summary">${esc(translation.summary)}</p>`
                        : ""
                    }

                    ${cover}

                    <div class="pub-text">${paragraphs(translation.body)}</div>

                    ${images.length > 1
                        ? `<div class="pub-gallery">${images.slice(1).map((url, i) => `
                            <a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Ouvrir l'image ${i + 2}">
                                <img src="${esc(url)}" alt="" loading="lazy">
                            </a>`).join("")}</div>`
                        : ""
                    }

                    ${shareBar(translation.title)}
                </div>
            </article>
        `);

        bindShare();
    }

    if (!supabase) {
        show(`<div class="pub-state"><p>Impossible de charger la publication pour le moment.</p></div>`);
        return;
    }

    load().catch(error => {
        console.error("Erreur publication :", error.message || error);
        show(`<div class="pub-state"><p>Impossible de charger la publication pour le moment.</p></div>`);
    });
})();
