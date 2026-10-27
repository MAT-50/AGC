/**
 * Gerenciador da Tabela de Parentes
 * FMRP-USP - Ambulatório de Aconselhamento Genético do Câncer (AGC)
 * 
 * Regras estritas:
 * - codA: Campo aberto com validação em tempo real (^Z?[A-O][1-9]\d*$)
 * - codB e codC: Campos abertos permitindo exclusivamente números inteiros (>= 0)
 * - Proibição e detecção de códigos idênticos (A.B.C) em 2 linhas
 * - Novo parente adicionado com campos vazios (exceto Estado Vital = "Vivo")
 * - Compactação sequencial ao remover (ex: ao remover A2, A3 vira A2, A4 vira A3...)
 * - Auto-correção de buracos de sequência na digitação (ex: A5 vira A3 se não houver A3 nem A4)
 * - Sexo antes de Parentesco com reatividade mútua de gênero (Irmã + M = Irmão)
 */

/**
 * Utilitário de escape de HTML
 */
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Normalizador de strings para buscas case-insensitive e acento-insensíveis em Português
 */
function normalizarTextoParentesco(texto) {
    return (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/**
 * Controlador de Combobox com Busca e Autocompletar para o Campo Parentesco
 * Permite digitar livremente, abre dropdown e filtra por correspondência (ex: "MA" -> Mãe, Irmã, parentes maternos),
 * seleciona automaticamente quando houver match exato do termo digitado.
 */
const ParentescoCombobox = {
    menuEl: null,
    activeInput: null,
    activeWrapper: null,
    activeRowIndex: null,
    highlightedIndex: -1,
    filteredItems: [],
    onSelectCallback: null,

    init: function() {
        if (this.menuEl) return;

        this.menuEl = document.createElement("div");
        this.menuEl.id = "parentesco-floating-menu";
        this.menuEl.className = "parentesco-floating-menu";

        // Estilos estruturais inline garantem funcionamento mesmo em caso de cache de CSS do navegador
        Object.assign(this.menuEl.style, {
            position: "fixed",
            zIndex: "99999",
            display: "none",
            maxHeight: "240px",
            overflowY: "auto",
            padding: "4px 0",
            borderRadius: "8px",
            boxShadow: "0 12px 28px -4px rgba(0, 0, 0, 0.25), 0 8px 12px -6px rgba(0, 0, 0, 0.2)",
            background: "var(--bg-card-solid, #ffffff)",
            border: "1px solid var(--border-color, #cbd5e1)",
            color: "var(--text-main, #0f172a)"
        });

        document.body.appendChild(this.menuEl);

        // Fecha ao clicar fora
        document.addEventListener("mousedown", (e) => {
            if (!this.menuEl || this.menuEl.style.display === "none") return;
            if (this.menuEl.contains(e.target)) return;
            if (this.activeWrapper && this.activeWrapper.contains(e.target)) return;
            this.fechar();
        });

        // Reposiciona ao rolar a janela ou a tabela
        window.addEventListener("scroll", () => this.reposicionar(), { passive: true });
        window.addEventListener("resize", () => this.reposicionar(), { passive: true });
        const tableWrapper = document.querySelector(".table-wrapper");
        if (tableWrapper) {
            tableWrapper.addEventListener("scroll", () => this.reposicionar(), { passive: true });
        }
    },

    destacarTermo: function(label, query) {
        if (!query || !query.trim()) return escapeHTML(label);
        const normLabel = normalizarTextoParentesco(label);
        const normQuery = normalizarTextoParentesco(query);
        const idx = normLabel.indexOf(normQuery);
        if (idx === -1) return escapeHTML(label);

        let res = "";
        let cursor = 0;
        let searchFrom = 0;
        while ((searchFrom = normLabel.indexOf(normQuery, cursor)) !== -1) {
            res += escapeHTML(label.slice(cursor, searchFrom));
            res += `<mark class="combobox-highlight" style="background:rgba(14, 165, 233, 0.25); color:var(--accent, #0ea5e9); font-weight:700; border-radius:2px; padding:0 2px;">${escapeHTML(label.slice(searchFrom, searchFrom + normQuery.length))}</mark>`;
            cursor = searchFrom + normQuery.length;
        }
        res += escapeHTML(label.slice(cursor));
        return res;
    },

    abrir: function(wrapper, input, rowIndex, onSelect, filtroInicial = null) {
        this.init();

        // Fecha outros menus flutuantes ativos (inclusive SearchableSelect)
        if (window.SearchableSelect && typeof window.SearchableSelect.fechar === "function") {
            window.SearchableSelect.fechar();
        }

        if (this.activeWrapper && this.activeWrapper !== wrapper) {
            this.activeWrapper.classList.remove("is-open");
        }
        this.activeWrapper = wrapper;
        this.activeInput = input;
        this.activeRowIndex = rowIndex;
        this.onSelectCallback = onSelect;
        this.highlightedIndex = -1;

        if (wrapper) wrapper.classList.add("is-open");

        this.filtrar(filtroInicial !== null ? filtroInicial : input.value);
        this.menuEl.classList.add("is-active");
        this.menuEl.style.display = "block";
        this.reposicionar();
    },

    obterItemPorTexto: function(texto, rowIndex) {
        if (!texto || !texto.trim()) return null;
        const norm = normalizarTextoParentesco(texto);
        const parente = (rowIndex !== null && TabelaParentes.parentes[rowIndex]) ? TabelaParentes.parentes[rowIndex] : null;
        const codA = parente ? (parente.codA || "").toUpperCase().trim() : "";
        const isZRow = codA.startsWith("Z");

        // 1. Se a linha for cônjuge (Z) ou a busca contém termos de cônjuge, prioriza opções contextuais de cônjuges
        const isSpouseQuery = ["conj", "espos", "marid", "mulher", "madrast", "padrast"].some(t => norm.includes(t));
        if (isZRow || isSpouseQuery) {
            const opcoesConjuges = TabelaParentes.obterOpcoesConjuges(rowIndex);
            const matchConjuge = opcoesConjuges.find(item => normalizarTextoParentesco(item.label) === norm);
            if (matchConjuge) return matchConjuge;
        }

        // 2. Busca no dicionário de parentescos consanguíneos
        const matchDict = DICIONARIO_PARENTESCOS.find(item => normalizarTextoParentesco(item.label) === norm);
        if (matchDict) return matchDict;

        // 3. Fallback para opções de cônjuges caso não tenha encontrado no dicionário consanguíneo
        const opcoesFallback = TabelaParentes.obterOpcoesConjuges(rowIndex);
        return opcoesFallback.find(item => normalizarTextoParentesco(item.label) === norm) || null;
    },

    fechar: function() {
        if (this.activeInput && this.activeInput._selectTimeoutId) {
            clearTimeout(this.activeInput._selectTimeoutId);
            this.activeInput._selectTimeoutId = null;
        }

        if (this.menuEl) {
            this.menuEl.classList.remove("is-active");
            this.menuEl.style.display = "none";
        }
        if (this.activeWrapper) this.activeWrapper.classList.remove("is-open");

        if (this.activeInput && this.activeRowIndex !== null) {
            const parente = TabelaParentes.parentes[this.activeRowIndex];
            if (parente) {
                const valDigitado = this.activeInput.value.trim();
                if (valDigitado === "") {
                    this.activeInput.value = "";
                    if (parente.parentesco !== "") {
                        parente.parentesco = "";
                        TabelaParentes.sincronizarHeredograma();
                    }
                } else {
                    const matchVal = this.obterItemPorTexto(valDigitado, this.activeRowIndex);
                    if (matchVal) {
                        this.activeInput.value = matchVal.label;
                        if (parente.parentesco !== matchVal.label && this.onSelectCallback) {
                            this.onSelectCallback(this.activeRowIndex, matchVal.label, true, matchVal);
                        }
                    } else {
                        this.activeInput.value = parente.parentesco || "";
                    }
                }
            }
        }

        this.activeWrapper = null;
        this.activeInput = null;
        this.activeRowIndex = null;
        this.highlightedIndex = -1;
    },

    reposicionar: function() {
        if (!this.menuEl || this.menuEl.style.display === "none" || !this.activeInput) return;

        const rect = this.activeInput.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
            this.fechar();
            return;
        }

        const menuHeight = Math.min(this.menuEl.scrollHeight || 220, 240);
        const espacoAbaixo = window.innerHeight - rect.bottom;
        const abrirParaCima = espacoAbaixo < menuHeight && rect.top > menuHeight;

        const top = abrirParaCima ? (rect.top - menuHeight - 4) : (rect.bottom + 4);
        const left = Math.max(8, rect.left);
        const width = Math.max(rect.width, 320);

        this.menuEl.style.position = "fixed";
        this.menuEl.style.top = `${top}px`;
        this.menuEl.style.left = `${left}px`;
        this.menuEl.style.width = `${width}px`;
        this.menuEl.style.zIndex = "99999";
    },

    filtrar: function(query) {
        if (!this.menuEl) return;
        const normQuery = normalizarTextoParentesco(query);
        const querySemHifen = normQuery.replace(/[-_]/g, " ");

        const parenteAtual = this.activeRowIndex !== null ? TabelaParentes.parentes[this.activeRowIndex] : null;
        const codAAtual = parenteAtual ? (parenteAtual.codA || "").toUpperCase().trim() : "";
        const isZRow = codAAtual.startsWith("Z");

        // Palavras-chave indicando busca intencional por cônjuge / afinidade no campo parentesco
        const isSpouseQuery = [
            "conj", "espos", "marid", "mulher", "madrast", "padrast", "afinid"
        ].some(term => normQuery.includes(term));

        let listaBase = [];
        if (isZRow || isSpouseQuery) {
            listaBase = TabelaParentes.obterOpcoesConjuges(this.activeRowIndex);
        } else {
            listaBase = DICIONARIO_PARENTESCOS;
        }

        if (!normQuery) {
            this.filteredItems = [...listaBase];
        } else {
            this.filteredItems = listaBase.filter(item => {
                const normItem = normalizarTextoParentesco(item.label);
                const itemSemHifen = normItem.replace(/[-_]/g, " ");
                const matchCod = item.codA && (
                    normalizarTextoParentesco(item.codA).includes(normQuery) || 
                    normalizarTextoParentesco(item.codA.replace(".", "")).includes(normQuery)
                );
                return normItem.includes(normQuery) || itemSemHifen.includes(querySemHifen) || matchCod;
            });
        }

        this.renderizarOpcoes(query);
    },

    renderizarOpcoes: function(queryHighlight = "") {
        this.menuEl.innerHTML = "";

        if (this.filteredItems.length === 0) {
            const empty = document.createElement("div");
            empty.className = "parentesco-menu-empty";
            empty.style.padding = "10px 14px";
            empty.style.color = "var(--text-muted, #64748b)";
            empty.style.fontStyle = "italic";
            empty.style.textAlign = "center";
            empty.textContent = "Nenhum parentesco correspondente";
            this.menuEl.appendChild(empty);
            return;
        }

        const parenteAtual = this.activeRowIndex !== null ? TabelaParentes.parentes[this.activeRowIndex] : null;
        const valorSelecionado = parenteAtual ? (parenteAtual.parentesco || "") : "";

        this.filteredItems.forEach((item, idx) => {
            const rowEl = document.createElement("div");
            rowEl.className = "parentesco-menu-item";
            rowEl.style.display = "flex";
            rowEl.style.justifyContent = "space-between";
            rowEl.style.alignItems = "center";
            rowEl.style.padding = "7px 12px";
            rowEl.style.cursor = "pointer";
            rowEl.style.transition = "background 0.12s ease";

            if (idx === this.highlightedIndex) {
                rowEl.classList.add("is-highlighted");
                rowEl.style.background = "rgba(14, 165, 233, 0.14)";
            }
            if (item.label === valorSelecionado) {
                rowEl.classList.add("is-selected");
                rowEl.style.fontWeight = "700";
                rowEl.style.background = "rgba(14, 165, 233, 0.2)";
            }

            const labelSpan = document.createElement("span");
            labelSpan.innerHTML = this.destacarTermo(item.label, queryHighlight);
            labelSpan.style.flex = "1 1 auto";
            labelSpan.style.overflow = "hidden";
            labelSpan.style.textOverflow = "ellipsis";
            labelSpan.style.whiteSpace = "nowrap";

            if (item.isDynamicSpouse && item.codA) {
                const hintSpan = document.createElement("span");
                hintSpan.className = "spouse-code-hint";
                hintSpan.textContent = ` [${item.codA}]`;
                hintSpan.style.opacity = "0.75";
                hintSpan.style.fontSize = "11px";
                hintSpan.style.fontFamily = "monospace";
                hintSpan.style.color = "var(--accent, #0ea5e9)";
                hintSpan.style.marginLeft = "4px";
                labelSpan.appendChild(hintSpan);
            }

            const badgesContainer = document.createElement("div");
            badgesContainer.className = "parentesco-badges-container";
            badgesContainer.style.display = "inline-flex";
            badgesContainer.style.alignItems = "center";
            badgesContainer.style.justifyContent = "flex-end";
            badgesContainer.style.gap = "5px";
            badgesContainer.style.marginLeft = "auto";
            badgesContainer.style.width = "53px";
            badgesContainer.style.minWidth = "53px";
            badgesContainer.style.flexShrink = "0";

            // 1. Badge de Grau de Parentesco (1°, 2°, 3°, 4°, N para cônjuges, P para probando)
            const g = (item.grau !== undefined && item.grau !== null) ? String(item.grau).trim().toUpperCase() : "";
            if (g) {
                const grauNum = g.replace("°", "");
                const badgeGrau = document.createElement("span");
                badgeGrau.className = `parentesco-degree-badge grau-${grauNum.toLowerCase()}`;
                
                // Exibe 1°, 2°, 3°, 4° ou P, N
                const textoGrau = ["1", "2", "3", "4"].includes(grauNum) ? `${grauNum}°` : g;
                badgeGrau.textContent = textoGrau;
                badgeGrau.style.fontSize = "10px";
                badgeGrau.style.fontWeight = "700";
                badgeGrau.style.width = "27px";
                badgeGrau.style.minWidth = "27px";
                badgeGrau.style.maxWidth = "27px";
                badgeGrau.style.height = "18px";
                badgeGrau.style.display = "inline-flex";
                badgeGrau.style.alignItems = "center";
                badgeGrau.style.justifyContent = "center";
                badgeGrau.style.padding = "0";
                badgeGrau.style.borderRadius = "4px";
                badgeGrau.style.boxSizing = "border-box";
                badgeGrau.style.lineHeight = "1";

                if (grauNum === "1") {
                    badgeGrau.title = "1º Grau de Parentesco (50% de genes compartilhados)";
                    badgeGrau.style.background = "rgba(220, 38, 38, 0.14)";
                    badgeGrau.style.color = "#dc2626";
                    badgeGrau.style.border = "1px solid rgba(220, 38, 38, 0.4)";
                } else if (grauNum === "2") {
                    badgeGrau.title = "2º Grau de Parentesco (25% de genes compartilhados)";
                    badgeGrau.style.background = "rgba(234, 88, 12, 0.14)";
                    badgeGrau.style.color = "#ea580c";
                    badgeGrau.style.border = "1px solid rgba(234, 88, 12, 0.4)";
                } else if (grauNum === "3") {
                    badgeGrau.title = "3º Grau de Parentesco (12.5% de genes compartilhados)";
                    badgeGrau.style.background = "rgba(22, 163, 74, 0.14)";
                    badgeGrau.style.color = "#16a34a";
                    badgeGrau.style.border = "1px solid rgba(22, 163, 74, 0.4)";
                } else if (grauNum === "N") {
                    badgeGrau.title = "Não-Consanguíneo (Cônjuge / Parceiro)";
                    badgeGrau.style.background = "rgba(124, 58, 237, 0.14)";
                    badgeGrau.style.color = "#7c3aed";
                    badgeGrau.style.border = "1px solid rgba(124, 58, 237, 0.4)";
                } else if (grauNum === "P") {
                    badgeGrau.title = "Probando (Caso Índice / Referência)";
                    badgeGrau.style.background = "rgba(13, 148, 136, 0.14)";
                    badgeGrau.style.color = "#0d9488";
                    badgeGrau.style.border = "1px solid rgba(13, 148, 136, 0.4)";
                } else {
                    badgeGrau.title = `${textoGrau} Grau de Parentesco`;
                    badgeGrau.style.background = "rgba(146, 64, 14, 0.14)";
                    badgeGrau.style.color = "#92400e";
                    badgeGrau.style.border = "1px solid rgba(146, 64, 14, 0.4)";
                }
                badgesContainer.appendChild(badgeGrau);
            }

            // 2. Badge de Sexo (M, F ou I)
            const badgeSpan = document.createElement("span");
            const s = (item.sexo || "I").toUpperCase();
            badgeSpan.className = `parentesco-gender-badge ${s.toLowerCase()}`;
            badgeSpan.textContent = s;
            badgeSpan.style.fontSize = "10px";
            badgeSpan.style.fontWeight = "700";
            badgeSpan.style.width = "21px";
            badgeSpan.style.minWidth = "21px";
            badgeSpan.style.maxWidth = "21px";
            badgeSpan.style.height = "18px";
            badgeSpan.style.display = "inline-flex";
            badgeSpan.style.alignItems = "center";
            badgeSpan.style.justifyContent = "center";
            badgeSpan.style.padding = "0";
            badgeSpan.style.borderRadius = "4px";
            badgeSpan.style.boxSizing = "border-box";
            badgeSpan.style.lineHeight = "1";

            if (s === "F") {
                badgeSpan.style.background = "rgba(192, 38, 211, 0.14)";
                badgeSpan.style.color = "#c026d3";
                badgeSpan.style.border = "1px solid rgba(192, 38, 211, 0.4)";
                badgeSpan.title = "Sexo Feminino";
            } else if (s === "M") {
                badgeSpan.style.background = "rgba(37, 99, 235, 0.14)";
                badgeSpan.style.color = "#2563eb";
                badgeSpan.style.border = "1px solid rgba(37, 99, 235, 0.4)";
                badgeSpan.title = "Sexo Masculino";
            } else {
                badgeSpan.style.background = "rgba(100, 116, 139, 0.14)";
                badgeSpan.style.color = "#64748b";
                badgeSpan.style.border = "1px solid rgba(100, 116, 139, 0.4)";
                badgeSpan.title = "Sexo Indeterminado";
            }

            badgesContainer.appendChild(badgeSpan);

            rowEl.appendChild(labelSpan);
            rowEl.appendChild(badgesContainer);

            rowEl.addEventListener("mouseenter", () => {
                rowEl.style.background = "rgba(14, 165, 233, 0.14)";
            });
            rowEl.addEventListener("mouseleave", () => {
                if (idx !== this.highlightedIndex && item.label !== valorSelecionado) {
                    rowEl.style.background = "transparent";
                }
            });

            rowEl.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.selecionarItem(item);
            });

            this.menuEl.appendChild(rowEl);
        });

        const highlightedEl = this.menuEl.querySelector(".is-highlighted, .is-selected");
        if (highlightedEl) {
            highlightedEl.scrollIntoView({ block: "nearest" });
        }

        this.reposicionar();
    },

    selecionarItem: function(itemOrLabel) {
        if (!this.activeInput || this.activeRowIndex === null) return;
        const label = (typeof itemOrLabel === "object" && itemOrLabel !== null) ? itemOrLabel.label : itemOrLabel;
        const itemObj = (typeof itemOrLabel === "object" && itemOrLabel !== null)
            ? itemOrLabel
            : this.obterItemPorTexto(label, this.activeRowIndex);

        this.activeInput.value = label;
        if (this.onSelectCallback) {
            this.onSelectCallback(this.activeRowIndex, label, true, itemObj);
        }
        this.fechar();
    },

    attach: function(wrapper, input, btnArrow, rowIndex, onSelect) {
        // Garante posicionamento estrutural absoluto e relativo
        wrapper.style.position = "relative";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.width = "100%";
        wrapper.style.minWidth = "180px";
        wrapper.style.maxWidth = "300px";

        input.style.width = "100%";
        input.style.paddingRight = "28px";
        input.style.boxSizing = "border-box";

        btnArrow.style.position = "absolute";
        btnArrow.style.right = "6px";
        btnArrow.style.top = "50%";
        btnArrow.style.transform = "translateY(-50%)";
        btnArrow.style.background = "transparent";
        btnArrow.style.border = "none";
        btnArrow.style.cursor = "pointer";
        btnArrow.style.zIndex = "2";
        btnArrow.style.padding = "3px";
        input.addEventListener("focus", () => {
            this.abrir(wrapper, input, rowIndex, onSelect, "");
            clearTimeout(input._selectTimeoutId);
            input._selectTimeoutId = setTimeout(() => {
                if (document.activeElement === input) {
                    if (typeof input.setSelectionRange === "function" && input.value) {
                        input.setSelectionRange(0, input.value.length);
                    } else if (typeof input.select === "function") {
                        input.select();
                    }
                }
            }, 10);
        });

        input.addEventListener("blur", () => {
            clearTimeout(input._selectTimeoutId);
        });

        input.addEventListener("mousedown", (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                input.focus();
            }
        });

        input.addEventListener("click", () => {
            if (!this.menuEl || !this.menuEl.classList.contains("is-active")) {
                this.abrir(wrapper, input, rowIndex, onSelect, "");
            }
        });

        input.addEventListener("input", (e) => {
            e.stopPropagation();
            const digitado = e.target.value;
            if (!this.menuEl || !this.menuEl.classList.contains("is-active")) {
                this.abrir(wrapper, input, rowIndex, onSelect, digitado);
            } else {
                this.filtrar(digitado);
            }

            // "Se for digitado corretamente seleciona automaticamente o parentesco digitado"
            const normDigitado = normalizarTextoParentesco(digitado);
            if (normDigitado) {
                const matchExato = this.obterItemPorTexto(digitado, rowIndex);
                if (matchExato) {
                    if (onSelect) {
                        onSelect(rowIndex, matchExato.label, false, matchExato);
                    }
                    this.renderizarOpcoes(digitado);
                }
            }
        });

        input.addEventListener("keydown", (e) => {
            const isOpen = this.menuEl && this.menuEl.classList.contains("is-active");

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!isOpen) {
                    this.abrir(wrapper, input, rowIndex, onSelect, "");
                    return;
                }
                if (this.filteredItems.length > 0) {
                    this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredItems.length - 1);
                    this.renderizarOpcoes(input.value);
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (isOpen && this.filteredItems.length > 0) {
                    this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
                    this.renderizarOpcoes(input.value);
                }
            } else if (e.key === "Enter") {
                if (isOpen) {
                    e.preventDefault();
                    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredItems.length) {
                        this.selecionarItem(this.filteredItems[this.highlightedIndex]);
                    } else if (this.filteredItems.length === 1) {
                        this.selecionarItem(this.filteredItems[0]);
                    } else {
                        const match = this.obterItemPorTexto(input.value, rowIndex);
                        if (match) {
                            this.selecionarItem(match);
                        } else {
                            this.fechar();
                        }
                    }
                }
            } else if (e.key === "Escape") {
                if (isOpen) {
                    e.preventDefault();
                    this.fechar();
                }
            } else if (e.key === "Tab") {
                if (isOpen) {
                    const match = this.obterItemPorTexto(input.value, rowIndex);
                    if (match) {
                        input.value = match.label;
                        if (onSelect) onSelect(rowIndex, match.label, true, match);
                    }
                    this.fechar();
                }
            }
        });

        btnArrow.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.activeInput === input && this.menuEl && this.menuEl.classList.contains("is-active")) {
                this.fechar();
            } else {
                input.focus();
                this.abrir(wrapper, input, rowIndex, onSelect, "");
            }
        });
    }
};

const TabelaParentes = {
    parentes: [],
    parenteEditandoIndex: null,

    init: function() {
        try {
            ParentescoCombobox.init();
        } catch (e) {
            console.warn("ParentescoCombobox.init error:", e);
        }

        // Registra eventos globais imediatamente
        this.registrarEventosGlobais();

        // Se a lista de parentes estiver vazia, inicializa com o Probando A1 padrão
        if (!Array.isArray(this.parentes) || this.parentes.length === 0) {
            this.inicializarProbandoPadrao();
        }

        this.renderizarTabela();
        this.sincronizarHeredograma();
    },

    /**
     * Puxa e consolida todos os dados do Probando preenchidos nas outras abas do formulário:
     * - Sexo, Idade, Ano de Nascimento da Aba 1 (Identificação)
     * - Diagnósticos/Neoplasias primárias da Aba 3 (História Pessoal)
     */
    obterDadosProbandoDoFormulario: function() {
        // 1. Sexo (Aba 1)
        const sexEl = document.querySelector('input[name="sex"]:checked');
        let sexo = "F";
        if (sexEl) {
            sexo = (sexEl.value === "2") ? "M" : "F";
        }

        // 2. Idade (Aba 1)
        const idadeInput = document.getElementById("field-idade");
        let idade = null;
        if (idadeInput && idadeInput.value !== "") {
            const parsed = parseInt(idadeInput.value, 10);
            if (!isNaN(parsed)) idade = parsed;
        }

        // 3. Data e Ano de Nascimento (Aba 1)
        const dobInput = document.getElementById("field-dob");
        let anoNasc = null;
        if (dobInput && dobInput.value) {
            const parts = dobInput.value.split("-");
            if (parts.length === 3 && parts[0].length === 4) {
                anoNasc = parseInt(parts[0], 10);
            }
        }
        if (anoNasc === null && idade !== null) {
            anoNasc = this.calcularAnoNascPorIdade(idade);
        }

        // 4. Diagnósticos Oncológicos do Probando (Aba 3: História Pessoal)
        const diags = [];
        const nPrimEl = document.getElementById("field-n-primarios");
        const qtdPrimarios = nPrimEl && nPrimEl.value ? (parseInt(nPrimEl.value, 10) || 1) : 1;

        for (let i = 1; i <= qtdPrimarios; i++) {
            const primEl = document.getElementById(`field-primario-${i}`);
            const idadeDxEl = document.getElementById(`field-idade-dx-${i}`);
            const detalhesEl = document.getElementById(`field-detalhes-dx-${i}`);
            if (primEl && primEl.value) {
                let rotuloTumor = primEl.value;
                if (window.REDCAP_DICTIONARY && Array.isArray(window.REDCAP_DICTIONARY.tumores)) {
                    const match = window.REDCAP_DICTIONARY.tumores.find(t => String(t.value) === String(primEl.value));
                    if (match) rotuloTumor = match.label;
                } else if (primEl.options && primEl.selectedIndex >= 0) {
                    const txt = primEl.options[primEl.selectedIndex].text;
                    if (txt) rotuloTumor = txt.replace(/^\d+,\s*/, '').trim();
                }

                const idadeDx = (idadeDxEl && idadeDxEl.value !== "") ? parseInt(idadeDxEl.value, 10) : null;
                const diagObj = {
                    tumor: rotuloTumor,
                    idade: !isNaN(idadeDx) ? idadeDx : null
                };
                if (detalhesEl && detalhesEl.value.trim() && (rotuloTumor === "Outros" || rotuloTumor === "Outro" || String(rotuloTumor).toLowerCase().startsWith("outro"))) {
                    diagObj.outro = detalhesEl.value.trim();
                }
                diags.push(diagObj);
            }
        }

        return {
            codA: "A1",
            codB: 0,
            codC: 0,
            parentesco: "Probando (Paciente)",
            sexo: sexo,
            idade: idade,
            anoNasc: anoNasc,
            estadoVital: "Vivo",
            idadeMorte: null,
            diags: diags
        };
    },

    inicializarProbandoPadrao: function() {
        const dadosProbando = this.obterDadosProbandoDoFormulario();
        this.parentes = [dadosProbando];
    },

    /**
     * Sincroniza a linha do Probando (A1) na tabela de parentes com os dados atuais das outras abas
     */
    sincronizarDadosProbando: function() {
        if (!Array.isArray(this.parentes)) {
            this.parentes = [];
        }

        const dadosProbando = this.obterDadosProbandoDoFormulario();
        const probandoIndex = this.parentes.findIndex(p => (p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0);

        if (probandoIndex === -1) {
            this.parentes.unshift(dadosProbando);
        } else {
            this.parentes[probandoIndex] = dadosProbando;
        }

        this.renderizarTabela();
        this.sincronizarHeredograma();
    },

    registrarEventosGlobais: function() {
        const inputDataAtendimento = document.getElementById("input-data-atendimento");
        if (inputDataAtendimento) {
            const hoje = new Date();
            const a = hoje.getFullYear();
            const m = String(hoje.getMonth() + 1).padStart(2, "0");
            const d = String(hoje.getDate()).padStart(2, "0");
            inputDataAtendimento.value = `${d}/${m}/${a}`;
            inputDataAtendimento.addEventListener("change", () => {
                this.recalcularTodasIdadesPorData();
            });
            inputDataAtendimento.addEventListener("input", () => {
                if (inputDataAtendimento.value.length === 10) {
                    this.recalcularTodasIdadesPorData();
                }
            });
        }

        // Botão Adicionar Parente com listener direto garantido
        const btnAdd = document.getElementById("btn-add-parente");
        if (btnAdd) {
            btnAdd.onclick = (e) => {
                e.preventDefault();
                this.adicionarParente();
            };
        }

        // Botão Limpar Tabela: Reinicia apenas com o Probando A1
        const btnClear = document.getElementById("btn-clear-table");
        if (btnClear) {
            btnClear.onclick = (e) => {
                e.preventDefault();
                if (confirm("Deseja limpar toda a tabela de parentes e reiniciar apenas com o probando?")) {
                    this.inicializarProbandoPadrao();
                    this.renderizarTabela();
                    this.sincronizarHeredograma();
                }
            };
        }

        const btnExportJson = document.getElementById("btn-export-json");
        if (btnExportJson) {
            btnExportJson.onclick = (e) => {
                e.preventDefault();
                this.exportarJSON();
            };
        }

        const fileInputImport = document.getElementById("input-import-json");
        if (fileInputImport) {
            fileInputImport.addEventListener("change", (e) => this.importarJSON(e));
        }

        const btnAddTumor = document.getElementById("btn-modal-add-tumor");
        if (btnAddTumor) {
            btnAddTumor.onclick = (e) => {
                e.preventDefault();
                const container = document.getElementById("modal-tumores-list");
                if (container) {
                    const rows = container.querySelectorAll(".tumor-entry-row");
                    if (rows.length === 1) {
                        const sel = rows[0].querySelector("select");
                        if (sel && this.isStatusDiagnostico(sel.value)) {
                            rows[0].remove();
                        }
                    }
                }
                this.adicionarLinhaTumorModal();
            };
        }

        const btnSaveDiags = document.getElementById("btn-modal-save-diags");
        if (btnSaveDiags) {
            btnSaveDiags.onclick = (e) => {
                e.preventDefault();
                this.salvarDiagnosticosModal();
            };
        }
    },

    /**
     * Obtém a data de referência clínica (data do atendimento / preenchimento da consulta)
     */
    obterDataReferencia: function() {
        const input = document.getElementById("input-data-atendimento");
        if (input && input.value) {
            const val = input.value.trim();
            // Formato brasileiro DD/MM/AAAA
            const mBr = val.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
            if (mBr) {
                const d = parseInt(mBr[1], 10);
                const m = parseInt(mBr[2], 10) - 1;
                const a = parseInt(mBr[3], 10);
                const dt = new Date(a, m, d);
                if (!isNaN(dt.getTime())) return dt;
            }
            // Formato ISO AAAA-MM-DD
            const mIso = val.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
            if (mIso) {
                const a = parseInt(mIso[1], 10);
                const m = parseInt(mIso[2], 10) - 1;
                const d = parseInt(mIso[3], 10);
                const dt = new Date(a, m, d);
                if (!isNaN(dt.getTime())) return dt;
            }
        }
        return new Date();
    },

    /**
     * Retorna o ano da consulta e se a data está no começo do ano ou no fim do ano.
     * Ponto de virada: 1º de julho (semestre 2).
     * - Antes de 1 de julho (começo do ano): chuta que o parente AINDA NÃO fez aniversário.
     * - A partir de 1 de julho (fim do ano): chuta que o parente JÁ FEZ aniversário.
     */
    obterInfoAnoReferencia: function() {
        const dataRef = this.obterDataReferencia();
        const anoRef = dataRef.getFullYear();
        const pontoMedio = new Date(anoRef, 6, 1); // 1º de Julho
        const jaFezAniversario = dataRef >= pontoMedio;
        return { anoRef, jaFezAniversario, dataRef };
    },

    /**
     * Calcula a idade provável a partir do ano de nascimento:
     * - Começo do ano: idade = (anoRef - anoNasc) - 1
     * - Fim do ano: idade = anoRef - anoNasc
     */
    calcularIdadePorAnoNasc: function(anoNasc) {
        if (!anoNasc || isNaN(anoNasc)) return null;
        const { anoRef, jaFezAniversario } = this.obterInfoAnoReferencia();
        return jaFezAniversario ? (anoRef - anoNasc) : (anoRef - anoNasc - 1);
    },

    /**
     * Calcula o ano de nascimento provável a partir da idade:
     * - Começo do ano: anoNasc = anoRef - (idade + 1)
     * - Fim do ano: anoNasc = anoRef - idade
     */
    calcularAnoNascPorIdade: function(idade) {
        if (idade === null || idade === undefined || isNaN(idade)) return null;
        const { anoRef, jaFezAniversario } = this.obterInfoAnoReferencia();
        return jaFezAniversario ? (anoRef - idade) : (anoRef - (idade + 1));
    },

    /**
     * Atualiza as idades calculadas de todos os membros vivos caso o usuário altere a data da consulta
     */
    recalcularTodasIdadesPorData: function() {
        this.parentes.forEach(p => {
            if (p.anoNasc && p.estadoVital !== "Falecido") {
                p.idade = this.calcularIdadePorAnoNasc(p.anoNasc);
            }
        });
        this.renderizarTabela();
        this.sincronizarHeredograma();
    },

    sincronizarHeredograma: function() {
        const countBadge = document.getElementById("count-total-parentes");
        const total = Array.isArray(this.parentes) ? this.parentes.length : 0;
        if (countBadge) {
            countBadge.textContent = total === 1 ? "1 membro" : `${total} membros`;
        }
        const countTab = document.getElementById("count-tab-parentes");
        if (countTab) {
            countTab.textContent = total;
        }
        this.verificarDuplicidades();
        if (window.FormularioClinico) {
            try {
                if (typeof FormularioClinico.atualizarMascaraProntuario === 'function') {
                    FormularioClinico.atualizarMascaraProntuario();
                }
                if (typeof FormularioClinico.atualizarAuditoriaCampos === 'function') {
                    FormularioClinico.atualizarAuditoriaCampos();
                }
            } catch (err) {
                console.warn("sincronizarHeredograma hook error:", err);
            }
        }
        if (window.RedcapBranching && typeof window.RedcapBranching.evalAll === 'function') {
            try {
                window.RedcapBranching.evalAll();
            } catch (err) {
                console.warn("RedcapBranching evalAll error:", err);
            }
        }
    },

    /**
     * Verifica e sinaliza duplicidades de códigos (codA.codB.codC) em todas as linhas
     */
    verificarDuplicidades: function() {
        const contagem = {};
        this.parentes.forEach((p, idx) => {
            const a = (p.codA || "").trim().toUpperCase();
            const b = p.codB !== "" && p.codB !== null && p.codB !== undefined ? String(p.codB).trim() : "";
            const c = p.codC !== "" && p.codC !== null && p.codC !== undefined ? String(p.codC).trim() : "";

            if (a && b !== "" && c !== "") {
                const chave = `${a}.${b}.${c}`;
                if (!contagem[chave]) contagem[chave] = [];
                contagem[chave].push(idx);
            }
        });

        // Itera pelas linhas da tabela e aplica/remove classe de erro de duplicidade
        const tbody = document.getElementById("tbody-parentes");
        if (!tbody) return false;

        let temDuplicata = false;
        const rows = tbody.querySelectorAll("tr");

        rows.forEach((tr, idx) => {
            const p = this.parentes[idx];
            if (!p) return;

            const a = (p.codA || "").trim().toUpperCase();
            const b = p.codB !== "" && p.codB !== null && p.codB !== undefined ? String(p.codB).trim() : "";
            const c = p.codC !== "" && p.codC !== null && p.codC !== undefined ? String(p.codC).trim() : "";
            const chave = `${a}.${b}.${c}`;

            const inputs = tr.querySelectorAll(".table-input-code");
            if (a && b !== "" && c !== "" && contagem[chave] && contagem[chave].length > 1) {
                temDuplicata = true;
                tr.classList.add("has-duplicate-code");
                inputs.forEach(inp => {
                    inp.classList.add("is-duplicate");
                    inp.title = `Código Duplicado: já existe outro membro com a identificação ${chave}`;
                });
            } else {
                tr.classList.remove("has-duplicate-code");
                inputs.forEach(inp => {
                    inp.classList.remove("is-duplicate");
                });
            }
        });

        return temDuplicata;
    },

    /**
     * Gera dinamicamente a lista de cônjuges possíveis com base nos parentes
     * consanguíneos atualmente cadastrados na tabela.
     */
    obterOpcoesConjuges: function(linhaIndex = null) {
        const opcoes = [];
        const pAtual = (linhaIndex !== null && this.parentes[linhaIndex]) ? this.parentes[linhaIndex] : null;

        const proximoLivre = (numerosUsados, inicio = 1) => {
            let n = inicio;
            while (numerosUsados.includes(n)) n++;
            return n;
        };

        // Identifica todos os parentes consanguíneos tronculares cadastrados
        // (codA não começa com Z, codB === 0, codA preenchido)
        const parceirosPossiveis = [];

        // Garante que o Probando (A1) sempre esteja disponível para ter cônjuge
        const temProbando = this.parentes.some(item => (item.codA || "").trim().toUpperCase() === "A1");
        if (!temProbando) {
            parceirosPossiveis.push({ codA: "A1", parentesco: "Probando", sexo: "F" });
        }

        this.parentes.forEach((item, idx) => {
            if (idx === linhaIndex) return;
            const a = (item.codA || "").trim().toUpperCase();
            if (!a || a.startsWith("Z")) return;
            const b = parseInt(item.codB, 10) || 0;
            const c = parseInt(item.codC, 10) || 0;
            if (b === 0 && c === 0) {
                if (!parceirosPossiveis.some(p => p.codA === a)) {
                    parceirosPossiveis.push(item);
                }
            }
        });

        // Ordenação: Probando (A1) primeiro, Pai (B1), Mãe (C1), Irmãos (A2, A3...), outros
        parceirosPossiveis.sort((p1, p2) => {
            const getPrioridade = (cod) => {
                if (cod === "A1") return 1;
                if (cod === "B1") return 2;
                if (cod === "C1") return 3;
                if (cod.startsWith("A")) return 4;
                if (cod.startsWith("B")) return 5;
                if (cod.startsWith("C")) return 6;
                return 10;
            };
            const prio1 = getPrioridade(p1.codA);
            const prio2 = getPrioridade(p2.codA);
            if (prio1 !== prio2) return prio1 - prio2;
            return p1.codA.localeCompare(p2.codA, undefined, { numeric: true });
        });

        parceirosPossiveis.forEach(parceiro => {
            const codParceiro = parceiro.codA;
            const indicesUsados = [];
            this.parentes.forEach((item, idx) => {
                if (idx === linhaIndex) return;
                const v = validarCodigoCodA(item.codA);
                if (v.valido && v.isConjuge && v.parceiro === codParceiro) {
                    indicesUsados.push(v.indiceConjuge);
                }
            });

            let idxSugerido = proximoLivre(indicesUsados, 1);
            if (pAtual && pAtual.codA) {
                const vAtual = validarCodigoCodA(pAtual.codA);
                if (vAtual.valido && vAtual.isConjuge && vAtual.parceiro === codParceiro) {
                    idxSugerido = vAtual.indiceConjuge;
                }
            }

            let sexoSugerido = "M";
            if (parceiro.sexo === "M") sexoSugerido = "F";
            else if (parceiro.sexo === "F") sexoSugerido = "M";

            let label = "";
            const prefixOrdinal = idxSugerido > 1 ? `${idxSugerido}º ` : "";
            const prefixOrdinalFem = idxSugerido > 1 ? `${idxSugerido}ª ` : "";

            if (codParceiro === "A1") {
                label = `${prefixOrdinal}Cônjuge do Probando`;
            } else if (codParceiro === "B1") {
                label = sexoSugerido === "F" ? `${prefixOrdinalFem}Madrasta (Cônjuge do Pai)` : `${prefixOrdinal}Cônjuge do Pai`;
            } else if (codParceiro === "C1") {
                label = sexoSugerido === "M" ? `${prefixOrdinal}Padrasto (Cônjuge da Mãe)` : `${prefixOrdinalFem}Cônjuge da Mãe`;
            } else {
                const rotuloParceiro = parceiro.parentesco || codParceiro;
                label = `${prefixOrdinal}Cônjuge de ${rotuloParceiro} (${codParceiro})`;
            }

            opcoes.push({
                label: label,
                categoria: "conjuge",
                sexo: sexoSugerido,
                grau: "N",
                codA: `Z${idxSugerido}.${codParceiro}`,
                codB: 0,
                codC: 0,
                isDynamicSpouse: true,
                parceiro: codParceiro,
                indiceConjuge: idxSugerido
            });
        });

        return opcoes;
    },

    /**
     * Auto-correção de buracos de sequência na fratria:
     * Exemplo: Ao digitar A5.0.0 quando só existem A1 e A2, corrige automaticamente para A3.0.0
     */
    corrigirSequenciaCodigo: function(linhaIndex) {
        const p = this.parentes[linhaIndex];
        if (!p || !p.codA) return;
        if ((p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) return;

        const val = validarCodigoCodA(p.codA);
        if (!val.valido) return;

        const ramo = val.ramo;
        const numDigitado = val.numero;
        const isConjuge = val.isConjuge;
        const b = p.codB !== "" && p.codB !== null ? parseInt(p.codB, 10) : 0;
        const c = p.codC !== "" && p.codC !== null ? parseInt(p.codC, 10) : 0;

        // 1. Fratria de codA (onde b === 0 e c === 0)
        if (b === 0 && c === 0 && !isConjuge) {
            const numerosExistentes = [];
            this.parentes.forEach((item, idx) => {
                if (idx === linhaIndex) return;
                const v = validarCodigoCodA(item.codA);
                const ib = parseInt(item.codB, 10) || 0;
                const ic = parseInt(item.codC, 10) || 0;
                if (v.valido && v.ramo === ramo && !v.isConjuge && ib === 0 && ic === 0) {
                    numerosExistentes.push(v.numero);
                }
            });

            // Encontra o menor número disponível consecutivo
            let proximoVago = 1;
            while (numerosExistentes.includes(proximoVago)) {
                proximoVago++;
            }

            if (numDigitado > proximoVago) {
                // Auto-corrige o código para manter a sequência sem buracos
                p.codA = `${ramo}${proximoVago}`;
            }
        }

        // 2. Descendência codB (filhos de um mesmo codA, onde c === 0 e b > 0)
        if (b > 0 && c === 0) {
            const bsExistentes = [];
            this.parentes.forEach((item, idx) => {
                if (idx === linhaIndex) return;
                if ((item.codA || "").trim().toUpperCase() === p.codA.trim().toUpperCase()) {
                    const ic = parseInt(item.codC, 10) || 0;
                    const ib = parseInt(item.codB, 10) || 0;
                    if (ic === 0 && ib > 0) {
                        bsExistentes.push(ib);
                    }
                }
            });

            let proximoBVago = 1;
            while (bsExistentes.includes(proximoBVago)) {
                proximoBVago++;
            }

            if (b > proximoBVago) {
                p.codB = proximoBVago;
            }
        }

        // 3. Sequenciamento de cônjuges múltiplos (Z1.A1, Z2.A1, Z1.A2, etc.)
        if (isConjuge && val.parceiro) {
            const indicesExistentes = [];
            this.parentes.forEach((item, idx) => {
                if (idx === linhaIndex) return;
                const v = validarCodigoCodA(item.codA);
                if (v.valido && v.isConjuge && v.parceiro === val.parceiro) {
                    indicesExistentes.push(v.indiceConjuge);
                }
            });

            if (!val.temIndiceExplicito) {
                // Usuário digitou formato implícito (ex: ZA2 ou Z.A2): auto-numera para o menor índice livre consecutivo
                let proximoZ = 1;
                while (indicesExistentes.includes(proximoZ)) {
                    proximoZ++;
                }
                p.codA = `Z${proximoZ}.${val.parceiro}`;
            } else {
                // Usuário digitou um índice explícito (ex: Z3.A2): se houver buraco, auto-corrige
                let menorBuraco = 1;
                while (indicesExistentes.includes(menorBuraco)) {
                    menorBuraco++;
                }
                if (val.indiceConjuge > menorBuraco) {
                    p.codA = `Z${menorBuraco}.${val.parceiro}`;
                } else {
                    p.codA = `Z${val.indiceConjuge}.${val.parceiro}`;
                }
            }
        }
    },

    renderizarTabela: function() {
        const tbody = document.getElementById("tbody-parentes");
        if (!tbody) return;

        tbody.innerHTML = "";

        // Garante que o Probando (A1.0.0) sempre exista e esteja sincronizado com o formulário
        if (!Array.isArray(this.parentes) || this.parentes.length === 0) {
            this.parentes = [this.obterDadosProbandoDoFormulario()];
        } else {
            let probandoIndex = this.parentes.findIndex(p => (p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0);
            if (probandoIndex === -1) {
                this.parentes.unshift(this.obterDadosProbandoDoFormulario());
            } else {
                Object.assign(this.parentes[probandoIndex], this.obterDadosProbandoDoFormulario());
            }
        }

        this.parentes.forEach((p, index) => {
            const tr = document.createElement("tr");
            const isProbando = (p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0;

            if (isProbando) {
                tr.classList.add("is-probando-row");
                tr.setAttribute("data-probando", "true");
            }

            let inParentesco;
            let wrapParentesco;
            let inCodB;
            let inCodC;
            let selSexo;

            // 1. codA (Input Text com Validação e Auto-Correção)
            const tdCodA = document.createElement("td");
            const inCodA = document.createElement("input");
            inCodA.type = "text";
            inCodA.maxLength = 7;
            inCodA.className = "table-input-code";
            inCodA.value = p.codA || "";
            inCodA.placeholder = "ex: A1";

            if (isProbando) {
                inCodA.value = "A1";
                inCodA.readOnly = true;
                inCodA.classList.add("is-probando-field", "is-valid");
                inCodA.title = "Probando (Caso Índice) - Código fixo A1 (somente visualização)";
                inCodA.setAttribute("aria-readonly", "true");
                tdCodA.title = inCodA.title;
            } else {
                const testA = validarCodigoCodA(p.codA);
                if (p.codA && testA.valido) {
                    inCodA.classList.add("is-valid");
                } else if (p.codA) {
                    inCodA.classList.add("is-invalid");
                    inCodA.title = testA.mensagem;
                }

                inCodA.addEventListener("input", (e) => {
                    const upper = e.target.value.toUpperCase().trim();
                    e.target.value = upper;
                    p.codA = upper;

                    const res = validarCodigoCodA(upper);
                    if (res.valido) {
                        inCodA.classList.remove("is-invalid");
                        inCodA.classList.add("is-valid");
                        inCodA.title = `Código Válido: ${res.codigoCanico}`;
                    } else if (upper.startsWith("Z")) {
                        inCodA.classList.remove("is-invalid");
                        inCodA.classList.add("is-valid");
                        inCodA.title = "Código de Cônjuge: selecione o parceiro em Parentesco ou complete o código (ex: Z1.A1, Z1.A2)";
                    } else if (upper !== "") {
                        inCodA.classList.remove("is-valid");
                        inCodA.classList.add("is-invalid");
                        inCodA.title = res.mensagem;
                    }
                    this.verificarDuplicidades();

                    // Se o usuário digitou Z no codA, transforma a lista de parentescos em lista de cônjuges e abre o dropdown
                    if (upper === "Z") {
                        if (wrapParentesco && inParentesco) {
                            ParentescoCombobox.abrir(wrapParentesco, inParentesco, index, (idx, label, fechar = true, itemObj = null) => {
                                this.aplicarDeducaoPorParentesco(idx, label, inCodA, inCodB, inCodC, selSexo, itemObj);
                            }, "");
                        }
                    } else if (upper.startsWith("Z") && ParentescoCombobox.menuEl && ParentescoCombobox.menuEl.classList.contains("is-active") && ParentescoCombobox.activeRowIndex === index) {
                        ParentescoCombobox.filtrar(upper);
                    }
                });

                inCodA.addEventListener("blur", () => {
                    // Auto-correção visual imediata do formato (ex: ZA2 -> Z1.A2, Z.A2 -> Z1.A2, Z2A1 -> Z2.A1)
                    const vPre = validarCodigoCodA(p.codA);
                    if (vPre.valido) {
                        p.codA = vPre.codigoCanico;
                    }

                    // Auto-correção de buracos e sequenciamento (ex: A5 -> A3, Z4.A1 -> Z2.A1)
                    this.corrigirSequenciaCodigo(index);
                    inCodA.value = p.codA;

                    const res = validarCodigoCodA(p.codA);
                    if (res.valido) {
                        inCodA.classList.remove("is-invalid");
                        inCodA.classList.add("is-valid");

                        // Sugestão de sexo APENAS se estiver vazio
                        if (!p.sexo || p.sexo === "") {
                            if (res.isConjuge) {
                                const parceiroParente = this.parentes.find(item => item.codA === res.parceiro && (parseInt(item.codB, 10) || 0) === (parseInt(p.codB, 10) || 0));
                                if (parceiroParente && parceiroParente.sexo) {
                                    p.sexo = parceiroParente.sexo === "F" ? "M" : "F";
                                    selSexo.value = p.sexo;
                                }
                            } else if ((parseInt(p.codB, 10) || 0) === 0 && res.numero === 1) {
                                // Apenas para ascendentes diretos (B1=Pai, C1=Mãe, D1=Avô, E1=Avó, etc.)
                                if (["C", "E", "G", "I", "K", "M", "O"].includes(res.ramo)) {
                                    p.sexo = "F";
                                    selSexo.value = "F";
                                } else if (["B", "D", "F", "H", "J", "L", "N"].includes(res.ramo)) {
                                    p.sexo = "M";
                                    selSexo.value = "M";
                                }
                            }
                        }

                        // Dedução e sugestão de parentesco com base no código e no sexo atual
                        const parentescoSugerido = deduzirParentescoPorCodigo(p.codA, p.codB, p.codC, p.sexo);
                        p.parentesco = parentescoSugerido;
                        if (inParentesco) inParentesco.value = parentescoSugerido || "";
                    }

                    this.verificarDuplicidades();
                    this.sincronizarHeredograma();
                });
            }
            tdCodA.appendChild(inCodA);

            // 2. codB (Input Text apenas para Números >= 0)
            const tdCodB = document.createElement("td");
            inCodB = document.createElement("input");
            inCodB.type = "text";
            inCodB.maxLength = 3;
            inCodB.className = "table-input-code";
            inCodB.style.width = "65px";
            inCodB.value = (p.codB !== null && p.codB !== undefined && p.codB !== "") ? p.codB : "";
            inCodB.placeholder = "0";

            if (isProbando) {
                inCodB.value = "0";
                inCodB.readOnly = true;
                inCodB.classList.add("is-probando-field");
                inCodB.title = "Probando - Fixo 0 (somente visualização)";
                inCodB.setAttribute("aria-readonly", "true");
                tdCodB.title = inCodB.title;
            } else {
                inCodB.addEventListener("input", (e) => {
                    // Permite apenas dígitos
                    const numOnly = e.target.value.replace(/\D/g, "");
                    e.target.value = numOnly;
                    p.codB = numOnly === "" ? "" : parseInt(numOnly, 10);
                    this.verificarDuplicidades();
                });

                inCodB.addEventListener("blur", () => {
                    if (p.codA && p.codB === "") {
                        p.codB = 0;
                        inCodB.value = "0";
                    }
                    this.corrigirSequenciaCodigo(index);
                    inCodB.value = p.codB !== "" ? p.codB : "";
                    this.aplicarDeducaoPorCodigo(index, inCodA, inParentesco, selSexo);
                    this.verificarDuplicidades();
                    this.sincronizarHeredograma();
                });
            }
            tdCodB.appendChild(inCodB);

            // 3. codC (Input Text apenas para Números >= 0)
            const tdCodC = document.createElement("td");
            inCodC = document.createElement("input");
            inCodC.type = "text";
            inCodC.maxLength = 3;
            inCodC.className = "table-input-code";
            inCodC.style.width = "65px";
            inCodC.value = (p.codC !== null && p.codC !== undefined && p.codC !== "") ? p.codC : "";
            inCodC.placeholder = "0";

            if (isProbando) {
                inCodC.value = "0";
                inCodC.readOnly = true;
                inCodC.classList.add("is-probando-field");
                inCodC.title = "Probando - Fixo 0 (somente visualização)";
                inCodC.setAttribute("aria-readonly", "true");
                tdCodC.title = inCodC.title;
            } else {
                inCodC.addEventListener("input", (e) => {
                    // Permite apenas dígitos
                    const numOnly = e.target.value.replace(/\D/g, "");
                    e.target.value = numOnly;
                    p.codC = numOnly === "" ? "" : parseInt(numOnly, 10);
                    this.verificarDuplicidades();
                });

                inCodC.addEventListener("blur", () => {
                    if (p.codA && p.codC === "") {
                        p.codC = 0;
                        inCodC.value = "0";
                    }
                    this.aplicarDeducaoPorCodigo(index, inCodA, inParentesco, selSexo);
                    this.verificarDuplicidades();
                    this.sincronizarHeredograma();
                });
            }
            tdCodC.appendChild(inCodC);

            // 4. Sexo (Select posicionado ANTES do Parentesco)
            const tdSexo = document.createElement("td");
            selSexo = document.createElement("select");
            selSexo.className = "table-select";
            selSexo.style.minWidth = "85px";
            selSexo.innerHTML = `
                <option value="" ${!p.sexo ? "selected" : ""} disabled>Selecione</option>
                <option value="F" ${p.sexo === "F" ? "selected" : ""}>F (Feminino)</option>
                <option value="M" ${p.sexo === "M" ? "selected" : ""}>M (Masculino)</option>
                <option value="I" ${p.sexo === "I" ? "selected" : ""}>I (Indet.)</option>
            `;

            if (isProbando) {
                selSexo.disabled = true;
                selSexo.classList.add("is-probando-field");
                selSexo.title = "Sexo puxado da Aba 1 (Identificação) - Somente visualização";
                tdSexo.title = selSexo.title;
            } else {
                selSexo.addEventListener("change", (e) => {
                    const novoSexo = e.target.value;
                    p.sexo = novoSexo;

                    // Reatividade mútua de gênero:
                    // O código (codA, codB, codC) NUNCA é alterado ao trocar de sexo!
                    // O parentesco é recalculado exclusivamente na sua forma gramatical adequada.
                    if (p.codA && p.codA.trim() !== "") {
                        const parentescoAtualizado = deduzirParentescoPorCodigo(p.codA, p.codB, p.codC, novoSexo);
                        if (parentescoAtualizado) {
                            p.parentesco = parentescoAtualizado;
                            if (inParentesco) inParentesco.value = parentescoAtualizado;
                        }
                    } else if (p.parentesco) {
                        const parentescoFlexionado = flexionarGeneroParentesco(p.parentesco, novoSexo);
                        if (parentescoFlexionado !== p.parentesco) {
                            p.parentesco = parentescoFlexionado;
                            if (inParentesco) inParentesco.value = parentescoFlexionado;
                        }
                    }

                    this.sincronizarHeredograma();
                });
            }
            tdSexo.appendChild(selSexo);

            // 5. Parentesco (Combobox Inteligente e Reativo com Busca e Dropdown)
            const tdParentesco = document.createElement("td");
            tdParentesco.className = "col-parentesco";
            wrapParentesco = document.createElement("div");
            wrapParentesco.className = "parentesco-combobox-wrapper";

            inParentesco = document.createElement("input");
            inParentesco.type = "text";
            inParentesco.className = "table-select parentesco-combobox-input";
            inParentesco.value = p.parentesco || "";
            inParentesco.placeholder = "Selecione ou digite...";
            inParentesco.autocomplete = "off";
            inParentesco.spellcheck = false;

            const btnArrowParentesco = document.createElement("button");
            btnArrowParentesco.type = "button";
            btnArrowParentesco.className = "parentesco-combobox-arrow";
            btnArrowParentesco.tabIndex = -1;
            btnArrowParentesco.title = "Abrir lista de parentescos";
            btnArrowParentesco.innerHTML = `
                <svg width="10" height="6" viewBox="0 0 10 6">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                </svg>
            `;

            wrapParentesco.appendChild(inParentesco);
            wrapParentesco.appendChild(btnArrowParentesco);
            tdParentesco.appendChild(wrapParentesco);

            if (isProbando) {
                inParentesco.value = "Probando (Paciente)";
                inParentesco.readOnly = true;
                inParentesco.classList.add("is-probando-field");
                inParentesco.title = "Probando (Caso Índice) - Somente visualização";
                inParentesco.setAttribute("aria-readonly", "true");
                btnArrowParentesco.style.display = "none";
                tdParentesco.title = inParentesco.title;
            } else {
                ParentescoCombobox.attach(wrapParentesco, inParentesco, btnArrowParentesco, index, (idx, label, fechar = true, itemObj = null) => {
                    this.aplicarDeducaoPorParentesco(idx, label, inCodA, inCodB, inCodC, selSexo, itemObj);
                });
            }

            // 6. Idade Atual (Number Input)
            const tdIdade = document.createElement("td");
            tdIdade.style.textAlign = "center";
            const inIdade = document.createElement("input");
            inIdade.type = "number";
            inIdade.min = "0";
            inIdade.max = "120";
            inIdade.className = "table-input-number";
            inIdade.style.width = "68px";
            inIdade.style.textAlign = "center";
            inIdade.value = (p.idade !== null && p.idade !== undefined) ? p.idade : "";
            inIdade.placeholder = "Idade";

            if (isProbando) {
                inIdade.readOnly = true;
                inIdade.classList.add("is-probando-field");
                inIdade.title = "Idade puxada da Aba 1 (Identificação) - Somente visualização";
                inIdade.setAttribute("aria-readonly", "true");
                tdIdade.title = inIdade.title;
            } else {
                inIdade.addEventListener("input", (e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    p.idade = val;

                    if (val !== null && !isNaN(val) && val >= 0 && val <= 120) {
                        const anoCalculado = this.calcularAnoNascPorIdade(val);
                        p.anoNasc = anoCalculado;
                        inAno.value = anoCalculado;
                    } else if (val === null) {
                        p.idade = null;
                    }
                    this.sincronizarHeredograma();
                });
            }
            tdIdade.appendChild(inIdade);

            // 7. Ano de Nascimento (Number Input)
            const tdAno = document.createElement("td");
            tdAno.style.textAlign = "center";
            const inAno = document.createElement("input");
            inAno.type = "number";
            inAno.min = "1850";
            inAno.max = "2030";
            inAno.className = "table-input-number";
            inAno.style.width = "70px";
            inAno.style.textAlign = "center";
            inAno.value = (p.anoNasc !== null && p.anoNasc !== undefined) ? p.anoNasc : "";
            inAno.placeholder = "Ano";

            if (isProbando) {
                inAno.readOnly = true;
                inAno.classList.add("is-probando-field");
                inAno.title = "Ano de Nascimento puxado da Aba 1 (Identificação) - Somente visualização";
                inAno.setAttribute("aria-readonly", "true");
                tdAno.title = inAno.title;
            } else {
                inAno.addEventListener("input", (e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    p.anoNasc = val;

                    if (val !== null && !isNaN(val) && String(val).length === 4 && val >= 1850) {
                        const idadeCalculada = this.calcularIdadePorAnoNasc(val);
                        p.idade = idadeCalculada;
                        inIdade.value = idadeCalculada;
                    } else if (val === null) {
                        p.anoNasc = null;
                    }
                    this.sincronizarHeredograma();
                });
            }
            tdAno.appendChild(inAno);

            // 8. Estado Vital (Select: Vivo / Falecido)
            const tdVital = document.createElement("td");
            const selVital = document.createElement("select");
            selVital.className = "table-select";
            selVital.style.minWidth = "85px";

            if (isProbando) {
                selVital.innerHTML = `<option value="Vivo" selected>Vivo</option>`;
                selVital.disabled = true;
                selVital.classList.add("is-probando-field");
                selVital.title = "Probando em atendimento clínico (Vivo) - Somente visualização";
                tdVital.title = selVital.title;
            } else {
                selVital.innerHTML = `
                    <option value="Vivo" ${p.estadoVital === "Vivo" ? "selected" : ""}>Vivo</option>
                    <option value="Falecido" ${p.estadoVital === "Falecido" ? "selected" : ""}>Falecido</option>
                `;
                selVital.addEventListener("change", (e) => {
                    p.estadoVital = e.target.value;
                    inMorte.disabled = p.estadoVital !== "Falecido";
                    if (p.estadoVital !== "Falecido") {
                        p.idadeMorte = null;
                        inMorte.value = "";
                    }
                    this.sincronizarHeredograma();
                });
            }
            tdVital.appendChild(selVital);

            // 9. Idade de Falecimento (Number Input)
            const tdMorte = document.createElement("td");
            tdMorte.className = "col-falecimento";
            tdMorte.style.textAlign = "center";
            const inMorte = document.createElement("input");
            inMorte.type = "number";
            inMorte.min = "0";
            inMorte.max = "120";
            inMorte.className = "table-input-number";
            inMorte.style.width = "75px";
            inMorte.style.textAlign = "center";
            inMorte.value = (p.idadeMorte !== null && p.idadeMorte !== undefined) ? p.idadeMorte : "";
            inMorte.placeholder = "Idade";
            inMorte.title = "Idade de Falecimento (se falecido)";
            inMorte.disabled = isProbando || p.estadoVital !== "Falecido";

            if (isProbando) {
                inMorte.value = "";
                inMorte.readOnly = true;
                inMorte.disabled = true;
                inMorte.classList.add("is-probando-field");
                inMorte.title = "Não aplicável ao Probando - Somente visualização";
                inMorte.setAttribute("aria-readonly", "true");
                tdMorte.title = inMorte.title;
            } else {
                inMorte.addEventListener("input", (e) => {
                    p.idadeMorte = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    this.sincronizarHeredograma();
                });
            }
            tdMorte.appendChild(inMorte);

            // 10. Diagnósticos com idade
            const tdDiags = document.createElement("td");
            tdDiags.className = "col-diags";
            const btnDiags = document.createElement("button");
            btnDiags.type = "button";

            if (isProbando) {
                btnDiags.className = `btn-diags-trigger is-probando-diags ${(p.diags && p.diags.length > 0) ? 'has-diags' : ''}`;
                btnDiags.title = "Diagnósticos do Probando gerenciados na Aba 3 (História Pessoal). Clique para editar.";
                tdDiags.title = btnDiags.title;

                if (p.diags && p.diags.length > 0) {
                    const resumo = p.diags.map(d => {
                        const tumorLabel = (this.isDiagnosticoOutro(d.tumor) && d.outro)
                            ? `Outros: ${d.outro}`
                            : d.tumor;
                        const idadeStr = (d.idade !== null && d.idade !== undefined && d.idade !== "") ? ` (${d.idade}a)` : "";
                        return `${escapeHTML(tumorLabel)}${idadeStr}`;
                    }).join(', ');
                    btnDiags.innerHTML = `<span class="diag-bullet"></span><span class="diag-text">${resumo}</span> <span class="badge-link-aba3">Editar na Aba 3 ↗</span>`;
                } else {
                    btnDiags.innerHTML = `<span class="diag-text" style="color:var(--text-muted); font-size:12px;">Sem neoplasias relatadas</span> <span class="badge-link-aba3" style="font-size:11px; margin-left:4px; opacity:0.85;">+ Aba 3 ↗</span>`;
                }

                btnDiags.addEventListener("click", () => {
                    if (window.FormularioClinico && typeof window.FormularioClinico.trocarAba === "function") {
                        window.FormularioClinico.trocarAba("tab-historia-pessoal");
                        const container = document.getElementById("container-tumores-probando") || document.getElementById("field-primario-1");
                        if (container) {
                            container.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                    }
                });
            } else {
                const diags = Array.isArray(p.diags) ? p.diags : [];
                const cancerDiags = diags.filter(d => !this.isHistoricoDesconhecido(d.tumor) && !this.isHistoricoDesconhecido(d.codigo) && !this.isSemHistorico(d.tumor) && !this.isSemHistorico(d.codigo));
                const isDesc = diags.some(d => this.isHistoricoDesconhecido(d.tumor) || this.isHistoricoDesconhecido(d.codigo)) || (cancerDiags.length === 0 && String(p.history_code) === '0');
                const isSem = diags.some(d => this.isSemHistorico(d.tumor) || this.isSemHistorico(d.codigo)) || (cancerDiags.length === 0 && String(p.history_code) === '1');

                if (cancerDiags.length > 0) {
                    const resumo = cancerDiags.map(d => {
                        const tumorLabel = (this.isDiagnosticoOutro(d.tumor) && d.outro)
                            ? `Outros: ${d.outro}`
                            : d.tumor;
                        const idadeStr = (d.idade !== null && d.idade !== undefined && d.idade !== "") ? ` (${d.idade}a)` : "";
                        return `${tumorLabel}${idadeStr}`;
                    }).join(', ');
                    btnDiags.className = "btn-diags-trigger has-diags";
                    btnDiags.innerHTML = `<span class="diag-bullet"></span><span class="diag-text">${escapeHTML(resumo)}</span>`;
                } else if (isDesc) {
                    btnDiags.className = "btn-diags-trigger is-diag-unknown";
                    btnDiags.innerHTML = `<span class="diag-bullet"></span><span class="diag-text">Histórico desconhecido</span>`;
                } else if (isSem) {
                    btnDiags.className = "btn-diags-trigger is-diag-none";
                    btnDiags.innerHTML = `<span class="diag-bullet"></span><span class="diag-text">Sem histórico</span>`;
                } else {
                    btnDiags.className = "btn-diags-trigger";
                    btnDiags.innerHTML = `<span style="opacity:0.6;">+ Adicionar</span>`;
                }
                btnDiags.addEventListener("click", () => this.abrirModalDiagnosticos(index));
            }
            tdDiags.appendChild(btnDiags);

            // 11. Ações (Excluir Linha)
            const tdAcoes = document.createElement("td");
            const btnDel = document.createElement("button");
            btnDel.type = "button";

            if (isProbando) {
                btnDel.className = "btn-delete-row is-probando-delete";
                btnDel.disabled = true;
                btnDel.title = "O Probando (A1) é o caso índice e não pode ser excluído";
                tdAcoes.title = btnDel.title;
                btnDel.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                `;
            } else {
                btnDel.className = "btn-delete-row";
                btnDel.title = "Remover parente";
                btnDel.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                `;
                btnDel.addEventListener("click", () => this.removerParente(index));
            }
            tdAcoes.appendChild(btnDel);

            // Monta a Linha com Sexo ANTES de Parentesco
            tr.appendChild(tdCodA);
            tr.appendChild(tdCodB);
            tr.appendChild(tdCodC);
            tr.appendChild(tdSexo);
            tr.appendChild(tdParentesco);
            tr.appendChild(tdIdade);
            tr.appendChild(tdAno);
            tr.appendChild(tdVital);
            tr.appendChild(tdMorte);
            tr.appendChild(tdDiags);
            tr.appendChild(tdAcoes);

            tbody.appendChild(tr);
        });

        this.verificarDuplicidades();
    },

    aplicarDeducaoPorParentesco: function(index, parentescoLabel, inCodA, inCodB, inCodC, selSexo, itemObj = null) {
        const p = this.parentes[index];
        if (!p) return;
        if ((p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) return;

        p.parentesco = parentescoLabel;

        // 0. Verifica se é uma opção de cônjuge dinâmica
        let matchSpouse = (itemObj && itemObj.isDynamicSpouse) ? itemObj : null;
        if (!matchSpouse) {
            const opcoesConjuges = this.obterOpcoesConjuges(index);
            matchSpouse = opcoesConjuges.find(o => o.label === parentescoLabel);
        }

        if (matchSpouse) {
            p.codA = matchSpouse.codA;
            p.codB = 0;
            p.codC = 0;
            if (matchSpouse.sexo && matchSpouse.sexo !== "I") {
                p.sexo = matchSpouse.sexo;
                if (selSexo) selSexo.value = matchSpouse.sexo;
            }
            if (inCodA) {
                inCodA.value = p.codA;
                inCodA.classList.remove("is-invalid");
                inCodA.classList.add("is-valid");
                inCodA.title = `Código Válido: ${p.codA}`;
            }
            if (inCodB) inCodB.value = "0";
            if (inCodC) inCodC.value = "0";
            this.verificarDuplicidades();
            this.sincronizarHeredograma();
            return;
        }

        // 1. Identifica o par de gênero e categoria canônica
        const parGenero = PARES_GENERO_PARENTESCO.find(item => item.m === parentescoLabel || item.f === parentescoLabel);
        const matchDict = DICIONARIO_PARENTESCOS.find(d => d.label === parentescoLabel);
        const novoSexo = matchDict ? matchDict.sexo : (parGenero ? (parGenero.f === parentescoLabel ? "F" : "M") : null);

        // Atualiza o sexo correspondente ao termo selecionado
        if (novoSexo) {
            p.sexo = novoSexo;
            if (selSexo) selSexo.value = novoSexo;
        }

        // 2. Se a linha já tem código (codA) preenchido:
        if (p.codA && p.codA.trim() !== "") {
            // Verifica se a mudança é apenas uma flexão de gênero do mesmo parente (ex: Sobrinho A2.1 -> Sobrinha A2.1)
            const parentescoEsperado = deduzirParentescoPorCodigo(p.codA, p.codB, p.codC, p.sexo);
            if (parentescoEsperado === parentescoLabel) {
                // A posição atual já corresponde ao parentesco com o novo sexo.
                // PRESERVA codA, codB, codC INTACTOS!
                this.verificarDuplicidades();
                this.sincronizarHeredograma();
                return;
            }

            // Verifica se pertence à mesma categoria estrutural:
            // Se já tem um parente configurado como sobrinho (ex: A3.1.0) e o usuário escolhe "Sobrinha",
            // ou tem A1.2.0 (filho) e escolhe "Filha", PRESERVA o código!
            const cat = matchDict ? matchDict.categoria : (parGenero ? parGenero.categoria : null);
            const valA = validarCodigoCodA(p.codA);
            const b = parseInt(p.codB, 10) || 0;
            const c = parseInt(p.codC, 10) || 0;

            let ehCompativel = false;
            if (cat === "sobrinho" && valA.valido && valA.ramo === "A" && valA.numero >= 2 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "sobrinho_neto" && valA.valido && valA.ramo === "A" && valA.numero >= 2 && b > 0 && c > 0) {
                ehCompativel = true;
            } else if (cat === "irmao" && valA.valido && valA.ramo === "A" && valA.numero >= 2 && b === 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "filho" && valA.valido && valA.ramo === "A" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "neto" && valA.valido && valA.ramo === "A" && valA.numero === 1 && b > 0 && c > 0) {
                ehCompativel = true;
            } else if (cat === "tio_pat" && valA.valido && valA.ramo === "B" && valA.numero >= 2 && b === 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "primo_pat" && valA.valido && valA.ramo === "B" && valA.numero >= 2 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "tio_mat" && valA.valido && valA.ramo === "C" && valA.numero >= 2 && b === 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "primo_mat" && valA.valido && valA.ramo === "C" && valA.numero >= 2 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "meio_pat" && valA.valido && valA.ramo === "B" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "meio_mat" && valA.valido && valA.ramo === "C" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "tio_avo_pat" && valA.valido && (valA.ramo === "D" || valA.ramo === "E") && valA.numero >= 2 && b === 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "tio_avo_mat" && valA.valido && (valA.ramo === "F" || valA.ramo === "G") && valA.numero >= 2 && b === 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "primo_mae_mat" && valA.valido && (valA.ramo === "F" || valA.ramo === "G") && valA.numero >= 2 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "bisneto" && valA.valido && valA.ramo === "A" && valA.numero === 1 && b === 0 && c > 0) {
                ehCompativel = true;
            } else if ((cat === "meio_tio_avo_pat" || cat === "meio_tio_pat") && valA.valido && valA.ramo === "D" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "meio_tio_avoa_pat" && valA.valido && valA.ramo === "E" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if ((cat === "meio_tio_avo_mat" || cat === "meio_tio_mat") && valA.valido && valA.ramo === "F" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if (cat === "meio_tio_avoa_mat" && valA.valido && valA.ramo === "G" && valA.numero === 1 && b > 0 && c === 0) {
                ehCompativel = true;
            } else if ((cat === "meio_sobrinho" || cat === "meio_sobrinho_pat") && valA.valido && valA.ramo === "B" && valA.numero === 1 && b > 0 && c > 0) {
                ehCompativel = true;
            } else if (cat === "meio_sobrinho_mat" && valA.valido && valA.ramo === "C" && valA.numero === 1 && b > 0 && c > 0) {
                ehCompativel = true;
            }

            if (ehCompativel) {
                this.verificarDuplicidades();
                this.sincronizarHeredograma();
                return;
            }
        }

        // 3. Se o código estava vazio ou é incompatível com a nova categoria selecionada:
        // Sugere o próximo código disponível para a categoria
        this.atribuirCodigoParaParentesco(index, parentescoLabel, matchDict, inCodA, inCodB, inCodC);

        this.verificarDuplicidades();
        this.sincronizarHeredograma();
    },

    atribuirCodigoParaParentesco: function(index, parentescoLabel, matchDict, inCodA, inCodB, inCodC) {
        const p = this.parentes[index];
        const cat = matchDict ? matchDict.categoria : "";

        // Auxiliar: encontra o menor número inteiro >= inicio ainda não utilizado
        const proximoLivre = (numerosUsados, inicio = 1) => {
            let n = inicio;
            while (numerosUsados.includes(n)) n++;
            return n;
        };

        if (cat === "irmao") {
            // Fratria A: A2, A3, A4... (Irmão ou Irmã usam a mesma fratria sequencial!)
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA && !item.codA.startsWith("Z") && (parseInt(item.codB, 10) || 0) === 0 && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.ramo === "A") ? v.numero : null;
                })
                .filter(n => n !== null);
            const prox = proximoLivre(usados, 2);
            p.codA = `A${prox}`;
            p.codB = 0;
            p.codC = 0;
        } else if (cat === "filho") {
            // Filhos do Probando: A1.1, A1.2... (Filho ou Filha usam a mesma sequência!)
            p.codA = "A1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "A1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "neto") {
            // Netos do Probando: A1.1.1, A1.1.2...
            p.codA = "A1";
            p.codB = 1;
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "A1" && (parseInt(item.codB, 10) || 0) === 1)
                .map(item => parseInt(item.codC, 10) || 0)
                .filter(n => n > 0);
            p.codC = proximoLivre(usados, 1);
        } else if (cat === "sobrinho") {
            // Sobrinhos (filhos de irmão/irmã A2, A3...):
            // Tanto Sobrinho quanto Sobrinha vinculam-se ao primeiro irmão disponível (padrão A2)
            const irmao = this.parentes.find(item => {
                const v = validarCodigoCodA(item.codA);
                return v.valido && v.ramo === "A" && v.numero >= 2 && !v.isConjuge && (parseInt(item.codB, 10) || 0) === 0;
            });
            const codAIrmao = irmao ? irmao.codA : "A2";
            p.codA = codAIrmao;

            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === codAIrmao && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "sobrinho_neto") {
            p.codA = "A2";
            p.codB = 1;
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "A2" && (parseInt(item.codB, 10) || 0) === 1)
                .map(item => parseInt(item.codC, 10) || 0)
                .filter(n => n > 0);
            p.codC = proximoLivre(usados, 1);
        } else if (cat === "tio_pat") {
            // Tios/Tias Paternos: B2, B3...
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA && (parseInt(item.codB, 10) || 0) === 0)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.ramo === "B" && !v.isConjuge) ? v.numero : null;
                })
                .filter(n => n !== null);
            const prox = proximoLivre(usados, 2);
            p.codA = `B${prox}`;
            p.codB = 0;
            p.codC = 0;
        } else if (cat === "primo_pat") {
            p.codA = "B2";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "B2" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "tio_mat") {
            // Tios/Tias Maternos: C2, C3...
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA && (parseInt(item.codB, 10) || 0) === 0)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.ramo === "C" && !v.isConjuge) ? v.numero : null;
                })
                .filter(n => n !== null);
            const prox = proximoLivre(usados, 2);
            p.codA = `C${prox}`;
            p.codB = 0;
            p.codC = 0;
        } else if (cat === "primo_mat") {
            p.codA = "C2";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "C2" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_pat") {
            p.codA = "B1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "B1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_mat") {
            p.codA = "C1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "C1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "tio_avo_pat") {
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA && (parseInt(item.codB, 10) || 0) === 0)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.ramo === "D" && !v.isConjuge) ? v.numero : null;
                })
                .filter(n => n !== null);
            const prox = proximoLivre(usados, 2);
            p.codA = `D${prox}`;
            p.codB = 0;
            p.codC = 0;
        } else if (cat === "tio_avo_mat") {
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA && (parseInt(item.codB, 10) || 0) === 0)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.ramo === "F" && !v.isConjuge) ? v.numero : null;
                })
                .filter(n => n !== null);
            const prox = proximoLivre(usados, 2);
            p.codA = `F${prox}`;
            p.codB = 0;
            p.codC = 0;
        } else if (cat === "primo_mae_mat") {
            p.codA = "F2";
            p.codB = 1;
            p.codC = 0;
        } else if (cat === "bisneto") {
            p.codA = "A1";
            p.codB = 0;
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "A1" && (parseInt(item.codB, 10) || 0) === 0)
                .map(item => parseInt(item.codC, 10) || 0)
                .filter(n => n > 0);
            p.codC = proximoLivre(usados, 1);
        } else if (cat === "meio_tio_avo_pat" || cat === "meio_tio_pat") {
            p.codA = "D1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "D1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_tio_avoa_pat") {
            p.codA = "E1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "E1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_tio_avo_mat" || cat === "meio_tio_mat") {
            p.codA = "F1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "F1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_tio_avoa_mat") {
            p.codA = "G1";
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "G1" && (parseInt(item.codC, 10) || 0) === 0)
                .map(item => parseInt(item.codB, 10) || 0)
                .filter(n => n > 0);
            p.codB = proximoLivre(usados, 1);
            p.codC = 0;
        } else if (cat === "meio_sobrinho" || cat === "meio_sobrinho_pat") {
            p.codA = "B1";
            p.codB = 1;
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "B1" && (parseInt(item.codB, 10) || 0) === 1)
                .map(item => parseInt(item.codC, 10) || 0)
                .filter(n => n > 0);
            p.codC = proximoLivre(usados, 1);
        } else if (cat === "meio_sobrinho_mat") {
            p.codA = "C1";
            p.codB = 1;
            const usados = this.parentes
                .filter((item, idx) => idx !== index && item.codA === "C1" && (parseInt(item.codB, 10) || 0) === 1)
                .map(item => parseInt(item.codC, 10) || 0)
                .filter(n => n > 0);
            p.codC = proximoLivre(usados, 1);
        } else if (cat === "conjuge") {
            // Encontra próximos índices livres para Z[n].A1
            const indicesUsados = this.parentes
                .filter((item, idx) => idx !== index && item.codA)
                .map(item => {
                    const v = validarCodigoCodA(item.codA);
                    return (v.valido && v.isConjuge && v.parceiro === "A1") ? v.indiceConjuge : null;
                })
                .filter(n => n !== null);
            const proxZ = proximoLivre(indicesUsados, 1);
            p.codA = `Z${proxZ}.A1`;
            p.codB = 0;
            p.codC = 0;
            const probando = this.parentes.find(item => item.codA === "A1" && (parseInt(item.codB, 10) || 0) === 0);
            if (probando && probando.sexo) {
                p.sexo = probando.sexo === "F" ? "M" : "F";
            }
        } else if (matchDict) {
            p.codA = matchDict.codA;
            p.codB = matchDict.codB;
            p.codC = matchDict.codC;
            if (matchDict.sexo) p.sexo = matchDict.sexo;
        }

        if (inCodA) {
            inCodA.value = p.codA;
            inCodA.classList.remove("is-invalid");
            inCodA.classList.add("is-valid");
        }
        if (inCodB) inCodB.value = (p.codB !== null && p.codB !== undefined) ? p.codB : "0";
        if (inCodC) inCodC.value = (p.codC !== null && p.codC !== undefined) ? p.codC : "0";
    },

    aplicarDeducaoPorCodigo: function(index, inCodA, inParentesco, selSexo) {
        const p = this.parentes[index];
        if (!p) return;
        if ((p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) return;

        // Sugestão de sexo APENAS se estiver vazio
        if (!p.sexo || p.sexo === "") {
            const val = validarCodigoCodA(p.codA);
            if (val.valido) {
                const b = parseInt(p.codB, 10) || 0;
                if (val.isConjuge) {
                    const parceiroNode = this.parentes.find(item => item.codA === val.parceiro && (parseInt(item.codB, 10) || 0) === 0);
                    if (parceiroNode && parceiroNode.sexo) {
                        p.sexo = parceiroNode.sexo === "F" ? "M" : "F";
                        if (selSexo) selSexo.value = p.sexo;
                    }
                } else if (b === 0 && val.numero === 1) {
                    if (["C", "E", "G", "I", "K", "M", "O"].includes(val.ramo)) {
                        p.sexo = "F";
                        if (selSexo) selSexo.value = "F";
                    } else if (["B", "D", "F", "H", "J", "L", "N"].includes(val.ramo)) {
                        p.sexo = "M";
                        if (selSexo) selSexo.value = "M";
                    }
                }
            }
        }

        const parentescoSugerido = deduzirParentescoPorCodigo(p.codA, p.codB, p.codC, p.sexo);
        p.parentesco = parentescoSugerido;
        if (inParentesco) inParentesco.value = parentescoSugerido || "";

        this.sincronizarHeredograma();
    },

    /**
     * Adicionar Árvore Nuclear Padrão (Pais e 4 Avós) em 1 Clique:
     * - Pai (B1, M, 1º grau)
     * - Mãe (C1, F, 1º grau)
     * - Avô Paterno (D1, M, 2º grau)
     * - Avó Paterna (E1, F, 2º grau)
     * - Avô Materno (F1, M, 2º grau)
     * - Avó Materna (G1, F, 2º grau)
     * Não duplica familiares que já foram inseridos na tabela.
     */
    adicionarArvoreNuclear: function() {
        if (!Array.isArray(this.parentes)) {
            this.parentes = [];
        }

        const nuclearPadrao = [
            { codA: "B1", codB: 0, codC: 0, parentesco: "Pai", sexo: "M", estadoVital: "Vivo" },
            { codA: "C1", codB: 0, codC: 0, parentesco: "Mãe", sexo: "F", estadoVital: "Vivo" },
            { codA: "D1", codB: 0, codC: 0, parentesco: "Avô Paterno", sexo: "M", estadoVital: "Vivo" },
            { codA: "E1", codB: 0, codC: 0, parentesco: "Avó Paterna", sexo: "F", estadoVital: "Vivo" },
            { codA: "F1", codB: 0, codC: 0, parentesco: "Avô Materno", sexo: "M", estadoVital: "Vivo" },
            { codA: "G1", codB: 0, codC: 0, parentesco: "Avó Materna", sexo: "F", estadoVital: "Vivo" }
        ];

        let adicionados = 0;
        nuclearPadrao.forEach(n => {
            const existe = this.parentes.some(p => {
                const codMatch = (p.codA || "").trim().toUpperCase() === n.codA;
                const parentescoMatch = (p.parentesco || "").trim().toLowerCase() === n.parentesco.toLowerCase();
                return codMatch || parentescoMatch;
            });

            if (!existe) {
                this.parentes.push({
                    codA: n.codA,
                    codB: n.codB,
                    codC: n.codC,
                    parentesco: n.parentesco,
                    sexo: n.sexo,
                    idade: null,
                    anoNasc: null,
                    estadoVital: n.estadoVital,
                    idadeMorte: null,
                    history_code: "1",
                    diags: [{
                        codigo: "SEM_HIST",
                        tumor: "Sem histórico",
                        idade: null,
                        outro: ""
                    }]
                });
                adicionados++;
            }
        });

        if (adicionados > 0) {
            this.renderizarTabela();
            this.sincronizarHeredograma();
            if (window.FormularioClinico && typeof FormularioClinico.mostrarToast === 'function') {
                FormularioClinico.mostrarToast(`✓ ${adicionados} familiar(es) da árvore nuclear adicionados!`);
            }
        } else {
            if (window.FormularioClinico && typeof FormularioClinico.mostrarToast === 'function') {
                FormularioClinico.mostrarToast('ℹ Todos os 6 familiares da árvore nuclear já constam na tabela.');
            }
        }
    },

    /**
     * Adicionar Novo Parente:
     * Todos os campos vêm vazios/null, exceto Estado Vital que vem como "Vivo"
     */
    adicionarParente: function() {
        if (!Array.isArray(this.parentes)) {
            this.parentes = [];
        }

        const novo = {
            codA: "",
            codB: "",
            codC: "",
            parentesco: "",
            sexo: "",
            idade: null,
            anoNasc: null,
            estadoVital: "Vivo",
            idadeMorte: null,
            history_code: "1",
            diags: [{
                codigo: "SEM_HIST",
                tumor: "Sem histórico",
                idade: null,
                outro: ""
            }]
        };

        this.parentes.push(novo);
        this.renderizarTabela();
        this.sincronizarHeredograma();

        const wrapper = document.querySelector(".table-wrapper");
        if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;

        // Foca automaticamente no campo codA do novo parente adicionado para digitação imediata
        setTimeout(() => {
            const tbody = document.getElementById("tbody-parentes");
            if (tbody) {
                const rows = tbody.querySelectorAll("tr");
                if (rows.length > 0) {
                    const lastRow = rows[rows.length - 1];
                    const firstInput = lastRow.querySelector("input.table-input-code");
                    if (firstInput) firstInput.focus();
                }
            }
        }, 50);
    },

    /**
     * Remover Parente com Compactação Sequencial Automática:
     * Exemplo: Ao remover A2, A3 vira A2, A4 vira A3, etc.
     */
    removerParente: function(index) {
        const p = this.parentes[index];
        if (p.codA === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) {
            alert("O Probando (A1) é o caso índice de referência obrigatório e não pode ser excluído.");
            return;
        }

        const codARemovido = p.codA || "";
        const bRemovido = (p.codB !== "" && p.codB !== null) ? parseInt(p.codB, 10) : 0;
        const cRemovido = (p.codC !== "" && p.codC !== null) ? parseInt(p.codC, 10) : 0;
        const valRemovido = validarCodigoCodA(codARemovido);

        // Remove da lista
        this.parentes.splice(index, 1);

        // 1. Compactação de fratria de codA (onde b === 0 e c === 0)
        if (valRemovido.valido && !valRemovido.isConjuge && bRemovido === 0 && cRemovido === 0) {
            const ramo = valRemovido.ramo;
            const numRemovido = valRemovido.numero;

            this.parentes.forEach(item => {
                const valItem = validarCodigoCodA(item.codA);
                const ib = parseInt(item.codB, 10) || 0;
                const ic = parseInt(item.codC, 10) || 0;

                if (valItem.valido && valItem.ramo === ramo && !valItem.isConjuge && ib === 0 && ic === 0) {
                    if (valItem.numero > numRemovido) {
                        const novoNum = valItem.numero - 1;
                        item.codA = `${ramo}${novoNum}`;
                        item.parentesco = deduzirParentescoPorCodigo(item.codA, item.codB, item.codC, item.sexo);
                    }
                }
            });
        }

        // 2. Compactação de descendência de codB (onde c === 0 e b > bRemovido)
        if (bRemovido > 0 && cRemovido === 0) {
            this.parentes.forEach(item => {
                const ic = parseInt(item.codC, 10) || 0;
                const ib = parseInt(item.codB, 10) || 0;
                if ((item.codA || "").trim().toUpperCase() === codARemovido.trim().toUpperCase() && ic === 0 && ib > bRemovido) {
                    item.codB = ib - 1;
                    item.parentesco = deduzirParentescoPorCodigo(item.codA, item.codB, item.codC, item.sexo);
                }
            });
        }

        // 3. Compactação de cônjuges do mesmo parceiro (onde isConjuge e parceiro === valRemovido.parceiro)
        if (valRemovido.valido && valRemovido.isConjuge && valRemovido.indiceConjuge) {
            const parceiroRemovido = valRemovido.parceiro;
            const idxRemovido = valRemovido.indiceConjuge;
            this.parentes.forEach(item => {
                const valItem = validarCodigoCodA(item.codA);
                if (valItem.valido && valItem.isConjuge && valItem.parceiro === parceiroRemovido) {
                    if (valItem.indiceConjuge > idxRemovido) {
                        const novoIdx = valItem.indiceConjuge - 1;
                        item.codA = `Z${novoIdx}.${parceiroRemovido}`;
                        item.parentesco = deduzirParentescoPorCodigo(item.codA, item.codB, item.codC, item.sexo);
                    }
                }
            });
        }

        // 4. Compactação de descendência de codC (onde c > cRemovido para o mesmo codA e codB)
        if (cRemovido > 0) {
            this.parentes.forEach(item => {
                const ic = parseInt(item.codC, 10) || 0;
                const ib = parseInt(item.codB, 10) || 0;
                if ((item.codA || "").trim().toUpperCase() === codARemovido.trim().toUpperCase() && ib === bRemovido && ic > cRemovido) {
                    item.codC = ic - 1;
                    item.parentesco = deduzirParentescoPorCodigo(item.codA, item.codB, item.codC, item.sexo);
                }
            });
        }

        this.renderizarTabela();
        this.sincronizarHeredograma();
    },

    abrirModalDiagnosticos: function(index) {
        const p = this.parentes[index];
        if (p && (p.codA || "").toUpperCase().trim() === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) {
            if (window.FormularioClinico && typeof window.FormularioClinico.trocarAba === "function") {
                window.FormularioClinico.trocarAba("tab-historia-pessoal");
                const container = document.getElementById("container-tumores-probando") || document.getElementById("field-primario-1");
                if (container) {
                    container.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
            return;
        }

        this.parenteEditandoIndex = index;
        const modal = document.getElementById("modal-diagnosticos");
        const modalTitle = document.getElementById("modal-diagnosticos-title") || document.getElementById("modal-diagnosticos-titulo");
        const modalDesc = document.getElementById("modal-diagnosticos-desc");

        const sexoParente = (p.sexo || "").toUpperCase().trim();
        const sexoRotulo = sexoParente === "F" ? "Feminino" : (sexoParente === "M" ? "Masculino" : "Sexo Indeterminado");

        if (modalTitle) {
            const rotulo = p.parentesco || p.codA || "Familiar";
            modalTitle.textContent = `Diagnósticos Oncológicos • ${rotulo} (${sexoRotulo})`;
        }

        if (modalDesc) {
            if (sexoParente === "F") {
                modalDesc.textContent = "Catálogo oficial do REDCap para familiares do sexo feminino:";
            } else if (sexoParente === "M") {
                modalDesc.textContent = "Catálogo oficial do REDCap para familiares do sexo masculino:";
            } else {
                modalDesc.textContent = "Catálogo oficial do REDCap para familiares (defina o sexo na tabela para filtrar especificamente):";
            }
        }

        const listContainer = document.getElementById("modal-tumores-list");
        if (listContainer) {
            listContainer.innerHTML = "";
            const diags = p.diags || [];
            if (diags.length === 0) {
                if (String(p.history_code) === '0') {
                    this.adicionarLinhaTumorModal("Histórico desconhecido", "", "", "HIST_DESC");
                } else if (String(p.history_code) === '1') {
                    this.adicionarLinhaTumorModal("Sem histórico", "", "", "SEM_HIST");
                } else {
                    this.adicionarLinhaTumorModal("Sem histórico", "", "", "SEM_HIST");
                }
            } else {
                diags.forEach(d => this.adicionarLinhaTumorModal(d.tumor, d.idade, d.outro, d.codigo));
            }
        }

        if (modal) modal.classList.add("active");
    },

    fecharModalDiagnosticos: function() {
        const modal = document.getElementById("modal-diagnosticos");
        if (modal) modal.classList.remove("active");
        this.parenteEditandoIndex = null;
    },

    /**
     * Catálogo oficial REDCap de apresentações oncológicas para familiares do sexo feminino
     */
    LISTA_TUMORES_REDCAP_FEMININO: [
        { code: "HIST_DESC", label: "Histórico desconhecido", en: "Don't know", isStatus: true, historyCode: "0" },
        { code: "SEM_HIST",  label: "Sem histórico",           en: "None listed", isStatus: true, historyCode: "1" },
        { code: "0", label: "Câncer de Endométrio", en: "Endometrial cancer" },
        { code: "1", label: "Câncer de Pulmão", en: "Lung cancer" },
        { code: "2", label: "Melanoma", en: "Melanoma" },
        { code: "4", label: "Câncer de Rim", en: "Kidney cancer" },
        { code: "5", label: "Câncer de Mama", en: "Breast cancer" },
        { code: "6", label: "Câncer de Ovário", en: "Ovarian cancer" },
        { code: "7", label: "Câncer de Cólon", en: "Colon cancer" },
        { code: "8", label: "Câncer de Pâncreas", en: "Pancreatic cancer" },
        { code: "9", label: "Linfoma ou Leucemia", en: "Lymphoma or leukemia" },
        { code: "10", label: "Outro câncer", en: "Other cancer" },
        { code: "11", label: "Diagnóstico de Síndrome de Cowden", en: "Cowden Syndrome Diagnosis" },
        { code: "12", label: "Diagnóstico de Síndrome de Bannayan-Riley-Ruvalcaba", en: "Bannayan-Riley-Ruvalcaba Syndrome Diagnosis" },
        { code: "13", label: "Câncer Epitelial de Peritônio/Tuba Uterina Confirmado", en: "Epithelial Peritoneal/Fallopian Tube Cancer Confirmed" },
        { code: "14", label: "Osteossarcoma", en: "Osteosarcoma" },
        { code: "15", label: "Sarcoma de Partes Moles", en: "Soft Tissue Sarcoma" },
        { code: "16", label: "Tumor de SNC (Sistema Nervoso Central)", en: "CNS Tumor" },
        { code: "17", label: "Carcinoma Adrenocortical", en: "Adrenocortical Carcinoma" },
        { code: "18", label: "Câncer Gástrico", en: "Gastric Cancer" },
        { code: "19", label: "Diagnóstico de Síndrome de Polipose Juvenil", en: "Juvenile Polyposis Syndrome Diagnosis" },
        { code: "20", label: "Diagnóstico de Síndrome de Peutz-Jeghers", en: "Peutz-Jeghers Syndrome Diagnosis" },
        { code: "21", label: "Diagnóstico de Síndrome de von Hippel-Lindau (VHL)", en: "VHL Syndrome Diagnosis" },
        { code: "22", label: "Câncer de Intestino Delgado", en: "Small Bowel Cancer" },
        { code: "23", label: "Carcinoma Urotelial", en: "Urothelial Carcinoma" },
        { code: "24", label: "Carcinoma / Adenoma Sebáceo", en: "Sebaceous Carcinoma/Adenoma" },
        { code: "25", label: "Câncer de Vias Biliares", en: "Biliary Tract Cancer" },
        { code: "26", label: "Queratoacantoma", en: "Keratocanthoma" }
    ],

    /**
     * Catálogo oficial REDCap de apresentações oncológicas para familiares do sexo masculino
     */
    LISTA_TUMORES_REDCAP_MASCULINO: [
        { code: "HIST_DESC", label: "Histórico desconhecido", en: "Don't know", isStatus: true, historyCode: "0" },
        { code: "SEM_HIST",  label: "Sem histórico",           en: "None listed", isStatus: true, historyCode: "1" },
        { code: "1", label: "Câncer de Pulmão", en: "Lung cancer" },
        { code: "2", label: "Melanoma", en: "Melanoma" },
        { code: "4", label: "Câncer de Rim", en: "Kidney cancer" },
        { code: "5", label: "Câncer de Mama", en: "Breast cancer" },
        { code: "6", label: "Câncer de Próstata", en: "Prostate cancer" },
        { code: "7", label: "Câncer de Cólon", en: "Colon cancer" },
        { code: "8", label: "Câncer de Pâncreas", en: "Pancreatic cancer" },
        { code: "9", label: "Linfoma ou Leucemia", en: "Lymphoma or leukemia" },
        { code: "10", label: "Outro câncer", en: "Other cancer" },
        { code: "11", label: "Diagnóstico de Síndrome de Cowden", en: "Cowden Syndrome Diagnosis" },
        { code: "12", label: "Diagnóstico de Síndrome de Bannayan-Riley-Ruvalcaba", en: "Bannayan-Riley-Ruvalcaba Syndrome Diagnosis" },
        { code: "13", label: "Câncer Epitelial de Peritônio/Tuba Uterina Confirmado", en: "Epithelial Peritoneal/Fallopian Tube Cancer Confirmed" },
        { code: "14", label: "Osteossarcoma", en: "Osteosarcoma" },
        { code: "15", label: "Sarcoma de Partes Moles", en: "Soft Tissue Sarcoma" },
        { code: "16", label: "Tumor de SNC (Sistema Nervoso Central)", en: "CNS Tumor" },
        { code: "17", label: "Carcinoma Adrenocortical", en: "Adrenocortical Carcinoma" },
        { code: "18", label: "Câncer Gástrico", en: "Gastric Cancer" },
        { code: "19", label: "Diagnóstico de Síndrome de Polipose Juvenil", en: "Juvenile Polyposis Syndrome Diagnosis" },
        { code: "20", label: "Diagnóstico de Síndrome de Peutz-Jeghers", en: "Peutz-Jeghers Syndrome Diagnosis" },
        { code: "21", label: "Diagnóstico de Síndrome de von Hippel-Lindau (VHL)", en: "VHL Syndrome Diagnosis" },
        { code: "22", label: "Câncer de Intestino Delgado", en: "Small Bowel Cancer" },
        { code: "23", label: "Carcinoma Urotelial", en: "Urothelial Carcinoma" },
        { code: "24", label: "Carcinoma / Adenoma Sebáceo", en: "Sebaceous Carcinoma/Adenoma" },
        { code: "25", label: "Câncer de Vias Biliares", en: "Biliary Tract Cancer" },
        { code: "26", label: "Queratoacantoma", en: "Keratocanthoma" }
    ],

    obterListaTumoresParente: function(sexo) {
        const s = (sexo || "").toUpperCase().trim();
        if (s === "F") {
            return this.LISTA_TUMORES_REDCAP_FEMININO;
        } else if (s === "M") {
            return this.LISTA_TUMORES_REDCAP_MASCULINO;
        } else {
            return [
                { code: "HIST_DESC", label: "Histórico desconhecido", en: "Don't know", isStatus: true, historyCode: "0" },
                { code: "SEM_HIST",  label: "Sem histórico",           en: "None listed", isStatus: true, historyCode: "1" },
                { code: "0", label: "Câncer de Endométrio", en: "Endometrial cancer" },
                { code: "1", label: "Câncer de Pulmão", en: "Lung cancer" },
                { code: "2", label: "Melanoma", en: "Melanoma" },
                { code: "4", label: "Câncer de Rim", en: "Kidney cancer" },
                { code: "5", label: "Câncer de Mama", en: "Breast cancer" },
                { code: "6", label: "Câncer de Ovário", en: "Ovarian cancer" },
                { code: "6", label: "Câncer de Próstata", en: "Prostate cancer" },
                { code: "7", label: "Câncer de Cólon", en: "Colon cancer" },
                { code: "8", label: "Câncer de Pâncreas", en: "Pancreatic cancer" },
                { code: "9", label: "Linfoma ou Leucemia", en: "Lymphoma or leukemia" },
                { code: "10", label: "Outro câncer", en: "Other cancer" },
                { code: "11", label: "Diagnóstico de Síndrome de Cowden", en: "Cowden Syndrome Diagnosis" },
                { code: "12", label: "Diagnóstico de Síndrome de Bannayan-Riley-Ruvalcaba", en: "Bannayan-Riley-Ruvalcaba Syndrome Diagnosis" },
                { code: "13", label: "Câncer Epitelial de Peritônio/Tuba Uterina Confirmado", en: "Epithelial Peritoneal/Fallopian Tube Cancer Confirmed" },
                { code: "14", label: "Osteossarcoma", en: "Osteosarcoma" },
                { code: "15", label: "Sarcoma de Partes Moles", en: "Soft Tissue Sarcoma" },
                { code: "16", label: "Tumor de SNC (Sistema Nervoso Central)", en: "CNS Tumor" },
                { code: "17", label: "Carcinoma Adrenocortical", en: "Adrenocortical Carcinoma" },
                { code: "18", label: "Câncer Gástrico", en: "Gastric Cancer" },
                { code: "19", label: "Diagnóstico de Síndrome de Polipose Juvenil", en: "Juvenile Polyposis Syndrome Diagnosis" },
                { code: "20", label: "Diagnóstico de Síndrome de Peutz-Jeghers", en: "Peutz-Jeghers Syndrome Diagnosis" },
                { code: "21", label: "Diagnóstico de Síndrome de von Hippel-Lindau (VHL)", en: "VHL Syndrome Diagnosis" },
                { code: "22", label: "Câncer de Intestino Delgado", en: "Small Bowel Cancer" },
                { code: "23", label: "Carcinoma Urotelial", en: "Urothelial Carcinoma" },
                { code: "24", label: "Carcinoma / Adenoma Sebáceo", en: "Sebaceous Carcinoma/Adenoma" },
                { code: "25", label: "Câncer de Vias Biliares", en: "Biliary Tract Cancer" },
                { code: "26", label: "Queratoacantoma", en: "Keratocanthoma" }
            ];
        }
    },

    isHistoricoDesconhecido: function(val) {
        if (!val) return false;
        const s = String(val).trim().toLowerCase();
        return s === "hist_desc" || s === "0_desc" || s === "0" || s === "histórico desconhecido" || s === "historico desconhecido" || s === "don't know" || s === "dont know" || s === "desconhecido";
    },

    isSemHistorico: function(val) {
        if (!val) return false;
        const s = String(val).trim().toLowerCase();
        return s === "sem_hist" || s === "1_none" || s === "1" || s === "sem histórico" || s === "sem historico" || s === "none listed" || s === "sem neoplasias relatadas";
    },

    isStatusDiagnostico: function(val) {
        return this.isHistoricoDesconhecido(val) || this.isSemHistorico(val);
    },

    isDiagnosticoOutro: function(val) {
        if (!val) return false;
        const raw = String(val).trim();
        if (raw === "10" || raw === "39") return true;
        const s = raw.replace(/^\d+,\s*/, "").toLowerCase().trim();
        return s === "outros" || s === "outro" || s === "outro câncer" || s === "outro cancer" ||
               s.startsWith("outro ") || s.startsWith("outros ") ||
               s.startsWith("outro:") || s.startsWith("outros:") ||
               s.startsWith("outro (") || s.startsWith("outros (");
    },

    adicionarLinhaTumorModal: function(tumorPadrao = "Câncer de Mama", idadePadrao = "", outroPadrao = "", codigoPadrao = "") {
        const container = document.getElementById("modal-tumores-list");
        if (!container) return;

        const parenteAtual = (this.parenteEditandoIndex !== null && this.parentes[this.parenteEditandoIndex])
            ? this.parentes[this.parenteEditandoIndex]
            : null;
        const sexoParente = parenteAtual ? parenteAtual.sexo : "";
        const listaOpcoes = this.obterListaTumoresParente(sexoParente);

        let tumorSel = tumorPadrao;
        let textoOutro = outroPadrao || "";
        if (!textoOutro && typeof tumorPadrao === "string") {
            const m1 = tumorPadrao.match(/^outros?:\s*(.+)$/i);
            const m2 = tumorPadrao.match(/^outros?\s*\((.+)\)$/i);
            const m3 = tumorPadrao.match(/^outro câncer:\s*(.+)$/i);
            const m4 = tumorPadrao.match(/^outro cancer:\s*(.+)$/i);
            if (m1) {
                tumorSel = "Outro câncer";
                textoOutro = m1[1].trim();
            } else if (m2) {
                tumorSel = "Outro câncer";
                textoOutro = m2[1].trim();
            } else if (m3) {
                tumorSel = "Outro câncer";
                textoOutro = m3[1].trim();
            } else if (m4) {
                tumorSel = "Outro câncer";
                textoOutro = m4[1].trim();
            }
        }

        const row = document.createElement("div");
        row.className = "tumor-entry-row";

        const mainInputs = document.createElement("div");
        mainInputs.className = "tumor-entry-main-inputs";

        const sel = document.createElement("select");
        sel.className = "table-select";

        let encontrouMatch = false;
        const normalizarStr = s => (s || "").replace(/^\d+,\s*/, "").trim().toLowerCase();

        listaOpcoes.forEach(item => {
            const opt = document.createElement("option");
            opt.value = item.label;
            opt.dataset.code = item.code;
            opt.textContent = item.isStatus ? item.label : `${item.code}, ${item.label}`;

            const matchPorCodigo = codigoPadrao && String(codigoPadrao) === String(item.code);
            const matchPorTexto = normalizarStr(item.label) === normalizarStr(tumorSel);
            const matchPorOutro = this.isDiagnosticoOutro(item.label) && this.isDiagnosticoOutro(tumorSel);
            const matchPorEn = item.en && normalizarStr(item.en) === normalizarStr(tumorSel);
            const matchPorStatus = (this.isHistoricoDesconhecido(item.code) && (this.isHistoricoDesconhecido(tumorSel) || this.isHistoricoDesconhecido(codigoPadrao))) ||
                                   (this.isSemHistorico(item.code) && (this.isSemHistorico(tumorSel) || this.isSemHistorico(codigoPadrao)));

            if (!encontrouMatch && (matchPorCodigo || matchPorTexto || matchPorOutro || matchPorEn || matchPorStatus)) {
                opt.selected = true;
                encontrouMatch = true;
            }
            sel.appendChild(opt);
        });

        // Caso tumorSel não estivesse na lista (ex: diagnóstico antigo ou customizado)
        if (!encontrouMatch && tumorSel && !this.isDiagnosticoOutro(tumorSel) && !this.isStatusDiagnostico(tumorSel)) {
            const optCustom = document.createElement("option");
            optCustom.value = tumorSel;
            optCustom.textContent = tumorSel;
            optCustom.selected = true;
            sel.appendChild(optCustom);
        }

        const inIdade = document.createElement("input");
        inIdade.type = "number";
        inIdade.className = "table-input-number";
        inIdade.placeholder = "Idade ao Dx";
        inIdade.style.width = "105px";
        inIdade.style.textAlign = "center";
        inIdade.min = "0";
        inIdade.max = "120";
        inIdade.value = (idadePadrao !== null && idadePadrao !== undefined && !this.isStatusDiagnostico(tumorSel)) ? idadePadrao : "";

        const btnRem = document.createElement("button");
        btnRem.type = "button";
        btnRem.className = "btn btn-danger btn-sm";
        btnRem.title = "Remover este diagnóstico";
        btnRem.textContent = "✕";
        btnRem.addEventListener("click", () => row.remove());

        mainInputs.appendChild(sel);
        if (window.SearchableSelect && typeof window.SearchableSelect.enhance === "function") {
            window.SearchableSelect.enhance(sel);
        }
        mainInputs.appendChild(inIdade);
        mainInputs.appendChild(btnRem);

        // Container e Campo de especificação "Outros"
        const outroWrap = document.createElement("div");
        outroWrap.className = "tumor-entry-outro-wrap";

        const inOutro = document.createElement("input");
        inOutro.type = "text";
        inOutro.className = "table-input-outro";
        inOutro.placeholder = "Qual diagnóstico? Especifique o tumor/lesão do familiar...";
        inOutro.value = textoOutro;

        outroWrap.appendChild(inOutro);

        const atualizarVisibilidadeCampos = (animarFoco = false) => {
            const isStatus = this.isStatusDiagnostico(sel.value);
            const isOutro = this.isDiagnosticoOutro(sel.value);

            if (isStatus) {
                inIdade.style.display = "none";
                inIdade.value = "";
                outroWrap.style.display = "none";
            } else {
                inIdade.style.display = "";
                if (isOutro) {
                    outroWrap.style.display = "block";
                    if (animarFoco) {
                        setTimeout(() => inOutro.focus(), 60);
                    }
                } else {
                    outroWrap.style.display = "none";
                }
            }
        };

        sel.addEventListener("change", () => atualizarVisibilidadeCampos(true));

        row.appendChild(mainInputs);
        row.appendChild(outroWrap);
        container.appendChild(row);

        atualizarVisibilidadeCampos(false);
    },

    salvarDiagnosticosModal: function() {
        if (this.parenteEditandoIndex === null) return;
        const p = this.parentes[this.parenteEditandoIndex];
        const container = document.getElementById("modal-tumores-list");
        const rows = container.querySelectorAll(".tumor-entry-row");

        const cancerDiags = [];
        let statusDiag = null;

        rows.forEach(r => {
            const sel = r.querySelector("select");
            const inIdade = r.querySelector(".table-input-number, input[type='number']");
            const inOutro = r.querySelector(".table-input-outro");
            if (sel && sel.value) {
                const optSel = sel.selectedOptions && sel.selectedOptions[0];
                const codigo = optSel ? (optSel.dataset.code || "") : "";

                if (this.isHistoricoDesconhecido(sel.value) || this.isHistoricoDesconhecido(codigo)) {
                    statusDiag = {
                        codigo: "HIST_DESC",
                        tumor: "Histórico desconhecido",
                        idade: null,
                        outro: ""
                    };
                } else if (this.isSemHistorico(sel.value) || this.isSemHistorico(codigo)) {
                    statusDiag = {
                        codigo: "SEM_HIST",
                        tumor: "Sem histórico",
                        idade: null,
                        outro: ""
                    };
                } else {
                    const diag = {
                        codigo: codigo,
                        tumor: sel.value,
                        idade: (inIdade && inIdade.value !== "") ? parseInt(inIdade.value, 10) : null
                    };
                    if (this.isDiagnosticoOutro(sel.value)) {
                        diag.outro = inOutro && inOutro.value ? inOutro.value.trim() : "";
                    }
                    cancerDiags.push(diag);
                }
            }
        });

        // Se houver diagnósticos oncológicos reais, eles têm prioridade
        if (cancerDiags.length > 0) {
            p.diags = cancerDiags;
            p.history_code = '2';
        } else if (statusDiag) {
            p.diags = [statusDiag];
            p.history_code = statusDiag.codigo === 'HIST_DESC' ? '0' : '1';
        } else {
            p.diags = [];
            p.history_code = '1';
        }

        this.fecharModalDiagnosticos();
        this.renderizarTabela();
        this.sincronizarHeredograma();
    },

    exportarJSON: function() {
        const payload = {
            versao: "1.2",
            criadoEm: new Date().toISOString(),
            dataAtendimento: document.getElementById("input-data-atendimento") ? document.getElementById("input-data-atendimento").value : new Date().toISOString().slice(0, 10),
            fonte: "AGC Analytics — Formulário de Atendimento Clínico (FMRP-USP)",
            parentes: this.parentes
        };

        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "historia_familiar_tabela.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importarJSON: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const dados = JSON.parse(e.target.result);
                if (dados && Array.isArray(dados.parentes)) {
                    this.parentes = dados.parentes;
                    if (dados.dataAtendimento) {
                        const inputData = document.getElementById("input-data-atendimento");
                        if (inputData) {
                            inputData.value = window.AGCDateInput ? window.AGCDateInput.formatToBr(dados.dataAtendimento) : dados.dataAtendimento;
                        }
                    }
                    this.renderizarTabela();
                    this.sincronizarHeredograma();
                    alert("Tabela de história familiar importada com sucesso!");
                } else {
                    alert("Formato de arquivo JSON inválido. O arquivo deve conter uma lista de parentes.");
                }
            } catch (err) {
                alert("Erro ao processar arquivo JSON: " + err.message);
            }
            event.target.value = "";
        };
        reader.readAsText(file);
    },

    limparTabela: function() {
        if (confirm("Deseja limpar toda a tabela de parentes e reiniciar apenas com o probando?")) {
            this.inicializarProbandoPadrao();
            this.renderizarTabela();
            this.sincronizarHeredograma();
        }
    }
};

window.TabelaParentes = TabelaParentes;
window.ParentescoCombobox = ParentescoCombobox;
