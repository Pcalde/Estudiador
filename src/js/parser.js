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
        "matriz": "\\mathcal{M}_{m\\times n}(\\mathbb{R})", "hess": "\\operatorname{Hess}", "jac": "\\operatorname{Jac}",
        "cinf": "\\mathcal{C}^{\\infty}", "tusual": "(\\mathbb{R}, \\tau_{us})", "tdisc": "(X, \\tau_{dis})",
        "t": "\\tau", "cl": "\\operatorname{cl}", "categ": "\\mathcal{C}", "cmorfismos": "\\operatorname{Hom}_{\\mathcal{C}}",
        "morfismos": "\\operatorname{Hom}", "Set": "\\mathbf{Set}", "Grp": "\\mathbf{Grp}", "Ab": "\\mathbf{Ab}",
        "CRing": "\\mathbf{CRing}", "ModR": "R-\\mathbf{Mod}", "VectK": "\\mathbf{Vect}_K", "Top": "\\mathbf{Top}",
        "Cat": "\\mathbf{Cat}", "isom": "\\xrightarrow{\\sim}", "phi": "\\varphi", "epsilon": "\\varepsilon",
        "xeq": "\\overline{x}", "mathbf": "\\mathbf", "realesext": "\\overline{\\mathbb{R}}"
    };

    const CMD_MAP_JS = {
        'defi': 'Definición', 'prop': 'Proposición', 'teorema': 'Teorema',
        'lema': 'Lema', 'coro': 'Corolario', 'ejemplo': 'Ejemplo', 'obs': 'Observación'
    };

    function sanitizeHtmlFragment(htmlContent) {
        const template = document.createElement('template');
        template.innerHTML = String(htmlContent || '');
        const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'LINK', 'META']);
        template.content.querySelectorAll('*').forEach(el => {
            if (blockedTags.has(el.tagName)) { el.remove(); return; }
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value || '';
                if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(value))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return template.innerHTML;
    }

    function sanitizeLatexRawInput(rawInput) {
        if (!rawInput) return '';
        return String(rawInput).replace(/\u0000/g, '').replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '').slice(0, 400000);
    }

    function extractBraceBlock(text, startIdx) {
        if (!text || startIdx >= text.length) return null;
        let i = startIdx;
        while (i < text.length && text[i] !== '{') i++;
        if (i >= text.length) return null;
        let balance = 0;
        for (let j = i; j < text.length; j++) {
            if (text[j] === '{') balance++;
            else if (text[j] === '}') balance--;
            if (balance === 0) return { content: text.substring(i + 1, j), endIndex: j + 1 };
        }
        return null;
    }

    function cleanLatexToHtml(text) {
        if (!text) return "";
        const mathZones = [];
        let ph = text;

        function saveMath(raw) {
            const i = mathZones.length;
            mathZones.push(raw);
            return '\x00M' + i + '\x00';
        }

        function parseLista(content, tag) {
            const parts = content.split(/\\item(?:\[([^\]]*)\])?/);
            if (parts.length <= 1) return '<' + tag + ' class="latex-list"></' + tag + '>';
            let html = '<' + tag + ' class="latex-list">';
            for (let k = 1; k < parts.length; k += 2) {
                const lbl  = parts[k];
                const body = (parts[k + 1] || '').trim();
                if (lbl !== undefined && lbl !== '') html += '<li style="list-style-type:none"><strong>' + lbl + '</strong>&nbsp;' + body + '</li>';
                else html += '<li>' + body + '</li>';
            }
            return html + '</' + tag + '>';
        }

        const MATH_BLOCK_ENVS = /\\begin\{(align\*?|gather\*?|equation\*?|multline\*?|flalign\*?|alignat\*?|split|eqnarray\*?|CD)\}([\s\S]*?)\\end\{\1\}/g;
        ph = ph.replace(MATH_BLOCK_ENVS, (_, envName, inner) => saveMath('\\[\\begin{' + envName + '}' + inner + '\\end{' + envName + '}\\]'));
        ph = ph.replace(/\\\[([\s\S]*?)\\\]/g,  m => saveMath(m));
        ph = ph.replace(/\$\$([\s\S]*?)\$\$/g,  m => saveMath(m));
        ph = ph.replace(/\\\(([\s\S]*?)\\\)/g,  m => saveMath(m));
        ph = ph.replace(/\$([^$]{1,1500}?)\$/g, m => saveMath(m));

        ph = ph.replace(/\\begin\{tikzcd\}[\s\S]*?\\end\{tikzcd\}/g, '<div class="tikz-placeholder">[ Diagrama Conmutativo TikZ ]</div>');
        ph = ph.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '<div class="tikz-placeholder">[ Figura TikZ ]</div>');
        ph = ph.replace(/\\begin\{figure\}[\s\S]*?\\end\{figure\}/g, '');
        ph = ph.replace(/\\begin\{scope\}[\s\S]*?\\end\{scope\}/g, '');

        for (let p = 0; p < 3; p++) ph = ph.replace(/\\begin\{minipage\}(?:\{[^}]*\})?([\s\S]*?)\\end\{minipage\}/g, '$1');
        ph = ph.replace(/\\begin\{(?:center|flushleft|flushright)\}([\s\S]*?)\\end\{(?:center|flushleft|flushright)\}/g, '$1');
        ph = ph.replace(/\\begin\{absurdum\}([\s\S]*?)\\end\{absurdum\}/g, '<span style="border-left:3px solid #c00;padding-left:6px">$1</span>');
        ph = ph.replace(/\\begin\{small\}([\s\S]*?)\\end\{small\}/g, '<small>$1</small>');

        ph = ph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        for (let pass = 0; pass < 6; pass++) {
            ph = ph.replace(/\\begin\{itemize\}((?:(?!\\begin\{itemize\}|\\begin\{enumerate\})[\s\S])*?)\\end\{itemize\}/g, (_, c) => parseLista(c, 'ul'));
            ph = ph.replace(/\\begin\{enumerate\}((?:(?!\\begin\{enumerate\}|\\begin\{itemize\})[\s\S])*?)\\end\{enumerate\}/g, (_, c) => parseLista(c, 'ol'));
        }

        for (let p = 0; p < 5; p++) {
            ph = ph.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>');
            ph = ph.replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>');
            ph = ph.replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>');
            ph = ph.replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>');
            ph = ph.replace(/\\textcolor\{[^{}]*\}\{([^{}]*)\}/g, '$1');
            ph = ph.replace(/\\colorbox\{[^{}]*\}\{([^{}]*)\}/g,  '$1');
        }

        ph = ph.replace(/``([\s\S]*?)''/g, '«$1»').replace(/\\\\/g, '<br>').replace(/\n\s*\n/g, '<br><br>').replace(/~/g, '&nbsp;');
        ph = ph.replace(/\\(?:fecha|label|ref|caption\*?|footnote)\{[^}]*\}/g, '');
        ph = ph.replace(/\\hyperref\[[^\]]*\]\{([^}]*)\}/g, '$1');
        ph = ph.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '<em>[imagen]</em>');
        ph = ph.replace(/\\(?:noindent|newpage|clearpage|hfill|restoregeometry)\b/g, '');
        ph = ph.replace(/\\(?:pagecolor|newgeometry|colorlet)\{[^}]*\}/g, '');
        ph = ph.replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, ' ');
        ph = ph.replace(/\\(?:par|quad|qquad|thinspace|enspace)\b/g, ' ');
        ph = ph.replace(/\\(?:demo|fintema|finejercicio)\b/g, '');
        ph = ph.replace(/\\(?:small|normalsize|large|Large|LARGE|huge|Huge|tiny|scriptsize|footnotesize)\b/g, '');
        ph = ph.replace(/\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/g, '<strong>$1</strong>');
        ph = ph.replace(/\\begin\{[^}]*\}/g, '').replace(/\\end\{[^}]*\}/g, '');

        for (let p = 0; p < 5; p++) ph = ph.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');

        let hasMath = true, passCount = 0;
        while (hasMath && passCount < 10) {
            hasMath = false;
            ph = ph.replace(/\x00M(\d+)\x00/g, (_, idx) => {
                hasMath = true;
                return mathZones[parseInt(idx)].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            });
            passCount++;
        }
        return sanitizeHtmlFragment(ph.trim());
    }

    function sanearLatex(htmlContent) {
        if (!htmlContent) return "";
        const mathEnvs = ['align', 'align\\*', 'equation', 'equation\\*', 'gather', 'gather\\*', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix'];
        let saneado = sanitizeHtmlFragment(htmlContent);

        mathEnvs.forEach(env => {
            const regex = new RegExp(`(\\\\begin\\{${env}\\})([\\s\\S]*?)(\\\\end\\{${env}\\})`, 'g');
            saneado = saneado.replace(regex, (match, start, content, end) => {
                let fixedContent = content.replace(/<br\s*\/?>/gi, ' \\\\ ').replace(/&nbsp;/g, ' ');
                return `${start}${fixedContent}${end}`;
            });
        });
        saneado = saneado.replace(/(\\substack\s*\{)([^\}]+)(\})/g, (match, start, content, end) => {
            return `${start}${content.replace(/<br\s*\/?>/gi, ' \\\\ ')}${end}`;
        });
        return saneado;
    }

    /**
     * Motor puro: Transforma crudo LaTeX a un array de tarjetas.
     */
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
                    titulo = !titulo ? `${tipo} (Auto)` : cleanLatexToHtml(titulo);

                    const newCard = {
                        Titulo: titulo, Contenido: contenidoLimpio, Tema: temaDefault, Dificultad: 2,
                        Apartado: tipo, EtapaRepaso: 0, UltimoRepaso: null, ProximoRepaso: null
                    };
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
