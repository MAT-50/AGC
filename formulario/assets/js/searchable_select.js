/**
 * AGC Analytics — Universal Searchable Select Combobox
 * Ambulatório de Aconselhamento Genético do Câncer (AGC) — FMRP-USP
 * 
 * Transforma qualquer elemento <select> da interface clínica em um combobox pesquisável e moderno,
 * reproduzindo fielmente o comportamento ágil e elegante do campo Parentesco:
 * - Digitação livre no campo com filtro instantâneo (insensível a caixa e acentuação)
 * - Destaque visual dos termos coincidentes (<mark class="combobox-highlight">)
 * - Menu flutuante singleton (anexado ao body com z-index 999999, imune a overflow de cards e tabelas)
 * - Reposicionamento inteligente (abre para cima se não houver espaço vertical suficiente abaixo)
 * - Navegação completa por teclado (ArrowUp, ArrowDown, Enter, Escape, Tab)
 * - Interceptação transparente de propriedades (value, selectedIndex) para sincronizar com código externo
 * - Disparo automático dos eventos 'input' e 'change' no <select> nativo para branching logic, CDSS e autosave
 * - Sincronização reativa de desabilitação (disabled), estilos customizados e opções dinâmicas
 */

(function(window) {
    'use strict';

    function normalizarTexto(texto) {
        return (texto || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const SearchableSelect = {
        menuEl: null,
        activeInput: null,
        activeWrapper: null,
        activeSelect: null,
        highlightedIndex: -1,
        filteredItems: [],
        mutationObserver: null,

        initMenu: function() {
            if (this.menuEl) return;

            this.menuEl = document.createElement("div");
            this.menuEl.id = "searchable-select-floating-menu";
            this.menuEl.className = "searchable-select-floating-menu";

            Object.assign(this.menuEl.style, {
                position: "fixed",
                zIndex: "999999",
                display: "none",
                maxHeight: "250px",
                overflowY: "auto",
                padding: "4px 0",
                borderRadius: "8px",
                boxShadow: "0 12px 28px -4px rgba(0, 0, 0, 0.25), 0 8px 12px -6px rgba(0, 0, 0, 0.2)",
                background: "var(--bg-card-solid, #ffffff)",
                border: "1px solid var(--border-color, #cbd5e1)",
                color: "var(--text-main, #0f172a)",
                fontFamily: "var(--font-secondary, sans-serif)",
                fontSize: "12px",
                backdropFilter: "var(--card-blur, blur(8px))"
            });

            document.body.appendChild(this.menuEl);

            // Fecha ao clicar fora
            document.addEventListener("mousedown", (e) => {
                if (!this.menuEl || this.menuEl.style.display === "none") return;
                if (this.menuEl.contains(e.target)) return;
                if (this.activeWrapper && this.activeWrapper.contains(e.target)) return;
                this.fechar();
            });

            // Reposiciona em eventos de scroll e redimensionamento da janela
            window.addEventListener("scroll", () => this.reposicionar(), { passive: true });
            window.addEventListener("resize", () => this.reposicionar(), { passive: true });
            document.querySelectorAll(".table-wrapper, .modal-body, .form-tab-pane").forEach(el => {
                el.addEventListener("scroll", () => this.reposicionar(), { passive: true });
            });
        },

        destacarTermo: function(label, query) {
            if (!query || !query.trim()) return escapeHTML(label);
            const normLabel = normalizarTexto(label);
            const normQuery = normalizarTexto(query);
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

        obterOpcoes: function(selectEl) {
            if (!selectEl) return [];
            const items = [];
            for (let i = 0; i < selectEl.options.length; i++) {
                const opt = selectEl.options[i];
                items.push({
                    index: i,
                    value: opt.value,
                    label: opt.textContent.trim(),
                    code: opt.dataset.code || (opt.value !== '' ? opt.value : ''),
                    disabled: opt.disabled,
                    isPlaceholder: opt.value === ''
                });
            }
            return items;
        },

        obterItemPorTexto: function(selectEl, texto) {
            if (!selectEl || texto === undefined || texto === null) return null;
            const norm = normalizarTexto(texto);
            if (!norm) return null;
            const items = this.obterOpcoes(selectEl);
            
            // 1. Match exato com a label da opção
            const matchLabel = items.find(item => normalizarTexto(item.label) === norm);
            if (matchLabel) return matchLabel;

            // 2. Match exato com código/valor (ex: "16" para Mama, "31" para RCC)
            const matchCode = items.find(item => normalizarTexto(item.code) === norm || String(item.value) === String(texto).trim());
            if (matchCode) return matchCode;

            // 3. Match com label sem prefixo numérico (ex: "1, Branca" digitado como "branca")
            const normSemNum = norm.replace(/^\d+[\s,.\-_]+/, "");
            if (normSemNum) {
                const matchSemNum = items.find(item => {
                    const lSem = normalizarTexto(item.label).replace(/^\d+[\s,.\-_]+/, "");
                    return lSem === normSemNum;
                });
                if (matchSemNum) return matchSemNum;
            }

            return null;
        },

        abrir: function(wrapper, input, selectEl, query = null) {
            this.initMenu();
            if (selectEl.disabled) return;

            if (this.activeWrapper && this.activeWrapper !== wrapper) {
                this.activeWrapper.classList.remove("is-open");
            }

            this.activeWrapper = wrapper;
            this.activeInput = input;
            this.activeSelect = selectEl;
            this.highlightedIndex = -1;

            if (wrapper) wrapper.classList.add("is-open");

            this.filtrar(query !== null ? query : "");
            this.menuEl.classList.add("is-active");
            this.menuEl.style.display = "block";
            this.reposicionar();
        },

        fechar: function() {
            if (this.menuEl) {
                this.menuEl.classList.remove("is-active");
                this.menuEl.style.display = "none";
            }
            if (this.activeWrapper) {
                this.activeWrapper.classList.remove("is-open");
            }

            // Ao fechar, valida o texto digitado
            if (this.activeInput && this.activeSelect) {
                const valDigitado = this.activeInput.value.trim();
                if (valDigitado === "") {
                    // Se o usuário limpou o texto
                    const emptyOpt = Array.from(this.activeSelect.options).find(o => o.value === "");
                    if (emptyOpt) {
                        if (this.activeSelect.value !== "") {
                            this.activeSelect.value = "";
                            this.activeSelect.dispatchEvent(new Event('input', { bubbles: true }));
                            this.activeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        this.activeInput.value = "";
                        this.activeInput.placeholder = emptyOpt.textContent.trim() || "Selecione...";
                    } else {
                        this.sincronizarDisplay(this.activeSelect, this.activeInput);
                    }
                } else {
                    const match = this.obterItemPorTexto(this.activeSelect, valDigitado);
                    if (match) {
                        if (this.activeSelect.value !== match.value) {
                            this.activeSelect.value = match.value;
                            this.activeSelect.dispatchEvent(new Event('input', { bubbles: true }));
                            this.activeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        this.activeInput.value = match.value !== "" ? match.label : "";
                        if (match.value === "") {
                            this.activeInput.placeholder = match.label || "Selecione...";
                        }
                    } else {
                        // Reverte texto inválido para o valor atualmente selecionado
                        this.sincronizarDisplay(this.activeSelect, this.activeInput);
                    }
                }
            }

            this.activeWrapper = null;
            this.activeInput = null;
            this.activeSelect = null;
            this.highlightedIndex = -1;
        },

        reposicionar: function() {
            if (!this.menuEl || this.menuEl.style.display === "none" || !this.activeInput) return;

            const rect = this.activeInput.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
                this.fechar();
                return;
            }

            const menuHeight = Math.min(this.menuEl.scrollHeight || 220, 250);
            const espacoAbaixo = window.innerHeight - rect.bottom;
            const abrirParaCima = espacoAbaixo < menuHeight && rect.top > menuHeight;

            const top = abrirParaCima ? (rect.top - menuHeight - 4) : (rect.bottom + 4);
            const width = Math.max(rect.width, 240);
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

            this.menuEl.style.position = "fixed";
            this.menuEl.style.top = `${top}px`;
            this.menuEl.style.left = `${left}px`;
            this.menuEl.style.width = `${width}px`;
            this.menuEl.style.zIndex = "999999";
        },

        filtrar: function(query) {
            if (!this.menuEl || !this.activeSelect) return;
            const normQuery = normalizarTexto(query);
            const querySemHifen = normQuery.replace(/[-_]/g, " ");
            const allItems = this.obterOpcoes(this.activeSelect);

            if (!normQuery) {
                this.filteredItems = allItems;
            } else {
                this.filteredItems = allItems.filter(item => {
                    if (item.disabled) return false;
                    const normLabel = normalizarTexto(item.label);
                    const itemSemHifen = normLabel.replace(/[-_]/g, " ");
                    const matchCode = item.code && (
                        normalizarTexto(item.code).includes(normQuery) ||
                        normalizarTexto(item.code.replace(".", "")).includes(normQuery)
                    );
                    return normLabel.includes(normQuery) || itemSemHifen.includes(querySemHifen) || matchCode;
                });
            }

            this.renderizarOpcoes(query);
        },

        renderizarOpcoes: function(queryHighlight = "") {
            this.menuEl.innerHTML = "";

            if (this.filteredItems.length === 0) {
                const empty = document.createElement("div");
                empty.className = "searchable-select-menu-empty";
                empty.style.padding = "10px 14px";
                empty.style.color = "var(--text-muted, #64748b)";
                empty.style.fontStyle = "italic";
                empty.style.textAlign = "center";
                empty.textContent = "Nenhuma opção correspondente";
                this.menuEl.appendChild(empty);
                this.reposicionar();
                return;
            }

            const fragment = document.createDocumentFragment();
            const valorAtual = this.activeSelect ? String(this.activeSelect.value) : "";
            const limiteRender = 80;
            const itemsParaRenderizar = this.filteredItems.slice(0, limiteRender);

            itemsParaRenderizar.forEach((item, idx) => {
                const rowEl = document.createElement("div");
                rowEl.className = "searchable-select-menu-item";
                rowEl.style.display = "flex";
                rowEl.style.justifyContent = "space-between";
                rowEl.style.alignItems = "center";
                rowEl.style.padding = "7px 12px";
                rowEl.style.cursor = item.disabled ? "not-allowed" : "pointer";
                rowEl.style.opacity = item.disabled ? "0.5" : "1";
                rowEl.style.transition = "background 0.12s ease, color 0.12s ease";

                if (idx === this.highlightedIndex) {
                    rowEl.classList.add("is-highlighted");
                    rowEl.style.background = "rgba(14, 165, 233, 0.14)";
                    rowEl.style.color = "var(--accent, #0ea5e9)";
                }
                if (String(item.value) === valorAtual) {
                    rowEl.classList.add("is-selected");
                    rowEl.style.fontWeight = "700";
                    rowEl.style.background = "rgba(14, 165, 233, 0.2)";
                    rowEl.style.color = "var(--accent, #0ea5e9)";
                }

                const labelSpan = document.createElement("span");
                labelSpan.innerHTML = this.destacarTermo(item.label, queryHighlight);
                labelSpan.style.flex = "1 1 auto";
                labelSpan.style.overflow = "hidden";
                labelSpan.style.textOverflow = "ellipsis";
                labelSpan.style.whiteSpace = "nowrap";

                rowEl.appendChild(labelSpan);

                // Badge discreto com código caso útil e não redundante com a label
                if (item.code && !item.isPlaceholder && !item.label.startsWith(item.code + ',') && !item.label.startsWith(item.code + ' -') && !item.label.startsWith(item.code + ' ')) {
                    const badge = document.createElement("span");
                    badge.className = "searchable-select-code-badge";
                    badge.textContent = `[${item.code}]`;
                    badge.style.fontSize = "10px";
                    badge.style.fontFamily = "var(--font-mono, monospace)";
                    badge.style.color = "var(--text-muted, #64748b)";
                    badge.style.background = "rgba(100, 116, 139, 0.12)";
                    badge.style.padding = "1px 5px";
                    badge.style.borderRadius = "4px";
                    badge.style.flexShrink = "0";
                    badge.style.marginLeft = "6px";
                    rowEl.appendChild(badge);
                }

                if (!item.disabled) {
                    rowEl.addEventListener("mouseenter", () => {
                        rowEl.style.background = "rgba(14, 165, 233, 0.14)";
                        rowEl.style.color = "var(--accent, #0ea5e9)";
                    });
                    rowEl.addEventListener("mouseleave", () => {
                        if (idx !== this.highlightedIndex && String(item.value) !== valorAtual) {
                            rowEl.style.background = "transparent";
                            rowEl.style.color = "var(--text-main, #0f172a)";
                        }
                    });

                    rowEl.addEventListener("mousedown", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.selecionarItem(item);
                    });
                }

                fragment.appendChild(rowEl);
            });

            if (this.filteredItems.length > limiteRender) {
                const maisEl = document.createElement("div");
                maisEl.style.padding = "6px 12px";
                maisEl.style.fontSize = "11px";
                maisEl.style.color = "var(--text-muted, #64748b)";
                maisEl.style.textAlign = "center";
                maisEl.style.borderTop = "1px dashed var(--border-color, #cbd5e1)";
                maisEl.textContent = `+ ${this.filteredItems.length - limiteRender} opções adicionais. Continue digitando para filtrar...`;
                fragment.appendChild(maisEl);
            }

            this.menuEl.appendChild(fragment);

            const highlightedEl = this.menuEl.querySelector(".is-highlighted, .is-selected");
            if (highlightedEl) {
                highlightedEl.scrollIntoView({ block: "nearest" });
            }

            this.reposicionar();
        },

        selecionarItem: function(item) {
            if (!this.activeInput || !this.activeSelect || !item) return;

            const selectEl = this.activeSelect;
            const input = this.activeInput;

            selectEl.value = item.value;

            if (item.value === "") {
                input.value = "";
                input.placeholder = item.label || "Selecione...";
            } else {
                input.value = item.label;
            }

            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));

            this.fechar();
        },

        sincronizarDisplay: function(selectEl, input) {
            if (!selectEl || !input) return;
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            if (selectedOpt && selectedOpt.value !== "") {
                input.value = selectedOpt.textContent.trim();
            } else if (selectedOpt && selectedOpt.textContent.trim()) {
                input.value = "";
                input.placeholder = selectedOpt.textContent.trim();
            } else {
                input.value = "";
                input.placeholder = selectEl.getAttribute("placeholder") || "Selecione...";
            }
        },

        enhance: function(selectEl) {
            if (!selectEl || selectEl.dataset.searchableSelectInit === "1") return;
            if (selectEl.size > 1 || selectEl.multiple || selectEl.id === "select-paciente-redcap") return;
            if (selectEl.dataset.noSearchable === "true") return;

            selectEl.dataset.searchableSelectInit = "1";

            const wrapper = document.createElement("div");
            wrapper.className = "searchable-select-wrapper";
            
            // Copia estilos de dimensionamento e flexibilidade
            if (selectEl.style.width) wrapper.style.width = selectEl.style.width;
            if (selectEl.style.maxWidth) wrapper.style.maxWidth = selectEl.style.maxWidth;
            if (selectEl.style.minWidth) wrapper.style.minWidth = selectEl.style.minWidth;
            if (selectEl.style.flex) wrapper.style.flex = selectEl.style.flex;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "form-control searchable-select-input";
            input.autocomplete = "off";
            input.spellcheck = false;
            input.setAttribute("data-searchable-input", "true");

            if (selectEl.id) {
                input.id = "combobox-" + selectEl.id;
                input.setAttribute("data-target-select", selectEl.id);
            }
            if (selectEl.title) input.title = selectEl.title;
            if (selectEl.disabled) input.disabled = true;

            // Herda customizações inline de altura, peso ou cor se presentes
            if (selectEl.style.height) input.style.height = selectEl.style.height;
            if (selectEl.style.fontWeight) input.style.fontWeight = selectEl.style.fontWeight;
            if (selectEl.style.color) input.style.color = selectEl.style.color;

            const arrowBtn = document.createElement("button");
            arrowBtn.type = "button";
            arrowBtn.className = "searchable-select-arrow";
            arrowBtn.setAttribute("tabindex", "-1");
            arrowBtn.title = "Abrir opções";
            if (selectEl.disabled) arrowBtn.disabled = true;
            arrowBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;

            // Insere wrapper no DOM contendo o select oculto e os controles do combobox
            selectEl.parentNode.insertBefore(wrapper, selectEl);
            wrapper.appendChild(selectEl);
            wrapper.appendChild(input);
            wrapper.appendChild(arrowBtn);

            // Oculta o select nativo mas mantém ativo e no DOM para branching/CDSS/REDCap
            selectEl.style.display = "none";
            selectEl.setAttribute("aria-hidden", "true");
            selectEl.setAttribute("tabindex", "-1");

            // Sincroniza valor inicial
            this.sincronizarDisplay(selectEl, input);

            // Redireciona cliques em label para o input do combobox
            if (selectEl.id) {
                document.querySelectorAll(`label[for="${selectEl.id}"]`).forEach(lbl => {
                    lbl.addEventListener("click", (e) => {
                        e.preventDefault();
                        input.focus();
                    });
                });
            }

            // Intercepta alterações programáticas em .value e .selectedIndex no selectEl nativo
            const origValDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
            const origIdxDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

            if (origValDesc && origValDesc.set) {
                Object.defineProperty(selectEl, 'value', {
                    get: function() {
                        return origValDesc.get.call(this);
                    },
                    set: (newVal) => {
                        origValDesc.set.call(selectEl, newVal);
                        this.sincronizarDisplay(selectEl, input);
                    },
                    configurable: true
                });
            }

            if (origIdxDesc && origIdxDesc.set) {
                Object.defineProperty(selectEl, 'selectedIndex', {
                    get: function() {
                        return origIdxDesc.get.call(this);
                    },
                    set: (newIdx) => {
                        origIdxDesc.set.call(selectEl, newIdx);
                        this.sincronizarDisplay(selectEl, input);
                    },
                    configurable: true
                });
            }

            // Eventos nativos de change/input no selectEl
            selectEl.addEventListener('change', () => this.sincronizarDisplay(selectEl, input));
            selectEl.addEventListener('input', () => this.sincronizarDisplay(selectEl, input));

            if (selectEl.form) {
                selectEl.form.addEventListener('reset', () => {
                    setTimeout(() => this.sincronizarDisplay(selectEl, input), 10);
                });
            }

            // MutationObserver para observar apenas disabled do select nativo
            const obs = new MutationObserver(() => {
                if (input.disabled !== selectEl.disabled) {
                    input.disabled = selectEl.disabled;
                    arrowBtn.disabled = selectEl.disabled;
                }
                this.sincronizarDisplay(selectEl, input);
            });
            obs.observe(selectEl, {
                attributes: true,
                childList: true,
                attributeFilter: ['disabled']
            });

            // Eventos no input do combobox
            input.addEventListener("focus", () => {
                if (selectEl.disabled) return;
                this.abrir(wrapper, input, selectEl, "");
                setTimeout(() => input.select(), 10);
            });

            input.addEventListener("click", () => {
                if (selectEl.disabled) return;
                if (!this.menuEl || !this.menuEl.classList.contains("is-active") || this.activeInput !== input) {
                    this.abrir(wrapper, input, selectEl, "");
                }
            });

            input.addEventListener("input", (e) => {
                // Impede o borbulhamento para o document listener de branching logic (evita travar digitação)
                e.stopPropagation();
                if (selectEl.disabled) return;
                const digitado = e.target.value;
                if (!this.menuEl || !this.menuEl.classList.contains("is-active") || this.activeInput !== input) {
                    this.abrir(wrapper, input, selectEl, digitado);
                } else {
                    this.filtrar(digitado);
                }
            });

            input.addEventListener("keydown", (e) => {
                const isOpen = this.menuEl && this.menuEl.classList.contains("is-active") && this.activeInput === input;

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!isOpen) {
                        this.abrir(wrapper, input, selectEl, "");
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
                            const match = this.obterItemPorTexto(selectEl, input.value);
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
                        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredItems.length) {
                            this.selecionarItem(this.filteredItems[this.highlightedIndex]);
                        } else if (this.filteredItems.length === 1) {
                            this.selecionarItem(this.filteredItems[0]);
                        } else {
                            const match = this.obterItemPorTexto(selectEl, input.value);
                            if (match) {
                                this.selecionarItem(match);
                            }
                        }
                        this.fechar();
                    }
                }
            });

            // Botão chevron de seta
            arrowBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (selectEl.disabled) return;
                if (this.activeInput === input && this.menuEl && this.menuEl.classList.contains("is-active")) {
                    this.fechar();
                } else {
                    input.focus();
                    this.abrir(wrapper, input, selectEl, "");
                }
            });
        },

        initAll: function() {
            this.initMenu();

            const selects = document.querySelectorAll(
                'select.form-control, select.form-select, select.table-select, select[data-redcap-field]'
            );

            selects.forEach(sel => {
                this.enhance(sel);
            });

            // Observador global para capturar novos selects injetados dinamicamente no DOM
            if (!this.mutationObserver) {
                this.mutationObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1) { // ELEMENT_NODE
                                // Ignora mutações internas do menu flutuante (evita repinturas em cascata durante digitação)
                                if (this.menuEl && (node === this.menuEl || this.menuEl.contains(node))) continue;
                                if (node.matches && node.matches('select.form-control, select.form-select, select.table-select, select[data-redcap-field]')) {
                                    this.enhance(node);
                                } else if (node.querySelectorAll) {
                                    node.querySelectorAll('select.form-control, select.form-select, select.table-select, select[data-redcap-field]').forEach(s => {
                                        this.enhance(s);
                                    });
                                }
                            }
                        }
                    }
                });

                this.mutationObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }
    };

    window.SearchableSelect = SearchableSelect;

})(window);
