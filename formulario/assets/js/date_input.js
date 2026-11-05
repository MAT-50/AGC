/**
 * AGC Analytics — Universal Masked Date Input Component
 * Ambulatório de Aconselhamento Genético do Câncer (AGC) — FMRP-USP
 * 
 * Transforma campos de data em inputs de texto com máscara inteligente brasileira (DD/MM/AAAA):
 * - Digitação fluida com inserção automática de barras
 * - Colar inteligente (Smart Paste): aceita DD/MM/AAAA, DDMMAAAA e AAAA-MM-DD (ISO)
 * - Validação rigorosa de calendário real (considerando anos bissextos e dias por mês)
 * - Seletor de calendário visual híbrido (botão com ícone nativo)
 * - Conversão automática bidirecional com o REDCap (DD/MM/AAAA <-> AAAA-MM-DD)
 */

(function(window) {
    'use strict';

    const AGCDateInput = {
        /**
         * Converte qualquer string de data aceita para o formato brasileiro DD/MM/AAAA
         */
        formatToBr: function(val) {
            if (!val) return '';
            val = String(val).trim();

            // Já está em DD/MM/AAAA
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
                return val;
            }

            // Formato ISO AAAA-MM-DD ou AAAA/MM/DD
            const mIso = val.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (mIso) {
                const y = mIso[1];
                const m = String(mIso[2]).padStart(2, '0');
                const d = String(mIso[3]).padStart(2, '0');
                return `${d}/${m}/${y}`;
            }

            // Apenas 8 dígitos consecutivos: DDMMAAAA
            const digits = val.replace(/\D/g, '');
            if (digits.length === 8) {
                const d = digits.slice(0, 2);
                const m = digits.slice(2, 4);
                const y = digits.slice(4, 8);
                // Se os 4 primeiros dígitos parecem ano (19xx ou 20xx), pode ser AAAAMMDD
                if ((digits.startsWith('19') || digits.startsWith('20')) && parseInt(digits.slice(4, 6), 10) <= 12) {
                    return `${digits.slice(6, 8)}/${digits.slice(4, 6)}/${digits.slice(0, 4)}`;
                }
                return `${d}/${m}/${y}`;
            }

            // Separadores variados (ex: D.M.AAAA ou D-M-AAAA)
            const mParts = val.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
            if (mParts) {
                const d = String(mParts[1]).padStart(2, '0');
                const m = String(mParts[2]).padStart(2, '0');
                let y = mParts[3];
                if (y.length === 2) {
                    y = parseInt(y, 10) > 40 ? '19' + y : '20' + y;
                }
                return `${d}/${m}/${y}`;
            }

            return val;
        },

        /**
         * Converte DD/MM/AAAA para o formato ISO AAAA-MM-DD esperado pelo REDCap
         */
        formatToIso: function(val) {
            if (!val) return '';
            val = String(val).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

            const br = this.formatToBr(val);
            const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) {
                return `${m[3]}-${m[2]}-${m[1]}`;
            }
            return '';
        },

        /**
         * Valida se uma data existe de fato no calendário
         */
        validarDataReal: function(strDDMMAAAA) {
            if (!strDDMMAAAA || strDDMMAAAA.trim() === '') {
                return { valida: true, vazia: true };
            }

            const m = strDDMMAAAA.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (!m) {
                return { valida: false, vazia: false, motivo: 'Data incompleta (use DD/MM/AAAA)' };
            }

            const dia = parseInt(m[1], 10);
            const mes = parseInt(m[2], 10);
            const ano = parseInt(m[3], 10);

            if (ano < 1880 || ano > 2100) {
                return { valida: false, vazia: false, motivo: 'Ano fora do intervalo permitido (1880 a 2100)' };
            }
            if (mes < 1 || mes > 12) {
                return { valida: false, vazia: false, motivo: 'Mês inválido (deve ser de 01 a 12)' };
            }

            // Determina a quantidade máxima de dias no mês/ano (trata bissextos automaticamente)
            const diasNoMes = new Date(ano, mes, 0).getDate();
            if (dia < 1 || dia > diasNoMes) {
                const nomeMes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mes - 1];
                return { valida: false, vazia: false, motivo: `${nomeMes} de ${ano} possui no máximo ${diasNoMes} dias` };
            }

            return {
                valida: true,
                vazia: false,
                dia,
                mes,
                ano,
                iso: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
            };
        },

        /**
         * Aplica a máscara e formata o texto do input
         */
        aplicarMascaraTexto: function(input) {
            const raw = input.value;
            let digits = raw.replace(/\D/g, '').slice(0, 8);

            // Permite digitação com inserção manual de barras
            if (raw.endsWith('/') && digits.length === 1) {
                digits = '0' + digits;
            } else if (raw.endsWith('/') && digits.length === 3) {
                digits = digits.slice(0, 2) + '0' + digits.slice(2);
            }

            let v = digits;
            if (digits.length > 4) {
                v = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
            } else if (digits.length === 4) {
                v = raw.endsWith('/') ? `${digits.slice(0, 2)}/${digits.slice(2)}/` : `${digits.slice(0, 2)}/${digits.slice(2)}`;
            } else if (digits.length > 2) {
                v = `${digits.slice(0, 2)}/${digits.slice(2)}`;
            } else if (digits.length === 2 && raw.endsWith('/')) {
                v = `${digits}/`;
            }
            input.value = v;
        },

        /**
         * Executa a validação visual do campo
         */
        validarCampoVisual: function(input, feedbackEl) {
            const v = input.value.trim();
            if (v === '') {
                input.classList.remove('is-invalid', 'is-valid');
                if (feedbackEl) {
                    feedbackEl.style.display = 'none';
                    feedbackEl.textContent = '';
                }
                return true;
            }

            // Se ainda está incompleto durante a digitação ativa, não marca erro imediato
            if (v.length < 10 && document.activeElement === input) {
                input.classList.remove('is-valid');
                return false;
            }

            const res = this.validarDataReal(v);
            if (res.valida) {
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
                if (feedbackEl) {
                    feedbackEl.style.display = 'none';
                    feedbackEl.textContent = '';
                }
                return true;
            } else {
                input.classList.add('is-invalid');
                input.classList.remove('is-valid');
                if (feedbackEl) {
                    feedbackEl.style.display = 'block';
                    feedbackEl.textContent = '⚠️ ' + res.motivo;
                }
                return false;
            }
        },

        /**
         * Transforma um elemento <input> no componente com máscara e botão de calendário
         */
        enhance: function(input) {
            if (!input || input.dataset.dateInputInit === '1') return;
            input.dataset.dateInputInit = '1';

            // Garante tipo texto para permitir livre formatação e colar
            input.type = 'text';
            input.classList.add('date-masked-input');
            input.setAttribute('placeholder', 'DD/MM/AAAA');
            input.setAttribute('maxlength', '10');
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('spellcheck', 'false');

            // Converte valor inicial (caso tenha vindo em formato ISO do PHP ou REDCap)
            if (input.value) {
                input.value = this.formatToBr(input.value);
            }

            // Cria estrutura envolvente (Wrapper)
            let wrapper = input.closest('.date-input-wrapper');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'date-input-wrapper';
                input.parentNode.insertBefore(wrapper, input);
                wrapper.appendChild(input);
            }

            // Elemento de feedback de erro
            let feedback = wrapper.parentElement ? wrapper.parentElement.querySelector('.date-feedback-msg') : null;
            if (!feedback) {
                feedback = document.createElement('div');
                feedback.className = 'date-feedback-msg';
                feedback.style.display = 'none';
                feedback.style.fontSize = '11px';
                feedback.style.color = 'var(--danger, #ef4444)';
                feedback.style.marginTop = '4px';
                feedback.style.fontWeight = '600';
                wrapper.parentNode.insertBefore(feedback, wrapper.nextSibling);
            }

            // Cria botão lateral de calendário
            let pickerBtn = wrapper.querySelector('.date-picker-btn');
            let hiddenPicker = wrapper.querySelector('.date-picker-native-hidden');

            if (!pickerBtn) {
                pickerBtn = document.createElement('button');
                pickerBtn.type = 'button';
                pickerBtn.className = 'date-picker-btn';
                pickerBtn.tabIndex = -1;
                pickerBtn.title = 'Escolher data no calendário';
                pickerBtn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                `;
                wrapper.appendChild(pickerBtn);
            }

            if (!hiddenPicker) {
                hiddenPicker = document.createElement('input');
                hiddenPicker.type = 'date';
                hiddenPicker.className = 'date-picker-native-hidden';
                hiddenPicker.tabIndex = -1;
                hiddenPicker.setAttribute('aria-hidden', 'true');
                Object.assign(hiddenPicker.style, {
                    position: 'absolute',
                    opacity: '0',
                    width: '0px',
                    height: '0px',
                    pointerEvents: 'none',
                    border: 'none',
                    margin: '0',
                    padding: '0'
                });
                wrapper.appendChild(hiddenPicker);
            }

            // Sincronização do calendário nativo ao clicar no botão
            pickerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const iso = this.formatToIso(input.value);
                if (iso) {
                    hiddenPicker.value = iso;
                }

                if (typeof hiddenPicker.showPicker === 'function') {
                    try {
                        hiddenPicker.showPicker();
                    } catch (err) {
                        hiddenPicker.click();
                    }
                } else {
                    hiddenPicker.focus();
                    hiddenPicker.click();
                }
            });

            // Quando o usuário seleciona uma data no calendário nativo
            hiddenPicker.addEventListener('change', () => {
                if (hiddenPicker.value) {
                    input.value = this.formatToBr(hiddenPicker.value);
                    this.validarCampoVisual(input, feedback);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });

            // Suporte ergonômico para Backspace próximo a barras
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace') {
                    const val = input.value;
                    const selStart = input.selectionStart;
                    const selEnd = input.selectionEnd;
                    if (selStart === selEnd && (selStart === 3 || selStart === 6) && val[selStart - 1] === '/') {
                        e.preventDefault();
                        input.value = val.slice(0, selStart - 2) + val.slice(selStart);
                        input.setSelectionRange(selStart - 2, selStart - 2);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });

            // 1. Digitação com inserção automática de barras
            input.addEventListener('input', (e) => {
                this.aplicarMascaraTexto(input);
                if (input.value.length === 10) {
                    this.validarCampoVisual(input, feedback);
                } else if (feedback.style.display !== 'none') {
                    feedback.style.display = 'none';
                    input.classList.remove('is-invalid');
                }
            });

            // 2. Colar inteligente (Smart Paste)
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const textoColado = (e.clipboardData || window.clipboardData).getData('text') || '';
                const formatado = this.formatToBr(textoColado);
                input.value = formatado;
                this.validarCampoVisual(input, feedback);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });

            // 3. Validação ao perder o foco (blur)
            input.addEventListener('blur', () => {
                this.validarCampoVisual(input, feedback);
            });

            // 4. Limpa aviso ao focar
            input.addEventListener('focus', () => {
                if (input.value.length < 10 && feedback.style.display !== 'none') {
                    feedback.style.display = 'none';
                    input.classList.remove('is-invalid');
                }
            });

            // Validação inicial
            if (input.value) {
                this.validarCampoVisual(input, feedback);
            }
        },

        /**
         * Inicializa todos os campos de data marcados no sistema
         */
        initAll: function() {
            const dateInputs = document.querySelectorAll(
                'input.date-masked-input, input[data-is-date="true"], #field-dob, #field-data-altura, #field-data-peso, #field-data-mol, #field-data-consulta, #field-date-death, #field-last-followup, #input-data-atendimento'
            );

            dateInputs.forEach(input => {
                this.enhance(input);
            });
        }
    };

    window.AGCDateInput = AGCDateInput;

    // Inicialização automática ao carregar o DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AGCDateInput.initAll());
    } else {
        AGCDateInput.initAll();
    }

})(window);
