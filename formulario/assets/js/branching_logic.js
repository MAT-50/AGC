/**
 * AGC Analytics — Motor Genérico de Branching Logic do REDCap (FMRP-USP)
 * 
 * Avalia expressões nativas do REDCap em tempo real no DOM do formulário.
 * Suporta:
 *   - Igualdade: [campo] = 'valor'
 *   - Desigualdade: [campo] != 'valor' ou [campo] <> ''
 *   - Comparações: [campo] > 'X', [campo] >= 'X', etc.
 *   - Checkboxes: [campo(codigo)] = '1'
 *   - Operadores lógicos: ||, &&, parênteses
 * 
 * Permite que a interface se adapte dinamicamente sem regras hardcoded,
 * recalibrando automaticamente se os metadados do REDCap forem atualizados.
 */

(function(window) {
    'use strict';

    const RedcapBranchingEngine = {
        rules: {},
        formValues: {},
        isInternalReverting: false,
        pendingTriggerEl: null,
        pendingAffectedFields: [],

        init: function() {
            if (window.REDCAP_BRANCHING) {
                this.rules = window.REDCAP_BRANCHING;
            } else if (window.REDCAP_SCHEMA && window.REDCAP_SCHEMA.branching_rules) {
                this.rules = window.REDCAP_SCHEMA.branching_rules;
            }

            // 1. Captura de estado anterior em foco e clique para poder reverter se o usuário cancelar
            document.addEventListener('focusin', (e) => {
                if (this.isInternalReverting) return;
                if (e.target && e.target.matches('select, input, textarea')) {
                    this.capturePreviousState(e.target);
                }
            }, true);

            document.addEventListener('pointerdown', (e) => {
                if (this.isInternalReverting) return;
                const el = e.target;
                if (el) {
                    const input = el.matches('input, select, textarea') ? el : el.closest('label')?.querySelector('input');
                    if (input) {
                        this.capturePreviousState(input);
                    }
                }
            }, true);

            // 2. Interceptação no evento 'change' (fase de captura) para validar se campos preenchidos serão apagados
            document.addEventListener('change', (e) => {
                const el = e.target;
                if (!el || !el.matches('input, select, textarea')) return;
                if (el.classList && el.classList.contains('searchable-select-input')) return;
                if (this.isInternalReverting || window._isBatchLoading) return;

                // Identifica se a alteração deste elemento fará com que campos preenchidos sejam ocultados
                const affectedResult = this.findFieldsThatWillBeHidden(el);

                if (affectedResult && affectedResult.inputs.length > 0) {
                    // Interrompe a propagação imediata do evento para evitar que outros listeners disparem
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    // Abre modal de confirmação com a contagem exata e lista dos campos
                    this.pendingTriggerEl = el;
                    this.pendingAffectedFields = affectedResult.inputs;
                    this.abrirModalConfirmacao(affectedResult.inputs, affectedResult.uniqueCount);
                    return;
                }

                // Se nenhum campo com dados for afetado, atualiza o estado anterior do elemento e avalia branching normalmente
                this.capturePreviousState(el);
                this.evalAll();
            }, true);

            // 3. Listener para inputs text/number que alterem branching em tempo real (debounced para digitação suave)
            let _branchingInputTimer = null;
            document.addEventListener('input', (e) => {
                if (this.isInternalReverting || window._isBatchLoading) return;
                if (e.target && e.target.classList && e.target.classList.contains('searchable-select-input')) return;
                if (e.target && e.target.matches('input[type="number"], input[type="text"]')) {
                    clearTimeout(_branchingInputTimer);
                    _branchingInputTimer = setTimeout(() => {
                        this.evalAll();
                    }, 120);
                }
            });

            // 4. Configurar botões do modal de confirmação
            this.configurarBotoesModal();

            // 5. Executar primeira avaliação após carregamento
            setTimeout(() => this.evalAll(), 100);
        },

        capturePreviousState: function(el) {
            if (!el) return;
            if (el.type === 'checkbox') {
                el._prevChecked = el.checked;
                el._prevValue = el.checked;
            } else if (el.type === 'radio') {
                const name = el.name;
                const currentChecked = name ? document.querySelector(`input[name="${name}"]:checked`) : null;
                el._prevRadio = currentChecked;
                el._prevValue = currentChecked ? currentChecked.value : '';
            } else {
                el._prevValue = el.value;
            }
        },

        hasValue: function(el) {
            if (!el) return false;
            if (el.classList && el.classList.contains('searchable-select-input')) return false;
            if (el.type === 'checkbox' || el.type === 'radio') {
                return Boolean(el.checked);
            }
            if (el.tagName === 'SELECT') {
                return el.value !== '' && el.value !== null && el.value !== undefined;
            }
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                return el.value !== '' && el.value !== null && el.value !== undefined && String(el.value).trim() !== '';
            }
            return false;
        },

        isElementOrAncestorSlated: function(el, slatedForErase) {
            if (!el || !slatedForErase) return false;
            let curr = el;
            while (curr && curr !== document.body && !curr.classList.contains('form-tab-pane')) {
                if (slatedForErase.has(curr)) return true;
                curr = curr.parentElement;
            }
            return false;
        },

        getSimulatedFieldValue: function(fieldName, checkboxCode, slatedForErase) {
            if (checkboxCode !== undefined && checkboxCode !== null) {
                const cb = document.querySelector(`input[name="${fieldName}"][value="${checkboxCode}"], input[name="${fieldName}[${checkboxCode}]"], input[data-redcap-field="${fieldName}"][data-code="${checkboxCode}"], input[name="${fieldName}___${checkboxCode}"], input[data-field-name="${fieldName}___${checkboxCode}"]`);
                if (cb) {
                    if (slatedForErase && this.isElementOrAncestorSlated(cb, slatedForErase)) {
                        return '0';
                    }
                    if (this.isElementHidden(cb)) return '0';
                    return cb.checked ? '1' : '0';
                }
                const cbSimple = document.querySelector(`input[data-redcap-field="${fieldName}_${checkboxCode}"]`);
                if (cbSimple) {
                    if (slatedForErase && this.isElementOrAncestorSlated(cbSimple, slatedForErase)) {
                        return '0';
                    }
                    if (this.isElementHidden(cbSimple)) return '0';
                    return cbSimple.checked ? '1' : '0';
                }
                return '0';
            }

            // Radio button
            const checkedRadio = document.querySelector(`input[type="radio"][name="${fieldName}"]:checked, input[type="radio"][data-redcap-field="${fieldName}"]:checked`);
            if (checkedRadio) {
                if (slatedForErase && this.isElementOrAncestorSlated(checkedRadio, slatedForErase)) return '';
                if (this.isElementHidden(checkedRadio)) return '';
                return checkedRadio.value;
            }
            const anyRadio = document.querySelector(`input[type="radio"][name="${fieldName}"], input[type="radio"][data-redcap-field="${fieldName}"]`);
            if (anyRadio) {
                return '';
            }

            let el = document.querySelector(`select[name="${fieldName}"], select[data-redcap-field="${fieldName}"], input[name="${fieldName}"], input[data-redcap-field="${fieldName}"], textarea[name="${fieldName}"], textarea[data-redcap-field="${fieldName}"], #field-${fieldName}`);
            if (!el) {
                el = document.querySelector(`[data-redcap-field="${fieldName}"]`);
                if (el && !el.matches('input, select, textarea')) {
                    el = el.querySelector('input:checked, select, textarea, input');
                }
            }

            if (!el) return this.getCalculatedFieldValue(fieldName);

            if (slatedForErase && this.isElementOrAncestorSlated(el, slatedForErase)) {
                return '';
            }

            if (this.isElementHidden(el)) return '';

            if (el.type === 'checkbox') return el.checked ? '1' : '0';
            if (el.type === 'radio') {
                const name = el.getAttribute('name');
                const checked = name ? document.querySelector(`input[name="${name}"]:checked`) : null;
                if (!checked) return '';
                if (slatedForErase && this.isElementOrAncestorSlated(checked, slatedForErase)) return '';
                return checked.value;
            }

            return el.value !== undefined && el.value !== null ? String(el.value).trim() : '';
        },

        evaluateSimulatedExpr: function(expr, slatedForErase) {
            if (!expr || expr === '') return true;
            const fn = this.parseExpression(expr);
            return fn((fieldName, code) => this.getSimulatedFieldValue(fieldName, code, slatedForErase));
        },

        willElementBeHiddenSimulated: function(el, slatedForErase) {
            if (!el) return false;
            let current = el;
            while (current && !current.classList.contains('form-tab-pane') && current !== document.body) {
                // Se o elemento ou qualquer ancestral já foi marcado como apagado na cascata
                if (slatedForErase && slatedForErase.has(current)) {
                    return true;
                }
                // 1. Regra explícita no contêiner
                if (current.hasAttribute('data-branching-rule')) {
                    const rule = current.getAttribute('data-branching-rule');
                    if (rule && !this.evaluateSimulatedExpr(rule, slatedForErase)) {
                        return true;
                    }
                }
                // 2. Mapeamento por data-branching-target
                if (current.hasAttribute('data-branching-target')) {
                    const targetField = current.getAttribute('data-branching-target');
                    const rule = this.rules[targetField];
                    if (rule && !this.evaluateSimulatedExpr(rule, slatedForErase)) {
                        return true;
                    }
                }
                // 3. .form-group com data-redcap-field associado a regra
                if (current.classList.contains('form-group') && !current.hasAttribute('data-branching-rule')) {
                    const rInput = current.querySelector('[data-redcap-field]');
                    if (rInput) {
                        const fieldName = rInput.getAttribute('data-redcap-field');
                        const rule = this.rules[fieldName];
                        if (rule && !this.evaluateSimulatedExpr(rule, slatedForErase)) {
                            return true;
                        }
                    }
                }
                current = current.parentElement;
            }
            return false;
        },

        findFieldsThatWillBeHidden: function(triggerEl) {
            // Otimização de alta performance: Pré-filtra apenas inputs que realmente contêm valor
            // Em 95% dos casos o conjunto é vazio, permitindo saída instantânea em < 0.1ms
            const allInputs = document.querySelectorAll('input, select, textarea');
            const candidates = [];
            for (let i = 0; i < allInputs.length; i++) {
                const inp = allInputs[i];
                if (inp === triggerEl) continue;
                if (inp.classList && inp.classList.contains('searchable-select-input')) continue;
                if (inp.type === 'radio' && triggerEl.type === 'radio' && inp.name === triggerEl.name) continue;
                if (!this.hasValue(inp)) continue;
                if (this.isElementHidden(inp)) continue;
                candidates.push(inp);
            }

            if (candidates.length === 0) {
                return { inputs: [], uniqueCount: 0 };
            }

            const slatedForErase = new Set();
            const affectedInputs = [];
            let addedNew = false;
            let pass = 0;

            do {
                addedNew = false;
                pass++;

                candidates.forEach(input => {
                    if (slatedForErase.has(input)) return;
                    if (this.willElementBeHiddenSimulated(input, slatedForErase)) {
                        slatedForErase.add(input);
                        affectedInputs.push(input);
                        addedNew = true;
                    }
                });
            } while (addedNew && pass < 5);

            // Contagem de campos únicos afetados
            const seenFields = new Set();
            affectedInputs.forEach(inp => {
                const key = inp.getAttribute('data-redcap-field') || inp.name || inp.id;
                if (key) seenFields.add(key);
            });

            return {
                inputs: affectedInputs,
                uniqueCount: seenFields.size > 0 ? seenFields.size : affectedInputs.length
            };
        },

        getFieldLabelAndValue: function(input) {
            const formGroup = input.closest('.form-group');
            let label = '';
            if (formGroup) {
                const labelEl = formGroup.querySelector('.form-label');
                if (labelEl) {
                    label = labelEl.textContent.replace(/\[[^\]]+\]/g, '').trim();
                }
            }
            const redcapTag = input.getAttribute('data-redcap-field') || input.id || input.name;

            if (!label) {
                const parentLabel = input.closest('label');
                if (parentLabel) {
                    label = parentLabel.textContent.trim();
                } else {
                    label = redcapTag || 'Campo';
                }
            }

            let valStr = '';
            if (input.type === 'checkbox') {
                valStr = 'Marcado';
            } else if (input.type === 'radio') {
                valStr = input.value;
            } else if (input.tagName === 'SELECT') {
                valStr = input.options[input.selectedIndex]?.text || input.value;
            } else {
                valStr = input.value;
                if (valStr.length > 35) valStr = valStr.substring(0, 32) + '...';
            }

            return {
                label: label,
                field: redcapTag,
                value: valStr
            };
        },

        abrirModalConfirmacao: function(affected, count) {
            const modal = document.getElementById('modal-confirm-erase');
            const elCount = document.getElementById('erase-count-text');
            const elList = document.getElementById('erase-fields-list');

            if (!modal) {
                const msg = `Mudar essa resposta apagará os dados de ${count} campo(s). Deseja confirmar e apagar esses dados?`;
                if (confirm(msg)) {
                    this.confirmErase();
                } else {
                    this.cancelErase();
                }
                return;
            }

            if (elCount) {
                elCount.textContent = count === 1 ? '1 campo' : `${count} campos`;
            }

            if (elList) {
                const seen = new Set();
                let itemsHtml = '<ul style="margin:0; padding-left:18px; line-height:1.7;">';
                affected.forEach(inp => {
                    const info = this.getFieldLabelAndValue(inp);
                    if (seen.has(info.field)) return;
                    seen.add(info.field);
                    itemsHtml += `<li><strong>${this.escapeHtml(info.label)}</strong> <span style="color:var(--text-muted); font-size:11px;">[${this.escapeHtml(info.field)}]</span>: <em style="color:var(--accent);">${this.escapeHtml(info.value)}</em></li>`;
                });
                itemsHtml += '</ul>';
                elList.innerHTML = itemsHtml;
            }

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        },

        fecharModalConfirmacao: function() {
            const modal = document.getElementById('modal-confirm-erase');
            if (modal) {
                modal.classList.remove('active');
            }
            document.body.style.overflow = '';
        },

        clearInput: function(input) {
            if (!input) return;
            if (input.type === 'checkbox') {
                input.checked = false;
                input._prevChecked = false;
                input._prevValue = false;
            } else if (input.type === 'radio') {
                input.checked = false;
                input._prevChecked = false;
                input._prevValue = '';
            } else if (input.tagName === 'SELECT') {
                input.value = '';
                input._prevValue = '';
            } else {
                input.value = '';
                input._prevValue = '';
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },

        confirmErase: function() {
            this.isInternalReverting = true;

            // 1. Apaga os campos identificados na análise em cascata
            if (Array.isArray(this.pendingAffectedFields)) {
                this.pendingAffectedFields.forEach(input => {
                    this.clearInput(input);
                });
            }

            // 2. Atualiza o estado capturado do trigger para a nova resposta
            if (this.pendingTriggerEl) {
                this.capturePreviousState(this.pendingTriggerEl);
                this.pendingTriggerEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 3. Executa a reavaliação de visibilidade
            this.evalAll();

            // 4. VARREDURA DE SEGURANÇA PROFUNDA:
            // Qualquer contêiner condicional que agora ficou oculto tem seus campos limpos
            const hiddenElements = document.querySelectorAll('.branching-hidden');
            hiddenElements.forEach(container => {
                if (container.classList.contains('form-tab-pane')) return;
                const innerInputs = container.querySelectorAll('input, select, textarea');
                innerInputs.forEach(inp => {
                    if (inp.classList && inp.classList.contains('searchable-select-input')) return;
                    if (this.hasValue(inp)) {
                        this.clearInput(inp);
                    }
                });
            });

            this.isInternalReverting = false;
            this.fecharModalConfirmacao();

            // 5. Salva rascunho e atualiza CDSS e Toast
            if (window.FormularioClinico) {
                if (typeof FormularioClinico.salvarRascunho === 'function') {
                    FormularioClinico.salvarRascunho(false);
                }
                if (typeof FormularioClinico.executarCdss === 'function') {
                    FormularioClinico.executarCdss();
                }
                if (typeof FormularioClinico.mostrarToast === 'function') {
                    FormularioClinico.mostrarToast('✓ Campos ocultados e dados apagados em profundidade.');
                }
            }

            this.pendingTriggerEl = null;
            this.pendingAffectedFields = [];
        },

        cancelErase: function() {
            this.isInternalReverting = true;
            const trigger = this.pendingTriggerEl;

            if (trigger) {
                if (trigger.type === 'checkbox') {
                    const prev = trigger._prevChecked !== undefined ? trigger._prevChecked : !trigger.checked;
                    trigger.checked = prev;
                } else if (trigger.type === 'radio') {
                    if (trigger._prevRadio) {
                        trigger._prevRadio.checked = true;
                    } else {
                        trigger.checked = false;
                    }
                } else if (trigger.tagName === 'SELECT' || trigger.tagName === 'INPUT' || trigger.tagName === 'TEXTAREA') {
                    trigger.value = trigger._prevValue !== undefined ? trigger._prevValue : '';
                }
            }

            this.isInternalReverting = false;
            this.fecharModalConfirmacao();

            // Reexecuta evalAll para manter os campos visíveis como estavam
            this.evalAll();

            if (window.FormularioClinico && typeof FormularioClinico.mostrarToast === 'function') {
                FormularioClinico.mostrarToast('Alteração cancelada. Dados preservados.');
            }

            this.pendingTriggerEl = null;
            this.pendingAffectedFields = [];
        },

        configurarBotoesModal: function() {
            const btnConfirm = document.getElementById('btn-modal-erase-confirm');
            const btnCancel = document.getElementById('btn-modal-erase-cancel');
            const btnClose = document.getElementById('btn-modal-erase-close');
            const modal = document.getElementById('modal-confirm-erase');

            if (btnConfirm) {
                btnConfirm.addEventListener('click', () => this.confirmErase());
            }
            if (btnCancel) {
                btnCancel.addEventListener('click', () => this.cancelErase());
            }
            if (btnClose) {
                btnClose.addEventListener('click', () => this.cancelErase());
            }
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.cancelErase();
                    }
                });
            }
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
                    this.cancelErase();
                }
            });
        },

        escapeHtml: function(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        /**
         * Verifica se o elemento está contido em um bloco condicional oculto
         * (ignora o painel da aba .form-tab-pane para permitir auditoria entre abas)
         */
        isElementHidden: function(el) {
            if (!el) return true;
            let current = el.parentElement;
            while (current && !current.classList.contains('form-tab-pane') && current !== document.body) {
                if (current.classList.contains('branching-hidden') || current.style.display === 'none') {
                    return true;
                }
                current = current.parentElement;
            }
            return false;
        },

        /**
         * Normalizador de texto para comparações insensíveis a acentos e maiúsculas
         */
        normStr: function(str) {
            return (str || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        },

        /**
         * Determina se o parente informado é o probando (caso índice)
         */
        isProbando: function(p) {
            if (!p) return true;
            const codA = (p.codA || "").toUpperCase().trim();
            const codB = parseInt(p.codB, 10) || 0;
            const codC = parseInt(p.codC, 10) || 0;
            if (codA === "A1" && codB === 0 && codC === 0) return true;
            const par = this.normStr(p.parentesco || "");
            if (par.includes("probando") || par.includes("paciente")) return true;
            return false;
        },

        /**
         * Determina o grau de parentesco consanguíneo (1, 2, 3 ou 99 para não-consanguíneo)
         */
        calcularGrauParentesco: function(p) {
            if (window.CdssEngine && typeof window.CdssEngine.obterGrauParentesco === 'function') {
                return window.CdssEngine.obterGrauParentesco(p);
            }
            const codA = (p.codA || "").toUpperCase().trim();
            const codB = parseInt(p.codB, 10) || 0;
            const codC = parseInt(p.codC, 10) || 0;

            if (codA === "A1" && codB === 0 && codC === 0) return 0;
            if (codA.startsWith("Z") || p.grau === "N") return 99;

            if (p.grau && ["1", "2", "3", "4"].includes(String(p.grau).replace(/[º°]/g, "").trim())) {
                return parseInt(String(p.grau).replace(/[º°]/g, "").trim(), 10);
            }

            if (codA.startsWith("A")) {
                if (codB === 0) return 1;
                if (codC === 0) return codA === "A1" ? 1 : 2;
                return codA === "A1" ? 2 : 3;
            }

            if (codA.startsWith("B") || codA.startsWith("C")) {
                if (codB === 0) {
                    const num = parseInt(codA.slice(1), 10) || 1;
                    return num === 1 ? 1 : 2;
                }
                if (codC === 0) {
                    const num = parseInt(codA.slice(1), 10) || 1;
                    return num === 1 ? 2 : 3;
                }
                return 3;
            }

            if (codA.startsWith("D") || codA.startsWith("E") || codA.startsWith("F") || codA.startsWith("G")) {
                const num = parseInt(codA.slice(1), 10) || 1;
                if (codB === 0 && codC === 0) return num === 1 ? 2 : 3;
                return 3;
            }

            if (["H", "I", "J", "K", "L", "M", "N", "O"].some(l => codA.startsWith(l))) {
                return 3;
            }

            return 3;
        },

        /**
         * Infere o sexo biológico do parente a partir do campo sexo ou do parentesco
         */
        inferirSexo: function(p) {
            const sexo = (p.sexo || "").toUpperCase().trim();
            if (sexo === "M" || sexo === "F") return sexo;
            const par = this.normStr(p.parentesco || "");
            if (/(mae|irma|filha|avo|tia|sobrinha|neta|bisavo|prima)/.test(par)) return "F";
            if (/(pai|irmao|filho|avo|tio|sobrinho|neto|bisavo|primo)/.test(par)) return "M";
            return "";
        },

        /**
         * Resolve variáveis calculadas de história familiar do REDCap diretamente
         * a partir da Tabela de Parentes em tempo real.
         */
        getCalculatedFieldValue: function(fieldName) {
            const calculatedTriggers = [
                'hist_familiar_mama_d2',
                'hist_familiar_prost_d3',
                'hist_familiar_ovar_d3',
                'hist_familiar_osteo_d2',
                'hist_familiar_sarco_d2',
                'hist_familiar_snc_d2',
                'hist_familiar_adreno_d2',
                'hist_familiar_leu_lin_d3',
                'hist_familiar_gastr_d2',
                'hist_familiar_gastr_spec',
                'hist_familiar_dx_cs_d3',
                'hist_familiar_dx_brrs_d3',
                'parente_ls_ccr_ce',
                'parente_45_menos_1'
            ];

            if (!calculatedTriggers.includes(fieldName)) {
                return '';
            }

            const parentes = (window.TabelaParentes && Array.isArray(window.TabelaParentes.parentes))
                ? window.TabelaParentes.parentes
                : (Array.isArray(window._mockParentes) ? window._mockParentes : []);

            if (parentes.length === 0) {
                return '0';
            }

            const self = this;

            const hasMatch = parentes.some(p => {
                if (self.isProbando(p)) return false;
                const grau = self.calcularGrauParentesco(p);
                if (grau > 3 || grau <= 0) return false;

                const sexo = self.inferirSexo(p);
                const diags = Array.isArray(p.diags) ? p.diags : (Array.isArray(p.diagnosticos) ? p.diagnosticos : []);
                if (diags.length === 0) return false;

                switch (fieldName) {
                    case 'hist_familiar_mama_d2':
                        // Mama até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "5" || t.includes("mama");
                        });

                    case 'hist_familiar_prost_d3':
                        // Próstata até 3º grau (homens)
                        if (sexo === "F") return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return (cod === "6" && sexo === "M") || t.includes("prostata");
                        });

                    case 'hist_familiar_ovar_d3':
                        // Ovário / Peritôneo / Trompas até 3º grau (mulheres)
                        if (sexo === "M") return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return (cod === "6" && sexo === "F") || cod === "13" || t.includes("ovario") || t.includes("perit") || t.includes("tuba") || t.includes("trompa");
                        });

                    case 'hist_familiar_osteo_d2':
                        // Osteossarcoma até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "14" || t.includes("osteossarcoma");
                        });

                    case 'hist_familiar_sarco_d2':
                        // Sarcoma partes moles até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "15" || (t.includes("sarcoma") && !t.includes("osteo"));
                        });

                    case 'hist_familiar_snc_d2':
                        // SNC até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "16" || t.includes("snc") || t.includes("cerebro") || t.includes("sistema nervoso") || t.includes("plexo") || t.includes("coroide") || t.includes("glioma") || t.includes("glioblastoma") || t.includes("astrocitoma");
                        });

                    case 'hist_familiar_adreno_d2':
                        // Adrenocortical até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "17" || t.includes("adrenocortical") || t.includes("adrenal") || t.includes("suprarrenal");
                        });

                    case 'hist_familiar_leu_lin_d3':
                        // Leucemia ou Linfoma até 3º grau
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "9" || t.includes("leucemia") || t.includes("linfoma") || t.includes("llaph") || t.includes("leukemia") || t.includes("lymphoma");
                        });

                    case 'hist_familiar_gastr_d2':
                        // Câncer gástrico até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "18" || t.includes("gastrico") || t.includes("estomago") || t.includes("gastrica");
                        });

                    case 'hist_familiar_gastr_spec':
                        // Câncer gástrico especificamente 3º grau
                        if (grau !== 3) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "18" || t.includes("gastrico") || t.includes("estomago") || t.includes("gastrica");
                        });

                    case 'hist_familiar_dx_cs_d3':
                        // Síndrome de Cowden até 3º grau
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "11" || t.includes("cowden");
                        });

                    case 'hist_familiar_dx_brrs_d3':
                        // Síndrome de Bannayan-Riley-Ruvalcaba até 3º grau
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            return cod === "12" || t.includes("bannayan") || t.includes("brrs") || t.includes("ruvalcaba");
                        });

                    case 'parente_ls_ccr_ce':
                        // Colorectal ou Endométrio até 2º grau
                        if (grau > 2) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            const t = self.normStr(d.tumor);
                            if (cod === "7" || t.includes("colon") || t.includes("reto") || t.includes("colorretal")) return true;
                            if ((cod === "0" && sexo !== "M") || t.includes("endometrio") || t.includes("utero")) return true;
                            return false;
                        });

                    case 'parente_45_menos_1':
                        // Parente de 1º grau com câncer antes dos 45 anos
                        if (grau !== 1) return false;
                        return diags.some(d => {
                            const cod = String(d.codigo || "").trim();
                            if (["11", "12", "19", "20", "21", "HIST_DESC", "SEM_HIST"].includes(cod)) return false;
                            const idade = parseInt(d.idadeDx !== undefined ? d.idadeDx : d.idade, 10);
                            return !isNaN(idade) && idade > 0 && idade < 45;
                        });

                    default:
                        return false;
                }
            });

            return hasMatch ? '1' : '0';
        },

        /**
         * Obtém o valor atual de um campo pelo nome do REDCap
         */
        getFieldValue: function(fieldName, checkboxCode) {
            // Se for checkbox com código específico: [campo(codigo)]
            if (checkboxCode !== undefined && checkboxCode !== null) {
                const cb = document.querySelector(`input[name="${fieldName}"][value="${checkboxCode}"], input[name="${fieldName}[${checkboxCode}]"], input[data-redcap-field="${fieldName}"][data-code="${checkboxCode}"], input[name="${fieldName}___${checkboxCode}"], input[data-field-name="${fieldName}___${checkboxCode}"]`);
                if (cb) {
                    if (this.isElementHidden(cb)) return '0';
                    return cb.checked ? '1' : '0';
                }
                const cbSimple = document.querySelector(`input[data-redcap-field="${fieldName}_${checkboxCode}"]`);
                if (cbSimple) {
                    if (this.isElementHidden(cbSimple)) return '0';
                    return cbSimple.checked ? '1' : '0';
                }
                return '0';
            }

            // Radio button
            const checkedRadio = document.querySelector(`input[type="radio"][name="${fieldName}"]:checked, input[type="radio"][data-redcap-field="${fieldName}"]:checked`);
            if (checkedRadio) {
                if (this.isElementHidden(checkedRadio)) return '';
                return checkedRadio.value;
            }
            const anyRadio = document.querySelector(`input[type="radio"][name="${fieldName}"], input[type="radio"][data-redcap-field="${fieldName}"]`);
            if (anyRadio) {
                return '';
            }

            // Buscar input, select, textarea específico primeiro
            let el = document.querySelector(`select[name="${fieldName}"], select[data-redcap-field="${fieldName}"], input[name="${fieldName}"], input[data-redcap-field="${fieldName}"], textarea[name="${fieldName}"], textarea[data-redcap-field="${fieldName}"], #field-${fieldName}`);
            if (!el) {
                el = document.querySelector(`[data-redcap-field="${fieldName}"]`);
                if (el && !el.matches('input, select, textarea')) {
                    el = el.querySelector('input:checked, select, textarea, input');
                }
            }

            if (!el) {
                return this.getCalculatedFieldValue(fieldName);
            }

            // Se o elemento estiver em contêiner condicional oculto, seu valor no formulário é inativo
            if (this.isElementHidden(el)) {
                return '';
            }

            if (el.type === 'checkbox') {
                return el.checked ? '1' : '0';
            }

            if (el.type === 'radio') {
                const name = el.getAttribute('name');
                const checked = name ? document.querySelector(`input[name="${name}"]:checked`) : null;
                return checked ? checked.value : '';
            }

            return el.value !== undefined && el.value !== null ? String(el.value).trim() : '';
        },

        /**
         * Converte uma expressão de Branching Logic do REDCap em uma função segura JS
         */
        parseExpression: function(expr) {
            if (!expr || typeof expr !== 'string') return () => true;

            // Limpar quebras de linha
            let cleanExpr = expr.replace(/\r?\n/g, ' ').trim();

            // Normalizar operadores REDCap
            cleanExpr = cleanExpr.replace(/<>/g, '!=');

            // Substituir if(isblankormissingcode([field]), val1, [field])
            cleanExpr = cleanExpr.replace(/if\(isblankormissingcode\(\[([a-zA-Z0-9_]+)\]\)\s*,\s*([0-9]+)\s*,\s*\[\1\]\)/g, "(__getVal('$1') !== '' ? Number(__getVal('$1')) : $2)");

            // Substituir checkboxes [campo(codigo)]
            cleanExpr = cleanExpr.replace(/\[([a-zA-Z0-9_]+)\(([a-zA-Z0-9_-]+)\)\]/g, (match, field, code) => {
                return `__getVal('${field}', '${code}')`;
            });

            // Substituir campos simples [campo]
            cleanExpr = cleanExpr.replace(/\[([a-zA-Z0-9_]+)\]/g, (match, field) => {
                return `__getVal('${field}')`;
            });

            // Normalizar comparações numéricas com segurança
            cleanExpr = cleanExpr.replace(/__getVal\('([^']+)'\)\s*(>|<|>=|<=)\s*'([0-9]+)'/g, "Number(__getVal('$1') || 0) $2 $3");
            cleanExpr = cleanExpr.replace(/__getVal\('([^']+)'\)\s*(>|<|>=|<=)\s*([0-9]+)/g, "Number(__getVal('$1') || 0) $2 $3");

            // Substituir igualdade simples '=' por '==' (cuidando para não quebrar <= ou >= ou != ou ==)
            cleanExpr = cleanExpr.replace(/([^!<>=])=([^=])/g, '$1==$2');

            // Criar função avaliadora isolada
            try {
                return new Function('__getVal', `
                    try {
                        return Boolean(${cleanExpr});
                    } catch(e) {
                        return false;
                    }
                `);
            } catch (err) {
                console.warn('Erro ao compilar regra de branching logic:', expr, err);
                return () => false;
            }
        },

        /**
         * Avalia uma expressão de branching logic com os valores atuais
         */
        evaluate: function(expr) {
            if (!expr || expr === '') return true;
            const fn = this.parseExpression(expr);
            return fn((fieldName, code) => this.getFieldValue(fieldName, code));
        },

        /**
         * Executa a avaliação em todos os contêineres condicionais da página
         */
        evalAll: function() {
            if (!this.rules || Object.keys(this.rules).length === 0) {
                if (window.REDCAP_BRANCHING) {
                    this.rules = window.REDCAP_BRANCHING;
                } else if (window.REDCAP_SCHEMA && window.REDCAP_SCHEMA.branching_rules) {
                    this.rules = window.REDCAP_SCHEMA.branching_rules;
                }
            }

            // Executa até 3 passos para resolver dependências em cascata
            let anyChanged = false;
            let pass = 0;

            do {
                anyChanged = false;
                pass++;

                // 1. Contêineres que possuem data-branching-rule explícito
                const explicitTargets = document.querySelectorAll('[data-branching-rule]');
                explicitTargets.forEach(el => {
                    const rule = el.getAttribute('data-branching-rule');
                    const isVisible = this.evaluate(rule);
                    const isCurrentlyVisible = !el.classList.contains('branching-hidden') && el.style.display !== 'none';
                    if (isVisible !== isCurrentlyVisible) {
                        this.toggleVisibility(el, isVisible);
                        anyChanged = true;
                    }
                });

                // 2. Contêineres que apontam para um campo do REDCap registrado no esquema
                const mappedTargets = document.querySelectorAll('[data-branching-target]');
                mappedTargets.forEach(el => {
                    const targetField = el.getAttribute('data-branching-target');
                    const rule = this.rules[targetField];
                    if (rule) {
                        const isVisible = this.evaluate(rule);
                        const isCurrentlyVisible = !el.classList.contains('branching-hidden') && el.style.display !== 'none';
                        if (isVisible !== isCurrentlyVisible) {
                            this.toggleVisibility(el, isVisible);
                            anyChanged = true;
                        }
                    }
                });

                // 3. Mapeamento Automático para todos os inputs com data-redcap-field registrados
                const redcapInputs = document.querySelectorAll('[data-redcap-field]');
                const processed = new Set();
                redcapInputs.forEach(input => {
                    const fieldName = input.getAttribute('data-redcap-field');
                    if (!fieldName || processed.has(fieldName)) return;
                    processed.add(fieldName);

                    const rule = this.rules[fieldName];
                    if (!rule || rule.trim() === '') return;

                    const group = input.closest('.form-group');
                    if (group && !group.hasAttribute('data-branching-rule')) {
                        const isVisible = this.evaluate(rule);
                        const isCurrentlyVisible = !group.classList.contains('branching-hidden') && group.style.display !== 'none';
                        if (isVisible !== isCurrentlyVisible) {
                            this.toggleVisibility(group, isVisible);
                            anyChanged = true;
                        }
                    }
                });

            } while (anyChanged && pass < 3);

            // Notifica o formulário para atualizar as barras de auditoria de forma assíncrona (não bloqueante)
            if (window.FormularioClinico && typeof FormularioClinico.agendarAuditoriaCampos === 'function') {
                FormularioClinico.agendarAuditoriaCampos(300);
            } else if (window.FormularioClinico && typeof FormularioClinico.atualizarAuditoriaCampos === 'function') {
                setTimeout(() => FormularioClinico.atualizarAuditoriaCampos(), 300);
            }
        },

        /**
         * Aplica ou remove classes e estilo de visibilidade
         */
        toggleVisibility: function(el, isVisible) {
            if (isVisible) {
                el.classList.remove('branching-hidden');
                el.classList.add('branching-visible');
                el.style.display = '';
            } else {
                el.classList.add('branching-hidden');
                el.classList.remove('branching-visible');
                el.style.display = 'none';
            }
        }
    };

    window.RedcapBranching = RedcapBranchingEngine;

})(window);
