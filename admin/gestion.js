(() => {
"use strict";

/* =========================================
CONFIGURATION GENERALE
========================================= */

const supabase = window.buepSupabase;
const $ = id => document.getElementById(id);

const loadingScreen = $("loadingScreen");
const application = $("application");
const errorScreen = $("errorScreen");
const moduleContent = $("moduleContent");
const moduleNavigation = $("moduleNavigation");

const moduleParam = new URLSearchParams(location.search).get("module");
const excludedModules = ["administration", "organigram"];

let currentProfile = null;
let availableModules = [];
let currentModule = null;
let permissions = {};

let activityCategories = [];
let academicYears = [];
let activitiesCache = [];
let archivedActivitiesCache = [];
let currentStepActivity = null;

let documentCategories = [];
let documentsCache = [];
let documentFilesCache = [];
let currentDocumentFiles = [];

let settingsCache = {};
let settingsPermissions = {
view: false,
edit: false
};

const DOCUMENT_BUCKET_PUBLIC = "buep-documents-public";
const DOCUMENT_BUCKET_PRIVATE = "buep-documents-private";
const SETTINGS_BUCKET = "buep-public-assets";

const moduleIcons = {
activities: "◈",
publications: "▤",
documents: "▧",
gallery: "▣",
clubs: "♧",
messages: "✉",
navigation: "☷",
settings: "⚙",
statistics: "▥"
};

const moduleDescriptions = {
activities: "Administration des activités, projets, étapes et bilans du BUEP.",
publications: "Gestion des publications, annonces et communications institutionnelles.",
documents: "Organisation des documents, catégories et fichiers téléchargeables.",
gallery: "Gestion des albums, photos, vidéos et catégories de la galerie.",
clubs: "Administration des clubs, de leurs activités et de leurs publications.",
messages: "Consultation et suivi des messages reçus par le BUEP.",
navigation: "Organisation des menus et des éléments de navigation du site.",
settings: "Configuration générale du portail, des langues et de la page d'accueil.",
statistics: "Consultation des statistiques de fréquentation et de téléchargement."
};

/* =========================================
OUTILS GENERAUX
========================================= */

function showError(message) {
if(loadingScreen) loadingScreen.style.display = "none";
if(application) application.style.display = "none";
if(!errorScreen) return;

errorScreen.style.display = "block";  
errorScreen.replaceChildren();  

const box = document.createElement("div");  
box.className = "error-box";  

const h = document.createElement("h2");  
h.textContent = "Accès indisponible";  

const p = document.createElement("p");  
p.textContent = message;  

const back = document.createElement("p");  
back.style.marginTop = "18px";  

const link = document.createElement("a");  
link.href = "gestion.html";  
link.textContent = "Retour au tableau de bord";  
link.style.color = "#0b1f3a";  
link.style.fontWeight = "bold";  

back.appendChild(link);  
box.append(h, p, back);  
errorScreen.appendChild(box);

}

function requireElement(id) {
const element = $(id);

if(!element) {  
    throw new Error(`Élément HTML introuvable : ${id}`);  
}  

return element;

}

async function getSession() {
const {data, error} = await supabase.auth.getSession();

if(error) throw error;  

if(!data.session) {  
    location.replace("connexion.html");  
    return null;  
}  

return data.session;

}

async function loadProfile(userId) {
const {data, error} = await supabase
.from("profiles")
.select("user_id,display_name,email,photo_path,is_principal_admin,account_status")
.eq("user_id", userId)
.single();

if(error) throw error;  

if(!data || data.account_status !== "active") {  
    throw new Error("Votre compte administrateur n'est pas actif.");  
}  

currentProfile = data;  

requireElement("profileName").textContent =  
    data.display_name || "Administrateur";  

requireElement("profileRole").textContent =  
    data.is_principal_admin  
        ? "Administrateur principal"  
        : "Administrateur";  

const avatar = requireElement("profileAvatar");  

const initials = (data.display_name || "B")  
    .trim()  
    .split(/\s+/)  
    .map(x => x.charAt(0))  
    .join("")  
    .substring(0, 2)  
    .toUpperCase();  

avatar.textContent = initials || "B";  

if(data.photo_path) {  
    const {data: photo} = supabase.storage  
        .from("admin-photos")  
        .getPublicUrl(data.photo_path);  

    if(photo?.publicUrl) {  
        const img = document.createElement("img");  
        img.src = photo.publicUrl;  
        img.alt = "Photo de profil";  

        img.onerror = () => {  
            img.remove();  
            avatar.textContent = initials || "B";  
        };  

        avatar.textContent = "";  
        avatar.appendChild(img);  
    }  
}

}

/* =========================================
   SUPPRESSIONS CONTRÔLÉES
   Toutes les suppressions de l'administration passent par la fonction SQL
   admin_delete_rows : elle vérifie le droit et renvoie le nombre de lignes
   réellement effacées (une suppression refusée n'est jamais signalée comme réussie).
========================================= */

async function deleteChecked(table, column, value, moduleSlug) {
    const values = Array.isArray(value) ? value.map(String) : [String(value)];

    if(!values.length) {
        return { data: [], error: null };
    }

    const { data, error } = await supabase.rpc("admin_delete_rows", {
        p_module: moduleSlug,
        p_table: table,
        p_column: column,
        p_values: values
    });

    if(error) return { data: null, error };

    // Liste de même longueur que les lignes effacées, comme avec .select("id").
    return {
        data: Array.from({ length: Number(data) || 0 }, () => ({ id: null })),
        error: null
    };
}

async function hasPermission(slug, action) {
if(currentProfile?.is_principal_admin) return true;

const {data, error} = await supabase.rpc("has_permission", {  
    p_module_slug: slug,  
    p_action_key: action  
});  

if(error) throw error;  

return data === true;

}

async function loadModules() {
const {data, error} = await supabase
.from("modules")
.select("id,name,slug,description")
.eq("is_active", true)
.order("name");

if(error) throw error;  

const results = await Promise.all((data || []).map(async module => {  
    if(excludedModules.includes(module.slug)) return null;  

    return await hasPermission(module.slug, "view")  
        ? module  
        : null;  
}));  

availableModules = results.filter(Boolean);

}

function renderNavigation() {
if(!moduleNavigation) return;

const dashboard = moduleNavigation.querySelector(  
    'a[href="gestion.html"]'  
);  

moduleNavigation.innerHTML = "";  

if(dashboard) {
    moduleNavigation.appendChild(dashboard);
    dashboard.classList.toggle("active", !currentModule);
}  

availableModules.forEach(module => {  
    const link = document.createElement("a");  
    link.className = "nav-link";  

    if(currentModule && module.slug === currentModule.slug) {  
        link.classList.add("active");  
    }  

    link.href = moduleHref(module.slug);  

    const icon = document.createElement("span");  
    icon.className = "nav-icon";  
    icon.textContent = moduleIcons[module.slug] || "•";  

    const label = document.createElement("span");  
    label.textContent = module.name;  

    link.append(icon, label);  
    moduleNavigation.appendChild(link);  
});

}

function openModal(id) {
const modal = $(id);
if(modal) modal.classList.add("show");
}

function closeModal(id) {
const modal = $(id);
if(modal) modal.classList.remove("show");
}

document.querySelectorAll("[data-close]").forEach(button => {
button.addEventListener("click", () => {
closeModal(button.dataset.close);
});
});

document.querySelectorAll(".modal").forEach(modal => {
modal.addEventListener("click", event => {
if(event.target === modal) {
modal.classList.remove("show");
}
});
});

function escapeHTML(value) {
return String(value ?? "").replace(/[&<>"']/g, char => ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
}[char]));
}

function statusLabel(status) {
return {
upcoming: "À venir",
ongoing: "En cours",
completed: "Terminée",
postponed: "Reportée",
cancelled: "Annulée",
draft: "Brouillon",
scheduled: "Programmée",
published: "Publiée",
archived: "Archivée",
pending: "En attente",
public: "Public",
conditional: "Conditionnel"
}[status] || status || "—";
}

function formatDate(value) {
if(!value) return "—";

const date = new Date(value);  

if(Number.isNaN(date.getTime())) return "—";  

return date.toLocaleDateString("fr-FR");

}

function formatFileSize(bytes) {
if(bytes === null || bytes === undefined) return "—";

const size = Number(bytes);  

if(!Number.isFinite(size)) return "—";  
if(size < 1024) return size + " o";  
if(size < 1024 * 1024) return (size / 1024).toFixed(1) + " Ko";  

return (size / (1024 * 1024)).toFixed(2) + " Mo";

}

function toLocalInput(value) {
if(!value) return "";

const date = new Date(value);  

if(Number.isNaN(date.getTime())) return "";  

const local = new Date(  
    date.getTime() - date.getTimezoneOffset() * 60000  
);  

return local.toISOString().slice(0, 16);

}

function fromLocalInput(value) {
if(!value) return null;

const date = new Date(value);  

if(Number.isNaN(date.getTime())) {  
    throw new Error("Date invalide.");  
}  

return date.toISOString();

}

function slugify(value) {
return String(value || "")
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-|-$/g, "");
}

function safeFileName(name) {
return String(name || "document")
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[^a-zA-Z0-9.-]/g, "")
.replace(/_+/g, "_");
}

function getDocumentBucket(accessType) {
return accessType === "conditional"
? DOCUMENT_BUCKET_PRIVATE
: DOCUMENT_BUCKET_PUBLIC;
}

/* =========================================
MODULE ACTIVITES : RESSOURCES
========================================= */

async function loadActivityResources() {
const [categoriesResult, yearsResult] = await Promise.all([
supabase.from("activity_categories")
.select("id,name,slug,is_active,display_order")
.order("display_order"),

supabase.from("academic_years")  
        .select("id,label,is_current,start_date,end_date")  
        .order("start_date", {ascending: false})  
]);  

if(categoriesResult.error) throw categoriesResult.error;  
if(yearsResult.error) throw yearsResult.error;  

const allCategories = categoriesResult.data || [];  

activityCategories = allCategories;  

const activeCategories = allCategories.filter(c => c.is_active);  

requireElement("activityCategory").innerHTML =  
    activeCategories.map(c => `  
        <option value="${escapeHTML(c.id)}">  
            ${escapeHTML(c.name)}  
        </option>  
    `).join("");  

academicYears = yearsResult.data || [];  

requireElement("activityYear").innerHTML =  
    '<option value="">Non précisée</option>' +  
    academicYears.map(y => `  
        <option value="${escapeHTML(y.id)}">  
            ${escapeHTML(y.label)}${y.is_current ? " (en cours)" : ""}  
        </option>  
    `).join("");

}

/* =========================================
MODULE ACTIVITES : CHARGEMENT
========================================= */

async function loadActivities() {
const {data, error} = await supabase
.from("activities")
.select("content_id,category_id,academic_year_id,is_project,event_status,start_date,end_date,location,objectives_fr,objectives_en,target_audience_fr,target_audience_en,bilan_fr,bilan_en,created_at")
.order("created_at", {ascending: false});

if(error) throw error;  

const rows = data || [];  
const ids = rows.map(row => row.content_id);  

let contents = [];  
let translations = [];  

if(ids.length) {  
    const [contentResult, translationResult] = await Promise.all([  
        supabase.from("contents")  
            .select("id,status,priority,is_featured,created_at,archived_at,published_at")  
            .in("id", ids),  

        supabase.from("content_translations")  
            .select("id,content_id,language_code,title,summary,body")  
            .in("content_id", ids)  
    ]);  

    if(contentResult.error) throw contentResult.error;  
    if(translationResult.error) throw translationResult.error;  

    contents = contentResult.data || [];  
    translations = translationResult.data || [];  
}  

const allItems = rows.map(activity => {  
    const content = contents.find(  
        c => c.id === activity.content_id  
    ) || {};  

    const fr = translations.find(  
        t => t.content_id === activity.content_id &&  
             t.language_code === "fr"  
    ) || {};  

    const en = translations.find(  
        t => t.content_id === activity.content_id &&  
             t.language_code === "en"  
    ) || {};  

    const category = activityCategories.find(  
        c => c.id === activity.category_id  
    );  

    const year = academicYears.find(  
        y => y.id === activity.academic_year_id  
    );  

    return {  
        ...activity,  
        ...content,  
        fr,  
        en,  
        categoryName: category?.name || "Catégorie inconnue",  
        yearLabel: year?.label || ""  
    };  
});  

activitiesCache = allItems.filter(  
    item => item.status !== "archived"  
);  

archivedActivitiesCache = allItems.filter(  
    item => item.status === "archived"  
);  

renderActivities();  
renderArchivedActivities();

}

/* =========================================
MODULE ACTIVITES : AFFICHAGE
========================================= */

function renderActivities() {
const search = $("activitySearch")?.value.toLowerCase() || "";
const filter = $("activityFilter")?.value || "all";

const rows = activitiesCache.filter(item => {  
    const matchesSearch =  
        (item.fr.title || "").toLowerCase().includes(search) ||  
        (item.location || "").toLowerCase().includes(search);  

    const matchesFilter =  
        filter === "all" ||  
        (filter === "project" && item.is_project) ||  
        (filter === "activity" && !item.is_project) ||  
        filter === item.status ||  
        filter === item.event_status;  

    return matchesSearch && matchesFilter;  
});  

const body = $("activitiesTableBody");  
if(!body) return;  

if(!rows.length) {  
    body.innerHTML = `  
        <tr>  
            <td colspan="6" class="empty-state">  
                Aucune activité ou projet trouvé.  
            </td>  
        </tr>  
    `;  
    return;  
}  

body.innerHTML = rows.map(item => {  
    const title = escapeHTML(item.fr.title || "Sans titre");  
    const status = item.status || "draft";  

    return `  
    <tr>  
        <td>  
            <strong>${title}</strong><br>  
            <small>${escapeHTML(item.yearLabel)}</small>  
        </td>  

        <td>  
            ${item.is_project ? "Projet" : "Activité"}<br>  
            <small>${escapeHTML(item.categoryName)}</small>  
        </td>  

        <td>  
            <span class="badge ${escapeHTML(item.event_status)}">  
                ${escapeHTML(statusLabel(item.event_status))}  
            </span>  
        </td>  

        <td>  
            <span class="badge ${escapeHTML(status)}">  
                ${escapeHTML(statusLabel(status))}  
            </span>  
        </td>  

        <td>${formatDate(item.start_date)}</td>  

        <td>  
            <div class="actions">  
                ${permissions.edit ? `  
                    <button class="btn btn-light"  
                        data-edit="${escapeHTML(item.content_id)}">  
                        Modifier  
                    </button>  
                ` : ""}  

                ${permissions.edit && item.is_project ? `  
                    <button class="btn btn-gold"  
                        data-steps="${escapeHTML(item.content_id)}">  
                        Étapes  
                    </button>  
                ` : ""}  

                ${permissions.publish ? `  
                    <button class="btn ${status === "published" ? "btn-light" : "btn-success"}"  
                        data-publish="${escapeHTML(item.content_id)}">  
                        ${status === "published" ? "Dépublier" : "Publier"}  
                    </button>  
                ` : ""}  

                ${permissions.edit ? `  
                    <button class="btn btn-danger"  
                        data-archive="${escapeHTML(item.content_id)}">  
                        Archiver  
                    </button>  
                ` : ""}  

                ${permissions.delete ? `  
                    <button class="btn btn-danger"  
                        data-delete="${escapeHTML(item.content_id)}">  
                        Supprimer  
                    </button>  
                ` : ""}  
            </div>  
        </td>  
    </tr>`;  
}).join("");  

body.querySelectorAll("[data-edit]").forEach(button => {  
    button.addEventListener("click", () => {  
        editActivity(button.dataset.edit);  
    });  
});  

body.querySelectorAll("[data-publish]").forEach(button => {  
    button.addEventListener("click", () => {  
        togglePublication(button.dataset.publish);  
    });  
});  

body.querySelectorAll("[data-archive]").forEach(button => {  
    button.addEventListener("click", () => {  
        archiveActivity(button.dataset.archive);  
    });  
});  

body.querySelectorAll("[data-delete]").forEach(button => {  
    button.addEventListener("click", () => {  
        deleteActivity(button.dataset.delete);  
    });  
});  

body.querySelectorAll("[data-steps]").forEach(button => {  
    button.addEventListener("click", () => {  
        openSteps(button.dataset.steps);  
    });  
});

}

function renderArchivedActivities() {
const body = $("archivedActivitiesTableBody");
const count = $("archivedActivitiesCount");

if(!body) return;  

if(count) {  
    count.textContent = archivedActivitiesCache.length;  
}  

if(!archivedActivitiesCache.length) {  
    body.innerHTML = `  
        <tr>  
            <td colspan="5" class="empty-state">  
                Aucun contenu archivé pour le moment.  
            </td>  
        </tr>  
    `;  
    return;  
}  

body.innerHTML = archivedActivitiesCache.map(item => `  
    <tr>  
        <td>  
            <strong>${escapeHTML(item.fr.title || "Sans titre")}</strong>  
        </td>  

        <td>${item.is_project ? "Projet" : "Activité"}</td>  

        <td>${escapeHTML(item.categoryName)}</td>  

        <td>${formatDate(item.archived_at)}</td>  

        <td>  
            <div class="actions">  
                ${permissions.edit ? `  
                    <button class="btn btn-success"  
                        data-restore="${escapeHTML(item.content_id)}">  
                        Restaurer  
                    </button>  
                ` : ""}  

                ${permissions.delete ? `  
                    <button class="btn btn-danger"  
                        data-delete-archived="${escapeHTML(item.content_id)}">  
                        Supprimer définitivement  
                    </button>  
                ` : ""}  
            </div>  
        </td>  
    </tr>  
`).join("");  

body.querySelectorAll("[data-restore]").forEach(button => {  
    button.addEventListener("click", () => {  
        restoreActivity(button.dataset.restore);  
    });  
});  

body.querySelectorAll("[data-delete-archived]").forEach(button => {  
    button.addEventListener("click", () => {  
        deleteActivity(button.dataset.deleteArchived);  
    });  
});

}

/* =========================================
MODULE ACTIVITES : FORMULAIRE
========================================= */

function resetActivityForm() {
requireElement("activityForm").reset();

$("activityContentId").value = "";  
$("activityModalTitle").textContent = "Nouvelle activité";  
$("activityType").value = "false";  
$("activityStatus").value = "upcoming";  
$("activityPriority").value = "normal";
resetImageInput(IMAGE_KINDS.activity);
loadContentImages(IMAGE_KINDS.activity, null);

}

function fillActivityForm(item) {
$("activityContentId").value = item.content_id;
$("activityTitleFr").value = item.fr.title || "";
$("activityTitleEn").value = item.en.title || "";
$("activityCategory").value = item.category_id || "";
$("activityYear").value = item.academic_year_id || "";
$("activityType").value = String(item.is_project);
$("activityStatus").value = item.event_status;
$("activityPriority").value = item.priority || "normal";
$("activityLocation").value = item.location || "";
$("activityStart").value = toLocalInput(item.start_date);
$("activityEnd").value = toLocalInput(item.end_date);
$("activitySummaryFr").value = item.fr.summary || "";
$("activityBodyFr").value = item.fr.body || "";
$("activitySummaryEn").value = item.en.summary || "";
$("activityBodyEn").value = item.en.body || "";
$("activityObjectivesFr").value = item.objectives_fr || "";
$("activityObjectivesEn").value = item.objectives_en || "";
$("activityAudienceFr").value = item.target_audience_fr || "";
$("activityAudienceEn").value = item.target_audience_en || "";
$("activityReportFr").value = item.bilan_fr || "";
$("activityReportEn").value = item.bilan_en || "";
$("activityModalTitle").textContent = "Modifier l'activité";
resetImageInput(IMAGE_KINDS.activity);
loadContentImages(IMAGE_KINDS.activity, item.content_id);
}

function editActivity(id) {
const item = activitiesCache.find(x => x.content_id === id);

if(!item) return;  

fillActivityForm(item);  
openModal("activityModal");

}

async function saveTranslation(contentId, language, title, summary, body) {
if(!title.trim() && !body.trim()) return;

const {data: existing, error: findError} = await supabase  
    .from("content_translations")  
    .select("id")  
    .eq("content_id", contentId)  
    .eq("language_code", language)  
    .maybeSingle();  

if(findError) throw findError;  

const payload = {  
    content_id: contentId,  
    language_code: language,  
    title: title.trim() || "Sans titre",  
    summary: summary.trim() || null,  
    body: body.trim()  
};  

if(existing) {  
    const {error} = await supabase  
        .from("content_translations")  
        .update(payload)  
        .eq("id", existing.id);  

    if(error) throw error;  
} else {  
    const {error} = await supabase  
        .from("content_translations")  
        .insert(payload);  

    if(error) throw error;  
}

}

async function saveActivity(event) {
event.preventDefault();

const contentId = $("activityContentId").value;  

if(!contentId && !permissions.create) {  
    return alert("Vous ne disposez pas de l'autorisation de création.");  
}  

if(contentId && !permissions.edit) {  
    return alert("Vous ne disposez pas de l'autorisation de modification.");  
}  

const start = $("activityStart").value;  
const end = $("activityEnd").value;  

if(start && end && new Date(end) < new Date(start)) {  
    return alert("La date de fin doit être postérieure à la date de début.");  
}  

const button = $("saveActivityButton");  
button.disabled = true;  
button.textContent = "Enregistrement...";  

try {  
    const isProject = $("activityType").value === "true";  

    const contentPayload = {  
        content_type: "activity",  
        priority: $("activityPriority").value,  
        updated_by: currentProfile.user_id,  
        editor_display_name: currentProfile.display_name || "Administrateur",  
        updated_at: new Date().toISOString()  
    };  

    let id = contentId;  

    if(!id) {  
        Object.assign(contentPayload, {  
            status: "draft",  
            created_by: currentProfile.user_id,  
            author_display_name: currentProfile.display_name || "Administrateur"  
        });  

        const {data, error} = await supabase  
            .from("contents")  
            .insert(contentPayload)  
            .select("id")  
            .single();  

        if(error) throw error;  

        id = data.id;  
    } else {  
        const {error} = await supabase  
            .from("contents")  
            .update(contentPayload)  
            .eq("id", id);  

        if(error) throw error;  
    }  

    await saveTranslation(  
        id,  
        "fr",  
        $("activityTitleFr").value,  
        $("activitySummaryFr").value,  
        $("activityBodyFr").value  
    );  

    if(  
        $("activityTitleEn").value.trim() ||  
        $("activityBodyEn").value.trim()  
    ) {  
        await saveTranslation(  
            id,  
            "en",  
            $("activityTitleEn").value,  
            $("activitySummaryEn").value,  
            $("activityBodyEn").value  
        );  
    }  

    const payload = {  
        content_id: id,  
        category_id: $("activityCategory").value,  
        academic_year_id: $("activityYear").value || null,  
        is_project: isProject,  
        event_status: $("activityStatus").value,  
        start_date: fromLocalInput(start),  
        end_date: fromLocalInput(end),  
        location: $("activityLocation").value.trim() || null,  
        objectives_fr: $("activityObjectivesFr").value.trim() || null,  
        objectives_en: $("activityObjectivesEn").value.trim() || null,  
        target_audience_fr: $("activityAudienceFr").value.trim() || null,  
        target_audience_en: $("activityAudienceEn").value.trim() || null,  
        bilan_fr: $("activityReportFr").value.trim() || null,  
        bilan_en: $("activityReportEn").value.trim() || null  
    };  

    const result = contentId  
        ? await supabase.from("activities").update(payload).eq("content_id", id)  
        : await supabase.from("activities").insert(payload);  

    if(result.error) throw result.error;  

    const activityImageFiles = imageSelectedFiles(IMAGE_KINDS.activity);
    if(activityImageFiles.length) {
        await uploadContentImages(IMAGE_KINDS.activity, id, activityImageFiles);
    }

    closeModal("activityModal");  
    resetActivityForm();  

    await loadActivities();  

    alert("Enregistrement effectué.");  

} catch(error) {  
    console.error(error);  
    alert("Erreur lors de l'enregistrement : " + error.message);  

} finally {  
    button.disabled = false;  
    button.textContent = "Enregistrer";  
}

}

/* =========================================
MODULE ACTIVITES : PUBLICATION
========================================= */

async function togglePublication(id) {
if(!permissions.publish) {
return alert("Vous ne disposez pas du droit de publication.");
}

const item = activitiesCache.find(x => x.content_id === id);  
if(!item) return;  

const publish = item.status !== "published";  

if(!confirm(  
    publish  
        ? "Publier cette activité ?"  
        : "Retirer cette activité de la publication ?"  
)) return;  

const payload = publish ? {  
    status: "published",  
    published_at: new Date().toISOString(),  
    published_by: currentProfile.user_id,  
    publisher_display_name: currentProfile.display_name || "Administrateur"  
} : {  
    status: "draft",  
    published_at: null  
};  

const {error} = await supabase  
    .from("contents")  
    .update(payload)  
    .eq("id", id);  

if(error) {  
    return alert("Impossible de modifier la publication : " + error.message);  
}  

await loadActivities();

}

async function archiveActivity(id) {
if(!permissions.edit) {
return alert("Vous ne disposez pas du droit d'archivage.");
}

if(!confirm("Archiver ce contenu ? Ses données seront conservées.")) return;  

const {error} = await supabase  
    .from("contents")  
    .update({  
        status: "archived",  
        archived_at: new Date().toISOString(),  
        updated_by: currentProfile.user_id,  
        editor_display_name: currentProfile.display_name || "Administrateur",  
        updated_at: new Date().toISOString()  
    })  
    .eq("id", id);  

if(error) {  
    return alert("Archivage impossible : " + error.message);  
}  

await loadActivities();  
alert("Contenu archivé avec succès.");

}

async function restoreActivity(id) {
if(!permissions.edit) {
return alert("Vous ne disposez pas du droit de restauration.");
}

const item = archivedActivitiesCache.find(x => x.content_id === id);  
if(!item) return;  

if(!confirm(`Restaurer « ${item.fr.title || "ce contenu"} » ?`)) return;  

const {error} = await supabase  
    .from("contents")  
    .update({  
        status: "draft",  
        archived_at: null,  
        published_at: null,  
        updated_by: currentProfile.user_id,  
        editor_display_name: currentProfile.display_name || "Administrateur",  
        updated_at: new Date().toISOString()  
    })  
    .eq("id", id);  

if(error) {  
    return alert("Restauration impossible : " + error.message);  
}  

await loadActivities();  
alert("Contenu restauré en brouillon.");

}

async function deleteActivity(id) {
if(!permissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const item =  
    activitiesCache.find(x => x.content_id === id) ||  
    archivedActivitiesCache.find(x => x.content_id === id);  

if(!item) return;  

const type = item.is_project ? "projet" : "activité";  

if(!confirm(  
    "ATTENTION : SUPPRESSION DEFINITIVE\n\n" +  
    `Voulez-vous vraiment supprimer ${type} « ${item.fr.title || "ce contenu"} » ?\n\n` +  
    "Les étapes et données associées seront également supprimées."  
)) return;  

try {  
    const {error} = await supabase.rpc(  
        "delete_activity_completely",  
        {p_content_id: id}  
    );  

    if(error) throw error;  

    await loadActivities();  
    alert("Contenu supprimé définitivement.");  

} catch(error) {  
    alert("La suppression a échoué : " + error.message);  
}

}

/* =========================================
ETAPES DES PROJETS
========================================= */

async function openSteps(contentId) {
if(!permissions.edit) return;

currentStepActivity = contentId;  

openModal("stepsModal");  

$("stepsContent").innerHTML =  
    '<p class="empty-state">Chargement des étapes...</p>';  

try {  
    await renderSteps();  
} catch(error) {  
    $("stepsContent").textContent =  
        "Impossible de charger les étapes : " + error.message;  
}

}

async function renderSteps() {
const {data, error} = await supabase
.from("project_steps")
.select("id,activity_id,title_fr,title_en,description_fr,description_en,planned_date,effective_date,status,display_order")
.eq("activity_id", currentStepActivity)
.order("display_order");

if(error) throw error;  

const steps = data || [];  

$("stepsContent").innerHTML = `  
<div class="steps-box">  
    <h3 class="section-title">Étapes enregistrées (${steps.length})</h3>  

    ${steps.length ? steps.map(step => `  
        <div class="step-item">  
            <strong>${escapeHTML(step.title_fr)}</strong>  

            <p>${escapeHTML(step.description_fr || "Aucune description")}</p>  

            <p>  
                Prévue : ${formatDate(step.planned_date)}  
                · Réalisée : ${formatDate(step.effective_date)}  
            </p>  

            <p>  
                <span class="badge ${escapeHTML(step.status)}">  
                    ${escapeHTML(statusLabel(step.status))}  
                </span>  
            </p>  

            <div class="actions" style="margin-top:9px">  
                ${permissions.edit ? `  
                    <button class="btn btn-light"  
                        data-step-edit="${escapeHTML(step.id)}">  
                        Modifier  
                    </button>  
                ` : ""}  

                ${permissions.delete ? `  
                    <button class="btn btn-danger"  
                        data-step-delete="${escapeHTML(step.id)}">  
                        Supprimer  
                    </button>  
                ` : ""}  
            </div>  
        </div>  
    `).join("") : `  
        <p class="empty-state">Aucune étape enregistrée.</p>  
    `}  
</div>  

${permissions.edit ? `  
<div class="step-form">  
    <h3 class="section-title" id="stepFormTitle">Ajouter une étape</h3>  

    <form id="stepForm">  
        <input type="hidden" id="stepId">  

        <div class="form-grid">  
            <div class="form-group">  
                <label for="stepTitle">Titre *</label>  
                <input id="stepTitle" required maxlength="250">  
            </div>  

            <div class="form-group">  
                <label for="stepTitleEn">Titre en anglais</label>  
                <input id="stepTitleEn" maxlength="250">  
            </div>  

            <div class="form-group">  
                <label for="stepPlanned">Date prévue</label>  
                <input id="stepPlanned" type="date">  
            </div>  

            <div class="form-group">  
                <label for="stepEffective">Date effective</label>  
                <input id="stepEffective" type="date">  
            </div>  

            <div class="form-group">  
                <label for="stepStatus">Statut</label>  
                <select id="stepStatus">  
                    <option value="pending">En attente</option>  
                    <option value="ongoing">En cours</option>  
                    <option value="completed">Terminée</option>  
                    <option value="postponed">Reportée</option>  
                    <option value="cancelled">Annulée</option>  
                </select>  
            </div>  
        </div>  

        <div class="form-group">  
            <label for="stepDescription">Description</label>  
            <textarea id="stepDescription"></textarea>  
        </div>  

        <div class="form-group">  
            <label for="stepDescriptionEn">Description en anglais</label>  
            <textarea id="stepDescriptionEn"></textarea>  
        </div>  

        <button class="btn btn-primary" type="submit" id="saveStepButton">  
            Enregistrer l'étape  
        </button>  

        <button class="btn btn-light" type="button" id="cancelStepEdit"  
            style="display:none">  
            Annuler la modification  
        </button>  
    </form>  
</div>  
` : ""}  
`;  

if(permissions.edit) {  
    $("stepForm").addEventListener("submit", saveStep);  
    $("cancelStepEdit").addEventListener("click", resetStepForm);  
}  

$("stepsContent").querySelectorAll("[data-step-edit]").forEach(button => {  
    button.addEventListener("click", () => {  
        editStep(steps, button.dataset.stepEdit);  
    });  
});  

$("stepsContent").querySelectorAll("[data-step-delete]").forEach(button => {  
    button.addEventListener("click", () => {  
        deleteStep(button.dataset.stepDelete);  
    });  
});

}

function editStep(steps, id) {
const step = steps.find(x => x.id === id);
if(!step) return;

$("stepId").value = step.id;  
$("stepTitle").value = step.title_fr || "";  
$("stepTitleEn").value = step.title_en || "";  
$("stepPlanned").value = step.planned_date || "";  
$("stepEffective").value = step.effective_date || "";  
$("stepStatus").value = step.status;  
$("stepDescription").value = step.description_fr || "";  
$("stepDescriptionEn").value = step.description_en || "";  

$("stepFormTitle").textContent = "Modifier l'étape";  
$("saveStepButton").textContent = "Mettre à jour";  
$("cancelStepEdit").style.display = "inline-flex";

}

function resetStepForm() {
$("stepForm").reset();
$("stepId").value = "";
$("stepFormTitle").textContent = "Ajouter une étape";
$("saveStepButton").textContent = "Enregistrer l'étape";
$("cancelStepEdit").style.display = "none";
}

async function saveStep(event) {
event.preventDefault();

if(!permissions.edit) {  
    return alert("Droit de modification manquant.");  
}  

const id = $("stepId").value;  

const payload = {  
    activity_id: currentStepActivity,  
    title_fr: $("stepTitle").value.trim(),  
    title_en: $("stepTitleEn").value.trim() || null,  
    description_fr: $("stepDescription").value.trim() || null,  
    description_en: $("stepDescriptionEn").value.trim() || null,  
    planned_date: $("stepPlanned").value || null,  
    effective_date: $("stepEffective").value || null,  
    status: $("stepStatus").value,  
    updated_by: currentProfile.user_id  
};  

try {  
    let result;  

    if(id) {  
        result = await supabase  
            .from("project_steps")  
            .update(payload)  
            .eq("id", id);  
    } else {  
        payload.created_by = currentProfile.user_id;  

        result = await supabase  
            .from("project_steps")  
            .insert(payload);  
    }  

    if(result.error) throw result.error;  

    await renderSteps();  
    alert("Étape enregistrée.");  

} catch(error) {  
    alert("Erreur : " + error.message);  
}

}

async function deleteStep(id) {
if(!permissions.delete) {
return alert("Droit de suppression manquant.");
}

if(!confirm("Supprimer cette étape ?")) return;  

const {error} = await supabase.rpc(  
    "delete_project_step_completely",  
    {p_step_id: id}  
);  

if(error) {  
    alert("Suppression impossible : " + error.message);  
    return;  
}  

await renderSteps();

}

/* =========================================
INTERFACE ACTIVITES
========================================= */

async function renderActivitiesModule() {
permissions = {
create: await hasPermission("activities", "create"),
edit: await hasPermission("activities", "edit"),
publish: await hasPermission("activities", "publish"),
delete: await hasPermission("activities", "delete")
};

await loadActivityResources();  

moduleContent.innerHTML = `  
<div class="page-heading">  
    <div>  
        <h1>Activités et projets</h1>  
        <p>Gérez les activités, les projets, leurs étapes et leurs bilans.</p>  
    </div>  
    <div class="module-label">MODULE ADMINISTRATIF</div>  
</div>  

<div class="welcome-card">  
    <h2>Espace de gestion des activités et projets</h2>  
    <p>  
        Les contenus créés sont d'abord enregistrés comme brouillons.  
        Leur publication nécessite l'autorisation correspondante.  
    </p>  
</div>  

<div class="panel">  
    <div class="toolbar">  
        <div>  
            <h2>Contenus enregistrés</h2>  
            <p style="font-size:12px;color:var(--muted);margin-top:5px">  
                Liste des activités et projets du BUEP.  
            </p>  
        </div>  

        ${permissions.create ? `  
            <button class="btn btn-primary" id="newActivityButton">  
                ＋ Nouvelle activité  
            </button>  
        ` : ""}  
    </div>  

    <div class="toolbar">  
        <input id="activitySearch" type="search"  
            placeholder="Rechercher un titre ou un lieu...">  

        <select id="activityFilter">  
            <option value="all">Tous les contenus</option>  
            <option value="activity">Activités uniquement</option>  
            <option value="project">Projets uniquement</option>  
            <option value="upcoming">À venir</option>  
            <option value="ongoing">En cours</option>  
            <option value="completed">Terminés</option>  
            <option value="postponed">Reportés</option>  
            <option value="cancelled">Annulés</option>  
        </select>  
    </div>  

    <div class="table-wrap">  
        <table>  
            <thead>  
                <tr>  
                    <th>Titre</th>  
                    <th>Type / Catégorie</th>  
                    <th>Activité</th>  
                    <th>Publication</th>  
                    <th>Date</th>  
                    <th>Actions</th>  
                </tr>  
            </thead>  

            <tbody id="activitiesTableBody">  
                <tr>  
                    <td colspan="6" class="empty-state">Chargement...</td>  
                </tr>  
            </tbody>  
        </table>  
    </div>  

    <div class="notice">  
        <strong>À savoir :</strong>  
        l'archivage conserve les données dans la base.  
        La suppression définitive est irréversible.  
    </div>  
</div>  

<div class="panel">  
    <div class="toolbar">  
        <div>  
            <h2>Archives</h2>  
            <p style="font-size:12px;color:var(--muted);margin-top:5px">  
                Contenus archivés :  
                <strong id="archivedActivitiesCount">0</strong>  
            </p>  
        </div>  
    </div>  

    <div class="table-wrap">  
        <table>  
            <thead>  
                <tr>  
                    <th>Titre</th>  
                    <th>Type</th>  
                    <th>Catégorie</th>  
                    <th>Date d'archivage</th>  
                    <th>Actions</th>  
                </tr>  
            </thead>  

            <tbody id="archivedActivitiesTableBody">  
                <tr>  
                    <td colspan="5" class="empty-state">  
                        Chargement des archives...  
                    </td>  
                </tr>  
            </tbody>  
        </table>  
    </div>  

    <div class="notice">  
        <strong>À savoir :</strong>  
        la restauration remet le contenu en brouillon.  
        Il faudra le publier à nouveau pour qu'il soit visible sur le site.  
    </div>  
</div>`;  

if(permissions.create) {  
    $("newActivityButton").addEventListener("click", () => {  
        resetActivityForm();  
        openModal("activityModal");  
    });  
}  

$("activitySearch").addEventListener("input", renderActivities);  
$("activityFilter").addEventListener("change", renderActivities);  

await loadActivities();

}

/* =========================================
MODULE DOCUMENTS : CHARGEMENT
========================================= */

/* =========================================
   DEMANDES D'ACCÈS AUX DOCUMENTS
   Affichées dans le module Documents.
========================================= */

let accessRequestsCache = [];
let accessRequestFilter = "pending";
let accessRequestLimit = 9;

function accessRequestIsDone(request) {
    return Boolean(request.decided_at);
}

function accessRequestSubject(request) {
    return "Votre demande d'accès : " + (request.documentTitle || "document");
}

// Texte prérempli de la réponse, modifiable par l'administrateur.
function accessRequestDefaultMessage(request) {
    return [
        "Bonjour " + (request.requester_name || "") + ",",
        "",
        "Nous avons bien reçu votre demande d'accès au document « " + (request.documentTitle || "") + " ».",
        "",
        "",
        "Cordialement,",
        "Le BUEP-ENS/PN"
    ].join("\n");
}

function accessRequestMailto(request, message) {
    return "mailto:" + (request.requester_email || "") +
        "?subject=" + encodeURIComponent(accessRequestSubject(request)) +
        "&body=" + encodeURIComponent(message);
}

// Copie dans le presse-papiers, avec repli si l'API n'est pas disponible.
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch(error) {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand("copy");
        area.remove();
        return copied;
    }
}

// Fenêtre de réponse générique : ouvre la messagerie, ou permet de copier
// le destinataire, l'objet et le message. `onRecord` (facultatif) enregistre la réponse.
function openMailReply({ to, subject, message, onRecord = null }) {
    let modal = document.getElementById("accessReplyModal");

    if(!modal) {
        modal = document.createElement("div");
        modal.id = "accessReplyModal";
        modal.className = "access-reply-overlay";
        document.body.appendChild(modal);

        modal.addEventListener("click", event => {
            if(event.target === modal || event.target.closest("[data-reply-close]")) {
                modal.hidden = true;
            }
        });
    }

    modal.innerHTML = `
        <div class="access-reply-box" role="dialog" aria-modal="true" aria-label="Répondre">
            <button type="button" class="access-reply-close" data-reply-close aria-label="Fermer">×</button>
            <h3>Répondre</h3>
            <p class="access-reply-note">
                « Ouvrir ma messagerie » prépare le message dans l'application de courrier de votre ordinateur.
                Si rien ne s'ouvre, copiez le destinataire, l'objet et le message, puis collez-les
                dans votre messagerie.
            </p>

            <label>Répondre à</label>
            <div class="access-reply-row">
                <input type="text" id="accessReplyTo" readonly value="${escapeHTML(to || "")}">
                <button type="button" class="btn" id="accessReplyCopyTo">Copier</button>
            </div>

            <label>Objet</label>
            <div class="access-reply-row">
                <input type="text" id="accessReplySubject" readonly value="${escapeHTML(subject || "")}">
                <button type="button" class="btn" id="accessReplyCopySubject">Copier</button>
            </div>

            <label>Message</label>
            <textarea id="accessReplyBody" rows="9">${escapeHTML(message || "")}</textarea>

            <div class="access-reply-actions">
                <button type="button" class="btn" id="accessReplyCopyBody">Copier le message</button>
                ${onRecord ? `<button type="button" class="btn" id="accessReplyRecord">Enregistrer dans l'historique</button>` : ""}
                <button type="button" class="btn btn-primary" id="accessReplyOpen">Ouvrir ma messagerie</button>
            </div>
            <p class="access-reply-feedback" id="accessReplyFeedback" aria-live="polite"></p>
        </div>
    `;

    const feedback = modal.querySelector("#accessReplyFeedback");

    async function copyWithFeedback(text, okMessage, koMessage) {
        feedback.textContent = await copyToClipboard(text) ? okMessage : koMessage;
    }

    modal.querySelector("#accessReplyCopyTo").addEventListener("click", () =>
        copyWithFeedback(to || "", "Destinataire copié.", "Copie impossible : sélectionnez le destinataire et copiez-le.")
    );

    modal.querySelector("#accessReplyCopySubject").addEventListener("click", () =>
        copyWithFeedback(subject || "", "Objet copié.", "Copie impossible : sélectionnez l'objet et copiez-le.")
    );

    modal.querySelector("#accessReplyCopyBody").addEventListener("click", () =>
        copyWithFeedback(modal.querySelector("#accessReplyBody").value, "Message copié.", "Copie impossible : sélectionnez le texte et copiez-le.")
    );

    modal.querySelector("#accessReplyOpen").addEventListener("click", () => {
        const body = modal.querySelector("#accessReplyBody").value;
        window.location.href = "mailto:" + (to || "") +
            "?subject=" + encodeURIComponent(subject || "") +
            "&body=" + encodeURIComponent(body);
    });

    if(onRecord) {
        modal.querySelector("#accessReplyRecord").addEventListener("click", async event => {
            const button = event.currentTarget;
            const body = modal.querySelector("#accessReplyBody").value.trim();

            if(!body) {
                feedback.textContent = "Le message est vide.";
                return;
            }

            button.disabled = true;

            try {
                await onRecord(body);
                feedback.textContent = "Réponse enregistrée dans l'historique.";
            } catch(error) {
                feedback.textContent = "Enregistrement impossible : " + error.message;
            } finally {
                button.disabled = false;
            }
        });
    }

    modal.hidden = false;
}

// Demande d'accès : réponse préremplie à partir de la demande.
function openAccessReply(id) {
    const request = accessRequestsCache.find(r => String(r.id) === String(id));
    if(!request) return;

    openMailReply({
        to: request.requester_email,
        subject: accessRequestSubject(request),
        message: accessRequestDefaultMessage(request)
    });
}

async function deleteAccessRequest(id) {
    if(!confirm("Supprimer définitivement cette demande traitée ?")) return;

    // Suppression par fonction SQL sécurisée (delete_document_access_request),
    // qui vérifie le droit et ne supprime que les demandes traitées.
    const { data, error } = await supabase.rpc("delete_document_access_request", {
        p_request_id: String(id)
    });

    if(error) {
        alert("Suppression impossible : " + error.message);
        return;
    }

    if(data !== true) {
        alert("Aucune demande supprimée. Vérifiez que la demande est traitée.");
        return;
    }

    await loadAccessRequests();
}

async function loadAccessRequests() {
    const [requestsResult, documentsResult] = await Promise.all([
        supabase.from("document_access_requests").select("*"),
        supabase.from("documents").select("id,title_fr")
    ]);

    if(requestsResult.error) throw requestsResult.error;
    if(documentsResult.error) throw documentsResult.error;

    const titles = new Map(
        (documentsResult.data || []).map(doc => [doc.id, doc.title_fr])
    );

    accessRequestsCache = (requestsResult.data || [])
        .map(request => ({
            ...request,
            documentTitle: titles.get(request.document_id) || "Document introuvable"
        }))
        .sort((a, b) =>
            String(b.created_at || "").localeCompare(String(a.created_at || ""))
        );

    renderAccessRequests();
}

function renderAccessRequests() {
    const body = $("accessRequestsBody");
    if(!body) return;

    const pendingCount = accessRequestsCache.filter(r => !accessRequestIsDone(r)).length;
    const doneCount = accessRequestsCache.length - pendingCount;

    document.querySelectorAll("[data-access-filter]").forEach(button => {
        const key = button.dataset.accessFilter;
        const label = key === "pending"
            ? "À traiter (" + pendingCount + ")"
            : key === "done"
                ? "Traitées (" + doneCount + ")"
                : "Toutes (" + accessRequestsCache.length + ")";

        button.textContent = label;
        button.classList.toggle("btn-primary", key === accessRequestFilter);
    });

    const rows = accessRequestsCache.filter(request =>
        accessRequestFilter === "all" ||
        (accessRequestFilter === "pending" ? !accessRequestIsDone(request) : accessRequestIsDone(request))
    );

    const visibleRows = rows.slice(0, accessRequestLimit);

    renderAccessRequestsMore(rows.length, visibleRows.length);

    if(!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">Aucune demande dans cette liste.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = visibleRows.map(request => {
        const done = accessRequestIsDone(request);

        const actions = [];

        if(permissions.edit) {
            actions.push(done
                ? `<button type="button" class="btn" data-access-action="reopen" data-id="${escapeHTML(request.id)}">Rouvrir</button>`
                : `<button type="button" class="btn btn-primary" data-access-action="done" data-id="${escapeHTML(request.id)}">Marquer traitée</button>`);
        }

        if(done && permissions.delete) {
            actions.push(`<button type="button" class="btn btn-danger" data-access-action="delete" data-id="${escapeHTML(request.id)}">Supprimer</button>`);
        }

        const action = actions.join("");

        return `
            <tr>
                <td>${escapeHTML(formatDate(request.created_at))}</td>
                <td>${escapeHTML(request.documentTitle)}</td>
                <td>
                    <strong>${escapeHTML(request.requester_name || "")}</strong><br>
                    <a href="mailto:${escapeHTML(request.requester_email || "")}">${escapeHTML(request.requester_email || "")}</a>
                </td>
                <td>${escapeHTML(request.requester_identity || "")}</td>
                <td style="max-width:260px;white-space:pre-line">${escapeHTML(request.request_reason || "")}</td>
                <td>
                    <div class="access-request-actions">
                        <button type="button" class="btn" data-access-action="reply" data-id="${escapeHTML(request.id)}">Répondre</button>
                        ${action}
                        <span class="access-request-state ${done ? "is-done" : "is-pending"}">${done ? "Traitée" : "À traiter"}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderAccessRequestsMore(total, shown) {
    const box = $("accessRequestsMore");
    if(!box) return;

    if(!total) {
        box.innerHTML = "";
        return;
    }

    const canBack = accessRequestLimit > 9;
    const canMore = shown < total;

    box.innerHTML = `
        <p class="access-requests-count">Affichage de ${shown} demande${shown > 1 ? "s" : ""} sur ${total}</p>
        <div class="access-requests-buttons">
            ${canBack ? `<button type="button" class="btn" data-access-page="less">Voir moins</button>` : ""}
            ${canMore ? `<button type="button" class="btn btn-primary" data-access-page="more">Voir plus</button>` : ""}
        </div>
    `;
}

async function setAccessRequestDone(id, done) {
    const { error } = await supabase
        .from("document_access_requests")
        .update({ decided_at: done ? new Date().toISOString() : null })
        .eq("id", id);

    if(error) {
        alert("Mise à jour impossible : " + error.message);
        return;
    }

    await loadAccessRequests();
}

function bindAccessRequests() {
    document.querySelectorAll("[data-access-filter]").forEach(button => {
        button.addEventListener("click", () => {
            accessRequestFilter = button.dataset.accessFilter;
            accessRequestLimit = 9;
            renderAccessRequests();
        });
    });

    $("accessRequestsMore").addEventListener("click", event => {
        const button = event.target.closest("[data-access-page]");
        if(!button) return;

        accessRequestLimit = button.dataset.accessPage === "more"
            ? accessRequestLimit + 9
            : 9;
        renderAccessRequests();
    });

    $("accessRequestsBody").addEventListener("click", event => {
        const button = event.target.closest("[data-access-action]");
        if(!button) return;

        const action = button.dataset.accessAction;

        if(action === "reply") {
            openAccessReply(button.dataset.id);
        } else if(action === "delete") {
            deleteAccessRequest(button.dataset.id);
        } else {
            setAccessRequestDone(button.dataset.id, action === "done");
        }
    });
}

async function loadDocumentResources() {
const [categoriesResult, yearsResult] = await Promise.all([
supabase.from("document_categories")
.select("id,name_fr,name_en,slug,description_fr,description_en,display_order,is_active,created_at")
.order("display_order"),

supabase.from("academic_years")  
        .select("id,label,is_current,start_date,end_date")  
        .order("start_date", {ascending: false})  
]);  

if(categoriesResult.error) throw categoriesResult.error;  
if(yearsResult.error) throw yearsResult.error;  

documentCategories = categoriesResult.data || [];  
academicYears = yearsResult.data || [];

}

async function loadDocuments() {
const [documentsResult, filesResult] = await Promise.all([
supabase.from("documents")
.select("id,category_id,title_fr,title_en,description_fr,description_en,academic_year_id,promotion,study_stream,access_type,status,published_at,display_order,created_by,updated_by,created_at,updated_at")
.order("display_order")
.order("created_at", {ascending: false}),

supabase.from("document_files")  
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
            display_order,  
            created_by,  
            created_at  
        `)  
        .order("display_order")  
]);  

if(documentsResult.error) throw documentsResult.error;  
if(filesResult.error) throw filesResult.error;  

documentsCache = documentsResult.data || [];  
documentFilesCache = filesResult.data || [];  

renderDocuments();  
renderDocumentCategories();

}

/* =========================================
MODULE DOCUMENTS : AFFICHAGE
========================================= */

function getCategoryName(categoryId) {
const category = documentCategories.find(
c => c.id === categoryId
);

return category?.name_fr || "Catégorie inconnue";

}

function getFilesForDocument(documentId) {
return documentFilesCache.filter(
file => file.document_id === documentId
);
}

function renderDocuments() {
const body = $("documentsTableBody");
if(!body) return;

const search = $("documentSearch")?.value.toLowerCase() || "";  
const categoryFilter = $("documentCategoryFilter")?.value || "all";  
const statusFilter = $("documentStatusFilter")?.value || "all";  

const rows = documentsCache.filter(doc => {  
    const matchesSearch =  
        (doc.title_fr || "").toLowerCase().includes(search) ||  
        (doc.title_en || "").toLowerCase().includes(search) ||  
        (doc.promotion || "").toLowerCase().includes(search) ||  
        (doc.study_stream || "").toLowerCase().includes(search);  

    const matchesCategory =  
        categoryFilter === "all" ||  
        doc.category_id === categoryFilter;  

    const matchesStatus =  
        statusFilter === "all" ||  
        doc.status === statusFilter;  

    return matchesSearch && matchesCategory && matchesStatus;  
});  

if(!rows.length) {  
    body.innerHTML = `  
        <tr>  
            <td colspan="7" class="empty-state">  
                Aucun document trouvé.  
            </td>  
        </tr>  
    `;  
    return;  
}  

body.innerHTML = rows.map(doc => {  
    const files = getFilesForDocument(doc.id);  

    return `  
    <tr>  
        <td>  
            <strong>${escapeHTML(doc.title_fr)}</strong>  
            ${doc.title_en  
                ? `<br><small>${escapeHTML(doc.title_en)}</small>`  
                : ""}  
        </td>  

        <td>${escapeHTML(getCategoryName(doc.category_id))}</td>  

        <td>  
            ${escapeHTML(doc.promotion || "—")}<br>  
            <small>${escapeHTML(doc.study_stream || "")}</small>  
        </td>  

        <td>  
            <span class="badge ${escapeHTML(doc.status)}">  
                ${escapeHTML(statusLabel(doc.status))}  
            </span>  
        </td>  

        <td>  
            <span class="badge">  
                ${escapeHTML(statusLabel(doc.access_type))}  
            </span>  
        </td>  

        <td>${files.length} fichier(s)</td>  

        <td>  
            <div class="actions">  
                ${permissions.edit ? `  
                    <button class="btn btn-light"  
                        data-document-edit="${escapeHTML(doc.id)}">  
                        Modifier  
                    </button>  
                ` : ""}  

                ${permissions.publish ? `  
                    <button class="btn ${doc.status === "published" ? "btn-light" : "btn-success"}"  
                        data-document-publish="${escapeHTML(doc.id)}">  
                        ${doc.status === "published" ? "Dépublier" : "Publier"}  
                    </button>  
                ` : ""}  

                ${permissions.delete ? `  
                    <button class="btn btn-danger"  
                        data-document-delete="${escapeHTML(doc.id)}">  
                        Supprimer  
                    </button>  
                ` : ""}  
            </div>  
        </td>  
    </tr>`;  
}).join("");  

body.querySelectorAll("[data-document-edit]").forEach(button => {  
    button.addEventListener("click", () => {  
        editDocument(button.dataset.documentEdit);  
    });  
});  

body.querySelectorAll("[data-document-publish]").forEach(button => {  
    button.addEventListener("click", () => {  
        toggleDocumentPublication(button.dataset.documentPublish);  
    });  
});  

body.querySelectorAll("[data-document-delete]").forEach(button => {  
    button.addEventListener("click", () => {  
        deleteDocument(button.dataset.documentDelete);  
    });  
});

}

function renderDocumentCategories() {
const body = $("documentCategoriesTableBody");
if(!body) return;

if(!documentCategories.length) {  
    body.innerHTML = `  
        <tr>  
            <td colspan="5" class="empty-state">  
                Aucune catégorie enregistrée.  
            </td>  
        </tr>  
    `;  
} else {  
    body.innerHTML = documentCategories.map(category => `  
        <tr>  
            <td><strong>${escapeHTML(category.name_fr)}</strong></td>  
            <td>${escapeHTML(category.name_en || "—")}</td>  
            <td>${escapeHTML(category.slug)}</td>  

            <td>  
                <span class="badge ${category.is_active ? "active" : "inactive"}">  
                    ${category.is_active ? "Active" : "Inactive"}  
                </span>  
            </td>  

            <td>  
                <div class="actions">  
                    ${permissions.edit ? `  
                        <button class="btn btn-light"  
                            data-category-edit="${escapeHTML(category.id)}">  
                            Modifier  
                        </button>  
                    ` : ""}  

                    ${permissions.edit ? `  
                        <button class="btn ${category.is_active ? "btn-danger" : "btn-success"}"  
                            data-category-toggle="${escapeHTML(category.id)}">  
                            ${category.is_active ? "Désactiver" : "Activer"}  
                        </button>  
                    ` : ""}  
                </div>  
            </td>  
        </tr>  
    `).join("");  
}  

body.querySelectorAll("[data-category-edit]").forEach(button => {  
    button.addEventListener("click", () => {  
        editDocumentCategory(button.dataset.categoryEdit);  
    });  
});  

body.querySelectorAll("[data-category-toggle]").forEach(button => {  
    button.addEventListener("click", () => {  
        toggleDocumentCategory(button.dataset.categoryToggle);  
    });  
});  

const activeCategories = documentCategories.filter(  
    category => category.is_active  
);  

const categorySelect = $("documentCategory");  
const previousCategory = categorySelect?.value || "";  

if(categorySelect) {  
    categorySelect.innerHTML =  
        '<option value="">Choisir une catégorie</option>' +  
        activeCategories.map(category => `  
            <option value="${escapeHTML(category.id)}">  
                ${escapeHTML(category.name_fr)}  
            </option>  
        `).join("");  

    // Préserver une catégorie inactive déjà associée au document.  
    const currentDocumentId = $("documentId")?.value;  

    if(currentDocumentId) {  
        const currentDocument = documentsCache.find(  
            doc => doc.id === currentDocumentId  
        );  

        const currentCategoryId = currentDocument?.category_id;  

        if(  
            currentCategoryId &&  
            !activeCategories.some(c => c.id === currentCategoryId)  
        ) {  
            const inactiveCategory = documentCategories.find(  
                c => c.id === currentCategoryId  
            );  

            if(inactiveCategory) {  
                const option = document.createElement("option");  
                option.value = inactiveCategory.id;  
                option.textContent =  
                    inactiveCategory.name_fr + " (inactive)";  

                categorySelect.appendChild(option);  
            }  
        }  
    }  

    if(previousCategory) {  
        categorySelect.value = previousCategory;  
    }  
}  

const filter = $("documentCategoryFilter");  

if(filter) {  
    const previousFilter = filter.value || "all";  

    filter.innerHTML =  
        '<option value="all">Toutes les catégories</option>' +  
        documentCategories.map(category => `  
            <option value="${escapeHTML(category.id)}">  
                ${escapeHTML(category.name_fr)}  
            </option>  
        `).join("");  

    filter.value = previousFilter;  
}

}

/* =========================================
MODULE DOCUMENTS : FORMULAIRE
========================================= */

function resetDocumentForm() {
requireElement("documentForm").reset();

$("documentId").value = "";  
$("documentModalTitle").textContent = "Nouveau document";  
$("documentOrder").value = "0";  
$("documentAccess").disabled = false;  

$("documentExistingFiles").innerHTML =  
    '<p class="empty-state">Enregistrez le document pour lui associer des fichiers.</p>';  

$("documentFilesArea").classList.add("hidden");  

currentDocumentFiles = [];

}

async function editDocument(id) {
if(!permissions.edit) return;

const doc = documentsCache.find(d => d.id === id);  
if(!doc) return;  

$("documentId").value = doc.id;  
$("documentTitleFr").value = doc.title_fr || "";  
$("documentTitleEn").value = doc.title_en || "";  

// Charger la catégorie, même si elle est inactive.  
renderDocumentCategories();  
$("documentCategory").value = doc.category_id || "";  

$("documentYear").value = doc.academic_year_id || "";  
$("documentPromotion").value = doc.promotion || "";  
$("documentStream").value = doc.study_stream || "";  
$("documentAccess").value = doc.access_type || "public";  
$("documentOrder").value = doc.display_order ?? 0;  
$("documentDescriptionFr").value = doc.description_fr || "";  
$("documentDescriptionEn").value = doc.description_en || "";  

currentDocumentFiles = getFilesForDocument(id);  

// Le type d'accès reste verrouillé si des fichiers existent.  
$("documentAccess").disabled = currentDocumentFiles.length > 0;  

$("documentModalTitle").textContent = "Modifier le document";  
$("documentFilesArea").classList.remove("hidden");  

renderExistingDocumentFiles();  
openModal("documentModal");

}

function renderExistingDocumentFiles() {
const container = $("documentExistingFiles");

if(!currentDocumentFiles.length) {  
    container.innerHTML =  
        '<p class="empty-state">Aucun fichier associé à ce document.</p>';  

    return;  
}  

container.innerHTML = currentDocumentFiles.map(file => `  
    <div class="file-item">  
        <div>  
            <strong>  
                ${escapeHTML(file.display_file_name || file.original_file_name)}  
            </strong>  

            <small>  
                ${escapeHTML((file.language_code || "fr").toUpperCase())}  
                · ${escapeHTML(file.file_extension || "Fichier")}  
                · ${formatFileSize(file.file_size)}  
            </small>  
        </div>  

        ${permissions.edit ? `  
            <button type="button" class="btn btn-danger"  
                data-file-delete="${escapeHTML(file.id)}">  
                Retirer  
            </button>  
        ` : ""}  
    </div>  
`).join("");  

container.querySelectorAll("[data-file-delete]").forEach(button => {  
    button.addEventListener("click", () => {  
        removeDocumentFile(button.dataset.fileDelete);  
    });  
});

}

async function saveDocument(event) {
event.preventDefault();

const id = $("documentId").value;  

if(!id && !permissions.create) {  
    return alert("Vous ne disposez pas du droit de création.");  
}  

if(id && !permissions.edit) {  
    return alert("Vous ne disposez pas du droit de modification.");  
}  

const titleFr = $("documentTitleFr").value.trim();  

if(!titleFr) {  
    return alert("Le titre français est obligatoire.");  
}  

const button = $("saveDocumentButton");  
button.disabled = true;  
button.textContent = "Enregistrement...";  

try {  
    const payload = {  
        category_id: $("documentCategory").value,  
        title_fr: titleFr,  
        title_en: $("documentTitleEn").value.trim() || null,  
        description_fr: $("documentDescriptionFr").value.trim() || null,  
        description_en: $("documentDescriptionEn").value.trim() || null,  
        academic_year_id: $("documentYear").value || null,  
        promotion: $("documentPromotion").value.trim() || null,  
        study_stream: $("documentStream").value.trim() || null,  
        access_type: $("documentAccess").value,  
        display_order: Number($("documentOrder").value) || 0,  
        updated_by: currentProfile.user_id,  
        updated_at: new Date().toISOString()  
    };  

    let documentId = id;  

    if(id) {  
        const {error} = await supabase  
            .from("documents")  
            .update(payload)  
            .eq("id", id);  

        if(error) throw error;  

    } else {  
        payload.status = "draft";  
        payload.created_by = currentProfile.user_id;  

        const {data, error} = await supabase  
            .from("documents")  
            .insert(payload)  
            .select("id")  
            .single();  

        if(error) throw error;  

        documentId = data.id;  
    }  

    const files = Array.from(  
        $("documentFiles").files || []  
    );  

    if(files.length) {  
        await uploadDocumentFiles(  
            documentId,  
            files,  
            $("documentFileLanguage").value,  
            $("documentAccess").value  
        );  
    }  

    closeModal("documentModal");  
    resetDocumentForm();  

    await loadDocuments();  

    alert("Document enregistré avec succès.");  

} catch(error) {  
    console.error("Enregistrement document :", error);  

    alert(  
        "Erreur lors de l'enregistrement : " + error.message  
    );  

} finally {  
    button.disabled = false;  
    button.textContent = "Enregistrer";  
}

}

/* =========================================
MODULE DOCUMENTS : TELEVERSEMENT
========================================= */

async function uploadDocumentFiles(documentId, files, language, accessType) {
const bucket = getDocumentBucket(accessType);

for(const file of files) {  
    const extension = (  
        file.name.split(".").pop() || ""  
    ).toLowerCase();  

    const uniqueName = (  
        crypto.randomUUID  
            ? crypto.randomUUID()  
            : Date.now() + "-" + Math.random().toString(16).slice(2)  
    );  

    const storagePath =  
        `documents/${documentId}/${uniqueName}-${safeFileName(file.name)}`;  

    const {error: uploadError} = await supabase.storage  
        .from(bucket)  
        .upload(storagePath, file, {  
            cacheControl: "3600",  
            upsert: false,  
            contentType: file.type || "application/octet-stream"  
        });  

    if(uploadError) throw uploadError;  

    const filePayload = {  
        document_id: documentId,  
        storage_path: storagePath,  
        original_file_name: file.name,  
        display_file_name: file.name,  
        mime_type: file.type || null,  
        file_extension: extension || null,  
        file_size: file.size,  
        language_code: language,  
        display_order: 0,  
        created_by: currentProfile.user_id  
    };  

    const {error: insertError} = await supabase  
        .from("document_files")  
        .insert(filePayload);  

    if(insertError) {  
        await supabase.storage  
            .from(bucket)  
            .remove([storagePath]);  

        throw insertError;  
    }  
}

}

async function removeDocumentFile(fileId) {
if(!permissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const file = currentDocumentFiles.find(f => f.id === fileId);  
if(!file) return;  

if(!confirm(  
    `Retirer le fichier « ${file.display_file_name || file.original_file_name} » ?`  
)) return;  

const doc = documentsCache.find(  
    d => d.id === file.document_id  
);  

if(!doc) return;  

const bucket = getDocumentBucket(doc.access_type);  

try {  
    // Base d'abord : une suppression refusée par la base ne doit pas effacer le fichier du stockage.
    const {data: removedRows, error: deleteError} = await deleteChecked("document_files", "id", fileId, "documents");  

    if(deleteError) throw deleteError;  

    if(!removedRows || !removedRows.length) {
        throw new Error("Le fichier n'a pas pu être supprimé de la base (droits insuffisants).");
    }

    const {error: storageError} = await supabase.storage  
        .from(bucket)  
        .remove([file.storage_path]);  

    if(storageError) console.error("Fichier non retiré du stockage :", storageError);  

    currentDocumentFiles = currentDocumentFiles.filter(  
        f => f.id !== fileId  
    );  

    renderExistingDocumentFiles();  

    await loadDocuments();  

    alert("Fichier retiré.");  

} catch(error) {  
    alert("Impossible de retirer le fichier : " + error.message);  
}

}

/* =========================================
MODULE DOCUMENTS : PUBLICATION
========================================= */

async function toggleDocumentPublication(id) {
if(!permissions.publish) {
return alert("Vous ne disposez pas du droit de publication.");
}

const doc = documentsCache.find(d => d.id === id);  
if(!doc) return;  

const publish = doc.status !== "published";  

if(publish && !getFilesForDocument(id).length) {  
    return alert(  
        "Ajoutez au moins un fichier avant de publier ce document."  
    );  
}  

if(!confirm(  
    publish ? "Publier ce document ?" : "Dépublier ce document ?"  
)) return;  

const payload = publish ? {  
    status: "published",  
    published_at: new Date().toISOString(),  
    updated_by: currentProfile.user_id,  
    updated_at: new Date().toISOString()  
} : {  
    status: "draft",  
    published_at: null,  
    updated_by: currentProfile.user_id,  
    updated_at: new Date().toISOString()  
};  

const {error} = await supabase  
    .from("documents")  
    .update(payload)  
    .eq("id", id);  

if(error) {  
    alert("Impossible de modifier la publication : " + error.message);  
    return;  
}  

await loadDocuments();  

alert(publish ? "Document publié." : "Document dépublié.");

}

/* =========================================
MODULE DOCUMENTS : SUPPRESSION
========================================= */

async function deleteDocument(id) {
if(!permissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const doc = documentsCache.find(d => d.id === id);
if(!doc) return;

const files = getFilesForDocument(id);

if(!confirm(
    "SUPPRESSION DEFINITIVE\n\n" +
    `Voulez-vous supprimer « ${doc.title_fr} » ?\n\n` +
    "Les fichiers associés seront également retirés du stockage."
)) return;

try {
    // 1. Suppression en base (autorisations, demandes, fichiers, fiche) dans une seule opération.
    const { data: paths, error } = await supabase.rpc("delete_document_completely", {
        p_document_id: String(id)
    });

    if(error) throw error;

    // 2. Retrait des fichiers du stockage, seulement après la confirmation de la base.
    const storagePaths = (paths || []).filter(Boolean);

    if(storagePaths.length) {
        const bucket = getDocumentBucket(doc.access_type);
        const { error: storageError } = await supabase.storage
            .from(bucket)
            .remove(storagePaths);

        if(storageError) {
            console.error("Fichiers document non retirés du stockage :", storageError);
        }
    }

    await loadDocuments();

    alert("Document et fichiers supprimés définitivement.");

} catch(error) {
    console.error("Suppression document :", error);

    alert("La suppression n'a pas pu être terminée : " + error.message);
}

}

/* =========================================
MODULE DOCUMENTS : CATEGORIES
========================================= */

function resetDocumentCategoryForm() {
requireElement("documentCategoryForm").reset();

$("documentCategoryId").value = "";  
$("documentCategoryModalTitle").textContent = "Nouvelle catégorie";  
$("categoryOrder").value = "0";  
$("categoryActive").value = "true";

}

function editDocumentCategory(id) {
if(!permissions.edit) return;

const category = documentCategories.find(c => c.id === id);  
if(!category) return;  

$("documentCategoryId").value = category.id;  
$("categoryNameFr").value = category.name_fr || "";  
$("categoryNameEn").value = category.name_en || "";  
$("categorySlug").value = category.slug || "";  
$("categoryDescriptionFr").value = category.description_fr || "";  
$("categoryDescriptionEn").value = category.description_en || "";  
$("categoryOrder").value = category.display_order ?? 0;  
$("categoryActive").value = String(category.is_active);  

$("documentCategoryModalTitle").textContent =  
    "Modifier la catégorie";  

openModal("documentCategoryModal");

}

async function saveDocumentCategory(event) {
event.preventDefault();

const id = $("documentCategoryId").value;  

// La politique RLS document_categories exige le droit documents.edit.  
if(!permissions.edit) {  
    return alert("Droit de gestion des catégories manquant.");  
}  

const nameFr = $("categoryNameFr").value.trim();  

if(!nameFr) {  
    return alert("Le nom français est obligatoire.");  
}  

const payload = {  
    name_fr: nameFr,  
    name_en: $("categoryNameEn").value.trim() || null,  
    slug: slugify($("categorySlug").value || nameFr),  
    description_fr: $("categoryDescriptionFr").value.trim() || null,  
    description_en: $("categoryDescriptionEn").value.trim() || null,  
    display_order: Number($("categoryOrder").value) || 0,  
    is_active: $("categoryActive").value === "true"  
};  

const button = $("saveDocumentCategoryButton");  
button.disabled = true;  
button.textContent = "Enregistrement...";  

try {  
    let result;  

    if(id) {  
        result = await supabase  
            .from("document_categories")  
            .update(payload)  
            .eq("id", id);  
    } else {  
        result = await supabase  
            .from("document_categories")  
            .insert(payload);  
    }  

    if(result.error) throw result.error;  

    closeModal("documentCategoryModal");  
    resetDocumentCategoryForm();  

    await loadDocumentResources();  
    await loadDocuments();  

    alert("Catégorie enregistrée.");  

} catch(error) {  
    alert("Erreur catégorie : " + error.message);  

} finally {  
    button.disabled = false;  
    button.textContent = "Enregistrer";  
}

}

async function toggleDocumentCategory(id) {
if(!permissions.edit) {
return alert("Droit de modification manquant.");
}

const category = documentCategories.find(c => c.id === id);  
if(!category) return;  

const nextState = !category.is_active;  

if(!confirm(  
    nextState  
        ? "Activer cette catégorie ?"  
        : "Désactiver cette catégorie ?"  
)) return;  

const {error} = await supabase  
    .from("document_categories")  
    .update({is_active: nextState})  
    .eq("id", id);  

if(error) {  
    alert("Impossible de modifier cette catégorie : " + error.message);  
    return;  
}  

await loadDocumentResources();  
await loadDocuments();

}

/* =========================================
INTERFACE DU MODULE DOCUMENTS
========================================= */

async function renderDocumentsModule() {
permissions = {
create: await hasPermission("documents", "create"),
edit: await hasPermission("documents", "edit"),
publish: await hasPermission("documents", "publish"),
delete: await hasPermission("documents", "delete")
};

await loadDocumentResources();  

moduleContent.innerHTML = `  
<div class="page-heading">  
    <div>  
        <h1>Gestion des documents</h1>  
        <p>  
            Organisez les ressources documentaires et les fichiers  
            téléchargeables du BUEP.  
        </p>  
    </div>  

    <div class="module-label">MODULE DOCUMENTS</div>  
</div>  

<div class="welcome-card">  
    <h2>Espace documentaire</h2>  
    <p>  
        Créez des fiches documentaires, classez-les par catégorie,  
        promotion ou filière, puis associez-y les fichiers correspondants.  
        Les nouveaux documents sont enregistrés comme brouillons.  
    </p>  
</div>  

<div class="panel">  
    <div class="toolbar">  
        <div>  
            <h2>Documents enregistrés</h2>  
            <p style="font-size:12px;color:var(--muted);margin-top:5px">  
                Gestion des informations, des fichiers et des publications.  
            </p>  
        </div>  

        ${permissions.create ? `  
            <button class="btn btn-primary" id="newDocumentButton">  
                ＋ Nouveau document  
            </button>  
        ` : ""}  
    </div>  

    <div class="toolbar">  
        <input id="documentSearch" type="search"  
            placeholder="Rechercher un document...">  

        <select id="documentCategoryFilter">  
            <option value="all">Toutes les catégories</option>  
        </select>  

        <select id="documentStatusFilter">  
            <option value="all">Tous les statuts</option>  
            <option value="draft">Brouillons</option>  
            <option value="published">Publiés</option>  
        </select>  
    </div>  

    <div class="table-wrap">  
        <table>  
            <thead>  
                <tr>  
                    <th>Titre</th>  
                    <th>Catégorie</th>  
                    <th>Promotion / Filière</th>  
                    <th>Statut</th>  
                    <th>Accès</th>  
                    <th>Fichiers</th>  
                    <th>Actions</th>  
                </tr>  
            </thead>  

            <tbody id="documentsTableBody">  
                <tr>  
                    <td colspan="7" class="empty-state">  
                        Chargement des documents...  
                    </td>  
                </tr>  
            </tbody>  
        </table>  
    </div>  

    <div class="notice">  
        <strong>À savoir :</strong>  
        un document doit posséder au moins un fichier avant sa publication.  
        Les documents conditionnels utilisent l'espace de stockage privé.  
    </div>  
</div>  

<div class="panel" id="accessRequestsPanel">

<div class="toolbar">
    <div>
        <h2>Demandes d'accès aux documents</h2>
        <p style="font-size:12px;color:var(--muted);margin-top:5px">
            Demandes envoyées depuis la page Documents du site.
        </p>
    </div>
</div>

<div class="toolbar">
    <div class="access-request-filters">
        <button type="button" class="btn btn-primary" data-access-filter="pending">À traiter</button>
        <button type="button" class="btn" data-access-filter="done">Traitées</button>
        <button type="button" class="btn" data-access-filter="all">Toutes</button>
    </div>
</div>

<div class="table-wrap">
    <table>
        <thead>
            <tr>
                <th>Reçue le</th>
                <th>Document</th>
                <th>Demandeur</th>
                <th>Matricule</th>
                <th>Motif</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody id="accessRequestsBody">
            <tr>
                <td colspan="6" class="empty-state">Chargement des demandes...</td>
            </tr>
        </tbody>
    </table>
</div>

<div class="access-requests-more" id="accessRequestsMore"></div>

<div class="notice">
    <strong>Comment répondre :</strong>
    « Répondre » prépare le message et tente d'ouvrir votre messagerie ;
    vous pouvez aussi copier l'adresse et le texte. Le site n'accorde pas l'accès
    automatiquement : une fois la réponse envoyée et l'accès traité, cliquez sur « Marquer traitée ».
</div>

</div>

<div class="panel">  
    <div class="toolbar">  
        <div>  
            <h2>Catégories documentaires</h2>  
            <p style="font-size:12px;color:var(--muted);margin-top:5px">  
                Organisez les documents selon les catégories disponibles.  
            </p>  
        </div>  

        ${permissions.edit ? `  
            <button class="btn btn-primary" id="newDocumentCategoryButton">  
                ＋ Nouvelle catégorie  
            </button>  
        ` : ""}  
    </div>  

    <div class="table-wrap">  
        <table>  
            <thead>  
                <tr>  
                    <th>Nom français</th>  
                    <th>Nom anglais</th>  
                    <th>Identifiant</th>  
                    <th>État</th>  
                    <th>Actions</th>  
                </tr>  
            </thead>  

            <tbody id="documentCategoriesTableBody">  
                <tr>  
                    <td colspan="5" class="empty-state">  
                        Chargement des catégories...  
                    </td>  
                </tr>  
            </tbody>  
        </table>  
    </div>  
</div>`;  

$("documentYear").innerHTML =  
    '<option value="">Non précisée</option>' +  
    academicYears.map(y => `  
        <option value="${escapeHTML(y.id)}">  
            ${escapeHTML(y.label)}${y.is_current ? " (en cours)" : ""}  
        </option>  
    `).join("");  

// Création d'un document : permission documents.create.  
if(permissions.create) {  
    $("newDocumentButton").addEventListener("click", () => {  
        resetDocumentForm();  

        $("documentFilesArea").classList.remove("hidden");  

        $("documentExistingFiles").innerHTML =  
            `<p class="empty-state">Enregistrez le document avant d'ajouter ses fichiers.</p>`;  

        openModal("documentModal");  
    });  
}  

// Gestion des catégories : permission documents.edit.  
if(permissions.edit) {  
    $("newDocumentCategoryButton").addEventListener("click", () => {  
        resetDocumentCategoryForm();  
        openModal("documentCategoryModal");  
    });  
}  

$("documentSearch").addEventListener("input", renderDocuments);  
$("documentCategoryFilter").addEventListener("change", renderDocuments);  
$("documentStatusFilter").addEventListener("change", renderDocuments);  

await loadDocuments();

bindAccessRequests();
try {
    await loadAccessRequests();
} catch(error) {
    $("accessRequestsBody").innerHTML = `
        <tr>
            <td colspan="6" class="empty-state">Impossible de charger les demandes : ${escapeHTML(error.message)}</td>
        </tr>
    `;
}

}

/* =========================================
MODULE PARAMETRES : CHARGEMENT
========================================= */

async function loadSettings() {
const {data, error} = await supabase
.from("site_settings")
.select("*")
.order("setting_key");

if(error) throw error;  

settingsCache = {};  

(data || []).forEach(setting => {  
    settingsCache[setting.setting_key] = setting;  
});

}

function getSettingValue(key) {
return settingsCache[key]?.setting_value || {};
}

function getSettingPublicUrl(path) {
if(!path) return "";

const {data} = supabase.storage  
    .from(SETTINGS_BUCKET)  
    .getPublicUrl(path);  

return data?.publicUrl || "";

}

/* =========================================
MODULE PARAMETRES : DEFINITION DES RUBRIQUES
Chaque groupe correspond à une ligne de site_settings.
Le champ "key" est la clé setting_key, "title" devient label_fr.
========================================= */

const SETTINGS_SECTIONS = [
{
id: "general",
icon: "▣",
title: "Général",
description: "Identité institutionnelle et coordonnées officielles.",
groups: [
{
key: "institution_identity",
category: "identity",
title: "Identité institutionnelle",
is_public: true,
fields: [
{name: "institution_name", label: "Nom de l'institution", type: "text", required: true},
{name: "acronym", label: "Sigle", type: "text"},
{name: "motto", label: "Devise institutionnelle", type: "text"},
{name: "presentation_fr", label: "Présentation institutionnelle (français)", type: "textarea", rows: 5},
{name: "presentation_en", label: "Institutional presentation (English)", type: "textarea", rows: 5},
{name: "presentation_photo_1", label: "Photo de présentation 1", type: "image", hint: "Affichée avec la présentation sur la page « Le BUEP »."},
{name: "presentation_photo_2", label: "Photo de présentation 2", type: "image", hint: "Facultative."},
{name: "presentation_photo_3", label: "Photo de présentation 3", type: "image", hint: "Facultative."}
]
},
{
key: "official_contacts",
category: "contacts",
title: "Coordonnées officielles",
is_public: true,
fields: [
{name: "email", label: "Adresse électronique", type: "email"},
{name: "phone", label: "Téléphone", type: "text"},
{name: "whatsapp", label: "WhatsApp", type: "text"},
{name: "address", label: "Adresse physique", type: "textarea", rows: 3},
{name: "office_hours", label: "Horaires de disponibilité", type: "text"}
]
}
]
},
{
id: "appearance",
icon: "◈",
title: "Apparence",
description: "Logo, favicon, couleurs et typographie.",
groups: [
{
key: "site_branding",
category: "appearance",
title: "Identité visuelle",
is_public: true,
fields: [
{name: "logo_path", label: "Logo", type: "image", hint: "Image PNG ou SVG recommandée, fond transparent."},
{name: "favicon_path", label: "Favicon", type: "image", hint: "Carré, 32 × 32 px ou 64 × 64 px."},
{name: "logo_alt", label: "Texte alternatif du logo", type: "text"}
]
},
{
key: "site_theme",
category: "appearance",
title: "Couleurs et typographie",
is_public: true,
fields: [
{name: "primary_color", label: "Couleur principale", type: "color"},
{name: "accent_color", label: "Couleur d'accent", type: "color"},
{
name: "font_family",
label: "Police du site",
type: "select",
default: "Arial, sans-serif",
options: [
{value: "Arial, sans-serif", label: "Arial"},
{value: "Georgia, serif", label: "Georgia"},
{value: "Verdana, sans-serif", label: "Verdana"},
{value: "Trebuchet MS, sans-serif", label: "Trebuchet MS"}
]
}
]
}
]
},
{
id: "homepage",
icon: "⌂",
title: "Page d'accueil",
description: "Bannière, présentation et mot du Président.",
groups: [
{
key: "homepage_welcome",
category: "homepage",
title: "Message de bienvenue",
is_public: true,
fields: [
{name: "title_fr", label: "Titre de bienvenue (français)", type: "text"},
{name: "title_en", label: "Welcome title (English)", type: "text"},
{name: "message_fr", label: "Message (français) — laissez vide pour afficher le titre", type: "textarea", rows: 3},
{name: "message_en", label: "Message (English)", type: "textarea", rows: 3}
]
},
{
key: "homepage_hero",
category: "homepage",
title: "Bannière",
is_public: true,
fields: [
{name: "image_path", label: "Image de bannière", type: "image"},
{name: "title_fr", label: "Titre (français)", type: "text"},
{name: "title_en", label: "Title (English)", type: "text"},
{name: "subtitle_fr", label: "Sous-titre (français)", type: "textarea", rows: 3},
{name: "subtitle_en", label: "Subtitle (English)", type: "textarea", rows: 3},
{name: "button_label_fr", label: "Libellé du bouton (français)", type: "text"},
{name: "button_url", label: "Lien du bouton", type: "url"}
]
},
{
key: "president_message",
category: "homepage",
title: "Mot du Président",
is_public: true,
fields: [
{name: "title_fr", label: "Titre de la rubrique (français)", type: "text", default: "Mot du Président"},
{name: "title_en", label: "Section title (English)", type: "text"},
{name: "name", label: "Nom du Président", type: "text"},
{name: "photo_path", label: "Photo", type: "image"},
{name: "content_fr", label: "Message (français) — une ligne vide sépare deux paragraphes", type: "textarea", rows: 6},
{name: "content_en", label: "Message (English)", type: "textarea", rows: 6}
]
}
]
},
{
id: "social",
icon: "◎",
title: "Réseaux sociaux",
description: "Liens vers les plateformes sociales du BUEP.",
groups: [
{
key: "social_networks",
category: "social",
title: "Liens des réseaux sociaux",
is_public: true,
fields: [
{name: "facebook", label: "Facebook", type: "url"},
{name: "instagram", label: "Instagram", type: "url"},
{name: "youtube", label: "YouTube", type: "url"},
{name: "telegram", label: "Telegram", type: "url"},
{name: "linkedin", label: "LinkedIn", type: "url"},
{name: "x", label: "X (Twitter)", type: "url"},
{name: "tiktok", label: "TikTok", type: "url"}
]
}
]
},
{
id: "footer",
icon: "▤",
title: "Pied de page",
description: "Informations et liens affichés en bas du site.",
groups: [
{
key: "footer_information",
category: "footer",
title: "Contenu du pied de page",
is_public: true,
fields: [
{name: "copyright_name", label: "Nom affiché dans la mention de droits", type: "text", hint: "Exemple : BUEP-ENS/PN. Le site affichera : © 2026 BUEP-ENS/PN. Tous droits réservés."},
{name: "show_quick_links", label: "Afficher la colonne « Navigation »", type: "checkbox", default: true},
{name: "show_contacts", label: "Afficher la colonne « Contact »", type: "checkbox", default: true},
{name: "show_social_networks", label: "Afficher la colonne « Réseaux »", type: "checkbox", default: true}
]
}
]
},
{
id: "system",
icon: "⚙",
title: "Système",
description: "Maintenance et paramètres techniques.",
groups: [
{
key: "maintenance_mode",
category: "system",
title: "Mode maintenance",
is_public: true,
fields: [
{name: "enabled", label: "Activer le mode maintenance", type: "checkbox"},
{name: "message_fr", label: "Message affiché (français)", type: "textarea", rows: 3},
{name: "message_en", label: "Message affiché (English)", type: "textarea", rows: 3}
]
},
{
key: "seo_defaults",
category: "system",
title: "Référencement par défaut",
is_public: true,
fields: [
{name: "meta_title", label: "Titre par défaut", type: "text"},
{name: "meta_description", label: "Description par défaut", type: "textarea", rows: 3}
]
}
]
},
{
id: "languages",
icon: "文",
title: "Langues",
description: "Langue par défaut et langues disponibles.",
groups: [
{
key: "language_settings",
category: "languages",
title: "Langues du portail",
is_public: true,
fields: [
{
name: "default_language",
label: "Langue par défaut",
type: "select",
default: "fr",
options: [
{value: "fr", label: "Français"},
{value: "en", label: "Anglais"}
]
},
{name: "english_enabled", label: "Afficher la version anglaise du site", type: "checkbox"}
]
}
]
}
];

/* =========================================
MODULE PARAMETRES : RENDU DES CHAMPS
========================================= */

function renderSettingField(group, field) {
const stored = getSettingValue(group.key)[field.name];
const value = stored ?? field.default;
const name = `${group.key}__${field.name}`;
const disabled = settingsPermissions.edit ? "" : "disabled";
const label = escapeHTML(field.label);
const hint = field.hint
? `<small class="settings-hint">${escapeHTML(field.hint)}</small>`
: "";

if(field.type === "checkbox") {  
    return `  
        <div class="form-group">  
            <label class="settings-checkbox">  
                <input type="checkbox" name="${name}" ${value ? "checked" : ""} ${disabled}>  
                <span>${label}</span>  
            </label>  
            ${hint}  
        </div>  
    `;  
}  

let control = "";  

switch(field.type) {  
    case "textarea":  
        control = `  
            <textarea name="${name}" rows="${field.rows || 4}" ${disabled}>${escapeHTML(value ?? "")}</textarea>  
        `;  
        break;  

    case "select": {  
        const current = String(value ?? field.default ?? "");  

        control = `  
            <select name="${name}" ${disabled}>  
                ${field.options.map(option => `  
                    <option value="${escapeHTML(option.value)}"  
                        ${String(option.value) === current ? "selected" : ""}>  
                        ${escapeHTML(option.label)}  
                    </option>  
                `).join("")}  
            </select>  
        `;  
        break;  
    }  

    case "color":  
        control = `  
            <input type="color" name="${name}"  
                value="${escapeHTML(value || "#0b1f3a")}" ${disabled}>  
        `;  
        break;  

    case "image": {  
        const url = getSettingPublicUrl(value);  

        control = `  
            <div class="settings-image-field">  
                ${url  
                    ? `<img class="settings-image-preview" src="${escapeHTML(url)}" alt="">`  
                    : `<div class="settings-image-empty">Aucun fichier enregistré</div>`}  
                <input type="file" name="${name}" accept="image/*" ${disabled}>  
                ${url  
                    ? `<label class="settings-checkbox settings-image-remove">  
                        <input type="checkbox" name="${name}__remove" value="1" ${disabled}>  
                        <span>Retirer cette image</span>  
                    </label>`  
                    : ""}  
            </div>  
        `;  
        break;  
    }  

    default:  
        control = `  
            <input type="${escapeHTML(field.type)}" name="${name}"  
                value="${escapeHTML(value ?? "")}"  
                ${field.required ? "required" : ""} ${disabled}>  
        `;  
}  

return `  
    <div class="form-group">  
        <label>${label}</label>  
        ${control}  
        ${hint}  
    </div>  
`;

}

/* =========================================
MODULE PARAMETRES : RENDU D'UNE RUBRIQUE
========================================= */

function renderSettingsSection(sectionId, feedback = null) {
const section = SETTINGS_SECTIONS.find(item => item.id === sectionId);
const container = $("settingsSectionContent");

if(!section || !container) return;  

container.innerHTML = `  
    <div class="settings-section-heading">  
        <div>  
            <h2>${escapeHTML(section.title)}</h2>  
            <p>${escapeHTML(section.description)}</p>  
        </div>  
    </div>  

    <form id="settingsForm">  
        ${section.groups.map(group => `  
            <div class="settings-form-section">  
                <h3>${escapeHTML(group.title)}</h3>  
                ${group.fields.map(field => renderSettingField(group, field)).join("")}  
            </div>  
        `).join("")}  

        <div class="settings-form-actions">  
            <button type="submit" class="btn btn-primary"  
                ${settingsPermissions.edit ? "" : "disabled"}>  
                Enregistrer les modifications  
            </button>  
        </div>  

        <div id="settingsMessage">  
            ${feedback  
                ? `<div class="notice ${escapeHTML(feedback.type)}">${escapeHTML(feedback.text)}</div>`  
                : ""}  
        </div>  
    </form>  
`;  

if(settingsPermissions.edit) {  
    $("settingsForm").addEventListener("submit", event => {  
        saveSettingsSection(event, section);  
    });  
}

}

/* =========================================
MODULE PARAMETRES : TELEVERSEMENT ET ENREGISTREMENT
========================================= */

async function uploadSettingImage(groupKey, fieldName, file) {
if(!file.type.startsWith("image/")) {
throw new Error(`Le fichier « ${file.name} » n'est pas une image.`);
}

if(file.size > 5 * 1024 * 1024) {  
    throw new Error(`L'image « ${file.name} » dépasse 5 Mo.`);  
}  

const extension = (file.name.split(".").pop() || "png").toLowerCase();  
const path = `settings/${groupKey}/${fieldName}-${Date.now()}.${extension}`;  

const {error} = await supabase.storage  
    .from(SETTINGS_BUCKET)  
    .upload(path, file, {  
        cacheControl: "3600",  
        upsert: false,  
        contentType: file.type  
    });  

if(error) throw error;  

return path;

}

async function saveSettingsSection(event, section) {
event.preventDefault();

if(!settingsPermissions.edit) return;  

const form = $("settingsForm");  
const button = form.querySelector('[type="submit"]');  
const formData = new FormData(form);  

button.disabled = true;  
button.textContent = "Enregistrement...";  

try {  
    const rows = [];
    const storagePathsToRemove = [];

    for(const group of section.groups) {  
        const value = {...getSettingValue(group.key)};  

        for(const field of group.fields) {  
            const name = `${group.key}__${field.name}`;  

            if(field.type === "checkbox") {  
                value[field.name] = formData.get(name) === "on";  
                continue;  
            }  

            if(field.type === "image") {  
                const file = formData.get(name);  
                const previousPath = value[field.name] || "";  

                if(file instanceof File && file.size > 0) {  
                    value[field.name] = await uploadSettingImage(  
                        group.key,  
                        field.name,  
                        file  
                    );  

                    if(previousPath && previousPath !== value[field.name]) {  
                        storagePathsToRemove.push(previousPath);  
                    }  
                } else if(formData.get(`${name}__remove`) === "1") {  
                    value[field.name] = "";  

                    if(previousPath) storagePathsToRemove.push(previousPath);  
                }  

                continue;  
            }  

            const raw = String(formData.get(name) ?? "").trim();  

            value[field.name] = field.type === "number"  
                ? Number(raw) || 0  
                : raw;  
        }  

        rows.push({  
            setting_key: group.key,  
            category: group.category,  
            label_fr: group.title,  
            setting_value: value,  
            is_public: group.is_public  
        });  
    }  

    const {error} = await supabase  
        .from("site_settings")  
        .upsert(rows, {onConflict: "setting_key"});  

    if(error) throw error;  

    // Les fichiers remplacés ou retirés ne sont supprimés du stockage
    // qu'une fois l'enregistrement confirmé.
    if(storagePathsToRemove.length) {  
        const {error: storageError} = await supabase.storage  
            .from(SETTINGS_BUCKET)  
            .remove(storagePathsToRemove);  

        if(storageError) {  
            console.error("Fichiers de paramètres non supprimés :", storageError);  
        }  
    }  

    await loadSettings();  

    renderSettingsSection(section.id, {  
        type: "success",  
        text: "Les paramètres ont été enregistrés."  
    });  

} catch(error) {  
    console.error("Erreur paramètres :", error);  

    button.disabled = false;  
    button.textContent = "Enregistrer les modifications";  

    const message = $("settingsMessage");  

    if(message) {  
        message.innerHTML = `  
            <div class="notice error">  
                Échec de l'enregistrement : ${escapeHTML(error.message)}  
            </div>  
        `;  
    }  
}

}

/* =========================================
MODULE PARAMETRES : INTERFACE PRINCIPALE
========================================= */

async function renderSettingsModule() {
settingsPermissions = {
view: await hasPermission("settings", "view"),
edit: await hasPermission("settings", "edit")
};

if(!settingsPermissions.view) {  
    throw new Error(  
        "Vous ne disposez pas du droit de consultation des paramètres."  
    );  
}  

let loadError = null;  

try {  
    await loadSettings();  
} catch(error) {  
    console.error("Chargement des paramètres :", error);  
    loadError = error;  
}  

const settingCount = Object.keys(settingsCache).length;  

moduleContent.innerHTML = `  
    <div class="page-heading">  
        <div>  
            <h1>Paramètres du portail</h1>  
            <p>  
                Configurez l'identité, l'apparence et le fonctionnement  
                du portail institutionnel du BUEP.  
            </p>  
        </div>  

        <div class="module-label">CONFIGURATION DU PORTAIL</div>  
    </div>  

    <div class="welcome-card">  
        <h2>Centre de configuration</h2>  
        <p>  
            Gérez les informations institutionnelles et les éléments  
            visibles sur le portail public depuis cet espace.  
        </p>  
    </div>  

    <div class="settings-layout">  
        <div class="settings-menu panel">  
            <h2>Rubriques</h2>  

            <div class="settings-menu-list">  
                ${SETTINGS_SECTIONS.map((section, index) => `  
                    <button  
                        type="button"  
                        class="settings-menu-item ${index === 0 ? "active" : ""}"  
                        data-settings-tab="${escapeHTML(section.id)}"  
                    >  
                        <span>${section.icon}</span>  
                        <span>  
                            <strong>${escapeHTML(section.title)}</strong>  
                            <small>${escapeHTML(section.description)}</small>  
                        </span>  
                    </button>  
                `).join("")}  
            </div>  
        </div>  

        <div class="settings-content panel">  
            <div id="settingsSectionContent"></div>  

            <div class="settings-summary">  
                <div>  
                    <strong>${loadError ? "—" : settingCount}</strong>  
                    <span>Paramètres disponibles</span>  
                </div>  

                <div>  
                    <strong>${settingsPermissions.edit ? "Oui" : "Non"}</strong>  
                    <span>Autorisation de modification</span>  
                </div>  
            </div>  

            ${loadError ? `  
                <div class="notice error">  
                    <strong>Erreur :</strong>  
                    impossible de charger les paramètres.  
                    ${escapeHTML(loadError.message)}  
                </div>  
            ` : ""}  
        </div>  
    </div>  
`;  

moduleContent.querySelectorAll("[data-settings-tab]").forEach(button => {  
    button.addEventListener("click", () => {  
        moduleContent.querySelectorAll("[data-settings-tab]")  
            .forEach(item => item.classList.remove("active"));  

        button.classList.add("active");  
        renderSettingsSection(button.dataset.settingsTab);  
    });  
});  

renderSettingsSection("general");

}

/* =========================================
   MODULE MESSAGES
   Tables : contact_messages, message_replies, message_categories
   Statuts provisoires : table vide au moment de l'écriture.
========================================= */

// Valeurs exactes acceptées par contact_messages_status_check.
const MESSAGE_STATUSES = [
    {value: "new", label: "Nouveau"},
    {value: "read", label: "Lu"},
    {value: "in_progress", label: "En cours"},
    {value: "processed", label: "Traité"}
];

let messagesCache = [];
let messageCategoriesCache = [];
let messagesPermissions = {view: false, edit: false};
let currentMessageId = null;

function messageStatusLabel(value) {
    return MESSAGE_STATUSES.find(s => s.value === value)?.label || value || "—";
}

function getMessageCategoryName(categoryId) {
    return messageCategoriesCache.find(c => c.id === categoryId)?.name_fr || "—";
}

async function loadMessagesData() {
    const [messagesResult, categoriesResult] = await Promise.all([
        supabase.from("contact_messages")
            .select("id,reference,category_id,sender_name,sender_email,sender_phone,subject,message_body,status,is_archived,processed_at,created_at,updated_at")
            .order("created_at", {ascending: false}),

        supabase.from("message_categories")
            .select("id,name_fr,is_active,display_order")
            .order("display_order")
    ]);

    if(messagesResult.error) throw messagesResult.error;
    if(categoriesResult.error) throw categoriesResult.error;

    messagesCache = messagesResult.data || [];
    messageCategoriesCache = categoriesResult.data || [];
}

async function loadMessageReplies(messageId) {
    const {data, error} = await supabase
        .from("message_replies")
        .select("id,author_name,reply_body,is_internal_note,created_at")
        .eq("message_id", messageId)
        .order("created_at");

    if(error) throw error;

    return data || [];
}

/* ---------- Liste ---------- */

async function renderMessagesModule() {
    messagesPermissions = {
        view: await hasPermission("messages", "view"),
        edit: await hasPermission("messages", "edit"),
        delete: await hasPermission("messages", "delete")
    };

    await loadMessagesData();
    renderMessagesShell();
    renderMessagesTable();
}

function renderMessagesShell() {
    moduleContent.innerHTML = `
    <div class="page-heading">
        <div>
            <h1>Messages reçus</h1>
            <p>
                Consultez les messages du formulaire de contact, suivez leur
                traitement et enregistrez vos réponses.
            </p>
        </div>
        <div class="module-label">MODULE MESSAGES</div>
    </div>

    <div class="panel">
        <div class="toolbar">
            <input id="messageSearch" type="search"
                placeholder="Rechercher un nom, un e-mail, un sujet...">

            <select id="messageStatusFilter">
                <option value="all">Tous les statuts</option>
                ${MESSAGE_STATUSES.map(s => `
                    <option value="${escapeHTML(s.value)}">${escapeHTML(s.label)}</option>
                `).join("")}
            </select>

            <label class="settings-checkbox">
                <input type="checkbox" id="messageShowArchived">
                <span>Afficher aussi les archivés</span>
            </label>
        </div>

        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Référence</th>
                        <th>Expéditeur</th>
                        <th>Sujet</th>
                        <th>Catégorie</th>
                        <th>Statut</th>
                        <th>Reçu le</th>
                        <th>Actions</th>
                    </tr>
                </thead>

                <tbody id="messagesTableBody"></tbody>
            </table>
        </div>

        <div class="access-requests-more" id="messagesMore"></div>

        <div class="notice">
            <strong>À savoir :</strong>
            « Répondre » prépare le message et tente d'ouvrir votre messagerie.
            « Enregistrer dans l'historique » garde une trace de la réponse.
        </div>
    </div>`;

    $("messageSearch").addEventListener("input", resetMessagesPage);
    $("messageStatusFilter").addEventListener("change", resetMessagesPage);
    $("messageShowArchived").addEventListener("change", resetMessagesPage);

    $("messagesMore").addEventListener("click", event => {
        const button = event.target.closest("[data-message-page]");
        if(!button) return;

        messagesLimit = button.dataset.messagePage === "more"
            ? messagesLimit + 9
            : 9;
        renderMessagesTable();
    });

    if(messagesPermissions.delete) {
        document.querySelector("#moduleContent .panel .toolbar").insertAdjacentHTML(
            "beforeend",
            '<button id="purgeArchivedButton" class="btn btn-danger" type="button">Vider les archives</button>'
        );

        $("purgeArchivedButton").addEventListener("click", purgeArchivedMessages);
    }
}

let messagesLimit = 9;

function resetMessagesPage() {
    messagesLimit = 9;
    renderMessagesTable();
}

// Texte prérempli : message d'origine cité sous la réponse.
function messageDefaultReply(message) {
    return [
        "Bonjour " + (message.sender_name || "") + ",",
        "",
        "",
        "",
        "Cordialement,",
        "Le BUEP-ENS/PN",
        "",
        "--- Message reçu le " + formatDate(message.created_at) + " ---",
        String(message.message_body || "")
    ].join("\n");
}

function openMessageReply(id) {
    const message = messagesCache.find(m => String(m.id) === String(id));
    if(!message) return;

    openMailReply({
        to: message.sender_email,
        subject: "Réponse à : " + (message.subject || ""),
        message: messageDefaultReply(message),
        onRecord: body => recordMessageReply(message.id, body)
    });
}

// Enregistre la réponse dans l'historique et passe le message à « En cours » s'il était nouveau.
async function recordMessageReply(messageId, body) {
    const { error } = await supabase
        .from("message_replies")
        .insert({
            message_id: messageId,
            author_id: currentProfile.user_id,
            author_name: currentProfile.display_name || "Administrateur",
            reply_body: body,
            is_internal_note: false
        });

    if(error) throw error;

    const current = messagesCache.find(m => m.id === messageId);

    if(current?.status === "new") {
        const { error: statusError } = await supabase
            .from("contact_messages")
            .update({ status: "in_progress", updated_at: new Date().toISOString() })
            .eq("id", messageId);

        if(statusError) throw statusError;
    }

    await loadMessagesData();
    renderMessagesTable();
}

function renderMessagesTable() {
    const body = $("messagesTableBody");
    if(!body) return;

    const search = $("messageSearch").value.trim().toLowerCase();
    const status = $("messageStatusFilter").value;
    const showArchived = $("messageShowArchived").checked;

    const rows = messagesCache.filter(message => {
        if(!showArchived && message.is_archived) return false;

        if(status !== "all" && message.status !== status) return false;

        if(!search) return true;

        return [message.reference, message.sender_name, message.sender_email, message.subject]
            .some(value => String(value || "").toLowerCase().includes(search));
    });

    renderMessagesMore(rows.length, Math.min(messagesLimit, rows.length));

    if(!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">Aucun message trouvé.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.slice(0, messagesLimit).map(message => `
        <tr>
            <td><strong>${escapeHTML(message.reference || "—")}</strong></td>

            <td>
                ${escapeHTML(message.sender_name)}<br>
                <small>${escapeHTML(message.sender_email)}</small>
            </td>

            <td>${escapeHTML(message.subject)}</td>

            <td>${escapeHTML(getMessageCategoryName(message.category_id))}</td>

            <td>
                <span class="badge ${escapeHTML(message.status)}">
                    ${escapeHTML(messageStatusLabel(message.status))}
                </span>
                ${message.is_archived
                    ? `<span class="badge archived">Archivé</span>`
                    : ""}
            </td>

            <td>${formatDate(message.created_at)}</td>

            <td>
                <div class="actions">
                    <button class="btn btn-light"
                        data-message-open="${escapeHTML(message.id)}">
                        Ouvrir
                    </button>
                    <button class="btn"
                        data-message-reply="${escapeHTML(message.id)}">
                        Répondre
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

    body.querySelectorAll("[data-message-open]").forEach(button => {
        button.addEventListener("click", () => {
            openMessage(button.dataset.messageOpen);
        });
    });

    body.querySelectorAll("[data-message-reply]").forEach(button => {
        button.addEventListener("click", () => {
            openMessageReply(button.dataset.messageReply);
        });
    });
}

function renderMessagesMore(total, shown) {
    const box = $("messagesMore");
    if(!box) return;

    if(!total) {
        box.innerHTML = "";
        return;
    }

    box.innerHTML = `
        <p class="access-requests-count">Affichage de ${shown} message${shown > 1 ? "s" : ""} sur ${total}</p>
        <div class="access-requests-buttons">
            ${messagesLimit > 9 ? `<button type="button" class="btn" data-message-page="less">Voir moins</button>` : ""}
            ${shown < total ? `<button type="button" class="btn btn-primary" data-message-page="more">Voir plus</button>` : ""}
        </div>
    `;
}

/* ---------- Détail ---------- */

async function openMessage(id) {
    const message = messagesCache.find(m => m.id === id);
    if(!message) return;

    currentMessageId = id;

    let replies = [];

    try {
        replies = await loadMessageReplies(id);
    } catch(error) {
        alert("Historique indisponible : " + error.message);
    }

    renderMessageDetail(message, replies);
}

function renderMessageDetail(message, replies) {
    const edit = messagesPermissions.edit;
    const disabled = edit ? "" : "disabled";

    moduleContent.innerHTML = `
    <div class="page-heading">
        <div>
            <h1>${escapeHTML(message.subject)}</h1>
            <p>
                Référence ${escapeHTML(message.reference || "—")}
                · reçu le ${formatDate(message.created_at)}
            </p>
        </div>

        <button class="btn btn-light" id="backToMessages" type="button">
            ← Retour à la liste
        </button>
    </div>

    <div class="panel">
        <h2>Expéditeur et message</h2>

        <p style="font-size:13px;margin-bottom:12px">
            ${escapeHTML(message.sender_name)}
            · <a href="mailto:${escapeHTML(message.sender_email)}">${escapeHTML(message.sender_email)}</a>
            ${message.sender_phone ? `· ${escapeHTML(message.sender_phone)}` : ""}
        </p>

        <p style="font-size:12px;color:var(--muted);margin-bottom:12px">
            Catégorie : ${escapeHTML(getMessageCategoryName(message.category_id))}
        </p>

        <div class="actions" style="margin-bottom:12px">
            <button type="button" class="btn btn-primary" id="messageReplyMail">Répondre</button>
        </div>

        <div class="step-item" style="white-space:pre-wrap;font-size:13px">${escapeHTML(message.message_body)}</div>
    </div>

    <div class="panel">
        <h2>Statut et archivage</h2>

        <form id="messageStatusForm" class="toolbar">
            <select name="status" ${disabled}>
                ${MESSAGE_STATUSES.map(s => `
                    <option value="${escapeHTML(s.value)}"
                        ${s.value === message.status ? "selected" : ""}>
                        ${escapeHTML(s.label)}
                    </option>
                `).join("")}
            </select>

            <div class="actions">
                <button type="submit" class="btn btn-primary" ${disabled}>
                    Mettre à jour le statut
                </button>

                <button type="button" id="toggleArchiveMessage"
                    class="btn ${message.is_archived ? "btn-success" : "btn-danger"}"
                    ${disabled}>
                    ${message.is_archived ? "Restaurer" : "Archiver"}
                </button>
            </div>
        </form>
    </div>

    <div class="panel">
        <h2>Historique des réponses</h2>

        ${replies.length ? replies.map(reply => `
            <div class="step-item"
                style="${reply.is_internal_note ? "background:#fff8e9;" : ""}">
                <strong>${escapeHTML(reply.author_name)}</strong>
                ${reply.is_internal_note ? "<small> · Note interne</small>" : ""}
                <small> · ${formatDate(reply.created_at)}</small>
                <p style="white-space:pre-wrap">${escapeHTML(reply.reply_body)}</p>
            </div>
        `).join("") : `
            <p class="empty-state">Aucune réponse enregistrée.</p>
        `}

        <form id="messageReplyForm" style="margin-top:18px">
            <div class="form-group">
                <label for="replyBody">Nouvelle réponse</label>
                <textarea id="replyBody" rows="5" ${disabled}></textarea>
            </div>

            <label class="settings-checkbox">
                <input type="checkbox" id="replyInternal" ${disabled}>
                <span>Note interne (réservée à l'équipe)</span>
            </label>

            <div class="settings-form-actions">
                <button type="submit" class="btn btn-primary" ${disabled}>
                    Enregistrer la réponse
                </button>
            </div>
        </form>

        <div class="notice">
            Les réponses sont enregistrées dans l'historique. Elles ne sont
            pas envoyées par e-mail depuis cette page.
        </div>
    </div>`;

    $("backToMessages").addEventListener("click", () => {
        renderMessagesShell();
        renderMessagesTable();
    });

    $("messageReplyMail").addEventListener("click", () => openMessageReply(message.id));

    if(edit) {
        $("messageStatusForm").addEventListener("submit", saveMessageStatus);
        $("toggleArchiveMessage").addEventListener("click", () => toggleMessageArchive(message));
        $("messageReplyForm").addEventListener("submit", addMessageReply);
    }

    if(messagesPermissions.delete && message.is_archived) {
        moduleContent.insertAdjacentHTML("beforeend", `
            <div class="panel">
                <h2>Suppression définitive</h2>
                <p style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.6">
                    La suppression efface le message et son historique de réponses.
                    Cette action est irréversible.
                </p>
                <button type="button" id="deleteMessageButton" class="btn btn-danger">
                    Supprimer définitivement
                </button>
            </div>
        `);

        $("deleteMessageButton").addEventListener("click", () => deleteMessagePermanently(message));
    }
}

async function deleteMessagesByIds(ids) {
    const {error: repliesError} = await deleteChecked("message_replies", "message_id", ids, "messages");

    if(repliesError) throw repliesError;

    // Sans .select(), une suppression bloquée par RLS ne renvoie aucune erreur.
    const {data: deleted, error} = await deleteChecked("contact_messages", "id", ids, "messages");

    if(error) throw error;

    if(!deleted?.length) {
        throw new Error("Aucune ligne supprimée : la politique de sécurité (RLS) de contact_messages bloque probablement la suppression.");
    }
}

async function deleteMessagePermanently(message) {
    if(!messagesPermissions.delete) {
        alert("Vous ne disposez pas du droit de suppression.");
        return;
    }

    if(!message.is_archived) {
        alert("Archivez le message avant de le supprimer définitivement.");
        return;
    }

    if(!confirm(
        "SUPPRESSION DÉFINITIVE\n\n" +
        `Supprimer le message ${message.reference || ""} de ${message.sender_name} ?\n\n` +
        "Son historique de réponses sera également supprimé. Action irréversible."
    )) return;

    try {
        await deleteMessagesByIds([message.id]);

        currentMessageId = null;
        await loadMessagesData();
        renderMessagesShell();
        renderMessagesTable();

        alert("Message supprimé définitivement.");

    } catch(error) {
        alert("Suppression impossible : " + error.message);
    }
}

async function purgeArchivedMessages() {
    if(!messagesPermissions.delete) {
        alert("Vous ne disposez pas du droit de suppression.");
        return;
    }

    const ids = messagesCache
        .filter(message => message.is_archived)
        .map(message => message.id);

    if(!ids.length) {
        alert("Aucun message archivé à supprimer.");
        return;
    }

    if(!confirm(`Supprimer définitivement ${ids.length} message(s) archivé(s) ?\n\nAction irréversible.`)) return;

    if(!confirm("Dernière confirmation : ces messages et leurs réponses seront effacés.")) return;

    try {
        await deleteMessagesByIds(ids);

        await loadMessagesData();
        renderMessagesShell();
        renderMessagesTable();

        alert(`${ids.length} message(s) supprimé(s).`);

    } catch(error) {
        alert("Suppression impossible : " + error.message);
    }
}

async function refreshMessageDetail() {
    await loadMessagesData();

    const message = messagesCache.find(m => m.id === currentMessageId);

    if(!message) {
        renderMessagesShell();
        renderMessagesTable();
        return;
    }

    const replies = await loadMessageReplies(currentMessageId);

    renderMessageDetail(message, replies);
}

async function saveMessageStatus(event) {
    event.preventDefault();

    if(!messagesPermissions.edit) return;

    const status = new FormData(event.target).get("status");
    const current = messagesCache.find(m => m.id === currentMessageId);
    const closing = status === "processed";

    const {error} = await supabase
        .from("contact_messages")
        .update({
            status,
            processed_at: closing
                ? (current?.processed_at || new Date().toISOString())
                : null,
            updated_at: new Date().toISOString()
        })
        .eq("id", currentMessageId);

    if(error) {
        alert("Mise à jour impossible : " + error.message);
        return;
    }

    await refreshMessageDetail();
}

async function toggleMessageArchive(message) {
    if(!messagesPermissions.edit) return;

    const archive = !message.is_archived;

    if(!confirm(archive ? "Archiver ce message ?" : "Restaurer ce message ?")) return;

    const {error} = await supabase
        .from("contact_messages")
        .update({
            is_archived: archive,
            updated_at: new Date().toISOString()
        })
        .eq("id", message.id);

    if(error) {
        alert("Action impossible : " + error.message);
        return;
    }

    await refreshMessageDetail();
}

async function addMessageReply(event) {
    event.preventDefault();

    if(!messagesPermissions.edit) return;

    const form = event.target;
    const body = form.querySelector("#replyBody").value.trim();
    const internal = form.querySelector("#replyInternal").checked;
    const button = form.querySelector('[type="submit"]');

    if(!body) {
        alert("La réponse ne peut pas être vide.");
        return;
    }

    button.disabled = true;

    try {
        const {error} = await supabase
            .from("message_replies")
            .insert({
                message_id: currentMessageId,
                author_id: currentProfile.user_id,
                author_name: currentProfile.display_name || "Administrateur",
                reply_body: body,
                is_internal_note: internal
            });

        if(error) throw error;

        // Une première réponse fait passer le message de « Nouveau » à « En cours ».
        const current = messagesCache.find(m => m.id === currentMessageId);

        if(current?.status === "new") {
            const {error: statusError} = await supabase
                .from("contact_messages")
                .update({
                    status: "in_progress",
                    updated_at: new Date().toISOString()
                })
                .eq("id", currentMessageId);

            if(statusError) throw statusError;
        }

        await refreshMessageDetail();

    } catch(error) {
        alert("Enregistrement impossible : " + error.message);
        button.disabled = false;
    }
}

/* =========================================
MODULE GALERIE
========================================= */

const GALLERY_BUCKET = "buep-gallery";

const GALLERY_ALBUM_COLUMNS =
"id,category_id,academic_year_id,slug,title_fr,title_en,description_fr,description_en,event_date,location,status,published_at,display_order,cover_media_id,created_at,updated_at";

const GALLERY_MEDIA_COLUMNS =
"id,album_id,media_type,storage_path,original_file_name,mime_type,file_size,title_fr,title_en,caption_fr,caption_en,alt_text_fr,alt_text_en,event_date,display_order,is_featured,created_at";

let galleryPermissions = {
create: false,
edit: false,
delete: false,
publish: false
};

let galleryCategoriesCache = [];
let galleryAlbumsCache = [];
let galleryMediaCache = [];
let currentGalleryAlbumId = null;
let galleryPreviewUrls = {};

function nullIfEmpty(value) {
const text = String(value ?? "").trim();
return text || null;
}

function getGalleryAlbum(id) {
return galleryAlbumsCache.find(album => album.id === id) || null;
}

function getGalleryMedia(id) {
return galleryMediaCache.find(item => item.id === id) || null;
}

function getGalleryCategoryName(id) {
const category = galleryCategoriesCache.find(item => item.id === id);
return category ? category.name_fr : "—";
}

function getAlbumMedia(albumId) {
return galleryMediaCache
.filter(item => item.album_id === albumId)
.sort((a, b) =>
(a.display_order ?? 0) - (b.display_order ?? 0) ||
new Date(a.created_at) - new Date(b.created_at)
);
}

/* -----------------------------------------
Permissions : publication = publier + valider
----------------------------------------- */

async function loadGalleryPermissions() {
const [create, edit, remove, publish, validate] = await Promise.all([
hasPermission("gallery", "create"),
hasPermission("gallery", "edit"),
hasPermission("gallery", "delete"),
hasPermission("gallery", "publish"),
hasPermission("gallery", "validate")
]);

return {
    create,
    edit,
    delete: remove,
    publish: publish && validate
};

}

/* -----------------------------------------
Chargement
----------------------------------------- */

async function loadGalleryResources() {
const [categoriesResult, albumsResult, mediaResult, yearsResult] = await Promise.all([
supabase.from("gallery_categories")
.select("id,name_fr,name_en,slug,display_order,is_active")
.order("display_order"),

    supabase.from("albums")
        .select(GALLERY_ALBUM_COLUMNS)
        .order("display_order")
        .order("created_at", {ascending: false}),

    supabase.from("media_items")
        .select(GALLERY_MEDIA_COLUMNS)
        .order("display_order"),

    academicYears.length
        ? Promise.resolve({data: academicYears, error: null})
        : supabase.from("academic_years")
            .select("id,label,is_current,start_date,end_date")
            .order("start_date", {ascending: false})
]);

if(categoriesResult.error) throw categoriesResult.error;
if(albumsResult.error) throw albumsResult.error;
if(mediaResult.error) throw mediaResult.error;
if(yearsResult.error) throw yearsResult.error;

galleryCategoriesCache = categoriesResult.data || [];
galleryAlbumsCache = albumsResult.data || [];
galleryMediaCache = mediaResult.data || [];
academicYears = yearsResult.data || [];

}

function fillGalleryFilters() {
const select = $("galleryCategoryFilter");
if(!select) return;

const current = select.value || "all";

select.innerHTML =
    '<option value="all">Toutes les catégories</option>' +
    galleryCategoriesCache.map(category => `
        <option value="${escapeHTML(category.id)}">
            ${escapeHTML(category.name_fr)}
        </option>
    `).join("");

select.value = current;

if(!select.value) select.value = "all";

}

function fillGalleryAlbumOptions(categoryId, yearId) {
$("galleryAlbumCategory").innerHTML =
'<option value="">Aucune</option>' +
galleryCategoriesCache
.filter(category => category.is_active || category.id === categoryId)
.map(category => `
<option value="${escapeHTML(category.id)}">
${escapeHTML(category.name_fr)}
</option>
`).join("");

$("galleryAlbumCategory").value = categoryId || "";

$("galleryAlbumYear").innerHTML =
    '<option value="">Non précisée</option>' +
    academicYears.map(year => `
        <option value="${escapeHTML(year.id)}">
            ${escapeHTML(year.label)}${year.is_current ? " (en cours)" : ""}
        </option>
    `).join("");

$("galleryAlbumYear").value = yearId || "";

}

/* -----------------------------------------
Liste des albums
----------------------------------------- */

function renderGalleryAlbums() {
const search = ($("galleryAlbumSearch").value || "").trim().toLowerCase();
const categoryFilter = $("galleryCategoryFilter").value;
const statusFilter = $("galleryStatusFilter").value;

const rows = galleryAlbumsCache.filter(album => {
    const text = [
        album.title_fr,
        album.title_en,
        album.location,
        album.slug
    ].join(" ").toLowerCase();

    return (!search || text.includes(search)) &&
        (categoryFilter === "all" || album.category_id === categoryFilter) &&
        (statusFilter === "all" || album.status === statusFilter);
});

const tbody = $("galleryAlbumsTableBody");

if(!rows.length) {
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="empty-state">
                Aucun album ne correspond à ces critères.
            </td>
        </tr>`;
    return;
}

tbody.innerHTML = rows.map(album => {
    const id = escapeHTML(album.id);
    const count = getAlbumMedia(album.id).length;
    const actions = [];

    actions.push(`
        <button class="btn btn-light" data-action="media" data-id="${id}">
            Photos
        </button>`);

    if(galleryPermissions.edit) {
        actions.push(`
            <button class="btn btn-light" data-action="edit-album" data-id="${id}">
                Modifier
            </button>`);
    }

    if(galleryPermissions.publish) {
        actions.push(`
            <button class="btn btn-light" data-action="toggle-publish" data-id="${id}">
                ${album.status === "published" ? "Dépublier" : "Publier"}
            </button>`);
    }

    if(galleryPermissions.delete) {
        actions.push(`
            <button class="btn btn-light" data-action="delete-album" data-id="${id}">
                Supprimer
            </button>`);
    }

    return `
        <tr>
            <td>
                <strong>${escapeHTML(album.title_fr)}</strong><br>
                <span style="font-size:12px;color:var(--muted)">${escapeHTML(album.slug)}</span>
            </td>
            <td>${escapeHTML(getGalleryCategoryName(album.category_id))}</td>
            <td>${formatDate(album.event_date)}</td>
            <td>${count}</td>
            <td>
                <span class="badge ${escapeHTML(album.status)}">
                    ${escapeHTML(statusLabel(album.status))}
                </span>
            </td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${actions.join("")}
                </div>
            </td>
        </tr>`;
}).join("");

}

function renderGalleryCategories() {
const tbody = $("galleryCategoriesTableBody");
if(!tbody) return;

if(!galleryCategoriesCache.length) {
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">Aucune catégorie.</td>
        </tr>`;
    return;
}

tbody.innerHTML = galleryCategoriesCache.map(category => {
    const id = escapeHTML(category.id);

    const actions = galleryPermissions.edit
        ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-light" data-action="edit-category" data-id="${id}">
                    Modifier
                </button>
                <button class="btn btn-light" data-action="toggle-category" data-id="${id}">
                    ${category.is_active ? "Désactiver" : "Activer"}
                </button>
            </div>`
        : "—";

    return `
        <tr>
            <td>${escapeHTML(category.name_fr)}</td>
            <td>${escapeHTML(category.name_en || "—")}</td>
            <td>${escapeHTML(category.slug)}</td>
            <td>${category.is_active ? "Active" : "Inactive"}</td>
            <td>${actions}</td>
        </tr>`;
}).join("");

}

/* -----------------------------------------
Albums : création, modification
----------------------------------------- */

function openGalleryAlbumForm(id = null) {
const album = id ? getGalleryAlbum(id) : null;

if(id ? !galleryPermissions.edit : !galleryPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

$("galleryAlbumId").value = album?.id || "";
$("galleryAlbumModalTitle").textContent = album ? "Modifier l'album" : "Nouvel album";
$("galleryAlbumTitleFr").value = album?.title_fr || "";
$("galleryAlbumTitleEn").value = album?.title_en || "";
$("galleryAlbumSlug").value = album?.slug || "";
$("galleryAlbumDescriptionFr").value = album?.description_fr || "";
$("galleryAlbumDescriptionEn").value = album?.description_en || "";
$("galleryAlbumDate").value = album?.event_date || "";
$("galleryAlbumLocation").value = album?.location || "";
$("galleryAlbumOrder").value = album?.display_order ?? 0;

fillGalleryAlbumOptions(album?.category_id, album?.academic_year_id);

openModal("galleryAlbumModal");

}

async function saveGalleryAlbum(event) {
event.preventDefault();

const id = $("galleryAlbumId").value;

if(id ? !galleryPermissions.edit : !galleryPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const titleFr = $("galleryAlbumTitleFr").value.trim();
const slug = slugify($("galleryAlbumSlug").value);

if(!titleFr || !slug) {
    return alert("Le titre français et l'identifiant sont obligatoires.");
}

const button = $("saveGalleryAlbumButton");
button.disabled = true;

try {
    const payload = {
        title_fr: titleFr,
        title_en: nullIfEmpty($("galleryAlbumTitleEn").value),
        slug,
        category_id: $("galleryAlbumCategory").value || null,
        academic_year_id: $("galleryAlbumYear").value || null,
        event_date: $("galleryAlbumDate").value || null,
        location: nullIfEmpty($("galleryAlbumLocation").value),
        description_fr: nullIfEmpty($("galleryAlbumDescriptionFr").value),
        description_en: nullIfEmpty($("galleryAlbumDescriptionEn").value),
        display_order: Number($("galleryAlbumOrder").value) || 0,
        updated_by: currentProfile.user_id,
        updated_at: new Date().toISOString()
    };

    if(id) {
        const {data, error} = await supabase
            .from("albums")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) {
            throw new Error("Aucune modification enregistrée (droits insuffisants).");
        }
    } else {
        const {error} = await supabase
            .from("albums")
            .insert({
                ...payload,
                status: "draft",
                created_by: currentProfile.user_id
            });

        if(error) throw error;
    }

    closeModal("galleryAlbumModal");
    await refreshGallery();

} catch(error) {
    alert("Impossible d'enregistrer l'album : " + error.message);

} finally {
    button.disabled = false;
}

}

/* -----------------------------------------
Albums : publication et suppression
----------------------------------------- */

async function toggleGalleryAlbumPublication(id) {
if(!galleryPermissions.publish) {
return alert("Publier un album exige les droits « publier » et « valider ».");
}

const album = getGalleryAlbum(id);
if(!album) return;

const publishing = album.status !== "published";
const items = getAlbumMedia(id);

if(publishing && items.length === 0) {
    return alert("Ajoutez au moins une photo avant de publier cet album.");
}

const payload = publishing
    ? {
        status: "published",
        published_at: new Date().toISOString(),
        cover_media_id: album.cover_media_id || items[0].id
    }
    : {
        status: "draft",
        published_at: null
    };

try {
    const {data, error} = await supabase
        .from("albums")
        .update({
            ...payload,
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshGallery();

} catch(error) {
    alert("Impossible de modifier la publication : " + error.message);
}

}

async function deleteGalleryAlbum(id) {
if(!galleryPermissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const album = getGalleryAlbum(id);
if(!album) return;

const items = getAlbumMedia(id);

if(!confirm(
    `Supprimer l'album « ${album.title_fr} » et ses ${items.length} élément(s) ? Cette action est définitive.`
)) return;

try {
    // La couverture doit être retirée avant la suppression des photos.
    const {error: coverError} = await supabase
        .from("albums")
        .update({cover_media_id: null})
        .eq("id", id);

    if(coverError) throw coverError;

    if(items.length) {
        const {data: removedItems, error: mediaError} = await deleteChecked("media_items", "album_id", id, "gallery");

        if(mediaError) throw mediaError;
        if((removedItems || []).length !== items.length) {
            console.error("Galerie : photos effacées", (removedItems || []).length, "sur", items.length, "album", id);
            throw new Error(`Certaines photos n'ont pas pu être supprimées (${(removedItems || []).length} effacée(s) sur ${items.length}). Ouvrez la console (F12) pour le détail.`);
        }
    }

    const {data, error} = await deleteChecked("albums", "id", id, "gallery");

    if(error) throw error;
    if(!data?.length) throw new Error("L'album n'a pas pu être supprimé (droits insuffisants).");

    // Les fichiers sont retirés du stockage après les lignes de la base.
    if(items.length) {
        const {error: storageError} = await supabase.storage
            .from(GALLERY_BUCKET)
            .remove(items.map(item => item.storage_path));

        if(storageError) {
            console.error("Fichiers galerie non supprimés :", storageError);
        }
    }

    if(currentGalleryAlbumId === id) closeGalleryMediaPanel();

    await refreshGallery();

} catch(error) {
    alert("Impossible de supprimer l'album : " + error.message);
}

}

/* -----------------------------------------
Photos : panneau de l'album
----------------------------------------- */

function updateGalleryMediaHeading() {
const album = getGalleryAlbum(currentGalleryAlbumId);
if(!album) return;

$("galleryMediaTitle").textContent = album.title_fr;
$("galleryMediaSubtitle").textContent =
    `${getAlbumMedia(album.id).length} élément(s) · ${statusLabel(album.status)}`;

}

async function openGalleryMediaPanel(albumId) {
const album = getGalleryAlbum(albumId);
if(!album) return;

currentGalleryAlbumId = albumId;
updateGalleryMediaHeading();

$("galleryMediaPanel").classList.remove("hidden");
$("galleryMediaPanel").scrollIntoView({behavior: "smooth", block: "start"});

await renderGalleryMedia();

}

function closeGalleryMediaPanel() {
currentGalleryAlbumId = null;
const panel = $("galleryMediaPanel");
if(panel) panel.classList.add("hidden");
}

async function ensureGalleryPreview(item) {
if(item.media_type !== "image") return;
if(galleryPreviewUrls[item.id]) return;

const {data, error} = await supabase.storage
    .from(GALLERY_BUCKET)
    .createSignedUrl(item.storage_path, 3600);

if(!error && data?.signedUrl) {
    galleryPreviewUrls[item.id] = data.signedUrl;
}

}

async function renderGalleryMedia() {
const album = getGalleryAlbum(currentGalleryAlbumId);
const grid = $("galleryMediaGrid");
if(!album || !grid) return;

const items = getAlbumMedia(album.id);

if(!items.length) {
    grid.innerHTML = `<p class="empty-state">Aucune photo dans cet album.</p>`;
    return;
}

await Promise.all(items.map(ensureGalleryPreview));

grid.innerHTML = items.map(item => {
    const id = escapeHTML(item.id);
    const isCover = album.cover_media_id === item.id;
    const preview = galleryPreviewUrls[item.id];

    const thumb = item.media_type === "image" && preview
        ? `<img src="${escapeHTML(preview)}"
                alt="${escapeHTML(item.alt_text_fr || item.title_fr || "")}"
                style="width:100%;height:140px;object-fit:cover;border-radius:8px">`
        : `<div style="height:140px;display:flex;align-items:center;justify-content:center;background:#eef2f7;border-radius:8px;font-size:12px;color:#64748b">
                ${item.media_type === "video" ? "Vidéo" : "Aperçu indisponible"}
           </div>`;

    const actions = [];

    if(galleryPermissions.edit) {
        actions.push(`
            <button class="btn btn-light" data-action="edit-media" data-id="${id}">
                Modifier
            </button>`);

        actions.push(`
            <button class="btn btn-light" data-action="feature-media" data-id="${id}">
                ${item.is_featured ? "Retirer la une" : "Mettre à la une"}
            </button>`);

        if(item.media_type === "image" && !isCover) {
            actions.push(`
                <button class="btn btn-light" data-action="cover-media" data-id="${id}">
                    Couverture
                </button>`);
        }
    }

    if(galleryPermissions.delete) {
        actions.push(`
            <button class="btn btn-light" data-action="delete-media" data-id="${id}">
                Supprimer
            </button>`);
    }

    const badges = [
        isCover ? "Couverture" : "",
        item.is_featured ? "À la une" : "",
        formatFileSize(item.file_size)
    ].filter(Boolean).join(" · ");

    return `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px">
            ${thumb}
            <strong style="font-size:13px">
                ${escapeHTML(item.title_fr || item.original_file_name || "Sans titre")}
            </strong>
            <span style="font-size:12px;color:var(--muted)">${escapeHTML(badges)}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${actions.join("")}
            </div>
        </div>`;
}).join("");

}

/* -----------------------------------------
Photos : envoi (permission gallery.create)
----------------------------------------- */

function showGallerySelection() {
const preview = $("galleryUploadPreview");
const files = Array.from($("galleryUploadInput").files || []);
if(!preview) return;

preview.innerHTML = files.map(file => {
    const isImage = file.type.startsWith("image/");
    const url = isImage ? URL.createObjectURL(file) : "";

    const thumb = isImage
        ? `<img src="${escapeHTML(url)}" alt=""
                style="width:90px;height:70px;object-fit:cover;border-radius:6px">`
        : `<div style="width:90px;height:70px;display:flex;align-items:center;justify-content:center;background:#eef2f7;border-radius:6px;font-size:11px;color:#64748b">Vidéo</div>`;

    return `
        <div style="width:90px;font-size:11px;color:var(--muted)">
            ${thumb}
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${escapeHTML(file.name)}
            </div>
        </div>`;
}).join("");

}

async function uploadGalleryFiles() {
if(!galleryPermissions.create) {
return alert("Vous ne disposez pas du droit d'ajout de fichiers.");
}

const albumId = currentGalleryAlbumId;
if(!albumId) return;

const input = $("galleryUploadInput");
const files = Array.from(input.files || []);

if(!files.length) {
    return alert("Sélectionnez au moins un fichier.");
}

const button = $("galleryUploadButton");
button.disabled = true;

let order = getAlbumMedia(albumId).reduce(
    (max, item) => Math.max(max, item.display_order ?? 0),
    0
);

const errors = [];

try {
    for(const file of files) {
        const mediaType = file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
                ? "video"
                : null;

        if(!mediaType) {
            errors.push(`${file.name} : format non pris en charge`);
            continue;
        }

        const uniqueName = (
            crypto.randomUUID
                ? crypto.randomUUID()
                : Date.now() + "-" + Math.random().toString(16).slice(2)
        );

        const storagePath =
            `albums/${albumId}/${uniqueName}-${safeFileName(file.name)}`;

        const {error: uploadError} = await supabase.storage
            .from(GALLERY_BUCKET)
            .upload(storagePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || "application/octet-stream"
            });

        if(uploadError) {
            errors.push(`${file.name} : ${uploadError.message}`);
            continue;
        }

        order += 1;

        const {error: insertError} = await supabase
            .from("media_items")
            .insert({
                album_id: albumId,
                media_type: mediaType,
                storage_path: storagePath,
                original_file_name: file.name,
                mime_type: file.type || null,
                file_size: file.size,
                display_order: order,
                is_featured: false,
                created_by: currentProfile.user_id
            });

        if(insertError) {
            await supabase.storage
                .from(GALLERY_BUCKET)
                .remove([storagePath]);

            errors.push(`${file.name} : ${insertError.message}`);
            continue;
        }
    }

} finally {
    input.value = "";
    button.disabled = false;
}

await refreshGallery();

if(errors.length) {
    alert("Certains fichiers n'ont pas été ajoutés :\n\n" + errors.join("\n"));
}

}

/* -----------------------------------------
Photos : modification, une, couverture, suppression
----------------------------------------- */

function openGalleryMediaForm(id) {
if(!galleryPermissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const item = getGalleryMedia(id);
if(!item) return;

$("galleryMediaId").value = item.id;
$("galleryMediaTitleFr").value = item.title_fr || "";
$("galleryMediaTitleEn").value = item.title_en || "";
$("galleryMediaAltFr").value = item.alt_text_fr || "";
$("galleryMediaAltEn").value = item.alt_text_en || "";
$("galleryMediaCaptionFr").value = item.caption_fr || "";
$("galleryMediaCaptionEn").value = item.caption_en || "";
$("galleryMediaOrder").value = item.display_order ?? 0;
$("galleryMediaFeatured").checked = item.is_featured === true;

openModal("galleryMediaModal");

}

async function saveGalleryMedia(event) {
event.preventDefault();

if(!galleryPermissions.edit) {
    return alert("Vous ne disposez pas du droit de modification.");
}

const id = $("galleryMediaId").value;
const button = $("saveGalleryMediaButton");
button.disabled = true;

try {
    const {data, error} = await supabase
        .from("media_items")
        .update({
            title_fr: nullIfEmpty($("galleryMediaTitleFr").value),
            title_en: nullIfEmpty($("galleryMediaTitleEn").value),
            alt_text_fr: nullIfEmpty($("galleryMediaAltFr").value),
            alt_text_en: nullIfEmpty($("galleryMediaAltEn").value),
            caption_fr: nullIfEmpty($("galleryMediaCaptionFr").value),
            caption_en: nullIfEmpty($("galleryMediaCaptionEn").value),
            display_order: Number($("galleryMediaOrder").value) || 0,
            is_featured: $("galleryMediaFeatured").checked
        })
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    closeModal("galleryMediaModal");
    await refreshGallery();

} catch(error) {
    alert("Impossible d'enregistrer la photo : " + error.message);

} finally {
    button.disabled = false;
}

}

async function toggleGalleryMediaFeatured(id) {
if(!galleryPermissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const item = getGalleryMedia(id);
if(!item) return;

try {
    const {data, error} = await supabase
        .from("media_items")
        .update({is_featured: !item.is_featured})
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshGallery();

} catch(error) {
    alert("Impossible de modifier la mise à la une : " + error.message);
}

}

async function setGalleryCover(id) {
if(!galleryPermissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const item = getGalleryMedia(id);
if(!item || item.media_type !== "image") return;

try {
    const {data, error} = await supabase
        .from("albums")
        .update({
            cover_media_id: id,
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("id", item.album_id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshGallery();

} catch(error) {
    alert("Impossible de définir la couverture : " + error.message);
}

}

async function deleteGalleryMedia(id) {
if(!galleryPermissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const item = getGalleryMedia(id);
if(!item) return;

if(!confirm(
    `Supprimer la photo « ${item.title_fr || item.original_file_name || "Sans titre"} » ? Cette action est définitive.`
)) return;

try {
    const album = getGalleryAlbum(item.album_id);

    if(album && album.cover_media_id === id) {
        const {error: coverError} = await supabase
            .from("albums")
            .update({cover_media_id: null})
            .eq("id", album.id);

        if(coverError) throw coverError;
    }

    const {data, error} = await deleteChecked("media_items", "id", id, "gallery");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    const {error: storageError} = await supabase.storage
        .from(GALLERY_BUCKET)
        .remove([item.storage_path]);

    if(storageError) {
        console.error("Fichier galerie non supprimé :", storageError);
    }

    delete galleryPreviewUrls[id];

    await refreshGallery();

} catch(error) {
    alert("Impossible de supprimer la photo : " + error.message);
}

}

/* -----------------------------------------
Catégories de la galerie
----------------------------------------- */

function openGalleryCategoryForm(id = null) {
if(!galleryPermissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const category = id
    ? galleryCategoriesCache.find(item => item.id === id)
    : null;

$("galleryCategoryId").value = category?.id || "";
$("galleryCategoryModalTitle").textContent =
    category ? "Modifier la catégorie" : "Nouvelle catégorie";
$("galleryCategoryNameFr").value = category?.name_fr || "";
$("galleryCategoryNameEn").value = category?.name_en || "";
$("galleryCategorySlug").value = category?.slug || "";
$("galleryCategoryOrder").value = category?.display_order ?? 0;
$("galleryCategoryActive").checked = category ? category.is_active === true : true;

openModal("galleryCategoryModal");

}

async function saveGalleryCategory(event) {
event.preventDefault();

if(!galleryPermissions.edit) {
    return alert("Vous ne disposez pas du droit de modification.");
}

const id = $("galleryCategoryId").value;
const nameFr = $("galleryCategoryNameFr").value.trim();
const slug = slugify($("galleryCategorySlug").value);

if(!nameFr || !slug) {
    return alert("Le nom français et l'identifiant sont obligatoires.");
}

const payload = {
    name_fr: nameFr,
    name_en: nullIfEmpty($("galleryCategoryNameEn").value),
    slug,
    display_order: Number($("galleryCategoryOrder").value) || 0,
    is_active: $("galleryCategoryActive").checked
};

const button = $("saveGalleryCategoryButton");
button.disabled = true;

try {
    const query = id
        ? supabase.from("gallery_categories").update(payload).eq("id", id).select("id")
        : supabase.from("gallery_categories").insert(payload).select("id");

    const {data, error} = await query;

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    closeModal("galleryCategoryModal");
    await refreshGallery();

} catch(error) {
    alert("Impossible d'enregistrer la catégorie : " + error.message);

} finally {
    button.disabled = false;
}

}

async function toggleGalleryCategory(id) {
if(!galleryPermissions.edit) {
return alert("Vous ne disposez pas du droit de modification.");
}

const category = galleryCategoriesCache.find(item => item.id === id);
if(!category) return;

try {
    const {data, error} = await supabase
        .from("gallery_categories")
        .update({is_active: !category.is_active})
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshGallery();

} catch(error) {
    alert("Impossible de modifier la catégorie : " + error.message);
}

}

/* -----------------------------------------
Modales créées à la demande
----------------------------------------- */

const GALLERY_MODALS_HTML = `
<div class="modal" id="galleryAlbumModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="galleryAlbumModalTitle">Nouvel album</h2>
            <button class="modal-close" type="button" data-gallery-close="galleryAlbumModal">×</button>
        </div>

        <form id="galleryAlbumForm">
            <input type="hidden" id="galleryAlbumId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="galleryAlbumTitleFr">Titre en français *</label>
                    <input id="galleryAlbumTitleFr" maxlength="250" required>
                </div>

                <div class="form-group">
                    <label for="galleryAlbumTitleEn">Titre en anglais</label>
                    <input id="galleryAlbumTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryAlbumSlug">Identifiant *</label>
                    <input id="galleryAlbumSlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="galleryAlbumCategory">Catégorie</label>
                    <select id="galleryAlbumCategory"></select>
                </div>

                <div class="form-group">
                    <label for="galleryAlbumYear">Année académique</label>
                    <select id="galleryAlbumYear"></select>
                </div>

                <div class="form-group">
                    <label for="galleryAlbumDate">Date de l'événement</label>
                    <input id="galleryAlbumDate" type="date">
                </div>

                <div class="form-group">
                    <label for="galleryAlbumLocation">Lieu</label>
                    <input id="galleryAlbumLocation" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryAlbumOrder">Ordre d'affichage</label>
                    <input id="galleryAlbumOrder" type="number" min="0" value="0">
                </div>
            </div>

            <div class="form-group">
                <label for="galleryAlbumDescriptionFr">Description en français</label>
                <textarea id="galleryAlbumDescriptionFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="galleryAlbumDescriptionEn">Description en anglais</label>
                <textarea id="galleryAlbumDescriptionEn" rows="3"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-gallery-close="galleryAlbumModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveGalleryAlbumButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="galleryMediaModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2>Modifier la photo</h2>
            <button class="modal-close" type="button" data-gallery-close="galleryMediaModal">×</button>
        </div>

        <form id="galleryMediaForm">
            <input type="hidden" id="galleryMediaId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="galleryMediaTitleFr">Titre en français</label>
                    <input id="galleryMediaTitleFr" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryMediaTitleEn">Titre en anglais</label>
                    <input id="galleryMediaTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryMediaAltFr">Texte alternatif en français</label>
                    <input id="galleryMediaAltFr" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryMediaAltEn">Texte alternatif en anglais</label>
                    <input id="galleryMediaAltEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="galleryMediaCaptionFr">Légende en français</label>
                    <textarea id="galleryMediaCaptionFr" rows="2"></textarea>
                </div>

                <div class="form-group">
                    <label for="galleryMediaCaptionEn">Légende en anglais</label>
                    <textarea id="galleryMediaCaptionEn" rows="2"></textarea>
                </div>

                <div class="form-group">
                    <label for="galleryMediaOrder">Ordre d'affichage</label>
                    <input id="galleryMediaOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label>
                        <input id="galleryMediaFeatured" type="checkbox">
                        Mettre à la une
                    </label>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-gallery-close="galleryMediaModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveGalleryMediaButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="galleryCategoryModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="galleryCategoryModalTitle">Nouvelle catégorie</h2>
            <button class="modal-close" type="button" data-gallery-close="galleryCategoryModal">×</button>
        </div>

        <form id="galleryCategoryForm">
            <input type="hidden" id="galleryCategoryId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="galleryCategoryNameFr">Nom en français *</label>
                    <input id="galleryCategoryNameFr" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="galleryCategoryNameEn">Nom en anglais</label>
                    <input id="galleryCategoryNameEn" maxlength="150">
                </div>

                <div class="form-group">
                    <label for="galleryCategorySlug">Identifiant *</label>
                    <input id="galleryCategorySlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="galleryCategoryOrder">Ordre d'affichage</label>
                    <input id="galleryCategoryOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label>
                        <input id="galleryCategoryActive" type="checkbox" checked>
                        Catégorie active
                    </label>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-gallery-close="galleryCategoryModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveGalleryCategoryButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>`;

function ensureGalleryModals() {
if($("galleryAlbumModal")) return;

document.body.insertAdjacentHTML("beforeend", GALLERY_MODALS_HTML);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-close]");
    if(button) closeModal(button.dataset.galleryClose);
});

$("galleryAlbumForm").addEventListener("submit", saveGalleryAlbum);
$("galleryMediaForm").addEventListener("submit", saveGalleryMedia);
$("galleryCategoryForm").addEventListener("submit", saveGalleryCategory);

// Identifiant généré depuis le titre, uniquement pour un nouvel élément.
$("galleryAlbumTitleFr").addEventListener("input", () => {
    if(!$("galleryAlbumId").value) {
        $("galleryAlbumSlug").value = slugify($("galleryAlbumTitleFr").value);
    }
});

$("galleryCategoryNameFr").addEventListener("input", () => {
    if(!$("galleryCategoryId").value) {
        $("galleryCategorySlug").value = slugify($("galleryCategoryNameFr").value);
    }
});

}

/* -----------------------------------------
Actions déléguées
----------------------------------------- */

function handleGalleryAction(event) {
const button = event.target.closest("button[data-action]");
if(!button) return;

const id = button.dataset.id;

const actions = {
    "media": () => openGalleryMediaPanel(id),
    "edit-album": () => openGalleryAlbumForm(id),
    "toggle-publish": () => toggleGalleryAlbumPublication(id),
    "delete-album": () => deleteGalleryAlbum(id),
    "edit-category": () => openGalleryCategoryForm(id),
    "toggle-category": () => toggleGalleryCategory(id),
    "edit-media": () => openGalleryMediaForm(id),
    "feature-media": () => toggleGalleryMediaFeatured(id),
    "cover-media": () => setGalleryCover(id),
    "delete-media": () => deleteGalleryMedia(id)
};

const action = actions[button.dataset.action];
if(action) action();

}

/* -----------------------------------------
Rafraîchissement et rendu du module
----------------------------------------- */

async function refreshGallery() {
await loadGalleryResources();

fillGalleryFilters();
renderGalleryAlbums();
renderGalleryCategories();

if(currentGalleryAlbumId && getGalleryAlbum(currentGalleryAlbumId)) {
    updateGalleryMediaHeading();
    await renderGalleryMedia();
} else {
    closeGalleryMediaPanel();
}

}

async function renderGalleryModule() {
galleryPermissions = await loadGalleryPermissions();

moduleContent.innerHTML = `
<div class="page-heading">
    <div>
        <h1>Galerie</h1>
        <p>
            Gestion des albums, des photos et des catégories de la galerie.
        </p>
    </div>

    <div class="module-label">MODULE GALERIE</div>
</div>

<div class="welcome-card">
    <h2>Espace galerie</h2>
    <p>
        Créez des albums, ajoutez-y des photos, puis publiez-les.
        Les nouveaux albums sont enregistrés comme brouillons.
        Un album doit contenir au moins une photo avant sa publication,
        et la publication exige les droits « publier » et « valider ».
    </p>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Albums</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Organisation des albums et de leur publication.
            </p>
        </div>

        ${galleryPermissions.create ? `
            <button class="btn btn-primary" id="newGalleryAlbumButton">
                ＋ Nouvel album
            </button>
        ` : ""}
    </div>

    <div class="toolbar">
        <input id="galleryAlbumSearch" type="search"
            placeholder="Rechercher un album...">

        <select id="galleryCategoryFilter">
            <option value="all">Toutes les catégories</option>
        </select>

        <select id="galleryStatusFilter">
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="published">Publiés</option>
            <option value="archived">Archivés</option>
        </select>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Titre</th>
                    <th>Catégorie</th>
                    <th>Date</th>
                    <th>Photos</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>

            <tbody id="galleryAlbumsTableBody">
                <tr>
                    <td colspan="6" class="empty-state">
                        Chargement des albums...
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="notice">
        <strong>À savoir :</strong>
        les photos d'un album restent privées tant que l'album n'est pas publié.
    </div>
</div>

<div class="panel hidden" id="galleryMediaPanel">
    <div class="toolbar">
        <div>
            <h2 id="galleryMediaTitle">Photos</h2>
            <p id="galleryMediaSubtitle" style="font-size:12px;color:var(--muted);margin-top:5px"></p>
        </div>

        <button class="btn btn-light" id="closeGalleryMediaButton" type="button">
            ← Retour aux albums
        </button>
    </div>

    ${galleryPermissions.create ? `
        <div class="toolbar">
            <input id="galleryUploadInput" type="file"
                accept="image/*,video/*" multiple>

            <button class="btn btn-primary" id="galleryUploadButton" type="button">
                Ajouter les fichiers
            </button>
        </div>
    ` : ""}

    <div id="galleryUploadPreview"
        style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>

    <div id="galleryMediaGrid"
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px">
    </div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Catégories de la galerie</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Classement des albums selon les catégories disponibles.
            </p>
        </div>

        ${galleryPermissions.edit ? `
            <button class="btn btn-primary" id="newGalleryCategoryButton">
                ＋ Nouvelle catégorie
            </button>
        ` : ""}
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Nom français</th>
                    <th>Nom anglais</th>
                    <th>Identifiant</th>
                    <th>État</th>
                    <th>Actions</th>
                </tr>
            </thead>

            <tbody id="galleryCategoriesTableBody">
                <tr>
                    <td colspan="5" class="empty-state">
                        Chargement des catégories...
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>`;

ensureGalleryModals();

$("galleryAlbumSearch").addEventListener("input", renderGalleryAlbums);
$("galleryCategoryFilter").addEventListener("change", renderGalleryAlbums);
$("galleryStatusFilter").addEventListener("change", renderGalleryAlbums);

$("galleryAlbumsTableBody").addEventListener("click", handleGalleryAction);
$("galleryMediaGrid").addEventListener("click", handleGalleryAction);
$("galleryCategoriesTableBody").addEventListener("click", handleGalleryAction);

$("closeGalleryMediaButton").addEventListener("click", closeGalleryMediaPanel);

if(galleryPermissions.create) {
    $("newGalleryAlbumButton").addEventListener("click", () => openGalleryAlbumForm());
    $("galleryUploadButton").addEventListener("click", uploadGalleryFiles);
    $("galleryUploadInput").addEventListener("change", showGallerySelection);
}

if(galleryPermissions.edit) {
    $("newGalleryCategoryButton").addEventListener("click", () => openGalleryCategoryForm());
}

await refreshGallery();

}

/* =========================================
MODULE CLUBS
========================================= */

const CLUB_BUCKET = "buep-public-assets";

const CLUB_COLUMNS =
"id,category_id,academic_year_id,slug,name_fr,name_en,description_fr,description_en,history_fr,history_en,objectives_fr,objectives_en,responsible_name,responsible_title,contact_email,contact_phone,whatsapp_number,social_links,logo_path,cover_path,status,is_featured,display_order,created_at,updated_at";

const CLUB_ACTIVITY_COLUMNS =
"id,club_id,title_fr,title_en,description_fr,description_en,activity_date,end_date,location,status,created_at,updated_at";

const CLUB_PUBLICATION_COLUMNS =
"id,club_id,title_fr,title_en,summary_fr,summary_en,body_fr,body_en,status,is_featured,published_at,created_at,updated_at";

const CLUB_IMAGE_COLUMNS =
"id,club_id,storage_path,caption_fr,caption_en,alt_text_fr,alt_text_en,display_order,created_at";

let clubPermissions = {
create: false,
edit: false,
delete: false,
publish: false
};

let clubCategoriesCache = [];
let clubsCache = [];
let clubActivitiesCache = [];
let clubPublicationsCache = [];
let clubImagesCache = [];
let currentClubId = null;

function getClub(id) {
return clubsCache.find(club => club.id === id) || null;
}

function getClubCategoryName(id) {
const category = clubCategoriesCache.find(item => item.id === id);
return category ? category.name_fr : "—";
}

function getClubPublicUrl(path) {
if(!path) return "";

const {data} = supabase.storage
    .from(CLUB_BUCKET)
    .getPublicUrl(path);

return data?.publicUrl || "";

}

function clubRowsFor(list, clubId) {
return list.filter(item => item.club_id === clubId);
}

/* -----------------------------------------
Permissions
----------------------------------------- */

async function loadClubPermissions() {
const [create, edit, remove, publish] = await Promise.all([
hasPermission("clubs", "create"),
hasPermission("clubs", "edit"),
hasPermission("clubs", "delete"),
hasPermission("clubs", "publish")
]);

return {create, edit, delete: remove, publish};

}

/* -----------------------------------------
Chargement
----------------------------------------- */

async function loadClubResources() {
const [categoriesResult, clubsResult, activitiesResult, publicationsResult, imagesResult, yearsResult] = await Promise.all([
supabase.from("club_categories")
.select("id,name_fr,name_en,slug,description_fr,description_en,display_order,is_active")
.order("display_order"),

    supabase.from("clubs")
        .select(CLUB_COLUMNS)
        .order("display_order")
        .order("created_at", {ascending: false}),

    supabase.from("club_activities")
        .select(CLUB_ACTIVITY_COLUMNS)
        .order("activity_date", {ascending: false}),

    supabase.from("club_publications")
        .select(CLUB_PUBLICATION_COLUMNS)
        .order("created_at", {ascending: false}),

    supabase.from("club_images")
        .select(CLUB_IMAGE_COLUMNS)
        .order("display_order"),

    academicYears.length
        ? Promise.resolve({data: academicYears, error: null})
        : supabase.from("academic_years")
            .select("id,label,is_current,start_date,end_date")
            .order("start_date", {ascending: false})
]);

const results = [categoriesResult, clubsResult, activitiesResult, publicationsResult, imagesResult, yearsResult];
for(const result of results) {
    if(result.error) throw result.error;
}

clubCategoriesCache = categoriesResult.data || [];
clubsCache = clubsResult.data || [];
clubActivitiesCache = activitiesResult.data || [];
clubPublicationsCache = publicationsResult.data || [];
clubImagesCache = imagesResult.data || [];
academicYears = yearsResult.data || [];

}

function fillClubFilters() {
const select = $("clubCategoryFilter");
if(!select) return;

const current = select.value || "all";

select.innerHTML =
    '<option value="all">Toutes les catégories</option>' +
    clubCategoriesCache.map(category => `
        <option value="${escapeHTML(category.id)}">
            ${escapeHTML(category.name_fr)}
        </option>
    `).join("");

select.value = current;
if(!select.value) select.value = "all";

}

function fillClubFormOptions(club) {
$("clubCategory").innerHTML =
'<option value="">Aucune</option>' +
clubCategoriesCache
.filter(category => category.is_active || category.id === club?.category_id)
.map(category => `
<option value="${escapeHTML(category.id)}">
${escapeHTML(category.name_fr)}
</option>
`).join("");

$("clubCategory").value = club?.category_id || "";

$("clubYear").innerHTML =
    '<option value="">Non précisée</option>' +
    academicYears.map(year => `
        <option value="${escapeHTML(year.id)}">
            ${escapeHTML(year.label)}${year.is_current ? " (en cours)" : ""}
        </option>
    `).join("");

$("clubYear").value = club?.academic_year_id || "";

}

/* -----------------------------------------
Liste des clubs
----------------------------------------- */

function renderClubs() {
const search = ($("clubSearch").value || "").trim().toLowerCase();
const categoryFilter = $("clubCategoryFilter").value;
const statusFilter = $("clubStatusFilter").value;

const rows = clubsCache.filter(club => {
    const text = [club.name_fr, club.name_en, club.slug].join(" ").toLowerCase();

    return (!search || text.includes(search)) &&
        (categoryFilter === "all" || club.category_id === categoryFilter) &&
        (statusFilter === "all" || club.status === statusFilter);
});

const tbody = $("clubsTableBody");

if(!rows.length) {
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                Aucun club ne correspond à ces critères.
            </td>
        </tr>`;
    return;
}

tbody.innerHTML = rows.map(club => {
    const id = escapeHTML(club.id);
    const actions = [];

    actions.push(`
        <button class="btn btn-light" data-action="club-detail" data-id="${id}">
            Gérer
        </button>`);

    if(clubPermissions.edit) {
        actions.push(`
            <button class="btn btn-light" data-action="edit-club" data-id="${id}">
                Modifier
            </button>`);
    }

    if(clubPermissions.publish) {
        actions.push(`
            <button class="btn btn-light" data-action="toggle-club" data-id="${id}">
                ${club.status === "published" ? "Dépublier" : "Publier"}
            </button>`);
    }

    if(clubPermissions.delete) {
        actions.push(`
            <button class="btn btn-light" data-action="delete-club" data-id="${id}">
                Supprimer
            </button>`);
    }

    return `
        <tr>
            <td>
                <strong>${escapeHTML(club.name_fr)}</strong><br>
                <span style="font-size:12px;color:var(--muted)">${escapeHTML(club.slug)}</span>
            </td>
            <td>${escapeHTML(getClubCategoryName(club.category_id))}</td>
            <td>${clubRowsFor(clubActivitiesCache, club.id).length} activité(s)</td>
            <td>
                <span class="badge ${escapeHTML(club.status)}">
                    ${escapeHTML(statusLabel(club.status))}
                </span>
            </td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${actions.join("")}
                </div>
            </td>
        </tr>`;
}).join("");

}

function renderClubCategories() {
const tbody = $("clubCategoriesTableBody");
if(!tbody) return;

if(!clubCategoriesCache.length) {
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">Aucune catégorie.</td>
        </tr>`;
    return;
}

tbody.innerHTML = clubCategoriesCache.map(category => {
    const id = escapeHTML(category.id);

    const actions = clubPermissions.edit
        ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-light" data-action="edit-club-category" data-id="${id}">Modifier</button>
                <button class="btn btn-light" data-action="toggle-club-category" data-id="${id}">
                    ${category.is_active ? "Désactiver" : "Activer"}
                </button>
            </div>`
        : "—";

    return `
        <tr>
            <td>${escapeHTML(category.name_fr)}</td>
            <td>${escapeHTML(category.name_en || "—")}</td>
            <td>${escapeHTML(category.slug)}</td>
            <td>${category.is_active ? "Active" : "Inactive"}</td>
            <td>${actions}</td>
        </tr>`;
}).join("");

}

/* -----------------------------------------
Clubs : formulaire
----------------------------------------- */

function openClubForm(id = null) {
const club = id ? getClub(id) : null;

if(id ? !clubPermissions.edit : !clubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

$("clubId").value = club?.id || "";
$("clubModalTitle").textContent = club ? "Modifier le club" : "Nouveau club";
$("clubNameFr").value = club?.name_fr || "";
$("clubNameEn").value = club?.name_en || "";
$("clubSlug").value = club?.slug || "";
$("clubResponsibleName").value = club?.responsible_name || "";
$("clubResponsibleTitle").value = club?.responsible_title || "";
$("clubContactEmail").value = club?.contact_email || "";
$("clubContactPhone").value = club?.contact_phone || "";
$("clubWhatsapp").value = club?.whatsapp_number || "";
$("clubDescriptionFr").value = club?.description_fr || "";
$("clubDescriptionEn").value = club?.description_en || "";
$("clubObjectivesFr").value = club?.objectives_fr || "";
$("clubObjectivesEn").value = club?.objectives_en || "";
$("clubHistoryFr").value = club?.history_fr || "";
$("clubHistoryEn").value = club?.history_en || "";
$("clubSocialFacebook").value = club?.social_links?.facebook || "";
$("clubSocialInstagram").value = club?.social_links?.instagram || "";
$("clubSocialLinkedin").value = club?.social_links?.linkedin || "";
$("clubSocialYoutube").value = club?.social_links?.youtube || "";
$("clubOrder").value = club?.display_order ?? 0;
$("clubFeatured").checked = club?.is_featured === true;
$("clubLogoInput").value = "";
$("clubCoverInput").value = "";
$("clubLogoStatus").textContent = club?.logo_path ? "Logo déjà envoyé." : "Aucun logo.";
$("clubCoverStatus").textContent = club?.cover_path ? "Couverture déjà envoyée." : "Aucune couverture.";

fillClubFormOptions(club);

openModal("clubModal");

}

async function uploadClubFile(clubId, file, kind) {
const uniqueName = (
crypto.randomUUID
? crypto.randomUUID()
: Date.now() + "-" + Math.random().toString(16).slice(2)
);

const storagePath =
    `clubs/${clubId}/${kind}-${uniqueName}-${safeFileName(file.name)}`;

const {error} = await supabase.storage
    .from(CLUB_BUCKET)
    .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
    });

if(error) throw error;

return storagePath;

}

async function saveClub(event) {
event.preventDefault();

const id = $("clubId").value;

if(id ? !clubPermissions.edit : !clubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const nameFr = $("clubNameFr").value.trim();
const slug = slugify($("clubSlug").value);

if(!nameFr || !slug) {
    return alert("Le nom français et l'identifiant sont obligatoires.");
}

const social = {
    facebook: nullIfEmpty($("clubSocialFacebook").value),
    instagram: nullIfEmpty($("clubSocialInstagram").value),
    linkedin: nullIfEmpty($("clubSocialLinkedin").value),
    youtube: nullIfEmpty($("clubSocialYoutube").value)
};

const payload = {
    name_fr: nameFr,
    name_en: nullIfEmpty($("clubNameEn").value),
    slug,
    category_id: $("clubCategory").value || null,
    academic_year_id: $("clubYear").value || null,
    responsible_name: nullIfEmpty($("clubResponsibleName").value),
    responsible_title: nullIfEmpty($("clubResponsibleTitle").value),
    contact_email: nullIfEmpty($("clubContactEmail").value),
    contact_phone: nullIfEmpty($("clubContactPhone").value),
    whatsapp_number: nullIfEmpty($("clubWhatsapp").value),
    description_fr: nullIfEmpty($("clubDescriptionFr").value),
    description_en: nullIfEmpty($("clubDescriptionEn").value),
    objectives_fr: nullIfEmpty($("clubObjectivesFr").value),
    objectives_en: nullIfEmpty($("clubObjectivesEn").value),
    history_fr: nullIfEmpty($("clubHistoryFr").value),
    history_en: nullIfEmpty($("clubHistoryEn").value),
    social_links: social,
    display_order: Number($("clubOrder").value) || 0,
    is_featured: $("clubFeatured").checked,
    updated_by: currentProfile.user_id,
    updated_at: new Date().toISOString()
};

const logoFile = $("clubLogoInput").files[0] || null;
const coverFile = $("clubCoverInput").files[0] || null;

const button = $("saveClubButton");
button.disabled = true;

try {
    let clubId = id;

    if(id) {
        const {data, error} = await supabase
            .from("clubs")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");
    } else {
        const {data, error} = await supabase
            .from("clubs")
            .insert({
                ...payload,
                status: "draft",
                created_by: currentProfile.user_id
            })
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Le club n'a pas été créé (droits insuffisants).");
        clubId = data[0].id;
    }

    const filesUpdate = {};

    if(logoFile) {
        filesUpdate.logo_path = await uploadClubFile(clubId, logoFile, "logo");
    }

    if(coverFile) {
        filesUpdate.cover_path = await uploadClubFile(clubId, coverFile, "cover");
    }

    if(Object.keys(filesUpdate).length) {
        const {error} = await supabase
            .from("clubs")
            .update(filesUpdate)
            .eq("id", clubId);

        if(error) throw error;
    }

    closeModal("clubModal");
    await refreshClubs();

} catch(error) {
    alert("Impossible d'enregistrer le club : " + error.message);

} finally {
    button.disabled = false;
}

}

/* -----------------------------------------
Clubs : publication et suppression
----------------------------------------- */

async function toggleClubPublication(id) {
if(!clubPermissions.publish) {
return alert("Vous ne disposez pas du droit de publication.");
}

const club = getClub(id);
if(!club) return;

const publishing = club.status !== "published";

try {
    const {data, error} = await supabase
        .from("clubs")
        .update({
            status: publishing ? "published" : "draft",
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshClubs();

} catch(error) {
    alert("Impossible de modifier la publication : " + error.message);
}

}

async function deleteClub(id) {
if(!clubPermissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const club = getClub(id);
if(!club) return;

const images = clubRowsFor(clubImagesCache, id);
const activities = clubRowsFor(clubActivitiesCache, id);
const publications = clubRowsFor(clubPublicationsCache, id);

if(!confirm(
    `Supprimer le club « ${club.name_fr} » avec ses activités, ses publications et ses photos ? Cette action est définitive.`
)) return;

try {
    if(images.length) {
        const {data, error} = await deleteChecked("club_images", "club_id", id, "clubs");

        if(error) throw error;
        if((data || []).length !== images.length) {
            throw new Error("Certaines photos n'ont pas pu être supprimées (droits insuffisants).");
        }
    }

    if(activities.length) {
        const {data, error} = await deleteChecked("club_activities", "club_id", id, "clubs");

        if(error) throw error;
        if((data || []).length !== activities.length) {
            throw new Error("Certaines activités n'ont pas pu être supprimées (droits insuffisants).");
        }
    }

    if(publications.length) {
        const {data, error} = await deleteChecked("club_publications", "club_id", id, "clubs");

        if(error) throw error;
        if((data || []).length !== publications.length) {
            throw new Error("Certaines publications n'ont pas pu être supprimées (droits insuffisants).");
        }
    }

    const {data, error} = await deleteChecked("clubs", "id", id, "clubs");

    if(error) throw error;
    if(!data?.length) throw new Error("Le club n'a pas pu être supprimé (droits insuffisants).");

    const paths = [
        ...images.map(item => item.storage_path),
        club.logo_path,
        club.cover_path
    ].filter(Boolean);

    if(paths.length) {
        const {error: storageError} = await supabase.storage
            .from(CLUB_BUCKET)
            .remove(paths);

        if(storageError) {
            console.error("Fichiers club non supprimés :", storageError);
        }
    }

    if(currentClubId === id) closeClubDetail();

    await refreshClubs();

} catch(error) {
    alert("Impossible de supprimer le club : " + error.message);
}

}

/* -----------------------------------------
Détail d'un club : activités, publications, photos
----------------------------------------- */

function closeClubDetail() {
currentClubId = null;
const panel = $("clubDetailPanel");
if(panel) panel.classList.add("hidden");
}

async function openClubDetail(clubId) {
const club = getClub(clubId);
if(!club) return;

currentClubId = clubId;
$("clubDetailPanel").classList.remove("hidden");
$("clubDetailPanel").scrollIntoView({behavior: "smooth", block: "start"});

renderClubDetail();

}

function renderClubDetail() {
const club = getClub(currentClubId);
if(!club) return closeClubDetail();

$("clubDetailTitle").textContent = club.name_fr;
$("clubDetailSubtitle").textContent =
    `${statusLabel(club.status)} · ${clubRowsFor(clubActivitiesCache, club.id).length} activité(s) · ${clubRowsFor(clubPublicationsCache, club.id).length} publication(s) · ${clubRowsFor(clubImagesCache, club.id).length} photo(s)`;

renderClubActivitiesList(club.id);
renderClubPublicationsList(club.id);
renderClubImagesList(club.id);

}

function renderClubActivitiesList(clubId) {
const tbody = $("clubActivitiesBody");
const items = clubRowsFor(clubActivitiesCache, clubId);

if(!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Aucune activité.</td></tr>`;
    return;
}

tbody.innerHTML = items.map(item => `
    <tr>
        <td><strong>${escapeHTML(item.title_fr)}</strong></td>
        <td>${formatDate(item.activity_date)}</td>
        <td>
            <span class="badge ${escapeHTML(item.status)}">
                ${escapeHTML(statusLabel(item.status))}
            </span>
        </td>
        <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${clubPermissions.edit ? `
                    <button class="btn btn-light" data-action="edit-club-activity" data-id="${escapeHTML(item.id)}">Modifier</button>
                    ` : ""}
                ${clubPermissions.delete ? `
                    <button class="btn btn-light" data-action="delete-club-activity" data-id="${escapeHTML(item.id)}">Supprimer</button>` : ""}
            </div>
        </td>
    </tr>`).join("");

}

function renderClubPublicationsList(clubId) {
const tbody = $("clubPublicationsBody");
const items = clubRowsFor(clubPublicationsCache, clubId);

if(!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Aucune publication.</td></tr>`;
    return;
}

tbody.innerHTML = items.map(item => `
    <tr>
        <td><strong>${escapeHTML(item.title_fr)}</strong></td>
        <td>${formatDate(item.published_at || item.created_at)}</td>
        <td>
            <span class="badge ${escapeHTML(item.status)}">
                ${escapeHTML(statusLabel(item.status))}
            </span>
        </td>
        <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${clubPermissions.edit ? `
                    <button class="btn btn-light" data-action="edit-club-publication" data-id="${escapeHTML(item.id)}">Modifier</button>
                    <button class="btn btn-light" data-action="toggle-club-publication" data-id="${escapeHTML(item.id)}">
                        ${item.status === "published" ? "Dépublier" : "Publier"}
                    </button>` : ""}
                ${clubPermissions.delete ? `
                    <button class="btn btn-light" data-action="delete-club-publication" data-id="${escapeHTML(item.id)}">Supprimer</button>` : ""}
            </div>
        </td>
    </tr>`).join("");

}

function renderClubImagesList(clubId) {
const grid = $("clubImagesGrid");
const items = clubRowsFor(clubImagesCache, clubId)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

if(!items.length) {
    grid.innerHTML = `<p class="empty-state">Aucune photo.</p>`;
    return;
}

grid.innerHTML = items.map(item => `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px">
        <img src="${escapeHTML(getClubPublicUrl(item.storage_path))}"
            alt="${escapeHTML(item.alt_text_fr || item.caption_fr || "")}"
            style="width:100%;height:120px;object-fit:cover;border-radius:8px">
        <span style="font-size:12px;color:var(--muted)">${escapeHTML(item.caption_fr || "Sans légende")}</span>
        ${clubPermissions.delete ? `
            <button class="btn btn-light" data-action="delete-club-image" data-id="${escapeHTML(item.id)}">Supprimer</button>` : ""}
    </div>`).join("");

}

async function uploadClubImages() {
if(!clubPermissions.create) {
return alert("Vous ne disposez pas du droit d'ajout de photos.");
}

const clubId = currentClubId;
if(!clubId) return;

const input = $("clubImageInput");
const files = Array.from(input.files || []).filter(file => file.type.startsWith("image/"));

if(!files.length) {
    return alert("Sélectionnez au moins une image.");
}

const button = $("clubImageUploadButton");
button.disabled = true;

let order = clubRowsFor(clubImagesCache, clubId).reduce(
    (max, item) => Math.max(max, item.display_order ?? 0),
    0
);

const errors = [];

try {
    for(const file of files) {
        let storagePath;

        try {
            storagePath = await uploadClubFile(clubId, file, "photo");
        } catch(error) {
            errors.push(`${file.name} : ${error.message}`);
            continue;
        }

        order += 1;

        const {error: insertError} = await supabase
            .from("club_images")
            .insert({
                club_id: clubId,
                storage_path: storagePath,
                display_order: order,
                created_by: currentProfile.user_id
            });

        if(insertError) {
            await supabase.storage.from(CLUB_BUCKET).remove([storagePath]);
            errors.push(`${file.name} : ${insertError.message}`);
        }
    }

} finally {
    input.value = "";
    button.disabled = false;
}

await refreshClubs();

if(errors.length) {
    alert("Certaines photos n'ont pas été ajoutées :\n\n" + errors.join("\n"));
}

}

async function deleteClubImage(id) {
if(!clubPermissions.delete) {
return alert("Vous ne disposez pas du droit de suppression.");
}

const item = clubImagesCache.find(image => image.id === id);
if(!item) return;

if(!confirm("Supprimer cette photo ? Cette action est définitive.")) return;

try {
    const {data, error} = await deleteChecked("club_images", "id", id, "clubs");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    const {error: storageError} = await supabase.storage
        .from(CLUB_BUCKET)
        .remove([item.storage_path]);

    if(storageError) console.error("Photo club non supprimée :", storageError);

    await refreshClubs();

} catch(error) {
    alert("Impossible de supprimer la photo : " + error.message);
}

}

/* -----------------------------------------
Activités du club
----------------------------------------- */

function openClubActivityForm(id = null) {
if(id ? !clubPermissions.edit : !clubPermissions.create) {
return alert("Vous ne disposez pas du droit nécessaire.");
}

const item = id ? clubActivitiesCache.find(row => row.id === id) : null;

$("clubActivityId").value = item?.id || "";
$("clubActivityModalTitle").textContent = item ? "Modifier l'activité" : "Nouvelle activité";
$("clubActivityTitleFr").value = item?.title_fr || "";
$("clubActivityTitleEn").value = item?.title_en || "";
$("clubActivityDescriptionFr").value = item?.description_fr || "";
$("clubActivityDescriptionEn").value = item?.description_en || "";
$("clubActivityStart").value = toLocalInput(item?.activity_date);
$("clubActivityEnd").value = toLocalInput(item?.end_date);
$("clubActivityLocation").value = item?.location || "";
$("clubActivityStatus").value = item?.status || "upcoming";

openModal("clubActivityModal");

}

async function saveClubActivity(event) {
event.preventDefault();

const id = $("clubActivityId").value;

if(id ? !clubPermissions.edit : !clubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const titleFr = $("clubActivityTitleFr").value.trim();

if(!titleFr) {
    return alert("Le titre français est obligatoire.");
}

const button = $("saveClubActivityButton");
button.disabled = true;

try {
    const payload = {
        title_fr: titleFr,
        title_en: nullIfEmpty($("clubActivityTitleEn").value),
        description_fr: nullIfEmpty($("clubActivityDescriptionFr").value),
        description_en: nullIfEmpty($("clubActivityDescriptionEn").value),
        activity_date: fromLocalInput($("clubActivityStart").value),
        end_date: fromLocalInput($("clubActivityEnd").value),
        location: nullIfEmpty($("clubActivityLocation").value),
        status: $("clubActivityStatus").value,
        updated_by: currentProfile.user_id,
        updated_at: new Date().toISOString()
    };

    if(id) {
        const {data, error} = await supabase
            .from("club_activities")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");
    } else {
        const {error} = await supabase
            .from("club_activities")
            .insert({
                ...payload,
                club_id: currentClubId,
                created_by: currentProfile.user_id
            });

        if(error) throw error;
    }

    closeModal("clubActivityModal");
    await refreshClubs();

} catch(error) {
    alert("Impossible d'enregistrer l'activité : " + error.message);

} finally {
    button.disabled = false;
}

}

async function deleteClubActivity(id) {
if(!clubPermissions.delete) return alert("Vous ne disposez pas du droit de suppression.");

const item = clubActivitiesCache.find(row => row.id === id);
if(!item) return;

if(!confirm(`Supprimer l'activité « ${item.title_fr} » ?`)) return;

try {
    const {data, error} = await deleteChecked("club_activities", "id", id, "clubs");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    await refreshClubs();

} catch(error) {
    alert("Impossible de supprimer l'activité : " + error.message);
}

}

/* -----------------------------------------
Publications du club
----------------------------------------- */

function openClubPublicationForm(id = null) {
if(id ? !clubPermissions.edit : !clubPermissions.create) {
return alert("Vous ne disposez pas du droit nécessaire.");
}

const item = id ? clubPublicationsCache.find(row => row.id === id) : null;

$("clubPublicationId").value = item?.id || "";
$("clubPublicationModalTitle").textContent = item ? "Modifier la publication" : "Nouvelle publication";
$("clubPublicationTitleFr").value = item?.title_fr || "";
$("clubPublicationTitleEn").value = item?.title_en || "";
$("clubPublicationSummaryFr").value = item?.summary_fr || "";
$("clubPublicationSummaryEn").value = item?.summary_en || "";
$("clubPublicationBodyFr").value = item?.body_fr || "";
$("clubPublicationBodyEn").value = item?.body_en || "";
$("clubPublicationFeatured").checked = item?.is_featured === true;

openModal("clubPublicationModal");

}

async function saveClubPublication(event) {
event.preventDefault();

const id = $("clubPublicationId").value;

if(id ? !clubPermissions.edit : !clubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const titleFr = $("clubPublicationTitleFr").value.trim();

if(!titleFr) {
    return alert("Le titre français est obligatoire.");
}

const button = $("saveClubPublicationButton");
button.disabled = true;

try {
    const payload = {
        title_fr: titleFr,
        title_en: nullIfEmpty($("clubPublicationTitleEn").value),
        summary_fr: nullIfEmpty($("clubPublicationSummaryFr").value),
        summary_en: nullIfEmpty($("clubPublicationSummaryEn").value),
        body_fr: nullIfEmpty($("clubPublicationBodyFr").value),
        body_en: nullIfEmpty($("clubPublicationBodyEn").value),
        is_featured: $("clubPublicationFeatured").checked,
        updated_by: currentProfile.user_id,
        updated_at: new Date().toISOString()
    };

    if(id) {
        const {data, error} = await supabase
            .from("club_publications")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");
    } else {
        const {error} = await supabase
            .from("club_publications")
            .insert({
                ...payload,
                club_id: currentClubId,
                status: "draft",
                created_by: currentProfile.user_id
            });

        if(error) throw error;
    }

    closeModal("clubPublicationModal");
    await refreshClubs();

} catch(error) {
    alert("Impossible d'enregistrer la publication : " + error.message);

} finally {
    button.disabled = false;
}

}

async function toggleClubPublicationStatus(id) {
if(!clubPermissions.publish) return alert("Vous ne disposez pas du droit de publication.");

const item = clubPublicationsCache.find(row => row.id === id);
if(!item) return;

const publishing = item.status !== "published";

try {
    const {data, error} = await supabase
        .from("club_publications")
        .update({
            status: publishing ? "published" : "draft",
            published_at: publishing ? new Date().toISOString() : null,
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshClubs();

} catch(error) {
    alert("Impossible de modifier la publication : " + error.message);
}

}

async function deleteClubPublication(id) {
if(!clubPermissions.delete) return alert("Vous ne disposez pas du droit de suppression.");

const item = clubPublicationsCache.find(row => row.id === id);
if(!item) return;

if(!confirm(`Supprimer la publication « ${item.title_fr} » ?`)) return;

try {
    const {data, error} = await deleteChecked("club_publications", "id", id, "clubs");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    await refreshClubs();

} catch(error) {
    alert("Impossible de supprimer la publication : " + error.message);
}

}

/* -----------------------------------------
Catégories de clubs
----------------------------------------- */

function openClubCategoryForm(id = null) {
if(!clubPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const category = id
    ? clubCategoriesCache.find(item => item.id === id)
    : null;

$("clubCategoryId").value = category?.id || "";
$("clubCategoryModalTitle").textContent = category ? "Modifier la catégorie" : "Nouvelle catégorie";
$("clubCategoryNameFr").value = category?.name_fr || "";
$("clubCategoryNameEn").value = category?.name_en || "";
$("clubCategorySlug").value = category?.slug || "";
$("clubCategoryDescriptionFr").value = category?.description_fr || "";
$("clubCategoryDescriptionEn").value = category?.description_en || "";
$("clubCategoryOrder").value = category?.display_order ?? 0;
$("clubCategoryActive").checked = category ? category.is_active === true : true;

openModal("clubCategoryModal");

}

async function saveClubCategory(event) {
event.preventDefault();

if(!clubPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const id = $("clubCategoryId").value;
const nameFr = $("clubCategoryNameFr").value.trim();
const slug = slugify($("clubCategorySlug").value);

if(!nameFr || !slug) {
    return alert("Le nom français et l'identifiant sont obligatoires.");
}

const payload = {
    name_fr: nameFr,
    name_en: nullIfEmpty($("clubCategoryNameEn").value),
    slug,
    description_fr: nullIfEmpty($("clubCategoryDescriptionFr").value),
    description_en: nullIfEmpty($("clubCategoryDescriptionEn").value),
    display_order: Number($("clubCategoryOrder").value) || 0,
    is_active: $("clubCategoryActive").checked
};

const button = $("saveClubCategoryButton");
button.disabled = true;

try {
    const query = id
        ? supabase.from("club_categories").update(payload).eq("id", id).select("id")
        : supabase.from("club_categories").insert(payload).select("id");

    const {data, error} = await query;

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    closeModal("clubCategoryModal");
    await refreshClubs();

} catch(error) {
    alert("Impossible d'enregistrer la catégorie : " + error.message);

} finally {
    button.disabled = false;
}

}

async function toggleClubCategory(id) {
if(!clubPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const category = clubCategoriesCache.find(item => item.id === id);
if(!category) return;

try {
    const {data, error} = await supabase
        .from("club_categories")
        .update({is_active: !category.is_active})
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshClubs();

} catch(error) {
    alert("Impossible de modifier la catégorie : " + error.message);
}

}

/* -----------------------------------------
Modales créées à la demande
----------------------------------------- */

const CLUB_MODALS_HTML = `
<div class="modal" id="clubModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="clubModalTitle">Nouveau club</h2>
            <button class="modal-close" type="button" data-club-close="clubModal">×</button>
        </div>

        <form id="clubForm">
            <input type="hidden" id="clubId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubNameFr">Nom en français *</label>
                    <input id="clubNameFr" maxlength="250" required>
                </div>

                <div class="form-group">
                    <label for="clubNameEn">Nom en anglais</label>
                    <input id="clubNameEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubSlug">Identifiant *</label>
                    <input id="clubSlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="clubCategory">Catégorie</label>
                    <select id="clubCategory"></select>
                </div>

                <div class="form-group">
                    <label for="clubYear">Année académique</label>
                    <select id="clubYear"></select>
                </div>

                <div class="form-group">
                    <label for="clubOrder">Ordre d'affichage</label>
                    <input id="clubOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label for="clubResponsibleName">Responsable</label>
                    <input id="clubResponsibleName" maxlength="150">
                </div>

                <div class="form-group">
                    <label for="clubResponsibleTitle">Fonction du responsable</label>
                    <input id="clubResponsibleTitle" maxlength="150">
                </div>

                <div class="form-group">
                    <label for="clubContactEmail">Courriel de contact</label>
                    <input id="clubContactEmail" type="email" maxlength="150">
                </div>

                <div class="form-group">
                    <label for="clubContactPhone">Téléphone</label>
                    <input id="clubContactPhone" maxlength="50">
                </div>

                <div class="form-group">
                    <label for="clubWhatsapp">Numéro WhatsApp</label>
                    <input id="clubWhatsapp" maxlength="50">
                </div>

                <div class="form-group">
                    <label>
                        <input id="clubFeatured" type="checkbox">
                        Club mis en avant
                    </label>
                </div>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubSocialFacebook">Facebook</label>
                    <input id="clubSocialFacebook" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubSocialInstagram">Instagram</label>
                    <input id="clubSocialInstagram" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubSocialLinkedin">LinkedIn</label>
                    <input id="clubSocialLinkedin" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubSocialYoutube">YouTube</label>
                    <input id="clubSocialYoutube" maxlength="250">
                </div>
            </div>

            <div class="form-group">
                <label for="clubDescriptionFr">Description en français</label>
                <textarea id="clubDescriptionFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubDescriptionEn">Description en anglais</label>
                <textarea id="clubDescriptionEn" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubObjectivesFr">Objectifs en français</label>
                <textarea id="clubObjectivesFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubObjectivesEn">Objectifs en anglais</label>
                <textarea id="clubObjectivesEn" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubHistoryFr">Historique en français</label>
                <textarea id="clubHistoryFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubHistoryEn">Historique en anglais</label>
                <textarea id="clubHistoryEn" rows="3"></textarea>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubLogoInput">Logo</label>
                    <input id="clubLogoInput" type="file" accept="image/*">
                    <small id="clubLogoStatus"></small>
                </div>

                <div class="form-group">
                    <label for="clubCoverInput">Image de couverture</label>
                    <input id="clubCoverInput" type="file" accept="image/*">
                    <small id="clubCoverStatus"></small>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-club-close="clubModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveClubButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="clubActivityModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="clubActivityModalTitle">Nouvelle activité</h2>
            <button class="modal-close" type="button" data-club-close="clubActivityModal">×</button>
        </div>

        <form id="clubActivityForm">
            <input type="hidden" id="clubActivityId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubActivityTitleFr">Titre en français *</label>
                    <input id="clubActivityTitleFr" maxlength="250" required>
                </div>

                <div class="form-group">
                    <label for="clubActivityTitleEn">Titre en anglais</label>
                    <input id="clubActivityTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubActivityStart">Début</label>
                    <input id="clubActivityStart" type="datetime-local">
                </div>

                <div class="form-group">
                    <label for="clubActivityEnd">Fin</label>
                    <input id="clubActivityEnd" type="datetime-local">
                </div>

                <div class="form-group">
                    <label for="clubActivityLocation">Lieu</label>
                    <input id="clubActivityLocation" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="clubActivityStatus">Statut</label>
                    <select id="clubActivityStatus">
                        <option value="upcoming">À venir</option>
                        <option value="ongoing">En cours</option>
                        <option value="completed">Terminée</option>
                        <option value="postponed">Reportée</option>
                        <option value="cancelled">Annulée</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="clubActivityDescriptionFr">Description en français</label>
                <textarea id="clubActivityDescriptionFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="clubActivityDescriptionEn">Description en anglais</label>
                <textarea id="clubActivityDescriptionEn" rows="3"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-club-close="clubActivityModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveClubActivityButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="clubPublicationModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="clubPublicationModalTitle">Nouvelle publication</h2>
            <button class="modal-close" type="button" data-club-close="clubPublicationModal">×</button>
        </div>

        <form id="clubPublicationForm">
            <input type="hidden" id="clubPublicationId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubPublicationTitleFr">Titre en français *</label>
                    <input id="clubPublicationTitleFr" maxlength="250" required>
                </div>

                <div class="form-group">
                    <label for="clubPublicationTitleEn">Titre en anglais</label>
                    <input id="clubPublicationTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label>
                        <input id="clubPublicationFeatured" type="checkbox">
                        Mettre en avant
                    </label>
                </div>
            </div>

            <div class="form-group">
                <label for="clubPublicationSummaryFr">Résumé en français</label>
                <textarea id="clubPublicationSummaryFr" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label for="clubPublicationSummaryEn">Résumé en anglais</label>
                <textarea id="clubPublicationSummaryEn" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label for="clubPublicationBodyFr">Contenu en français</label>
                <textarea id="clubPublicationBodyFr" rows="5"></textarea>
            </div>

            <div class="form-group">
                <label for="clubPublicationBodyEn">Contenu en anglais</label>
                <textarea id="clubPublicationBodyEn" rows="5"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-club-close="clubPublicationModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveClubPublicationButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="clubCategoryModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="clubCategoryModalTitle">Nouvelle catégorie</h2>
            <button class="modal-close" type="button" data-club-close="clubCategoryModal">×</button>
        </div>

        <form id="clubCategoryForm">
            <input type="hidden" id="clubCategoryId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="clubCategoryNameFr">Nom en français *</label>
                    <input id="clubCategoryNameFr" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="clubCategoryNameEn">Nom en anglais</label>
                    <input id="clubCategoryNameEn" maxlength="150">
                </div>

                <div class="form-group">
                    <label for="clubCategorySlug">Identifiant *</label>
                    <input id="clubCategorySlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="clubCategoryOrder">Ordre d'affichage</label>
                    <input id="clubCategoryOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label>
                        <input id="clubCategoryActive" type="checkbox" checked>
                        Catégorie active
                    </label>
                </div>
            </div>

            <div class="form-group">
                <label for="clubCategoryDescriptionFr">Description en français</label>
                <textarea id="clubCategoryDescriptionFr" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label for="clubCategoryDescriptionEn">Description en anglais</label>
                <textarea id="clubCategoryDescriptionEn" rows="2"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-club-close="clubCategoryModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveClubCategoryButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>`;

function ensureClubModals() {
if($("clubModal")) return;

document.body.insertAdjacentHTML("beforeend", CLUB_MODALS_HTML);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-club-close]");
    if(button) closeModal(button.dataset.clubClose);
});

$("clubForm").addEventListener("submit", saveClub);
$("clubActivityForm").addEventListener("submit", saveClubActivity);
$("clubPublicationForm").addEventListener("submit", saveClubPublication);
$("clubCategoryForm").addEventListener("submit", saveClubCategory);

$("clubNameFr").addEventListener("input", () => {
    if(!$("clubId").value) {
        $("clubSlug").value = slugify($("clubNameFr").value);
    }
});

$("clubCategoryNameFr").addEventListener("input", () => {
    if(!$("clubCategoryId").value) {
        $("clubCategorySlug").value = slugify($("clubCategoryNameFr").value);
    }
});

}

/* -----------------------------------------
Actions déléguées
----------------------------------------- */

function handleClubAction(event) {
const button = event.target.closest("button[data-action]");
if(!button) return;

const id = button.dataset.id;

const actions = {
    "club-detail": () => openClubDetail(id),
    "edit-club": () => openClubForm(id),
    "toggle-club": () => toggleClubPublication(id),
    "delete-club": () => deleteClub(id),
    "edit-club-activity": () => openClubActivityForm(id),
    "delete-club-activity": () => deleteClubActivity(id),
    "edit-club-publication": () => openClubPublicationForm(id),
    "toggle-club-publication": () => toggleClubPublicationStatus(id),
    "delete-club-publication": () => deleteClubPublication(id),
    "delete-club-image": () => deleteClubImage(id),
    "edit-club-category": () => openClubCategoryForm(id),
    "toggle-club-category": () => toggleClubCategory(id)
};

const action = actions[button.dataset.action];
if(action) action();

}

/* -----------------------------------------
Rafraîchissement et rendu du module
----------------------------------------- */

async function refreshClubs() {
await loadClubResources();

fillClubFilters();
renderClubs();
renderClubCategories();

if(currentClubId && getClub(currentClubId)) {
    renderClubDetail();
} else {
    closeClubDetail();
}

}

async function renderClubsModule() {
clubPermissions = await loadClubPermissions();

moduleContent.innerHTML = `
<div class="page-heading">
    <div>
        <h1>Clubs</h1>
        <p>
            Gestion des clubs, de leurs activités, de leurs publications et de leurs photos.
        </p>
    </div>

    <div class="module-label">MODULE CLUBS</div>
</div>

<div class="welcome-card">
    <h2>Espace clubs</h2>
    <p>
        Les nouveaux clubs sont enregistrés comme brouillons.
        Ils ne deviennent visibles sur le site qu'une fois publiés.
    </p>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Clubs</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Informations générales, responsables et statut de publication.
            </p>
        </div>

        ${clubPermissions.create ? `
            <button class="btn btn-primary" id="newClubButton">＋ Nouveau club</button>
        ` : ""}
    </div>

    <div class="toolbar">
        <input id="clubSearch" type="search" placeholder="Rechercher un club...">

        <select id="clubCategoryFilter">
            <option value="all">Toutes les catégories</option>
        </select>

        <select id="clubStatusFilter">
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="published">Publiés</option>
        </select>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Catégorie</th>
                    <th>Activités</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="clubsTableBody">
                <tr>
                    <td colspan="5" class="empty-state">Chargement des clubs...</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<div class="panel hidden" id="clubDetailPanel">
    <div class="toolbar">
        <div>
            <h2 id="clubDetailTitle">Club</h2>
            <p id="clubDetailSubtitle" style="font-size:12px;color:var(--muted);margin-top:5px"></p>
        </div>

        <button class="btn btn-light" id="closeClubDetailButton" type="button">
            ← Retour aux clubs
        </button>
    </div>

    <h3 style="margin-top:10px">Activités</h3>
    ${clubPermissions.create ? `
        <div class="toolbar">
            <button class="btn btn-primary" id="newClubActivityButton" type="button">＋ Nouvelle activité</button>
        </div>` : ""}
    <div class="table-wrap">
        <table>
            <thead>
                <tr><th>Titre</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody id="clubActivitiesBody"></tbody>
        </table>
    </div>

    <h3 style="margin-top:20px">Publications</h3>
    ${clubPermissions.create ? `
        <div class="toolbar">
            <button class="btn btn-primary" id="newClubPublicationButton" type="button">＋ Nouvelle publication</button>
        </div>` : ""}
    <div class="table-wrap">
        <table>
            <thead>
                <tr><th>Titre</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody id="clubPublicationsBody"></tbody>
        </table>
    </div>

    <h3 style="margin-top:20px">Photos</h3>
    ${clubPermissions.create ? `
        <div class="toolbar">
            <input id="clubImageInput" type="file" accept="image/*" multiple>
            <button class="btn btn-primary" id="clubImageUploadButton" type="button">Ajouter les photos</button>
        </div>` : ""}
    <div id="clubImagesGrid"
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px"></div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Catégories de clubs</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Classement des clubs selon les catégories disponibles.
            </p>
        </div>

        ${clubPermissions.edit ? `
            <button class="btn btn-primary" id="newClubCategoryButton">＋ Nouvelle catégorie</button>
        ` : ""}
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Nom français</th>
                    <th>Nom anglais</th>
                    <th>Identifiant</th>
                    <th>État</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="clubCategoriesTableBody">
                <tr><td colspan="5" class="empty-state">Chargement...</td></tr>
            </tbody>
        </table>
    </div>
</div>`;

ensureClubModals();

$("clubSearch").addEventListener("input", renderClubs);
$("clubCategoryFilter").addEventListener("change", renderClubs);
$("clubStatusFilter").addEventListener("change", renderClubs);

$("clubsTableBody").addEventListener("click", handleClubAction);
$("clubDetailPanel").addEventListener("click", handleClubAction);
$("clubCategoriesTableBody").addEventListener("click", handleClubAction);

$("closeClubDetailButton").addEventListener("click", closeClubDetail);

if(clubPermissions.create) {
    $("newClubButton").addEventListener("click", () => openClubForm());
    $("newClubActivityButton").addEventListener("click", () => openClubActivityForm());
    $("newClubPublicationButton").addEventListener("click", () => openClubPublicationForm());
    $("clubImageUploadButton").addEventListener("click", uploadClubImages);
}

if(clubPermissions.edit) {
    $("newClubCategoryButton").addEventListener("click", () => openClubCategoryForm());
}

await refreshClubs();

}

/* =========================================
MODULE STATISTIQUES
========================================= */

const STATISTICS_PAGE_SIZE = 1000;
let statisticsPeriodDays = 30;
let statisticsData = {pageViews: [], downloads: []};

/* -----------------------------------------
Chargement (pagination : Supabase limite
chaque requête à 1000 lignes)
----------------------------------------- */

async function fetchAllStatisticsRows(table, columns, sinceIso) {
const rows = [];
let from = 0;

while(true) {
    const {data, error} = await supabase
        .from(table)
        .select(columns)
        .gte("occurred_at", sinceIso)
        .order("occurred_at", {ascending: true})
        .range(from, from + STATISTICS_PAGE_SIZE - 1);

    if(error) throw error;

    rows.push(...(data || []));

    if(!data || data.length < STATISTICS_PAGE_SIZE) break;

    from += STATISTICS_PAGE_SIZE;
}

return rows;

}

async function loadStatisticsData() {
const since = new Date(
Date.now() - statisticsPeriodDays * 86400000
).toISOString();

const [pageViews, downloads] = await Promise.all([
    fetchAllStatisticsRows(
        "page_views",
        "visitor_id,page_path,page_title,content_type,device_type,occurred_at",
        since
    ),
    fetchAllStatisticsRows(
        "download_events",
        "visitor_id,resource_id,resource_title,resource_type,file_format,occurred_at",
        since
    )
]);

statisticsData = {pageViews, downloads};

}

/* -----------------------------------------
Calculs
----------------------------------------- */

function statisticsDayKey(value) {
const date = new Date(value);
if(Number.isNaN(date.getTime())) return "";
return date.toLocaleDateString("fr-CA");
}

function statisticsBucket(value) {
const day = statisticsDayKey(value);

return statisticsPeriodDays > 90
    ? day.slice(0, 7)
    : day;

}

function countStatisticsBy(rows, keyFn) {
const map = new Map();

for(const row of rows) {
    const key = keyFn(row) || "—";
    map.set(key, (map.get(key) || 0) + 1);
}

return [...map.entries()].sort((a, b) => b[1] - a[1]);

}

function buildStatisticsSeries() {
const keys = [];
const seen = new Set();

for(let i = statisticsPeriodDays - 1; i >= 0; i--) {
    const key = statisticsBucket(
        new Date(Date.now() - i * 86400000).toISOString()
    );

    if(key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
    }
}

const series = new Map(
    keys.map(key => [key, {key, views: 0, downloads: 0}])
);

for(const view of statisticsData.pageViews) {
    const item = series.get(statisticsBucket(view.occurred_at));
    if(item) item.views += 1;
}

for(const download of statisticsData.downloads) {
    const item = series.get(statisticsBucket(download.occurred_at));
    if(item) item.downloads += 1;
}

return [...series.values()];

}

/* -----------------------------------------
Rendu
----------------------------------------- */

function renderStatisticsRanking(entries, total) {
if(!entries.length) {
return `<tr><td colspan="3" class="empty-state">Aucune donnée sur cette période.</td></tr>`;
}

return entries.slice(0, 10).map(([label, count]) => `
    <tr>
        <td>${escapeHTML(label)}</td>
        <td>${count}</td>
        <td>${total ? Math.round((count * 100) / total) : 0} %</td>
    </tr>`).join("");

}

function renderStatisticsChart(series) {
if(!series.length) {
return `<p class="empty-state">Aucune donnée sur cette période.</p>`;
}

const max = Math.max(1, ...series.map(item => Math.max(item.views, item.downloads)));

const bars = series.map(item => {
    const viewsHeight = Math.round((item.views * 100) / max);
    const downloadsHeight = Math.round((item.downloads * 100) / max);

    return `
        <div title="${escapeHTML(item.key)} — ${item.views} vue(s), ${item.downloads} téléchargement(s)"
            style="flex:1;min-width:4px;height:100%;display:flex;align-items:flex-end;gap:1px">
            <div style="flex:1;height:${viewsHeight}%;background:#0b1f3a;border-radius:3px 3px 0 0"></div>
            <div style="flex:1;height:${downloadsHeight}%;background:#c8a24a;border-radius:3px 3px 0 0"></div>
        </div>`;
}).join("");

return `
    <div style="display:flex;align-items:flex-end;gap:3px;height:180px">${bars}</div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px">
        <span>${escapeHTML(series[0].key)}</span>
        <span>${escapeHTML(series[series.length - 1].key)}</span>
    </div>
    <div style="display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:8px">
        <span><span style="display:inline-block;width:10px;height:10px;background:#0b1f3a;border-radius:2px"></span> Vues</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#c8a24a;border-radius:2px"></span> Téléchargements</span>
    </div>`;

}

function renderStatisticsCards() {
const views = statisticsData.pageViews;
const downloads = statisticsData.downloads;

const cards = [
    ["Pages vues", views.length],
    ["Visiteurs uniques", new Set(views.map(item => item.visitor_id)).size],
    ["Téléchargements", downloads.length],
    ["Téléchargeurs uniques", new Set(downloads.map(item => item.visitor_id)).size]
];

return cards.map(([label, value]) => `
    <div style="flex:1;min-width:160px;border:1px solid #e2e8f0;border-radius:10px;padding:14px">
        <div style="font-size:12px;color:var(--muted)">${escapeHTML(label)}</div>
        <div style="font-size:26px;font-weight:bold;margin-top:6px">${value}</div>
    </div>`).join("");

}

function renderStatisticsContent() {
const content = $("statisticsContent");
if(!content) return;

const views = statisticsData.pageViews;
const downloads = statisticsData.downloads;

const topPages = countStatisticsBy(views, item => item.page_path);
const topResources = countStatisticsBy(downloads, item => item.resource_title);
const devices = countStatisticsBy(views, item => item.device_type);
const formats = countStatisticsBy(downloads, item => item.file_format);

content.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
        ${renderStatisticsCards()}
    </div>

    <div class="panel">
        <h2>Évolution</h2>
        <p style="font-size:12px;color:var(--muted);margin-top:5px;margin-bottom:14px">
            ${statisticsPeriodDays > 90 ? "Regroupement par mois." : "Regroupement par jour."}
        </p>
        ${renderStatisticsChart(buildStatisticsSeries())}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px">
        <div class="panel">
            <h2>Pages les plus consultées</h2>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Page</th><th>Vues</th><th>Part</th></tr></thead>
                    <tbody>${renderStatisticsRanking(topPages, views.length)}</tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <h2>Ressources les plus téléchargées</h2>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Ressource</th><th>Téléchargements</th><th>Part</th></tr></thead>
                    <tbody>${renderStatisticsRanking(topResources, downloads.length)}</tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <h2>Appareils</h2>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Type</th><th>Vues</th><th>Part</th></tr></thead>
                    <tbody>${renderStatisticsRanking(devices, views.length)}</tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <h2>Formats téléchargés</h2>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Format</th><th>Téléchargements</th><th>Part</th></tr></thead>
                    <tbody>${renderStatisticsRanking(formats, downloads.length)}</tbody>
                </table>
            </div>
        </div>
    </div>`;

}

async function refreshStatistics() {
const content = $("statisticsContent");
if(content) {
    content.innerHTML = `<p class="empty-state">Chargement des statistiques...</p>`;
}

try {
    await loadStatisticsData();
    renderStatisticsContent();

} catch(error) {
    console.error("Erreur statistiques :", error);

    if(content) {
        content.innerHTML = `
            <div class="notice">
                <strong>Impossible de charger les statistiques :</strong>
                ${escapeHTML(error.message)}
            </div>`;
    }
}

}

async function renderStatisticsModule() {
moduleContent.innerHTML = `
<div class="page-heading">
    <div>
        <h1>Statistiques</h1>
        <p>
            Fréquentation du site et téléchargements des ressources.
        </p>
    </div>

    <div class="module-label">MODULE STATISTIQUES</div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Période</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Les données sont celles enregistrées sur le site pendant la période choisie.
            </p>
        </div>

        <select id="statisticsPeriod">
            <option value="7">7 derniers jours</option>
            <option value="30" selected>30 derniers jours</option>
            <option value="90">90 derniers jours</option>
            <option value="365">12 derniers mois</option>
        </select>
    </div>
</div>

<div id="statisticsContent"></div>`;

$("statisticsPeriod").value = String(statisticsPeriodDays);

$("statisticsPeriod").addEventListener("change", async event => {
    statisticsPeriodDays = Number(event.target.value) || 30;
    await refreshStatistics();
});

await refreshStatistics();

}

/* =========================================
MODULE NAVIGATION
========================================= */

const NAV_ITEM_COLUMNS =
"id,parent_id,label_fr,label_en,item_type,url,open_in_new_tab,icon,display_order,is_active,is_visible,created_at,updated_at";

const HOMEPAGE_BLOCK_COLUMNS =
"id,block_key,block_type,title_fr,title_en,content_fr,content_en,display_order,status,is_featured,display_start,display_end,created_at,updated_at";

const NAVIGATION_SETTING_COLUMNS =
"id,setting_key,setting_value,updated_at";

const HOMEPAGE_BLOCK_TYPES = [
["hero", "Bannière d'accueil"],
["welcome", "Message de bienvenue"],
["president_message", "Message du président"],
["activities", "Activités à la une"],
["clubs", "Clubs à la une"],
["gallery", "Galerie à la une"],
["publications", "Publications à la une"]
];

let navigationPermissions = {
create: false,
edit: false,
delete: false
};

let blockPermissions = {
edit: false,
delete: false
};

let navItemsCache = [];
let homepageBlocksCache = [];
let navigationSettingsCache = [];

function sortByDisplayOrder(a, b) {
return (a.display_order ?? 0) - (b.display_order ?? 0);
}

function navStatusLabel(status) {
return status === "hidden" ? "Masquée" : statusLabel(status);
}

function getHomepageBlockTypeLabel(type) {
const found = HOMEPAGE_BLOCK_TYPES.find(([value]) => value === type);
return found ? found[1] : type || "—";
}

function getNavItem(id) {
return navItemsCache.find(item => item.id === id) || null;
}

function getHomepageBlock(id) {
return homepageBlocksCache.find(block => block.id === id) || null;
}

/* -----------------------------------------
Permissions
----------------------------------------- */

async function loadNavigationPermissions() {
const [create, edit, remove, blockEdit, blockDelete] = await Promise.all([
hasPermission("navigation", "create"),
hasPermission("navigation", "edit"),
hasPermission("navigation", "delete"),
hasPermission("settings", "edit"),
hasPermission("settings", "delete")
]);

navigationPermissions = {create, edit, delete: remove};
blockPermissions = {edit: blockEdit, delete: blockDelete};

}

/* -----------------------------------------
Chargement
----------------------------------------- */

async function loadNavigationResources() {
const [itemsResult, blocksResult, settingsResult] = await Promise.all([
supabase.from("navigation_items")
.select(NAV_ITEM_COLUMNS)
.order("display_order"),

    supabase.from("homepage_blocks")
        .select(HOMEPAGE_BLOCK_COLUMNS)
        .order("display_order"),

    supabase.from("navigation_settings")
        .select(NAVIGATION_SETTING_COLUMNS)
]);

if(itemsResult.error) throw itemsResult.error;
if(blocksResult.error) throw blocksResult.error;
if(settingsResult.error) throw settingsResult.error;

navItemsCache = itemsResult.data || [];
homepageBlocksCache = blocksResult.data || [];
navigationSettingsCache = settingsResult.data || [];

}

/* -----------------------------------------
Menu : arborescence
----------------------------------------- */

function getNavSections() {
return navItemsCache
.filter(item => item.item_type === "section")
.sort(sortByDisplayOrder);
}

function getNavChildren(parentId) {
return navItemsCache
.filter(item => item.item_type === "link" && item.parent_id === parentId)
.sort(sortByDisplayOrder);
}

function getOrphanNavLinks() {
const sectionIds = new Set(getNavSections().map(section => section.id));

return navItemsCache
    .filter(item =>
        item.item_type === "link" &&
        (!item.parent_id || !sectionIds.has(item.parent_id))
    )
    .sort(sortByDisplayOrder);

}

function renderNavItemRow(item, depth, siblings) {
const id = escapeHTML(item.id);
const index = siblings.findIndex(sibling => sibling.id === item.id);
const actions = [];

if(navigationPermissions.edit) {
    if(index > 0) {
        actions.push(`<button class="btn btn-light" data-action="nav-up" data-id="${id}">↑</button>`);
    }
    if(index < siblings.length - 1) {
        actions.push(`<button class="btn btn-light" data-action="nav-down" data-id="${id}">↓</button>`);
    }
    actions.push(`<button class="btn btn-light" data-action="edit-nav" data-id="${id}">Modifier</button>`);
    actions.push(`<button class="btn btn-light" data-action="toggle-nav-visible" data-id="${id}">${item.is_visible ? "Masquer" : "Afficher"}</button>`);
}

if(navigationPermissions.delete) {
    actions.push(`<button class="btn btn-light" data-action="delete-nav" data-id="${id}">Supprimer</button>`);
}

const indent = depth ? `<span style="padding-left:22px;color:var(--muted)">↳ </span>` : "";

return `
    <tr>
        <td>${indent}<strong>${escapeHTML(item.label_fr)}</strong></td>
        <td>${item.item_type === "section" ? "Section" : "Lien"}</td>
        <td style="font-size:12px;color:var(--muted)">${escapeHTML(item.url || "—")}</td>
        <td>${item.is_visible ? "Visible" : "Masqué"}${item.is_active ? "" : " · inactif"}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">${actions.join("")}</div></td>
    </tr>`;

}

function renderNavigationTree() {
const tbody = $("navItemsTableBody");
if(!tbody) return;

const sections = getNavSections();
const orphans = getOrphanNavLinks();
const rows = [];

sections.forEach(section => {
    rows.push(renderNavItemRow(section, 0, sections));
    const children = getNavChildren(section.id);
    children.forEach(child => rows.push(renderNavItemRow(child, 1, children)));
});

if(orphans.length) {
    rows.push(`<tr><td colspan="5" style="background:#fff7ed;font-size:12px">Liens sans section</td></tr>`);
    orphans.forEach(link => rows.push(renderNavItemRow(link, 0, orphans)));
}

tbody.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="5" class="empty-state">Aucun élément de menu.</td></tr>`;

}

async function moveNavItem(id, direction) {
if(!navigationPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const item = getNavItem(id);
if(!item) return;

const siblings = item.item_type === "section"
    ? getNavSections()
    : getNavChildren(item.parent_id);

const index = siblings.findIndex(sibling => sibling.id === id);
const target = index + direction;

if(target < 0 || target >= siblings.length) return;

const reordered = [...siblings];
[reordered[index], reordered[target]] = [reordered[target], reordered[index]];

try {
    for(let position = 0; position < reordered.length; position++) {
        const {data, error} = await supabase
            .from("navigation_items")
            .update({display_order: position + 1, updated_at: new Date().toISOString()})
            .eq("id", reordered[position].id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Modification refusée (droits insuffisants).");
    }

    await refreshNavigation();

} catch(error) {
    alert("Impossible de déplacer l'élément : " + error.message);
}

}

async function toggleNavItemVisibility(id) {
if(!navigationPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const item = getNavItem(id);
if(!item) return;

try {
    const {data, error} = await supabase
        .from("navigation_items")
        .update({is_visible: !item.is_visible, updated_at: new Date().toISOString()})
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Modification refusée (droits insuffisants).");

    await refreshNavigation();

} catch(error) {
    alert("Impossible de modifier la visibilité : " + error.message);
}

}

async function deleteNavItem(id) {
if(!navigationPermissions.delete) return alert("Vous ne disposez pas du droit de suppression.");

const item = getNavItem(id);
if(!item) return;

if(item.item_type === "section" && getNavChildren(id).length) {
    return alert("Cette section contient des liens. Déplacez ou supprimez-les d'abord.");
}

if(!confirm(`Supprimer « ${item.label_fr} » ? Cette action est définitive.`)) return;

try {
    const {data, error} = await deleteChecked("navigation_items", "id", id, "navigation");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    await refreshNavigation();

} catch(error) {
    alert("Impossible de supprimer l'élément : " + error.message);
}

}

function fillNavParentOptions(selectedId) {
$("navItemParent").innerHTML =
'<option value="">Aucune section</option>' +
getNavSections().map(section => `
    <option value="${escapeHTML(section.id)}">
        ${escapeHTML(section.label_fr)}
    </option>
`).join("");

$("navItemParent").value = selectedId || "";

}

function updateNavItemTypeFields() {
const isLink = $("navItemType").value === "link";
$("navItemUrlField").style.display = isLink ? "" : "none";
$("navItemParentField").style.display = isLink ? "" : "none";
}

function openNavItemForm(id = null, presetType = "link") {
const item = id ? getNavItem(id) : null;

if(id ? !navigationPermissions.edit : !navigationPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const type = item?.item_type || presetType;

$("navItemId").value = item?.id || "";
$("navItemModalTitle").textContent = item
    ? "Modifier l'élément"
    : (type === "section" ? "Nouvelle section" : "Nouveau lien");
$("navItemType").value = type;
$("navItemType").disabled = Boolean(item);
$("navItemLabelFr").value = item?.label_fr || "";
$("navItemLabelEn").value = item?.label_en || "";
$("navItemUrl").value = item?.url || "";
$("navItemIcon").value = item?.icon || "";
$("navItemOrder").value = item?.display_order ?? 0;
$("navItemNewTab").checked = item?.open_in_new_tab === true;
$("navItemVisible").checked = item ? item.is_visible === true : true;
$("navItemActive").checked = item ? item.is_active === true : true;

fillNavParentOptions(item?.parent_id);
updateNavItemTypeFields();

openModal("navItemModal");

}

async function saveNavItem(event) {
event.preventDefault();

const id = $("navItemId").value;

if(id ? !navigationPermissions.edit : !navigationPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const type = $("navItemType").value;
const labelFr = $("navItemLabelFr").value.trim();
const url = nullIfEmpty($("navItemUrl").value);

if(!labelFr) {
    return alert("Le libellé français est obligatoire.");
}

if(type === "link" && !url) {
    return alert("Un lien doit avoir une adresse (URL).");
}

const payload = {
    label_fr: labelFr,
    label_en: nullIfEmpty($("navItemLabelEn").value),
    item_type: type,
    url: type === "link" ? url : null,
    parent_id: type === "link" ? (nullIfEmpty($("navItemParent").value)) : null,
    icon: nullIfEmpty($("navItemIcon").value),
    open_in_new_tab: $("navItemNewTab").checked,
    display_order: Number($("navItemOrder").value) || 0,
    is_visible: $("navItemVisible").checked,
    is_active: $("navItemActive").checked,
    updated_by: currentProfile.user_id,
    updated_at: new Date().toISOString()
};

const button = $("saveNavItemButton");
button.disabled = true;

try {
    if(id) {
        const {data, error} = await supabase
            .from("navigation_items")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");
    } else {
        const {error} = await supabase
            .from("navigation_items")
            .insert({
                ...payload,
                created_by: currentProfile.user_id
            });

        if(error) throw error;
    }

    closeModal("navItemModal");
    await refreshNavigation();

} catch(error) {
    alert("Impossible d'enregistrer l'élément : " + error.message);

} finally {
    $("navItemType").disabled = false;
    button.disabled = false;
}

}

/* -----------------------------------------
Blocs de la page d'accueil
----------------------------------------- */

function renderHomepageBlocks() {
const tbody = $("homepageBlocksTableBody");
if(!tbody) return;

if(!homepageBlocksCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Aucun bloc sur la page d'accueil.</td></tr>`;
    return;
}

tbody.innerHTML = homepageBlocksCache.map(block => {
    const id = escapeHTML(block.id);
    const actions = [];

    if(blockPermissions.edit) {
        actions.push(`<button class="btn btn-light" data-action="edit-block" data-id="${id}">Modifier</button>`);
        actions.push(`<button class="btn btn-light" data-action="toggle-block" data-id="${id}">${block.status === "published" ? "Dépublier" : "Publier"}</button>`);
    }

    if(blockPermissions.delete) {
        actions.push(`<button class="btn btn-light" data-action="delete-block" data-id="${id}">Supprimer</button>`);
    }

    return `
        <tr>
            <td><strong>${escapeHTML(block.title_fr || getHomepageBlockTypeLabel(block.block_type))}</strong></td>
            <td>${escapeHTML(getHomepageBlockTypeLabel(block.block_type))}</td>
            <td>
                <span class="badge ${escapeHTML(block.status)}">${escapeHTML(navStatusLabel(block.status))}</span>
                ${block.is_featured ? " · à la une" : ""}
            </td>
            <td style="font-size:12px">
                ${block.display_start ? "Du " + formatDate(block.display_start) : ""}
                ${block.display_end ? " au " + formatDate(block.display_end) : ""}
                ${!block.display_start && !block.display_end ? "Permanent" : ""}
            </td>
            <td><div style="display:flex;gap:6px;flex-wrap:wrap">${actions.join("")}</div></td>
        </tr>`;
}).join("");

}

function openHomepageBlockForm(id = null) {
const block = id ? getHomepageBlock(id) : null;

if(!blockPermissions.edit) {
    return alert("Vous ne disposez pas du droit de modification.");
}

const fr = block?.content_fr || {};
const en = block?.content_en || {};

$("homepageBlockId").value = block?.id || "";
$("homepageBlockModalTitle").textContent = block ? "Modifier le bloc" : "Nouveau bloc";
$("homepageBlockType").innerHTML = HOMEPAGE_BLOCK_TYPES.map(([value, label]) => `
    <option value="${escapeHTML(value)}">${escapeHTML(label)}</option>
`).join("");
$("homepageBlockType").value = block?.block_type || "hero";
$("homepageBlockTitleFr").value = block?.title_fr || "";
$("homepageBlockTitleEn").value = block?.title_en || "";
$("homepageBlockTextFr").value = fr.text || "";
$("homepageBlockTextEn").value = en.text || "";
$("homepageBlockButtonFr").value = fr.button_label || "";
$("homepageBlockButtonEn").value = en.button_label || "";
$("homepageBlockButtonUrl").value = fr.button_url || en.button_url || "";
$("homepageBlockOrder").value = block?.display_order ?? 0;
$("homepageBlockStatus").value = block?.status || "draft";
$("homepageBlockFeatured").checked = block?.is_featured === true;
$("homepageBlockStart").value = toLocalInput(block?.display_start);
$("homepageBlockEnd").value = toLocalInput(block?.display_end);

openModal("homepageBlockModal");

}

async function saveHomepageBlock(event) {
event.preventDefault();

const id = $("homepageBlockId").value;

if(!blockPermissions.edit) {
    return alert("Vous ne disposez pas du droit de modification.");
}

const type = $("homepageBlockType").value;
const start = fromLocalInput($("homepageBlockStart").value);
const end = fromLocalInput($("homepageBlockEnd").value);

if(start && end && new Date(end) <= new Date(start)) {
    return alert("La date de fin doit être postérieure à la date de début.");
}

const buttonUrl = $("homepageBlockButtonUrl").value.trim();

const content = (suffix, text, buttonLabel) => ({
    text: text.trim(),
    button_label: buttonLabel.trim(),
    button_url: buttonUrl
});

const payload = {
    block_type: type,
    title_fr: nullIfEmpty($("homepageBlockTitleFr").value),
    title_en: nullIfEmpty($("homepageBlockTitleEn").value),
    content_fr: content("fr", $("homepageBlockTextFr").value, $("homepageBlockButtonFr").value),
    content_en: content("en", $("homepageBlockTextEn").value, $("homepageBlockButtonEn").value),
    display_order: Number($("homepageBlockOrder").value) || 0,
    status: $("homepageBlockStatus").value,
    is_featured: $("homepageBlockFeatured").checked,
    display_start: start,
    display_end: end,
    updated_by: currentProfile.user_id,
    updated_at: new Date().toISOString()
};

const button = $("saveHomepageBlockButton");
button.disabled = true;

try {
    if(id) {
        const {data, error} = await supabase
            .from("homepage_blocks")
            .update(payload)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");
    } else {
        const {error} = await supabase
            .from("homepage_blocks")
            .insert({
                ...payload,
                block_key: `${type}-${Date.now().toString(36)}`,
                created_by: currentProfile.user_id
            });

        if(error) throw error;
    }

    closeModal("homepageBlockModal");
    await refreshNavigation();

} catch(error) {
    alert("Impossible d'enregistrer le bloc : " + error.message);

} finally {
    button.disabled = false;
}

}

async function toggleHomepageBlock(id) {
if(!blockPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const block = getHomepageBlock(id);
if(!block) return;

const publishing = block.status !== "published";

try {
    const {data, error} = await supabase
        .from("homepage_blocks")
        .update({
            status: publishing ? "published" : "draft",
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshNavigation();

} catch(error) {
    alert("Impossible de modifier le bloc : " + error.message);
}

}

async function deleteHomepageBlock(id) {
if(!blockPermissions.delete) return alert("Vous ne disposez pas du droit de suppression.");

const block = getHomepageBlock(id);
if(!block) return;

if(!confirm(`Supprimer le bloc « ${block.title_fr || getHomepageBlockTypeLabel(block.block_type)} » ?`)) return;

try {
    const {data, error} = await deleteChecked("homepage_blocks", "id", id, "navigation");

    if(error) throw error;
    if(!data?.length) throw new Error("Suppression refusée (droits insuffisants).");

    await refreshNavigation();

} catch(error) {
    alert("Impossible de supprimer le bloc : " + error.message);
}

}

/* -----------------------------------------
Affichage du menu (navigation_settings)
----------------------------------------- */

function getNavDisplaySettings() {
const row = navigationSettingsCache.find(item => item.setting_key === "display");
const value = row?.setting_value || {};

return {
    show_search: value.show_search !== false,
    show_language_switch: value.show_language_switch !== false
};

}

function renderNavDisplaySettings() {
const settings = getNavDisplaySettings();
$("navShowSearch").checked = settings.show_search;
$("navShowLanguage").checked = settings.show_language_switch;
$("navDisplayForm").querySelectorAll("input, button").forEach(element => {
    element.disabled = !navigationPermissions.edit;
});

}

async function saveNavDisplaySettings(event) {
event.preventDefault();

if(!navigationPermissions.edit) {
    return alert("Vous ne disposez pas du droit de modification.");
}

const value = {
    show_search: $("navShowSearch").checked,
    show_language_switch: $("navShowLanguage").checked
};

try {
    const {data, error} = await supabase
        .from("navigation_settings")
        .update({
            setting_value: value,
            updated_by: currentProfile.user_id,
            updated_at: new Date().toISOString()
        })
        .eq("setting_key", "display")
        .select("id");

    if(error) throw error;

    if(!data?.length) {
        const {error: insertError} = await supabase
            .from("navigation_settings")
            .insert({
                setting_key: "display",
                setting_value: value,
                updated_by: currentProfile.user_id
            });

        if(insertError) throw insertError;
    }

    alert("Affichage du menu enregistré.");
    await refreshNavigation();

} catch(error) {
    alert("Impossible d'enregistrer l'affichage : " + error.message);
}

}

/* -----------------------------------------
Modales créées à la demande
----------------------------------------- */

const NAVIGATION_MODALS_HTML = `
<div class="modal" id="navItemModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="navItemModalTitle">Nouvel élément</h2>
            <button class="modal-close" type="button" data-nav-close="navItemModal">×</button>
        </div>

        <form id="navItemForm">
            <input type="hidden" id="navItemId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="navItemType">Type</label>
                    <select id="navItemType">
                        <option value="section">Section</option>
                        <option value="link">Lien</option>
                    </select>
                </div>

                <div class="form-group" id="navItemParentField">
                    <label for="navItemParent">Section parente</label>
                    <select id="navItemParent"></select>
                </div>

                <div class="form-group">
                    <label for="navItemLabelFr">Libellé en français *</label>
                    <input id="navItemLabelFr" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="navItemLabelEn">Libellé en anglais</label>
                    <input id="navItemLabelEn" maxlength="150">
                </div>

                <div class="form-group" id="navItemUrlField">
                    <label for="navItemUrl">Adresse (URL) *</label>
                    <input id="navItemUrl" maxlength="500" placeholder="Ex. : pages/activites.html">
                </div>

                <div class="form-group">
                    <label for="navItemIcon">Icône (facultatif)</label>
                    <input id="navItemIcon" maxlength="50">
                </div>

                <div class="form-group">
                    <label for="navItemOrder">Ordre d'affichage</label>
                    <input id="navItemOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label><input id="navItemNewTab" type="checkbox"> Ouvrir dans un nouvel onglet</label>
                </div>

                <div class="form-group">
                    <label><input id="navItemVisible" type="checkbox" checked> Visible sur le site</label>
                </div>

                <div class="form-group">
                    <label><input id="navItemActive" type="checkbox" checked> Actif</label>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-nav-close="navItemModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveNavItemButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="homepageBlockModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="homepageBlockModalTitle">Nouveau bloc</h2>
            <button class="modal-close" type="button" data-nav-close="homepageBlockModal">×</button>
        </div>

        <form id="homepageBlockForm">
            <input type="hidden" id="homepageBlockId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="homepageBlockType">Type de bloc *</label>
                    <select id="homepageBlockType" required></select>
                </div>

                <div class="form-group">
                    <label for="homepageBlockStatus">Statut</label>
                    <select id="homepageBlockStatus">
                        <option value="draft">Brouillon</option>
                        <option value="published">Publié</option>
                        <option value="hidden">Masqué</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="homepageBlockTitleFr">Titre en français</label>
                    <input id="homepageBlockTitleFr" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="homepageBlockTitleEn">Titre en anglais</label>
                    <input id="homepageBlockTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="homepageBlockOrder">Ordre d'affichage</label>
                    <input id="homepageBlockOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label><input id="homepageBlockFeatured" type="checkbox"> Mettre en avant</label>
                </div>

                <div class="form-group">
                    <label for="homepageBlockStart">Affiché à partir du</label>
                    <input id="homepageBlockStart" type="datetime-local">
                </div>

                <div class="form-group">
                    <label for="homepageBlockEnd">Affiché jusqu'au</label>
                    <input id="homepageBlockEnd" type="datetime-local">
                </div>
            </div>

            <div class="form-group">
                <label for="homepageBlockTextFr">Texte en français</label>
                <textarea id="homepageBlockTextFr" rows="3"></textarea>
            </div>

            <div class="form-group">
                <label for="homepageBlockTextEn">Texte en anglais</label>
                <textarea id="homepageBlockTextEn" rows="3"></textarea>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="homepageBlockButtonFr">Bouton en français</label>
                    <input id="homepageBlockButtonFr" maxlength="100">
                </div>

                <div class="form-group">
                    <label for="homepageBlockButtonEn">Bouton en anglais</label>
                    <input id="homepageBlockButtonEn" maxlength="100">
                </div>

                <div class="form-group">
                    <label for="homepageBlockButtonUrl">Adresse du bouton</label>
                    <input id="homepageBlockButtonUrl" maxlength="500">
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-nav-close="homepageBlockModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="saveHomepageBlockButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>`;

function ensureNavigationModals() {
if($("navItemModal")) return;

document.body.insertAdjacentHTML("beforeend", NAVIGATION_MODALS_HTML);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-nav-close]");
    if(button) closeModal(button.dataset.navClose);
});

$("navItemForm").addEventListener("submit", saveNavItem);
$("homepageBlockForm").addEventListener("submit", saveHomepageBlock);
$("navItemType").addEventListener("change", updateNavItemTypeFields);

}

/* -----------------------------------------
Actions déléguées
----------------------------------------- */

function handleNavigationAction(event) {
const button = event.target.closest("button[data-action]");
if(!button) return;

const id = button.dataset.id;

const actions = {
    "nav-up": () => moveNavItem(id, -1),
    "nav-down": () => moveNavItem(id, 1),
    "edit-nav": () => openNavItemForm(id),
    "toggle-nav-visible": () => toggleNavItemVisibility(id),
    "delete-nav": () => deleteNavItem(id),
    "edit-block": () => openHomepageBlockForm(id),
    "toggle-block": () => toggleHomepageBlock(id),
    "delete-block": () => deleteHomepageBlock(id)
};

const action = actions[button.dataset.action];
if(action) action();

}

/* -----------------------------------------
Rafraîchissement et rendu du module
----------------------------------------- */

async function refreshNavigation() {
await loadNavigationResources();

renderNavigationTree();
renderHomepageBlocks();
renderNavDisplaySettings();

}

async function renderNavigationModule() {
await loadNavigationPermissions();

moduleContent.innerHTML = `
<div class="page-heading">
    <div>
        <h1>Navigation</h1>
        <p>Organisation du menu du site, des blocs de la page d'accueil et de l'affichage du menu.</p>
    </div>

    <div class="module-label">MODULE NAVIGATION</div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Menu principal</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Les sections regroupent les liens. Un lien doit avoir une adresse.
            </p>
        </div>

        ${navigationPermissions.create ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-light" id="newNavSectionButton">＋ Section</button>
                <button class="btn btn-primary" id="newNavLinkButton">＋ Lien</button>
            </div>` : ""}
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr><th>Libellé</th><th>Type</th><th>Adresse</th><th>Affichage</th><th>Actions</th></tr>
            </thead>
            <tbody id="navItemsTableBody">
                <tr><td colspan="5" class="empty-state">Chargement...</td></tr>
            </tbody>
        </table>
    </div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Blocs de la page d'accueil</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Un bloc n'apparaît sur le site que s'il est publié et dans sa période d'affichage.
            </p>
        </div>

        ${blockPermissions.edit ? `
            <button class="btn btn-primary" id="newHomepageBlockButton">＋ Nouveau bloc</button>
        ` : ""}
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr><th>Titre</th><th>Type</th><th>Statut</th><th>Période</th><th>Actions</th></tr>
            </thead>
            <tbody id="homepageBlocksTableBody">
                <tr><td colspan="5" class="empty-state">Chargement...</td></tr>
            </tbody>
        </table>
    </div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Affichage du menu</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Éléments affichés dans l'en-tête du site.
            </p>
        </div>
    </div>

    <form id="navDisplayForm" style="display:flex;flex-direction:column;gap:12px">
        <label><input id="navShowSearch" type="checkbox"> Afficher la recherche</label>
        <label><input id="navShowLanguage" type="checkbox"> Afficher le choix de langue</label>
        ${navigationPermissions.edit ? `
            <div><button class="btn btn-primary" type="submit">Enregistrer l'affichage</button></div>` : ""}
    </form>
</div>`;

ensureNavigationModals();

$("navItemsTableBody").addEventListener("click", handleNavigationAction);
$("homepageBlocksTableBody").addEventListener("click", handleNavigationAction);

if(navigationPermissions.create) {
    $("newNavSectionButton").addEventListener("click", () => openNavItemForm(null, "section"));
    $("newNavLinkButton").addEventListener("click", () => openNavItemForm(null, "link"));
}

if(blockPermissions.edit) {
    $("newHomepageBlockButton").addEventListener("click", () => openHomepageBlockForm());
}

$("navDisplayForm").addEventListener("submit", saveNavDisplaySettings);

await refreshNavigation();

}

/* =========================================
MODULE PUBLICATIONS
========================================= */

const PUB_CONTENT_COLUMNS =
"id,content_type,status,priority,is_featured,created_at,published_at,published_by,archived_at,display_from,display_until,author_display_name,editor_display_name";

const PUB_DETAIL_COLUMNS =
"content_id,category_id,subcategory_id,reference,reference_year,reference_number,created_at";

const PUB_CATEGORY_COLUMNS =
"id,name,slug,reference_prefix,description,is_active,display_order,created_at";

const PUB_SUBCATEGORY_COLUMNS =
"id,category_id,name,slug,description,is_active,is_public,display_order,created_at";

const PUB_TRANSLATION_COLUMNS =
"id,content_id,language_code,title,summary,body";

let pubPermissions = {
create: false,
edit: false,
delete: false,
publish: false,
principal: false
};

let pubContentsCache = [];
let pubDetailsCache = [];
let pubCategoriesCache = [];
let pubSubcategoriesCache = [];
let pubTranslationsCache = [];

function getPubContent(id) {
return pubContentsCache.find(item => item.id === id) || null;
}

function getPubDetail(contentId) {
return pubDetailsCache.find(item => item.content_id === contentId) || null;
}

function getPubCategory(id) {
return pubCategoriesCache.find(item => item.id === id) || null;
}

function getPubSubcategory(id) {
return pubSubcategoriesCache.find(item => item.id === id) || null;
}

function getPubTranslation(contentId, language) {
return pubTranslationsCache.find(
item => item.content_id === contentId && item.language_code === language
) || null;
}

function getPubTitle(contentId) {
const fr = getPubTranslation(contentId, "fr");
return fr?.title || getPubTranslation(contentId, "en")?.title || "Sans titre";
}

function pubStatusLabel(status) {
return {
draft: "Brouillon",
scheduled: "Programmée",
published: "Publiée",
archived: "Archivée"
}[status] || status || "—";
}

/* -----------------------------------------
Permissions
----------------------------------------- */

async function loadPubPermissions() {
const [create, edit, remove, publish] = await Promise.all([
hasPermission("publications", "create"),
hasPermission("publications", "edit"),
hasPermission("publications", "delete"),
hasPermission("publications", "publish")
]);

pubPermissions = {
    create,
    edit,
    delete: remove,
    publish,
    principal: currentProfile?.is_principal_admin === true
};

}

/* -----------------------------------------
Chargement
----------------------------------------- */

async function loadPubResources() {
const [contentsResult, detailsResult, categoriesResult, subcategoriesResult, translationsResult, yearsResult] = await Promise.all([
supabase.from("contents")
.select(PUB_CONTENT_COLUMNS)
.eq("content_type", "publication")
.order("created_at", {ascending: false}),

    supabase.from("publications")
        .select(PUB_DETAIL_COLUMNS)
        .order("reference_year", {ascending: false})
        .order("reference_number", {ascending: false}),

    supabase.from("publication_categories")
        .select(PUB_CATEGORY_COLUMNS)
        .order("display_order"),

    supabase.from("publication_subcategories")
        .select(PUB_SUBCATEGORY_COLUMNS)
        .order("display_order"),

    supabase.from("content_translations")
        .select(PUB_TRANSLATION_COLUMNS),

    academicYears.length
        ? Promise.resolve({data: academicYears, error: null})
        : supabase.from("academic_years")
            .select("id,label,is_current,start_date,end_date")
            .order("start_date", {ascending: false})
]);

const results = [contentsResult, detailsResult, categoriesResult, subcategoriesResult, translationsResult, yearsResult];
for(const result of results) {
    if(result.error) throw result.error;
}

const publicationIds = new Set(
    (detailsResult.data || []).map(item => item.content_id)
);

pubContentsCache = (contentsResult.data || []).filter(item => publicationIds.has(item.id));
pubDetailsCache = detailsResult.data || [];
pubCategoriesCache = categoriesResult.data || [];
pubSubcategoriesCache = subcategoriesResult.data || [];

const contentIds = new Set(pubContentsCache.map(item => item.id));
pubTranslationsCache = (translationsResult.data || []).filter(
    item => contentIds.has(item.content_id)
);

academicYears = yearsResult.data || [];

}

/* -----------------------------------------
Liste des publications
----------------------------------------- */

function renderPublications() {
const tbody = $("pubTableBody");
if(!tbody) return;

const search = ($("pubSearch").value || "").trim().toLowerCase();
const categoryFilter = $("pubCategoryFilter").value;
const statusFilter = $("pubStatusFilter").value;

const rows = pubContentsCache.filter(content => {
    const detail = getPubDetail(content.id);
    const title = getPubTitle(content.id).toLowerCase();
    const reference = (detail?.reference || "").toLowerCase();

    return (!search || title.includes(search) || reference.includes(search)) &&
        (categoryFilter === "all" || detail?.category_id === categoryFilter) &&
        (statusFilter === "all" || content.status === statusFilter);
});

if(!rows.length) {
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="empty-state">Aucune publication ne correspond à ces critères.</td>
        </tr>`;
    return;
}

tbody.innerHTML = rows.map(content => {
    const id = escapeHTML(content.id);
    const detail = getPubDetail(content.id);
    const actions = [];

    if(pubPermissions.edit) {
        actions.push(`<button class="btn btn-light" data-action="edit-pub" data-id="${id}">Modifier</button>`);
    }

    if(pubPermissions.publish) {
        if(content.status !== "published") {
            actions.push(`<button class="btn btn-light" data-action="publish-pub" data-id="${id}">Publier</button>`);
        } else {
            actions.push(`<button class="btn btn-light" data-action="draft-pub" data-id="${id}">Dépublier</button>`);
        }

        if(content.status !== "archived") {
            actions.push(`<button class="btn btn-light" data-action="archive-pub" data-id="${id}">Archiver</button>`);
        }
    }

    if(pubPermissions.delete) {
        actions.push(`<button class="btn btn-light" data-action="delete-pub" data-id="${id}">Supprimer</button>`);
    }

    return `
        <tr>
            <td><strong>${escapeHTML(getPubTitle(content.id))}</strong></td>
            <td style="font-size:12px">${escapeHTML(detail?.reference || "—")}</td>
            <td>${escapeHTML(getPubCategory(detail?.category_id)?.name || "—")}</td>
            <td>${escapeHTML(getPubSubcategory(detail?.subcategory_id)?.name || "—")}</td>
            <td>
                <span class="badge ${escapeHTML(content.status)}">${escapeHTML(pubStatusLabel(content.status))}</span>
            </td>
            <td><div style="display:flex;gap:6px;flex-wrap:wrap">${actions.join("")}</div></td>
        </tr>`;
}).join("");

}

/* -----------------------------------------
Publications : formulaire
----------------------------------------- */

function fillPubCategoryOptions(categoryId) {
$("pubCategory").innerHTML = pubCategoriesCache
.filter(category => category.is_active || category.id === categoryId)
.map(category => `
<option value="${escapeHTML(category.id)}">
${escapeHTML(category.name)} (${escapeHTML(category.reference_prefix)})
</option>
`).join("");

$("pubCategory").value = categoryId || "";

}

function fillPubSubcategoryOptions(categoryId, subcategoryId) {
$("pubSubcategory").innerHTML =
'<option value="">Aucune</option>' +
pubSubcategoriesCache
.filter(item => item.category_id === categoryId && (item.is_active || item.id === subcategoryId))
.map(item => `
<option value="${escapeHTML(item.id)}">
${escapeHTML(item.name)}
</option>
`).join("");

$("pubSubcategory").value = subcategoryId || "";

}

// ===== Images des contenus (publications, activités) : plusieurs images, une seule principale =====
const PUB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PUB_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const IMAGE_KINDS = {
    publication: {
        label: "publication",
        folder: "publications",
        bucket: "buep-publications",
        input: "pubImage",
        preview: "pubImagePreview",
        current: "pubImagesCurrent",
        canEdit: () => pubPermissions.edit,
        refresh: () => refreshPublications()
    },
    activity: {
        label: "activite",
        folder: "activities",
        bucket: "buep-activities",
        input: "activityImage",
        preview: "activityImagePreview",
        current: "activityImagesCurrent",
        canEdit: () => permissions.edit,
        refresh: () => loadActivities()
    }
};

const imageContentIds = {publication: null, activity: null};

function imageSelectedFiles(kind) {
    const input = $(kind.input);
    return input && input.files ? Array.from(input.files) : [];
}

function resetImageInput(kind) {
    const input = $(kind.input);
    if(input) input.value = "";
    showImageLocalPreview(kind);
}

function showImageLocalPreview(kind) {
    const box = $(kind.preview);
    if(!box) return;

    const files = imageSelectedFiles(kind);
    if(!files.length) {
        box.hidden = true;
        box.innerHTML = "";
        return;
    }

    box.innerHTML = files.map(file => `
        <figure class="pub-thumb">
            <img src="${escapeHTML(URL.createObjectURL(file))}" alt="">
            <figcaption>${escapeHTML(file.name)}</figcaption>
        </figure>
    `).join("");
    box.hidden = false;
}

async function loadContentImages(kind, contentId) {
    const box = $(kind.current);
    if(!box) return;

    imageContentIds[kind.label] = contentId || null;
    box.innerHTML = "";
    if(!contentId) return;

    try {
        const {data, error} = await supabase
            .from("content_media")
            .select("id, storage_path, is_main, display_order")
            .eq("content_id", contentId)
            .eq("media_type", "image")
            .order("is_main", {ascending: false})
            .order("display_order");

        if(error) throw error;

        if(!data?.length) {
            box.innerHTML = `<p class="pub-thumbs-empty">Aucune image pour le moment.</p>`;
            return;
        }

        const rows = await Promise.all(data.map(async row => {
            const {data: signed} = await supabase.storage
                .from(kind.bucket)
                .createSignedUrl(row.storage_path, 3600);
            return {...row, url: signed?.signedUrl || ""};
        }));

        box.innerHTML = rows.map(row => `
            <figure class="pub-thumb${row.is_main ? " is-main" : ""}"
                data-image-id="${escapeHTML(row.id)}"
                data-storage-path="${escapeHTML(row.storage_path)}">
                <img src="${escapeHTML(row.url)}" alt="">
                <figcaption>${row.is_main ? "Image principale" : "Image secondaire"}</figcaption>
                <div class="pub-thumb-actions">
                    ${row.is_main ? "" : `<button type="button" data-img-main>Définir principale</button>`}
                    <button type="button" data-img-delete>Retirer</button>
                </div>
            </figure>
        `).join("");

    } catch(error) {
        console.error("Images du contenu :", error);
        box.innerHTML = `<p class="pub-thumbs-empty">Impossible de charger les images.</p>`;
    }
}

async function handleContentImageAction(kind, event) {
    const mainButton = event.target.closest("[data-img-main]");
    const deleteButton = event.target.closest("[data-img-delete]");
    if(!mainButton && !deleteButton) return;

    const figure = event.target.closest("[data-image-id]");
    const contentId = imageContentIds[kind.label];
    if(!figure || !contentId) return;

    if(!kind.canEdit()) {
        return alert("Vous ne disposez pas du droit nécessaire.");
    }

    try {
        if(mainButton) {
            const {error: resetError} = await supabase
                .from("content_media")
                .update({is_main: false})
                .eq("content_id", contentId)
                .eq("media_type", "image");
            if(resetError) throw resetError;

            const {error} = await supabase
                .from("content_media")
                .update({is_main: true})
                .eq("id", figure.dataset.imageId);
            if(error) throw error;
        }

        if(deleteButton) {
            if(!confirm("Retirer cette image ?")) return;

            const wasMain = figure.classList.contains("is-main");

            const {data: removedMedia, error} = await deleteChecked("content_media", "id", figure.dataset.imageId, "publications");
            if(error) throw error;
            if(!removedMedia || !removedMedia.length) {
                throw new Error("L'image n'a pas pu être supprimée de la base (droits insuffisants).");
            }

            await supabase.storage
                .from(kind.bucket)
                .remove([figure.dataset.storagePath]);

            // Si l'image principale disparaît, la première restante devient principale.
            if(wasMain) {
                const {data: rest} = await supabase
                    .from("content_media")
                    .select("id")
                    .eq("content_id", contentId)
                    .eq("media_type", "image")
                    .order("display_order")
                    .limit(1);

                if(rest?.length) {
                    await supabase
                        .from("content_media")
                        .update({is_main: true})
                        .eq("id", rest[0].id);
                }
            }
        }

        await loadContentImages(kind, contentId);
        await kind.refresh();

    } catch(error) {
        alert("Action impossible sur l'image : " + error.message);
    }
}

async function uploadContentImages(kind, contentId, files) {
    // Vérification de tous les fichiers avant tout envoi
    for(const file of files) {
        if(!PUB_IMAGE_TYPES.includes(file.type)) {
            throw new Error(`« ${file.name} » n'est pas une image JPG, PNG ou WebP.`);
        }
        if(file.size > PUB_IMAGE_MAX_BYTES) {
            throw new Error(`« ${file.name} » dépasse 5 Mo.`);
        }
    }

    const {data: existing, error: existingError} = await supabase
        .from("content_media")
        .select("is_main, display_order")
        .eq("content_id", contentId)
        .eq("media_type", "image");

    if(existingError) throw existingError;

    let hasMain = (existing || []).some(row => row.is_main === true);
    let order = (existing || []).reduce((max, row) => Math.max(max, Number(row.display_order) || 0), 0);

    for(const file of files) {
        const uniqueName = (
            crypto.randomUUID
                ? crypto.randomUUID()
                : Date.now() + "-" + Math.random().toString(16).slice(2)
        );

        const fileName = `image-${uniqueName}-${safeFileName(file.name)}`;
        const storagePath = `${kind.folder}/${contentId}/${fileName}`;

        const {error: uploadError} = await supabase.storage
            .from(kind.bucket)
            .upload(storagePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if(uploadError) throw uploadError;

        order += 1;
        const isMain = !hasMain;
        hasMain = true;

        const {error: insertError} = await supabase
            .from("content_media")
            .insert({
                content_id: contentId,
                storage_path: storagePath,
                media_type: "image",
                is_main: isMain,
                display_order: order,
                file_name: fileName
            });

        if(insertError) {
            await supabase.storage.from(kind.bucket).remove([storagePath]);
            throw insertError;
        }
    }
}

function openPubForm(id = null) {
const content = id ? getPubContent(id) : null;
const detail = id ? getPubDetail(id) : null;

if(id ? !pubPermissions.edit : !pubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

$("pubId").value = content?.id || "";
$("pubModalTitle").textContent = content ? "Modifier la publication" : "Nouvelle publication";
$("pubTitleFr").value = getPubTranslation(content?.id, "fr")?.title || "";
$("pubTitleEn").value = getPubTranslation(content?.id, "en")?.title || "";
$("pubSummaryFr").value = getPubTranslation(content?.id, "fr")?.summary || "";
$("pubSummaryEn").value = getPubTranslation(content?.id, "en")?.summary || "";
$("pubBodyFr").value = getPubTranslation(content?.id, "fr")?.body || "";
$("pubBodyEn").value = getPubTranslation(content?.id, "en")?.body || "";
$("pubPriority").value = content?.priority || "normal";
$("pubFeatured").checked = content?.is_featured === true;
$("pubDisplayFrom").value = toLocalInput(content?.display_from);
$("pubDisplayUntil").value = toLocalInput(content?.display_until);

// La catégorie détermine la référence : elle ne peut plus changer après création.
$("pubCategory").disabled = Boolean(content);
fillPubCategoryOptions(detail?.category_id);
fillPubSubcategoryOptions(detail?.category_id || $("pubCategory").value, detail?.subcategory_id);

resetImageInput(IMAGE_KINDS.publication);
loadContentImages(IMAGE_KINDS.publication, content?.id || null);

openModal("pubModal");

}

async function savePublication(event) {
event.preventDefault();

const id = $("pubId").value;

if(id ? !pubPermissions.edit : !pubPermissions.create) {
    return alert("Vous ne disposez pas du droit nécessaire.");
}

const titleFr = $("pubTitleFr").value.trim();
const categoryId = $("pubCategory").value;

if(!titleFr) return alert("Le titre français est obligatoire.");
if(!categoryId) return alert("Choisissez une catégorie.");

const displayFrom = fromLocalInput($("pubDisplayFrom").value);
const displayUntil = fromLocalInput($("pubDisplayUntil").value);

if(displayFrom && displayUntil && new Date(displayUntil) <= new Date(displayFrom)) {
    return alert("La fin de l'affichage doit être postérieure au début.");
}

const subcategoryId = $("pubSubcategory").value || null;
const button = $("savePubButton");
button.disabled = true;

const contentFields = {
    priority: $("pubPriority").value,
    is_featured: $("pubFeatured").checked,
    display_from: displayFrom,
    display_until: displayUntil,
    updated_by: currentProfile.user_id,
    editor_display_name: currentProfile.display_name || "Administrateur",
    updated_at: new Date().toISOString()
};

try {
    let contentId = id;

    if(id) {
        const {data, error} = await supabase
            .from("contents")
            .update(contentFields)
            .eq("id", id)
            .select("id");

        if(error) throw error;
        if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

        const {data: detailData, error: detailError} = await supabase
            .from("publications")
            .update({subcategory_id: subcategoryId})
            .eq("content_id", id)
            .select("content_id");

        if(detailError) throw detailError;
        if(!detailData?.length) throw new Error("Détails de la publication introuvables (droits insuffisants).");
    } else {
        const {data, error} = await supabase
            .from("contents")
            .insert({
                ...contentFields,
                content_type: "publication",
                status: "draft",
                created_by: currentProfile.user_id,
                author_display_name: currentProfile.display_name || "Administrateur"
            })
            .select("id")
            .single();

        if(error) throw error;
        contentId = data.id;

        try {
            const year = new Date().getFullYear();

            const {data: refData, error: refError} = await supabase
                .rpc("next_publication_reference", {
                    p_category_id: categoryId,
                    p_year: year
                });

            if(refError) throw refError;

            const reference = Array.isArray(refData) ? refData[0] : refData;

            const {error: detailError} = await supabase
                .from("publications")
                .insert({
                    content_id: contentId,
                    category_id: categoryId,
                    subcategory_id: subcategoryId,
                    reference: reference.reference,
                    reference_year: year,
                    reference_number: reference.reference_number
                });

            if(detailError) throw detailError;

        } catch(detailError) {
            // Évite un contenu orphelin sans détails de publication.
            await deleteChecked("contents", "id", contentId, "publications");
            throw detailError;
        }
    }

    await saveTranslation(
        contentId,
        "fr",
        titleFr,
        $("pubSummaryFr").value,
        $("pubBodyFr").value
    );

    await saveTranslation(
        contentId,
        "en",
        $("pubTitleEn").value,
        $("pubSummaryEn").value,
        $("pubBodyEn").value
    );

    const pubImageFiles = imageSelectedFiles(IMAGE_KINDS.publication);
    if(pubImageFiles.length) {
        await uploadContentImages(IMAGE_KINDS.publication, contentId, pubImageFiles);
    }

    closeModal("pubModal");
    await refreshPublications();

} catch(error) {
    alert("Impossible d'enregistrer la publication : " + error.message);

} finally {
    button.disabled = false;
}

}

/* -----------------------------------------
Publications : statut et suppression
----------------------------------------- */

async function setPublicationStatus(id, status) {
if(!pubPermissions.publish) return alert("Vous ne disposez pas du droit de publication.");

const content = getPubContent(id);
if(!content) return;

const now = new Date().toISOString();
const payload = {
    status,
    updated_by: currentProfile.user_id,
    updated_at: now
};

if(status === "published") {
    payload.published_at = content.published_at || now;
    payload.published_by = currentProfile.user_id;
    payload.archived_at = null;
}

if(status === "archived") {
    payload.archived_at = now;
}

if(status === "draft") {
    payload.archived_at = null;
}

try {
    const {data, error} = await supabase
        .from("contents")
        .update(payload)
        .eq("id", id)
        .select("id");

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    await refreshPublications();

} catch(error) {
    alert("Impossible de modifier le statut : " + error.message);
}

}

async function deletePublication(id) {
if(!pubPermissions.delete) return alert("Vous ne disposez pas du droit de suppression.");

const content = getPubContent(id);
if(!content) return;

if(!confirm(`Supprimer définitivement la publication « ${getPubTitle(id)} » ? Son historique et ses fichiers seront aussi supprimés.`)) return;

try {
    const {data: paths, error} = await supabase.rpc(
        "delete_publication_completely",
        {p_content_id: id}
    );

    if(error) throw error;

    const storagePaths = (paths || []).filter(Boolean);

    if(storagePaths.length) {
        const {error: storageError} = await supabase.storage
            .from("buep-publications")
            .remove(storagePaths);

        if(storageError) {
            console.error("Fichiers publication non supprimés :", storageError);
        }
    }

    await refreshPublications();

} catch(error) {
    alert("Impossible de supprimer la publication : " + error.message);
}

}

/* -----------------------------------------
Catégories et sous-catégories (administrateur principal
pour les catégories ; édition pour les sous-catégories)
----------------------------------------- */

function renderPubCategories() {
const tbody = $("pubCategoriesBody");
if(!tbody) return;

if(!pubCategoriesCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Aucune catégorie.</td></tr>`;
    return;
}

tbody.innerHTML = pubCategoriesCache.map(category => {
    const id = escapeHTML(category.id);
    const count = pubSubcategoriesCache.filter(item => item.category_id === category.id).length;

    return `
        <tr>
            <td><strong>${escapeHTML(category.name)}</strong></td>
            <td>${escapeHTML(category.reference_prefix)}</td>
            <td>${count} sous-catégorie(s)</td>
            <td>${category.is_active ? "Active" : "Inactive"}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${pubPermissions.principal ? `
                        <button class="btn btn-light" data-action="edit-pub-category" data-id="${id}">Modifier</button>` : ""}
                    ${pubPermissions.edit ? `
                        <button class="btn btn-light" data-action="new-pub-subcategory" data-id="${id}">＋ Sous-catégorie</button>` : ""}
                </div>
            </td>
        </tr>`;
}).join("");

}

function openPubCategoryForm(id = null) {
if(!pubPermissions.principal) return alert("Seul l'administrateur principal gère les catégories.");

const category = id ? getPubCategory(id) : null;

$("pubCategoryId").value = category?.id || "";
$("pubCategoryModalTitle").textContent = category ? "Modifier la catégorie" : "Nouvelle catégorie";
$("pubCategoryName").value = category?.name || "";
$("pubCategorySlug").value = category?.slug || "";
$("pubCategoryPrefix").value = category?.reference_prefix || "";
$("pubCategoryDescription").value = category?.description || "";
$("pubCategoryOrder").value = category?.display_order ?? 0;
$("pubCategoryActive").checked = category ? category.is_active === true : true;

openModal("pubCategoryModal");

}

async function savePubCategory(event) {
event.preventDefault();

if(!pubPermissions.principal) return alert("Seul l'administrateur principal gère les catégories.");

const id = $("pubCategoryId").value;
const name = $("pubCategoryName").value.trim();
const slug = slugify($("pubCategorySlug").value);
const prefix = $("pubCategoryPrefix").value.trim().toUpperCase();

if(!name || !slug || !prefix) {
    return alert("Le nom, l'identifiant et le préfixe de référence sont obligatoires.");
}

const payload = {
    name,
    slug,
    reference_prefix: prefix,
    description: nullIfEmpty($("pubCategoryDescription").value),
    display_order: Number($("pubCategoryOrder").value) || 0,
    is_active: $("pubCategoryActive").checked
};

try {
    const query = id
        ? supabase.from("publication_categories").update(payload).eq("id", id).select("id")
        : supabase.from("publication_categories").insert(payload).select("id");

    const {data, error} = await query;

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée.");

    closeModal("pubCategoryModal");
    await refreshPublications();

} catch(error) {
    alert("Impossible d'enregistrer la catégorie : " + error.message);
}

}

function openPubSubcategoryForm(categoryId, id = null) {
if(!pubPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const item = id ? pubSubcategoriesCache.find(row => row.id === id) : null;

$("pubSubcategoryId").value = item?.id || "";
$("pubSubcategoryCategoryId").value = item?.category_id || categoryId;
$("pubSubcategoryModalTitle").textContent = item ? "Modifier la sous-catégorie" : "Nouvelle sous-catégorie";
$("pubSubcategoryName").value = item?.name || "";
$("pubSubcategorySlug").value = item?.slug || "";
$("pubSubcategoryDescription").value = item?.description || "";
$("pubSubcategoryOrder").value = item?.display_order ?? 0;
$("pubSubcategoryActive").checked = item ? item.is_active === true : true;
$("pubSubcategoryPublic").checked = item ? item.is_public === true : true;

openModal("pubSubcategoryModal");

}

async function savePubSubcategory(event) {
event.preventDefault();

if(!pubPermissions.edit) return alert("Vous ne disposez pas du droit de modification.");

const id = $("pubSubcategoryId").value;
const name = $("pubSubcategoryName").value.trim();
const slug = slugify($("pubSubcategorySlug").value);

if(!name || !slug) return alert("Le nom et l'identifiant sont obligatoires.");

const payload = {
    category_id: $("pubSubcategoryCategoryId").value,
    name,
    slug,
    description: nullIfEmpty($("pubSubcategoryDescription").value),
    display_order: Number($("pubSubcategoryOrder").value) || 0,
    is_active: $("pubSubcategoryActive").checked,
    is_public: $("pubSubcategoryPublic").checked
};

try {
    const query = id
        ? supabase.from("publication_subcategories").update(payload).eq("id", id).select("id")
        : supabase.from("publication_subcategories").insert(payload).select("id");

    const {data, error} = await query;

    if(error) throw error;
    if(!data?.length) throw new Error("Aucune modification enregistrée (droits insuffisants).");

    closeModal("pubSubcategoryModal");
    await refreshPublications();

} catch(error) {
    alert("Impossible d'enregistrer la sous-catégorie : " + error.message);
}

}

/* -----------------------------------------
Modales créées à la demande
----------------------------------------- */

const PUBLICATION_MODALS_HTML = `
<div class="modal" id="pubModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="pubModalTitle">Nouvelle publication</h2>
            <button class="modal-close" type="button" data-pub-close="pubModal">×</button>
        </div>

        <form id="pubForm">
            <input type="hidden" id="pubId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="pubCategory">Catégorie *</label>
                    <select id="pubCategory" required></select>
                </div>

                <div class="form-group">
                    <label for="pubSubcategory">Sous-catégorie</label>
                    <select id="pubSubcategory"></select>
                </div>

                <div class="form-group">
                    <label for="pubTitleFr">Titre en français *</label>
                    <input id="pubTitleFr" maxlength="250" required>
                </div>

                <div class="form-group">
                    <label for="pubTitleEn">Titre en anglais</label>
                    <input id="pubTitleEn" maxlength="250">
                </div>

                <div class="form-group">
                    <label for="pubPriority">Priorité</label>
                    <select id="pubPriority">
                        <option value="normal">Normale</option>
                        <option value="important">Importante</option>
                        <option value="urgent">Urgente</option>
                    </select>
                </div>

                <div class="form-group">
                    <label><input id="pubFeatured" type="checkbox"> Mettre en avant</label>
                </div>

                <div class="form-group">
                    <label for="pubDisplayFrom">Affiché à partir du</label>
                    <input id="pubDisplayFrom" type="datetime-local">
                </div>

                <div class="form-group">
                    <label for="pubDisplayUntil">Affiché jusqu'au</label>
                    <input id="pubDisplayUntil" type="datetime-local">
                </div>
            </div>

            <div class="form-group">
                <label for="pubSummaryFr">Résumé en français</label>
                <textarea id="pubSummaryFr" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label for="pubSummaryEn">Résumé en anglais</label>
                <textarea id="pubSummaryEn" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label for="pubBodyFr">Contenu en français</label>
                <textarea id="pubBodyFr" rows="6"></textarea>
            </div>

            <div class="form-group">
                <label for="pubBodyEn">Contenu en anglais</label>
                <textarea id="pubBodyEn" rows="6"></textarea>
            </div>

            <div class="form-group">
                <label for="pubImage">Images de la publication (JPG, PNG ou WebP, 5 Mo maximum chacune)</label>
                <input id="pubImage" type="file" multiple accept="image/jpeg,image/png,image/webp">
                <p class="pub-thumbs-hint">Vous pouvez en choisir plusieurs. L'image principale sert de couverture dans les listes.</p>
                <div id="pubImagePreview" class="pub-thumbs" hidden></div>
                <div id="pubImagesCurrent" class="pub-thumbs"></div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-pub-close="pubModal">Annuler</button>
                <button type="submit" class="btn btn-primary" id="savePubButton">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="pubCategoryModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="pubCategoryModalTitle">Nouvelle catégorie</h2>
            <button class="modal-close" type="button" data-pub-close="pubCategoryModal">×</button>
        </div>

        <form id="pubCategoryForm">
            <input type="hidden" id="pubCategoryId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="pubCategoryName">Nom *</label>
                    <input id="pubCategoryName" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="pubCategorySlug">Identifiant *</label>
                    <input id="pubCategorySlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="pubCategoryPrefix">Préfixe de référence *</label>
                    <input id="pubCategoryPrefix" maxlength="20" required>
                </div>

                <div class="form-group">
                    <label for="pubCategoryOrder">Ordre d'affichage</label>
                    <input id="pubCategoryOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label><input id="pubCategoryActive" type="checkbox" checked> Catégorie active</label>
                </div>
            </div>

            <div class="form-group">
                <label for="pubCategoryDescription">Description</label>
                <textarea id="pubCategoryDescription" rows="2"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-pub-close="pubCategoryModal">Annuler</button>
                <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
        </form>
    </div>
</div>

<div class="modal" id="pubSubcategoryModal">
    <div class="modal-card">
        <div class="modal-header">
            <h2 id="pubSubcategoryModalTitle">Nouvelle sous-catégorie</h2>
            <button class="modal-close" type="button" data-pub-close="pubSubcategoryModal">×</button>
        </div>

        <form id="pubSubcategoryForm">
            <input type="hidden" id="pubSubcategoryId">
            <input type="hidden" id="pubSubcategoryCategoryId">

            <div class="form-grid">
                <div class="form-group">
                    <label for="pubSubcategoryName">Nom *</label>
                    <input id="pubSubcategoryName" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="pubSubcategorySlug">Identifiant *</label>
                    <input id="pubSubcategorySlug" maxlength="150" required>
                </div>

                <div class="form-group">
                    <label for="pubSubcategoryOrder">Ordre d'affichage</label>
                    <input id="pubSubcategoryOrder" type="number" min="0" value="0">
                </div>

                <div class="form-group">
                    <label><input id="pubSubcategoryActive" type="checkbox" checked> Active</label>
                </div>

                <div class="form-group">
                    <label><input id="pubSubcategoryPublic" type="checkbox" checked> Visible sur le site</label>
                </div>
            </div>

            <div class="form-group">
                <label for="pubSubcategoryDescription">Description</label>
                <textarea id="pubSubcategoryDescription" rows="2"></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-pub-close="pubSubcategoryModal">Annuler</button>
                <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
        </form>
    </div>
</div>`;

function ensurePublicationModals() {
if($("pubModal")) return;

document.body.insertAdjacentHTML("beforeend", PUBLICATION_MODALS_HTML);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-pub-close]");
    if(button) closeModal(button.dataset.pubClose);
});

$("pubForm").addEventListener("submit", savePublication);
$("pubImage")?.addEventListener("change", () => showImageLocalPreview(IMAGE_KINDS.publication));
$("pubImagesCurrent")?.addEventListener("click", event => handleContentImageAction(IMAGE_KINDS.publication, event));

// Images des activités et projets
$("activityImage")?.addEventListener("change", () => showImageLocalPreview(IMAGE_KINDS.activity));
$("activityImagesCurrent")?.addEventListener("click", event => handleContentImageAction(IMAGE_KINDS.activity, event));
$("pubCategoryForm").addEventListener("submit", savePubCategory);
$("pubSubcategoryForm").addEventListener("submit", savePubSubcategory);

$("pubCategory").addEventListener("change", () => {
    fillPubSubcategoryOptions($("pubCategory").value, "");
});

$("pubCategoryName").addEventListener("input", () => {
    if(!$("pubCategoryId").value) {
        $("pubCategorySlug").value = slugify($("pubCategoryName").value);
    }
});

$("pubSubcategoryName").addEventListener("input", () => {
    if(!$("pubSubcategoryId").value) {
        $("pubSubcategorySlug").value = slugify($("pubSubcategoryName").value);
    }
});

}

/* -----------------------------------------
Actions déléguées
----------------------------------------- */

function handlePublicationAction(event) {
const button = event.target.closest("button[data-action]");
if(!button) return;

const id = button.dataset.id;

const actions = {
    "edit-pub": () => openPubForm(id),
    "publish-pub": () => setPublicationStatus(id, "published"),
    "draft-pub": () => setPublicationStatus(id, "draft"),
    "archive-pub": () => setPublicationStatus(id, "archived"),
    "delete-pub": () => deletePublication(id),
    "edit-pub-category": () => openPubCategoryForm(id),
    "new-pub-subcategory": () => openPubSubcategoryForm(id)
};

const action = actions[button.dataset.action];
if(action) action();

}

/* -----------------------------------------
Rafraîchissement et rendu du module
----------------------------------------- */

async function refreshPublications() {
await loadPubResources();

const categoryFilter = $("pubCategoryFilter");
const current = categoryFilter.value || "all";
categoryFilter.innerHTML =
    '<option value="all">Toutes les catégories</option>' +
    pubCategoriesCache.map(category => `
        <option value="${escapeHTML(category.id)}">${escapeHTML(category.name)}</option>
    `).join("");
categoryFilter.value = current;

renderPublications();
renderPubCategories();

}

async function renderPublicationsModule() {
await loadPubPermissions();

moduleContent.innerHTML = `
<div class="page-heading">
    <div>
        <h1>Publications</h1>
        <p>Gestion des publications institutionnelles, de leurs catégories et de leur numérotation.</p>
    </div>

    <div class="module-label">MODULE PUBLICATIONS</div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Publications</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                La référence est attribuée à la création et ne change plus ensuite.
            </p>
        </div>

        ${pubPermissions.create ? `
            <button class="btn btn-primary" id="newPubButton">＋ Nouvelle publication</button>
        ` : ""}
    </div>

    <div class="toolbar">
        <input id="pubSearch" type="search" placeholder="Rechercher par titre ou référence...">

        <select id="pubCategoryFilter">
            <option value="all">Toutes les catégories</option>
        </select>

        <select id="pubStatusFilter">
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="published">Publiées</option>
            <option value="archived">Archivées</option>
        </select>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Titre</th>
                    <th>Référence</th>
                    <th>Catégorie</th>
                    <th>Sous-catégorie</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="pubTableBody">
                <tr><td colspan="6" class="empty-state">Chargement...</td></tr>
            </tbody>
        </table>
    </div>
</div>

<div class="panel">
    <div class="toolbar">
        <div>
            <h2>Catégories de publications</h2>
            <p style="font-size:12px;color:var(--muted);margin-top:5px">
                Le préfixe de référence est utilisé pour numéroter les publications de la catégorie.
            </p>
        </div>

        ${pubPermissions.principal ? `
            <button class="btn btn-primary" id="newPubCategoryButton">＋ Nouvelle catégorie</button>
        ` : ""}
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Préfixe</th>
                    <th>Sous-catégories</th>
                    <th>État</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="pubCategoriesBody">
                <tr><td colspan="5" class="empty-state">Chargement...</td></tr>
            </tbody>
        </table>
    </div>
</div>`;

ensurePublicationModals();

$("pubSearch").addEventListener("input", renderPublications);
$("pubCategoryFilter").addEventListener("change", renderPublications);
$("pubStatusFilter").addEventListener("change", renderPublications);

$("pubTableBody").addEventListener("click", handlePublicationAction);
$("pubCategoriesBody").addEventListener("click", handlePublicationAction);

if(pubPermissions.create) {
    $("newPubButton").addEventListener("click", () => openPubForm());
}

if(pubPermissions.principal) {
    $("newPubCategoryButton").addEventListener("click", () => openPubCategoryForm());
}

await refreshPublications();

}

/* =========================================
AUTRES MODULES
========================================= */

function renderPlaceholderModule() {
const description =
moduleDescriptions[currentModule.slug] ||
currentModule.description ||
"Espace de gestion du module.";

moduleContent.innerHTML = `  
<div class="page-heading">  
    <div>  
        <h1>${escapeHTML(currentModule.name)}</h1>  
        <p>${escapeHTML(description)}</p>  
    </div>  

    <div class="module-label">MODULE ADMINISTRATIF</div>  
</div>  

<div class="welcome-card">  
    <h2>Bienvenue dans votre espace de gestion</h2>  

    <p>  
        Cet espace est réservé aux administrateurs autorisés.  
        Les fonctionnalités de gestion seront intégrées progressivement.  
    </p>  

    <div style="margin-top:15px;color:var(--success);font-size:12px">  
        ● Accès autorisé  
    </div>  
</div>  

<div class="panel">  
    <h2>Espace de travail</h2>  

    <p style="font-size:13px;color:var(--muted);line-height:1.7">  
        La structure de ce module est opérationnelle.  
        Ses fonctionnalités seront développées progressivement.  
    </p>  
</div>`;

}

/* =========================================
FORMAT FRANÇAIS DES DATES ET HEURES
Les champs date/heure suivent la langue du champ :
on force le français (jj/mm/aaaa, 24 h), même si le
navigateur est en anglais (AM / PM).
========================================= */

const FRENCH_DATE_INPUTS = 'input[type="datetime-local"], input[type="date"], input[type="time"]';

function applyFrenchDateInputs(root) {
    if(!root) return;

    if(root.matches && root.matches(FRENCH_DATE_INPUTS)) {
        root.lang = "fr-FR";
    }

    if(root.querySelectorAll) {
        root.querySelectorAll(FRENCH_DATE_INPUTS).forEach(input => {
            input.lang = "fr-FR";
        });
    }
}

document.documentElement.lang = "fr";

document.addEventListener("DOMContentLoaded", () => {
    applyFrenchDateInputs(document.body);

    // Les fenêtres créées après le chargement reçoivent aussi le format français
    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if(node.nodeType === 1) applyFrenchDateInputs(node);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });
});

/* =========================================
TABLEAU DE BORD (vue d'accueil de la gestion)
========================================= */

const DASHBOARD_MODULE_DETAILS = {
    activities: { icon: "◈", description: "Administrer les activités et les projets du Bureau." },
    administration: { icon: "♙", description: "Gérer les administrateurs et leurs autorisations." },
    settings: { icon: "⚙", description: "Configurer les éléments du portail institutionnel." },
    documents: { icon: "▣", description: "Gérer les documents et leurs catégories." },
    gallery: { icon: "▧", description: "Organiser les albums et les photographies." },
    messages: { icon: "✉", description: "Consulter et traiter les messages reçus." },
    navigation: { icon: "☷", description: "Organiser les menus et les liens du portail." },
    organigram: { icon: "♙", description: "Gérer les postes, les membres, les photos et les affectations." },
    publications: { icon: "▤", description: "Gérer les actualités, les communiqués et les annonces." },
    statistics: { icon: "▥", description: "Consulter les statistiques du portail." },
    clubs: { icon: "◉", description: "Gérer les clubs et les activités associatives." }
};

function moduleHref(slug) {
    if(slug === "administration") return "administration.html";
    if(slug === "organigram") return "organigramme.html";
    return "gestion.html?module=" + encodeURIComponent(slug);
}

function renderDashboardView() {
    currentModule = null;
    renderNavigation();

    $("breadcrumbModule").textContent = "Tableau de bord";
    document.title = "Tableau de bord | BUEP-ENS/PN";

    const cards = availableModules.map(module => {
        const details = DASHBOARD_MODULE_DETAILS[module.slug] || {
            icon: "▣",
            description: module.description || "Gérer ce module du portail."
        };

        return `
            <a class="module-card" href="${escapeHTML(moduleHref(module.slug))}">
                <span class="module-icon" aria-hidden="true">${escapeHTML(details.icon)}</span>
                <h3>${escapeHTML(module.name)}</h3>
                <p>${escapeHTML(details.description)}</p>
            </a>
        `;
    }).join("");

    moduleContent.innerHTML = `
        <div class="welcome-card">
            <h2>Bienvenue dans votre espace</h2>
            <p>
                Gérez les contenus du portail institutionnel du BUEP-ENS/PN.
                Choisissez un module ci-dessous, ou utilisez l'accès rapide
                au site dans la barre latérale pour voir vos modifications.
            </p>
        </div>

        <h2 class="section-title">Modules de gestion</h2>

        ${cards
            ? `<div class="module-grid">${cards}</div>`
            : `<div class="empty-state">Aucun module ne vous est actuellement accessible.</div>`
        }
    `;
}

/* =========================================
INITIALISATION
========================================= */

async function initialize() {
try {
if(!supabase) {
throw new Error(
"Le client Supabase n'a pas été initialisé. Vérifiez les chemins et les fichiers de configuration."
);
}

const session = await getSession();  
    if(!session) return;  

    await loadProfile(session.user.id);  
    await loadModules();  

    if(!moduleParam) {
    renderDashboardView();
    loadingScreen.style.display = "none";
    application.style.display = "block";
    return;
}

currentModule = availableModules.find(  
        module => module.slug === moduleParam  
    );  

    if(!currentModule) {  
        if(excludedModules.includes(moduleParam)) {  
            throw new Error(  
                "Ce module possède une page de gestion distincte."  
            );  
        }  

        throw new Error(  
            "Vous ne disposez pas des autorisations nécessaires pour accéder à ce module."  
        );  
    }  

    renderNavigation();  

    $("breadcrumbModule").textContent = currentModule.name;  

    document.title =  
        currentModule.name + " | BUEP-ENS/PN";  

    if(currentModule.slug === "activities") {  
        await renderActivitiesModule();  

    } else if(currentModule.slug === "documents") {  
        await renderDocumentsModule();  

    } else if(currentModule.slug === "messages") {  

        await renderMessagesModule();  

      

    } else if(currentModule.slug === "gallery") {
        await renderGalleryModule();

    } else if(currentModule.slug === "clubs") {
        await renderClubsModule();

    } else if(currentModule.slug === "statistics") {
        await renderStatisticsModule();

    } else if(currentModule.slug === "navigation") {
        await renderNavigationModule();

    } else if(currentModule.slug === "publications") {
        await renderPublicationsModule();

    } else if(currentModule.slug === "settings") {  
        await renderSettingsModule();  

    } else {  
        renderPlaceholderModule();  
    }  

    loadingScreen.style.display = "none";  
    application.style.display = "block";  

} catch(error) {  
    console.error("Erreur gestion.html :", error);  

    showError(  
        error.message ||  
        "Une erreur est survenue pendant le chargement."  
    );  
}

}

/* =========================================
EVENEMENTS GENERAUX
========================================= */

requireElement("activityForm").addEventListener(
"submit",
saveActivity
);

requireElement("documentForm").addEventListener(
"submit",
saveDocument
);

requireElement("documentCategoryForm").addEventListener(
"submit",
saveDocumentCategory
);

requireElement("categoryNameFr").addEventListener("input", () => {
if(!$("documentCategoryId").value) {
$("categorySlug").value = slugify(
$("categoryNameFr").value
);
}
});

requireElement("menuToggle").addEventListener("click", () => {
$("sidebar").classList.toggle("open");
$("mobileOverlay").classList.toggle("show");
});

requireElement("mobileOverlay").addEventListener("click", () => {
$("sidebar").classList.remove("open");
$("mobileOverlay").classList.remove("show");
});

requireElement("logoutButton").addEventListener("click", async () => {
const button = $("logoutButton");

button.disabled = true;  
button.textContent = "Déconnexion...";  

const {error} = await supabase.auth.signOut();  

if(error) {  
    console.error(error);  

    button.disabled = false;  
    button.textContent = "Déconnexion";  

    alert("Impossible de terminer la déconnexion.");  
    return;  
}  

location.replace("connexion.html");

});

/* =========================================
DEMARRAGE
========================================= */

initialize();

})();