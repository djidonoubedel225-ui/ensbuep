/* =========================================
   BUEP-ENS/PN — CHIFFRES EN TIMES NEW ROMAN
   Chaque suite de chiffres du texte est enveloppée dans une balise
   <span class="digits">. La police est donnée par le style (police système),
   les lettres restent dans leur police. Fonctionne aussi sur les contenus
   chargés après coup (base de données).
   ========================================= */

(() => {
    const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);
    const DIGITS = /\d+/g;

    function wrapNode(node) {
        const text = node.nodeValue;
        if (!DIGITS.test(text)) {
            DIGITS.lastIndex = 0;
            return;
        }
        DIGITS.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let last = 0;
        let match;

        while ((match = DIGITS.exec(text)) !== null) {
            if (match.index > last) {
                frag.appendChild(document.createTextNode(text.slice(last, match.index)));
            }
            const span = document.createElement("span");
            span.className = "digits";
            span.textContent = match[0];
            frag.appendChild(span);
            last = match.index + match[0].length;
        }
        DIGITS.lastIndex = 0;

        if (last < text.length) {
            frag.appendChild(document.createTextNode(text.slice(last)));
        }
        node.parentNode.replaceChild(frag, node);
    }

    function wrapIn(root) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentNode;
                if (!parent || SKIP.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
                if (parent.classList && parent.classList.contains("digits")) return NodeFilter.FILTER_REJECT;
                return /\d/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(wrapNode);
    }

    function onMutations(mutations) {
        const roots = new Set();
        mutations.forEach(m => {
            if (m.type === "childList") {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
                    else if (node.nodeType === Node.TEXT_NODE && node.parentNode) roots.add(node.parentNode);
                });
            } else if (m.type === "characterData" && m.target.parentNode) {
                roots.add(m.target.parentNode);
            }
        });
        roots.forEach(root => {
            if (root.isConnected) wrapIn(root);
        });
    }

    function start() {
        wrapIn(document.body);
        new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
