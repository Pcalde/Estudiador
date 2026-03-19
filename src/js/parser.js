// ════════════════════════════════════════════════════════════════
// PARSER.JS — Análisis léxico y saneamiento de texto
// Reglas de Arquitectura: Cero manipulación del DOM de la UI.
// Excepción: Uso de document.createElement en memoria para saneamiento.
// ════════════════════════════════════════════════════════════════

const Parser = (() => {
    const LATEX_MACROS = {
        "sii": "\\Longleftrightarrow", "si": "\\Longrightarrow", "iff": "\\Longleftrightarrow", "implies": "\\Longrightarrow",
        "anillo": "\\mathbb{A}", "cuerpo": "\\mathbb{K}", "grupo": "\\mathbb{G}", "ideal": "\\mathcal{I}",
        "primo": "\\mathfrak{p}", "maximal": "\\mathfrak{m}", "algebra": "\\mathcal{A}lg(A)",
        "naturales": "\\mathbb{N}", "enteros": "\\mathbb{Z}", "racionales": "\\mathbb{Q}", "reales": "\\mathbb{R}",
        "complejos": "\\mathbb{C}", "rn": "\\mathbb{R}^n", "rem": "\\mathbb{R}^m",
        "Acirc": "\\overset{\\circ}{A}", "bola": "\\mathcal{B}(x,\\delta)", "sucesion": "\\lbrace a_n \\rbrace_{\\mathbb{N}}",
        "suma": "\\sum a_n", "sucfun": "\\lbrace f_n \\rbrace", "serfun": "\\sum\\limits_{n\\geq 1} f_n(x)",
        "matriz": "\\mathcal{M}_{m\\times n}(\\mathbb{R})", "pmatriz": "\\begin{pmatrix}#1\\end{pmatrix}"
    };

    const CMD_MAP_JS = {
        'defi': 'Definición', 'teorema': 'Teorema', 'prop': 'Proposición',
        'lema': 'Lema', 'corolario': 'Corolario', 'ejemplo': 'Ejemplo', 'obs': 'Observación'
    };

    function sanearLatex(input) {
        if (!input) return "";
        let text = input;
        Object.keys(LATEX_MACROS).forEach(macro => {
            const regex = new RegExp(`\\\\${macro}\\b`, 'g');
            text = text.replace(regex, LATEX_MACROS[macro]);
        });
        text = text.replace(/\\mathbb{([A-Z])}/g, (m, c) => `\\mathbb{${c}}`);
        text = text.replace(/\\mathcal{([A-Z])}/g, (m, c) => `\\mathcal{${c}}`);
        return text;
    }

    function extractBraceBlock(text, startIdx) {
        let cursor = startIdx;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
        if (text[cursor] !== '{') return null;
        let depth = 1;
        cursor++;
        let startContent = cursor;
        while (cursor < text.length && depth > 0) {
            if (text[cursor] === '{' && text[cursor - 1] !== '\\') depth++;
            else if (text[cursor] === '}' && text[cursor - 1] !== '\\') depth--;
            cursor++;
        }
        if (depth > 0) return null;
        return { content: text.substring(startContent, cursor - 1), endIndex: cursor };
    }

    function sanitizeHtmlFragment(htmlStr) {
        const div = document.createElement('div');
        div.innerHTML = htmlStr;
        const allowedTags = ['B','I','U','STRONG','EM','P','BR','UL','LI','OL','SPAN','DIV','TABLE','TR','TD','TH','TBODY','THEAD'];
        function cleanNode(node) {
            if (node.nodeType === 3) return;
            if (node.nodeType !== 1) { node.remove(); return; }
            if (!allowedTags.includes(node.tagName)) {
                while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
                node.remove();
                return;
            }
            const allowedAttrs = ['class', 'style', 'id'];
            Array.from(node.attributes).forEach(attr => {
                if (!allowedAttrs.includes(attr.name)) node.removeAttribute(attr.name);
            });
            Array.from(node.childNodes).forEach(cleanNode);
        }
        Array.from(div.childNodes).forEach(cleanNode);
        return div.innerHTML;
    }

    function sanitizeLatexRawInput(raw) {
        if (!raw) return "";
        let safe = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return sanearLatex(safe);
    }

    function cleanLatexToHtml(latexStr) {
        let text = latexStr;
        text = text.replace(/\\textbf{([^}]+)}/g, '<strong>$1</strong>');
        text = text.replace(/\\textit{([^}]+)}/g, '<em>$1</em>');
        text = text.replace(/\\underline{([^}]+)}/g, '<u>$1</u>');
        text = text.replace(/\n\n/g, '<br><br>');
        return sanitizeHtmlFragment(text).trim();
    }

    function parseLatexToCards(rawText, temaDefault = 1) {
        const rawInput = sanitizeLatexRawInput(rawText);
        if (!rawInput.trim()) return [];

        const newCards = [];
        let lastCardRef = null;
        let cursor = 0;
        const len = rawInput.length;
        const demoKeywords = ['demop', 'demot', 'democ', 'demol', 'proof', 'demostracion'];

        while (cursor < len) {
            if (/\s/.test(rawInput[cursor])) { cursor++; continue; }

            if (rawInput[cursor] === '\\') {
                let cmdEnd = cursor + 1;
                while (cmdEnd < len && /[a-zA-Z]/.test(rawInput[cmdEnd])) cmdEnd++;
                const command = rawInput.substring(cursor + 1, cmdEnd);

                if (CMD_MAP_JS[command]) {
                    cursor = cmdEnd;
                    let titulo = "";
                    while (cursor < len && /\s/.test(rawInput[cursor])) cursor++;
                    if (rawInput[cursor] === '[') {
                        const endBracket = rawInput.indexOf(']', cursor);
                        if (endBracket !== -1) {
                            titulo = rawInput.substring(cursor + 1, endBracket);
                            cursor = endBracket + 1;
                        }
                    }

                    const block = extractBraceBlock(rawInput, cursor);
                    if (!block) { cursor++; continue; }

                    let contenidoLimpio;
                    try { contenidoLimpio = cleanLatexToHtml(block.content); }
                    catch (e) { contenidoLimpio = block.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

                    const tipo = CMD_MAP_JS[command];
                    let needsAI = false;

                    // --- LÓGICA DE TITULACIÓN SELECTIVA (Arquitectura Limpia) ---
                    if (!titulo) {
                        if (command === 'defi') {
                            const boldMatch = contenidoLimpio.match(/<strong[^>]*>(.*?)<\/strong>/i);
                            if (boldMatch && boldMatch[1] && boldMatch[1].trim().length > 0) {
                                let extracted = boldMatch[1].replace(/<[^>]+>/g, '').trim();
                                titulo = extracted.charAt(0).toUpperCase() + extracted.slice(1);
                            } else {
                                titulo = `${tipo} (Auto)`;
                                needsAI = true;
                            }
                        } else {
                            titulo = `${tipo} (Auto)`;
                            needsAI = true;
                        }
                    } else {
                        titulo = cleanLatexToHtml(titulo);
                    }

                    const newCard = {
                        Titulo: titulo, Contenido: contenidoLimpio, Tema: temaDefault, Dificultad: 2,
                        Apartado: tipo, EtapaRepaso: 0, UltimoRepaso: null, ProximoRepaso: null
                    };

                    if (needsAI) {
                        newCard._needsAutoTitle = true;
                    }

                    newCards.push(newCard);
                    lastCardRef = newCard;
                    cursor = block.endIndex;
                    continue;
                }

                if (command === 'begin') {
                    const envBlock = extractBraceBlock(rawInput, cmdEnd);
                    if (envBlock) {
                        const envName = envBlock.content.toLowerCase().trim();
                        if (demoKeywords.includes(envName)) {
                            const endMarker = `\\end{${envBlock.content}}`;
                            const endIdx = rawInput.indexOf(endMarker, envBlock.endIndex);

                            if (endIdx !== -1) {
                                const rawDemo = rawInput.substring(envBlock.endIndex, endIdx);
                                const demoLimpia = cleanLatexToHtml(rawDemo);

                                let tituloDemo = "Demostración";
                                if (lastCardRef && lastCardRef.Titulo) tituloDemo = `Demostración: ${lastCardRef.Titulo.replace(/<[^>]*>?/gm, '')}`;

                                let apartadoDemo = "Demostración";
                                if (lastCardRef) {
                                    const m = { 'Teorema': 'Demot', 'Proposición': 'Demop', 'Lema': 'Demol', 'Corolario': 'Democ' };
                                    apartadoDemo = m[lastCardRef.Apartado] || apartadoDemo;
                                }
                                const envMap = { 'demot': 'Demot', 'demop': 'Demop', 'demol': 'Demol', 'democ': 'Democ' };
                                apartadoDemo = envMap[envName] || apartadoDemo;

                                newCards.push({
                                    Titulo: tituloDemo, Contenido: demoLimpia, Tema: temaDefault, Dificultad: 3,
                                    Apartado: apartadoDemo, EtapaRepaso: 0, UltimoRepaso: null, ProximoRepaso: null
                                });
                                cursor = endIdx + endMarker.length;
                                continue;
                            }
                        }
                    }
                }
            }
            cursor++;
        }
        return newCards;
    }

    return { sanearLatex, sanitizeHtmlFragment, parseLatexToCards };
})();