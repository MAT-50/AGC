/**
 * AGC Analytics — Controlador do Formulário Clínico e Integração Prontuário
 * Ambulatório de Aconselhamento Genético do Câncer (AGC)
 * Faculdade de Medicina de Ribeirão Preto — Universidade de São Paulo (FMRP-USP)
 * 
 * Controlador orientado a metadados (Schema-Driven) responsável pela reatividade,
 * alternância de abas, contêineres dinâmicos (1..6 variantes e 1..6 apresentações),
 * sincronização do paciente, persistência de rascunho e geração da Máscara HC.
 */

const FormularioClinico = {
    abaAtiva: 'tab-identificacao',
    STORAGE_KEY: 'agc_formulario_rascunho_v2',

    init: function() {
        if (localStorage.getItem('agc_show_field_tags') === '1') {
            document.body.classList.add('show-field-tags');
        }
        this.configurarAbas();
        this.configurarNavegacaoTeclado();
        this.configurarCalculosAutomaticos();
        this.configurarSincronizacaoBanner();
        this.configurarControlesDinamicos();
        this.configurarEventosRascunho();
        this.configurarAuditoriaCampos();
        this.carregarRascunho();

        // Avaliação inicial do CDSS após o carregamento do DOM
        setTimeout(() => {
            this.executarCdss();
            if (window.RedcapBranching) {
                window.RedcapBranching.evalAll();
            }
            this.atualizarAuditoriaCampos();
        }, 250);
    },

    alternarTagsRedcap: function() {
        const ativa = document.body.classList.toggle('show-field-tags');
        try {
            localStorage.setItem('agc_show_field_tags', ativa ? '1' : '0');
        } catch (e) {}
        this.mostrarToast(ativa ? '🏷️ Nomes técnicos do REDCap visíveis' : '🏷️ Nomes técnicos ocultados');
    },

    /**
     * Alternância entre as abas clínicas
     */
    configurarAbas: function() {
        const botoesAba = document.querySelectorAll('.form-tab-btn');
        botoesAba.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (!targetTab) return;
                this.trocarAba(targetTab);
            });
        });
    },

    /**
     * Navegação Contínua pelo Teclado (Experiência "Planilha / Sem Mouse"):
     * - Alt + 1..6: Alternar abas clínicas
     * - Ctrl + S: Salvar rascunho
     * - Alt + N: Adicionar novo familiar
     * - Enter / Shift+Enter: Pular para o próximo campo / campo anterior
     * - Na tabela de parentes: Enter navega entre células e cria nova linha no final
     */
    configurarNavegacaoTeclado: function() {
        document.addEventListener('keydown', (e) => {
            // 1. Salvar com Ctrl+S
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.salvarRascunho(true);
                return;
            }

            // 2. Atalhos Alt + 1..6 para alternar abas
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                const num = parseInt(e.key, 10);
                if (num >= 1 && num <= 6) {
                    e.preventDefault();
                    const abas = [
                        'tab-identificacao',
                        'tab-molecular',
                        'tab-historia-pessoal',
                        'tab-historia-familiar',
                        'tab-criterios',
                        'tab-mascara'
                    ];
                    const targetTab = abas[num - 1];
                    if (targetTab) {
                        this.trocarAba(targetTab);
                        const btn = document.querySelector(`.form-tab-btn[data-tab="${targetTab}"]`);
                        const titulo = btn ? btn.textContent.trim().replace(/\s+/g, ' ') : `Aba ${num}`;
                        this.mostrarToast(`⚡ Aba ${num}: ${titulo}`);
                    }
                    return;
                }

                // Alt + N: Adicionar Parente (Árvore Genealógica)
                if (e.key === 'n' || e.key === 'N') {
                    e.preventDefault();
                    if (this.abaAtiva !== 'tab-historia-familiar') {
                        this.trocarAba('tab-historia-familiar');
                    }
                    if (window.TabelaParentes && typeof window.TabelaParentes.adicionarParente === 'function') {
                        window.TabelaParentes.adicionarParente();
                    }
                    return;
                }
            }

            // 3. Navegação com Enter / Shift+Enter estilo Planilha
            if (e.key === 'Enter') {
                const el = e.target;
                if (!el) return;

                // Não intercepta botões (permite clicar/ativar botão via Enter)
                if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit'))) return;

                // Não intercepta Textarea comum (permite quebras de linha normais, a menos que seja Ctrl+Enter)
                if (el.tagName === 'TEXTAREA' && !e.ctrlKey) return;

                // Não intercepta se houver modal aberto
                const modalAtivo = document.querySelector('.modal-overlay.active, .modal.show, .custom-modal.is-active, #modal-redcap.active, #inspector-modal.active');
                if (modalAtivo && modalAtivo.style.display !== 'none' && !modalAtivo.contains(el)) return;

                // Não intercepta se o menu flutuante de um combobox estiver aberto (ele próprio consome o Enter)
                const menuComboboxAberto = document.querySelector('.searchable-select-floating-menu.is-active, #parentesco-floating-menu.is-active');
                if (menuComboboxAberto && menuComboboxAberto.style.display !== 'none') return;

                // CENÁRIO A: Dentro da Tabela de Parentes (table.table-parentes)
                const trParente = el.closest('table.table-parentes tr');
                if (trParente) {
                    e.preventDefault();
                    this.navegarTecladoTabela(trParente, el, e.shiftKey);
                    return;
                }

                // CENÁRIO B: Formulário Geral (Abas 1, 2, 3, 5)
                const tabAtiva = document.querySelector('.form-tab-pane.is-active');
                if (tabAtiva) {
                    e.preventDefault();
                    this.navegarTecladoFormulario(tabAtiva, el, e.shiftKey);
                    return;
                }
            }
        });
    },

    selecionarAba: function(tabId) {
        this.trocarAba(tabId);
    },

    navegarTecladoTabela: function(tr, elAtual, isShift) {
        // Coleta todos os inputs e selects editáveis da linha
        const celulas = Array.from(tr.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled])'
        )).filter(elem => {
            if (elem.offsetParent === null) return false;
            if (elem.closest('.col-falecimento') && window.getComputedStyle(elem.closest('.col-falecimento')).display === 'none') return false;
            return true;
        });

        const idx = celulas.indexOf(elAtual);
        if (idx === -1) return;

        if (isShift) {
            // Volta para a célula anterior
            if (idx > 0) {
                const prev = celulas[idx - 1];
                prev.focus();
                if (typeof prev.select === 'function') prev.select();
            } else {
                // Vai para a última célula da linha anterior
                const prevTr = tr.previousElementSibling;
                if (prevTr) {
                    const prevCelulas = Array.from(prevTr.querySelectorAll(
                        'input:not([type="hidden"]):not([disabled]), select:not([disabled])'
                    )).filter(e => e.offsetParent !== null);
                    if (prevCelulas.length > 0) {
                        const ultimo = prevCelulas[prevCelulas.length - 1];
                        ultimo.focus();
                        if (typeof ultimo.select === 'function') ultimo.select();
                    }
                }
            }
        } else {
            // Avança para a próxima célula
            if (idx < celulas.length - 1) {
                const next = celulas[idx + 1];
                next.focus();
                if (typeof next.select === 'function') next.select();
            } else {
                // Chegou ao fim da linha atual:
                const nextTr = tr.nextElementSibling;
                if (nextTr) {
                    // Pula para o primeiro input da próxima linha
                    const nextInput = nextTr.querySelector('input.table-input-code, input, select');
                    if (nextInput) {
                        nextInput.focus();
                        if (typeof nextInput.select === 'function') nextInput.select();
                    }
                } else {
                    // É a última linha da tabela: adiciona novo parente automaticamente!
                    if (window.TabelaParentes && typeof window.TabelaParentes.adicionarParente === 'function') {
                        window.TabelaParentes.adicionarParente();
                    }
                }
            }
        }
    },

    navegarTecladoFormulario: function(tabContainer, elAtual, isShift) {
        // Encontra todos os campos interativos visíveis na aba atual
        const seletor = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), .searchable-select-input:not([disabled])';
        
        const todos = Array.from(tabContainer.querySelectorAll(seletor));
        const visiveis = todos.filter(elem => {
            if (elem.disabled) return false;
            // Ignora o select nativo se ele foi substituído pelo wrapper do searchable-select
            if (elem.tagName === 'SELECT' && elem.dataset.searchableSelectInit === '1') return false;
            // Ignora se estiver em contêiner oculto pelo branching logic ou display none
            if (elem.closest('.branching-hidden')) return false;
            if (elem.offsetParent === null && window.getComputedStyle(elem).display === 'none') return false;
            return true;
        });

        const idx = visiveis.indexOf(elAtual);
        if (idx === -1) {
            // Se o elemento atual não foi achado, foca no primeiro visível
            if (visiveis.length > 0) {
                visiveis[0].focus();
                if (typeof visiveis[0].select === 'function') visiveis[0].select();
            }
            return;
        }

        if (isShift) {
            if (idx > 0) {
                const prev = visiveis[idx - 1];
                prev.focus();
                if (typeof prev.select === 'function') prev.select();
            }
        } else {
            if (idx < visiveis.length - 1) {
                const next = visiveis[idx + 1];
                next.focus();
                if (typeof next.select === 'function') next.select();
                next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                // Chegou ao fim da aba: sugere avançar de aba
                this.mostrarToast('✓ Fim dos campos desta aba. Pressione Alt + número para a próxima aba.');
            }
        }
    },

    trocarAba: function(tabId) {
        this.abaAtiva = tabId;

        // Atualiza botões da barra de navegação
        document.querySelectorAll('.form-tab-btn').forEach(b => {
            if (b.getAttribute('data-tab') === tabId) {
                b.classList.add('is-active');
            } else {
                b.classList.remove('is-active');
            }
        });

        // Atualiza visibilidade dos painéis (instantâneo a 60fps)
        document.querySelectorAll('.form-tab-pane').forEach(pane => {
            if (pane.id === tabId) {
                pane.classList.add('is-active');
            } else {
                pane.classList.remove('is-active');
            }
        });

        // Executa tarefas secundárias de background no próximo tick para não travar a transição visual
        requestAnimationFrame(() => {
            if (tabId === 'tab-criterios') {
                this.executarCdss();
            }
            if (tabId === 'tab-mascara') {
                this.atualizarMascaraProntuario();
            }
            if (tabId === 'tab-historia-familiar') {
                this.sincronizarProbandoTabela();
            }
            if (window.RedcapBranching) {
                window.RedcapBranching.evalAll();
            }
        });
    },

    /**
     * Cálculos automáticos: Idade via Data de Nascimento e IMC via Peso/Altura
     */
    configurarCalculosAutomaticos: function() {
        const inDob = document.getElementById('field-dob');
        const inIdade = document.getElementById('field-idade');
        if (inDob && inIdade) {
            const recalcularIdade = () => {
                if (!inDob.value) {
                    this.sincronizarProbandoTabela();
                    return;
                }
                const nasc = new Date(inDob.value + 'T00:00:00');
                const hoje = new Date();
                let idade = hoje.getFullYear() - nasc.getFullYear();
                const m = hoje.getMonth() - nasc.getMonth();
                if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
                    idade--;
                }
                if (idade >= 0) {
                    inIdade.value = idade;
                    this.atualizarBanner();
                    this.sincronizarProbandoTabela();
                    this.executarCdss();
                }
            };
            inDob.addEventListener('change', recalcularIdade);
            inDob.addEventListener('input', recalcularIdade);

            const recalcularManualIdade = () => {
                this.atualizarBanner();
                this.sincronizarProbandoTabela();
                this.executarCdss();
            };
            inIdade.addEventListener('input', recalcularManualIdade);
            inIdade.addEventListener('change', recalcularManualIdade);
        }

        const inPeso = document.getElementById('field-weight');
        const inAltura = document.getElementById('field-height');
        const inBmi = document.getElementById('field-bmi');
        const calcBmi = () => {
            const peso = parseFloat(inPeso.value);
            const altCm = parseFloat(inAltura.value);
            if (peso > 0 && altCm > 0) {
                const altM = altCm > 3 ? altCm / 100 : altCm;
                const bmi = (peso / (altM * altM)).toFixed(1);
                inBmi.value = bmi;
            } else {
                inBmi.value = '';
            }
        };

        if (inPeso && inAltura && inBmi) {
            inPeso.addEventListener('input', calcBmi);
            inAltura.addEventListener('input', calcBmi);
        }
    },

    /**
     * Configuração dos seletores dinâmicos de quantidade (1 a 6)
     */
    configurarControlesDinamicos: function() {
        // 1. Número de Variantes Moleculares (1 a 6)
        const selNVariantes = document.getElementById('field-n-variantes');
        if (selNVariantes) {
            selNVariantes.addEventListener('change', () => {
                const qtd = parseInt(selNVariantes.value, 10);
                this.atualizarQuantidadeVariantes(isNaN(qtd) ? 0 : qtd);
            });
        }

        // 2. Número de Apresentações Clínicas do Probando (1 a 6)
        const selNPrimarios = document.getElementById('field-n-primarios');
        if (selNPrimarios) {
            selNPrimarios.addEventListener('change', () => {
                const qtd = parseInt(selNPrimarios.value, 10);
                this.atualizarQuantidadePrimarios(isNaN(qtd) ? 0 : qtd);
                this.sincronizarProbandoTabela();
                this.executarCdss();
            });
        }

        // 3. Número de Tumores de Mama (1 a 3+)
        const selNMama = document.getElementById('field-n-mama');
        if (selNMama) {
            selNMama.addEventListener('change', () => {
                const qtd = parseInt(selNMama.value, 10);
                for (let m = 1; m <= 3; m++) {
                    const cardMama = document.getElementById(`card-mama-${m}`);
                    if (cardMama) {
                        cardMama.style.display = (!isNaN(qtd) && qtd > 0 && m <= qtd) ? '' : 'none';
                    }
                }
            });
        }

        // 4. Listeners em todos os selects de tumores para reavaliar CDSS, Branching Logic e Tabela de Parentes
        document.querySelectorAll('.select-primario-proband').forEach(sel => {
            sel.addEventListener('change', () => {
                if (window.RedcapBranching) {
                    window.RedcapBranching.evalAll();
                }
                this.sincronizarProbandoTabela();
                this.executarCdss();
            });
        });

        // 4.1 Listeners nas idades ao diagnóstico dos tumores do probando
        for (let p = 1; p <= 6; p++) {
            const inIdadeDx = document.getElementById(`field-idade-dx-${p}`);
            if (inIdadeDx) {
                const onDxAgeChange = () => {
                    this.sincronizarProbandoTabela();
                    this.executarCdss();
                };
                inIdadeDx.addEventListener('input', onDxAgeChange);
                inIdadeDx.addEventListener('change', onDxAgeChange);
            }
        }

        // 5. Listeners em selects de genes
        document.querySelectorAll('.select-gene-mol').forEach(sel => {
            sel.addEventListener('change', () => {
                if (window.RedcapBranching) {
                    window.RedcapBranching.evalAll();
                }
            });
        });
    },

    atualizarQuantidadeVariantes: function(qtd) {
        for (let v = 1; v <= 6; v++) {
            const card = document.getElementById(`card-variante-${v}`);
            if (card) {
                card.style.display = (qtd > 0 && v <= qtd) ? '' : 'none';
            }
        }

        const badge = document.getElementById('count-tab-variantes');
        if (badge) {
            const realizou = document.getElementById('field-realizou-mol')?.value === '1';
            const res = document.getElementById('field-mol-resultado')?.value === '1';
            if (realizou && res && qtd > 0) {
                badge.textContent = qtd;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    atualizarQuantidadePrimarios: function(qtd) {
        for (let p = 1; p <= 6; p++) {
            const card = document.getElementById(`card-primario-${p}`);
            if (card) {
                card.style.display = (qtd > 0 && p <= qtd) ? '' : 'none';
            }
        }
    },

    /**
     * Sincronização em tempo real do Banner do Paciente
     */
    configurarSincronizacaoBanner: function() {
        const camposReativos = ['field-nome', 'field-sobrenome', 'field-registrohc', 'field-rf', 'field-vital-status'];
        camposReativos.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.atualizarBanner());
                el.addEventListener('change', () => this.atualizarBanner());
            }
        });

        document.querySelectorAll('input[name="sex"]').forEach(r => {
            r.addEventListener('change', () => {
                this.atualizarBanner();
                this.sincronizarProbandoTabela();
                this.executarCdss();
            });
        });
    },

    atualizarBanner: function() {
        const nome = (document.getElementById('field-nome')?.value || '').trim();
        const sobrenome = (document.getElementById('field-sobrenome')?.value || '').trim();
        const nomeCompleto = (nome || sobrenome) ? `${nome} ${sobrenome}`.trim() : 'Paciente Novo (Não Identificado)';

        const bannerNome = document.getElementById('banner-nome-paciente');
        if (bannerNome) bannerNome.textContent = nomeCompleto;

        const hc = document.getElementById('field-registrohc')?.value || '—';
        const bannerHc = document.getElementById('banner-hc');
        if (bannerHc) bannerHc.textContent = hc;

        const rf = document.getElementById('field-rf')?.value || '—';
        const bannerRf = document.getElementById('banner-rf');
        if (bannerRf) bannerRf.textContent = rf;

        const idade = document.getElementById('field-idade')?.value;
        const bannerIdade = document.getElementById('banner-idade');
        if (bannerIdade) bannerIdade.textContent = idade ? `${idade} anos` : '—';

        const sexEl = document.querySelector('input[name="sex"]:checked');
        const bannerSexo = document.getElementById('banner-sexo');
        if (bannerSexo) {
            if (sexEl?.value === '1') bannerSexo.textContent = 'Feminino (♀)';
            else if (sexEl?.value === '2') bannerSexo.textContent = 'Masculino (♂)';
            else bannerSexo.textContent = '—';
        }

        const avatar = document.getElementById('banner-avatar');
        if (avatar) {
            const iniciais = (nome ? nome[0] : '') + (sobrenome ? sobrenome[0] : '');
            avatar.textContent = iniciais.toUpperCase() || 'P';
        }
    },

    sincronizarProbandoTabela: function() {
        if (window.TabelaParentes && typeof window.TabelaParentes.sincronizarDadosProbando === 'function') {
            window.TabelaParentes.sincronizarDadosProbando();
        }
    },

    /**
     * Sistema de Rascunho Automático (LocalStorage)
     */
    configurarEventosRascunho: function() {
        const btnSalvar = document.getElementById('btn-salvar-rascunho');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                this.salvarRascunho(true);
            });
        }

        // Autosave a cada 30 segundos
        setInterval(() => {
            this.salvarRascunho(false);
        }, 30000);
    },

    salvarRascunho: function(exibirToast = false) {
        const dadosForm = {};
        const inputs = document.querySelectorAll('.form-control, input[type="radio"]:checked, input[type="checkbox"]');
        inputs.forEach(el => {
            if (el.classList && el.classList.contains('searchable-select-input')) return;
            const campoKey = el.getAttribute('data-redcap-field') || el.name || el.id;
            if (!campoKey) return;

            if (el.type === 'checkbox') {
                const code = el.getAttribute('data-code');
                const key = code ? `${campoKey}_code_${code}` : campoKey;
                dadosForm[key] = el.checked;
            } else if (el.type === 'radio') {
                if (el.checked) {
                    const rName = el.name || el.getAttribute('data-redcap-field') || campoKey;
                    const rVal = el.getAttribute('data-val') || el.getAttribute('value') || el.value;
                    dadosForm[rName] = rVal;
                }
            } else {
                dadosForm[campoKey] = el.value;
            }
        });

        // Inclui dados da tabela de parentes
        if (window.TabelaParentes && TabelaParentes.parentes) {
            dadosForm['_parentes'] = TabelaParentes.parentes;
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            salvoEm: new Date().toISOString(),
            dados: dadosForm
        }));

        const statusBadge = document.getElementById('status-rascunho-texto');
        if (statusBadge) {
            const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            statusBadge.textContent = `Salvo às ${hora}`;
        }

        if (exibirToast) {
            this.mostrarToast('✓ Rascunho salvo no navegador!');
        }
    },

    carregarRascunho: function() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return;
            const payload = JSON.parse(raw);
            if (!payload || !payload.dados) return;

            const dados = payload.dados;
            for (const key in dados) {
                if (key === '_parentes' && window.TabelaParentes && Array.isArray(dados[key]) && dados[key].length > 0) {
                    TabelaParentes.parentes = dados[key];
                    TabelaParentes.renderizarTabela();
                    TabelaParentes.sincronizarHeredograma();
                } else if (key.includes('_code_')) {
                    const parts = key.split('_code_');
                    const fieldName = parts[0];
                    const code = parts[1];
                    const cb = document.querySelector(`input[data-redcap-field="${fieldName}"][data-code="${code}"], input[name="${fieldName}"][value="${code}"]`);
                    if (cb) cb.checked = Boolean(dados[key]);
                } else {
                    // Busca radio button correspondente à chave e ao valor exato
                    const rad = document.querySelector(`input[type="radio"][name="${key}"][value="${dados[key]}"], input[type="radio"][data-redcap-field="${key}"][value="${dados[key]}"], input[type="radio"][name="${key}"][data-val="${dados[key]}"], input[type="radio"][data-redcap-field="${key}"][data-val="${dados[key]}"]`);
                    if (rad) {
                        rad.checked = true;
                    } else {
                        const el = document.querySelector(`[data-redcap-field="${key}"], #${key}`);
                        if (el) {
                            if (el.type === 'checkbox') {
                                el.checked = Boolean(dados[key]);
                            } else if (el.type === 'radio') {
                                // NUNCA sobrescrever .value de um input radio!
                                el.checked = (String(el.value) === String(dados[key]) || String(el.getAttribute('data-val')) === String(dados[key]));
                            } else {
                                el.value = dados[key];
                            }
                        }
                    }
                }
            }

            // Restaura quantidades de contêineres dinâmicos
            const rawVar = document.getElementById('field-n-variantes')?.value;
            const qtdVar = rawVar ? (parseInt(rawVar, 10) || 0) : 0;
            this.atualizarQuantidadeVariantes(qtdVar);

            const rawPrim = document.getElementById('field-n-primarios')?.value;
            const qtdPrim = rawPrim ? (parseInt(rawPrim, 10) || 0) : 0;
            this.atualizarQuantidadePrimarios(qtdPrim);

            const rawMama = document.getElementById('field-n-mama')?.value;
            const qtdMama = rawMama ? (parseInt(rawMama, 10) || 0) : 0;
            for (let m = 1; m <= 3; m++) {
                const card = document.getElementById(`card-mama-${m}`);
                if (card) card.style.display = (qtdMama > 0 && m <= qtdMama) ? '' : 'none';
            }

            this.atualizarBanner();
            this.sincronizarProbandoTabela();
        } catch (e) {
            console.warn('Erro ao restaurar rascunho:', e);
        }
    },

    mostrarToast: function(mensagem) {
        let toast = document.getElementById('toast-feedback-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-feedback-msg';
            toast.className = 'toast-feedback';
            document.body.appendChild(toast);
        }
        toast.textContent = mensagem;
        toast.classList.add('is-visible');
        setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3000);
    },

    /**
     * Executa o Motor de Inferência CDSS em Tempo Real
     */
    executarCdss: function() {
        if (!window.CdssEngine) return;

        // Extrai dados clínicos do probando a partir dos campos do formulário
        const sexVal = document.querySelector('input[name="sex"]:checked')?.value || '1';
        const dadosClinicos = {
            idade: parseInt(document.getElementById('field-idade')?.value, 10) || 45,
            sex: sexVal,
            sexo: sexVal === '2' ? 'M' : 'F',
            ashkenazi: document.getElementById('field-ashkenazi')?.checked || false,
            tumores: []
        };

        // Coleta tumores do probando (1 a 6)
        const qtdPrimarios = parseInt(document.getElementById('field-n-primarios')?.value, 10) || 1;
        for (let i = 1; i <= qtdPrimarios; i++) {
            const primVal = document.getElementById(`field-primario-${i}`)?.value;
            const idadeDx = document.getElementById(`field-idade-dx-${i}`)?.value;
            const det = document.getElementById(`field-detalhes-dx-${i}`)?.value || '';

            if (primVal) {
                // Obtém label legível se disponível
                let tipoLabel = primVal;
                if (window.REDCAP_DICTIONARY && window.REDCAP_DICTIONARY.tumores) {
                    const match = window.REDCAP_DICTIONARY.tumores.find(t => String(t.value) === String(primVal));
                    if (match) tipoLabel = match.label;
                }

                dadosClinicos.tumores.push({
                    codigo: primVal,
                    tipo: tipoLabel,
                    idadeDx: parseInt(idadeDx, 10) || dadosClinicos.idade,
                    detalhes: det
                });
            }
        }

        // Parentes da tabela
        const parentes = (window.TabelaParentes && TabelaParentes.parentes) ? TabelaParentes.parentes : [];

        // Avalia via motor CDSS
        const resultado = CdssEngine.avaliar(dadosClinicos, parentes);
        this.resultadoCdss = resultado;
        this.renderizarResultadoCdss(resultado);
        return resultado;
    },

    renderizarResultadoCdss: function(resultado) {
        const badge = document.getElementById('cdss-status-badge');
        const lista = document.getElementById('cdss-criterios-lista');
        if (!badge || !lista) return;

        if (resultado.indicacaoGeral) {
            badge.style.background = 'rgba(22, 163, 74, 0.15)';
            badge.style.color = '#15803d';
            badge.style.borderColor = 'rgba(22, 163, 74, 0.35)';
            badge.innerHTML = `🟢 <strong>Indicação Formal de Testagem Genética Preenchida</strong> (${resultado.criteriosAtendidos.length} critérios atendidos)`;
        } else {
            badge.style.background = 'rgba(100, 116, 139, 0.1)';
            badge.style.color = 'var(--text-muted)';
            badge.style.borderColor = 'var(--border-color)';
            badge.innerHTML = `⚪ Critérios formais NCCN não atendidos no momento`;
        }

        if (resultado.criteriosAtendidos.length === 0) {
            lista.innerHTML = `<div style="font-size:12px; font-style:italic; color:var(--text-muted); padding:6px 0;">Nenhum critério NCCN ativo no momento com base nos dados relatados.</div>`;
        } else {
            let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
            resultado.criteriosAtendidos.forEach(c => {
                html += `
                    <div style="padding:8px 12px; background:var(--bg-card-solid); border:1px solid var(--border-color); border-left:3px solid var(--accent); border-radius:6px; font-size:12px;">
                        <div style="font-weight:700; color:var(--accent); display:flex; justify-content:space-between;">
                            <span>${c.sindrome} • ${c.codigo}</span>
                            <span style="font-size:10px; background:rgba(14, 165, 233, 0.1); padding:1px 6px; border-radius:4px;">NCCN v3.2026</span>
                        </div>
                        <div style="color:var(--text-main); margin-top:3px;">${c.descricao}</div>
                        ${c.justificativa ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Justificativa: ${c.justificativa}</div>` : ''}
                    </div>
                `;
            });
            html += '</div>';
            lista.innerHTML = html;
        }
    },

    /**
     * Geração da Máscara de Evolução Clínica para o Prontuário do HCFMRP-USP
     */
    atualizarMascaraProntuario: function() {
        const textarea = document.getElementById('textarea-mascara-prontuario');
        if (!textarea) return;

        const nome = (document.getElementById('field-nome')?.value || '').trim();
        const sobrenome = (document.getElementById('field-sobrenome')?.value || '').trim();
        const nomeCompleto = `${nome} ${sobrenome}`.trim() || '[NÃO INFORMADO]';
        const hc = document.getElementById('field-registrohc')?.value || '[NÃO INFORMADO]';
        const rf = document.getElementById('field-rf')?.value || '—';
        const dob = document.getElementById('field-dob')?.value || '—';
        const idade = document.getElementById('field-idade')?.value || '—';
        const dataConsulta = document.getElementById('field-data-consulta')?.value || new Date().toLocaleDateString('pt-BR');

        const sexVal = document.querySelector('input[name="sex"]:checked')?.value;
        const sexoStr = sexVal === '1' ? 'Feminino (♀)' : (sexVal === '2' ? 'Masculino (♂)' : 'Não informado');

        // Demografia
        const racaVal = document.getElementById('field-race')?.value;
        const racaLabel = window.REDCAP_DICTIONARY?.raca_ibge?.find(r => r.value === racaVal)?.label || 'Não informada';
        const ufVal = document.getElementById('field-uf')?.value;
        const ufLabel = window.REDCAP_DICTIONARY?.estados_uf?.find(u => u.value === ufVal)?.label || 'SP';
        const cidade = document.getElementById('field-city')?.value || 'Ribeirão Preto';
        const bmi = document.getElementById('field-bmi')?.value;

        // Motivo
        const motivos = [];
        if (document.getElementById('motivo-hp')?.checked) motivos.push('História Pessoal de Câncer');
        if (document.getElementById('motivo-hf')?.checked) motivos.push('História Familiar de Câncer');
        if (document.getElementById('motivo-teste-pos')?.checked) motivos.push('Teste Genético Positivo no Probando');
        if (document.getElementById('motivo-outros')?.checked) {
            const outTxt = document.getElementById('field-outros-motivos')?.value;
            motivos.push(outTxt ? `Outros (${outTxt})` : 'Outros');
        }
        const motivoStr = motivos.length > 0 ? motivos.join(', ') : 'Aconselhamento Genético em Oncologia';

        // Tumores do Probando (1 a 6)
        const tumoresProbando = [];
        const qtdPrimarios = parseInt(document.getElementById('field-n-primarios')?.value, 10) || 1;
        for (let i = 1; i <= qtdPrimarios; i++) {
            const prim = document.getElementById(`field-primario-${i}`)?.value;
            const idadeDx = document.getElementById(`field-idade-dx-${i}`)?.value;
            const det = document.getElementById(`field-detalhes-dx-${i}`)?.value;
            if (prim) {
                let rotuloTumor = prim;
                if (window.REDCAP_DICTIONARY?.tumores) {
                    const match = window.REDCAP_DICTIONARY.tumores.find(t => String(t.value) === String(prim));
                    if (match) rotuloTumor = match.label;
                }
                let linha = `- Apresentação #${i}: ${rotuloTumor}`;
                if (idadeDx) linha += ` aos ${idadeDx} anos`;
                if (det) linha += ` [Detalhes: ${det}]`;
                tumoresProbando.push(linha);
            }
        }

        // Sub-estadiamento e especificações (Branching)
        const subDetalhes = [];
        // Mama
        if (document.getElementById('panel-branching-mama')?.style.display !== 'none') {
            const nMama = document.getElementById('field-n-mama')?.value || '1';
            const histMama = document.getElementById('field-bc-histology-1')?.value;
            const herMama = document.getElementById('field-her-1')?.value;
            const stageMama = document.getElementById('field-bc-stage-1')?.value;
            const parp = document.getElementById('field-parb-ini-1')?.value;
            subDetalhes.push(`* Mama: ${nMama} tumor(es); Histologia: ${histMama || '—'}; HER2: ${herMama || '—'}; Estádio: ${stageMama || '—'}; Uso PARP: ${parp === '1' ? 'Sim' : 'Não'}`);
        }
        // Rim
        if (document.getElementById('panel-branching-rim')?.style.display !== 'none') {
            const tipoRim = document.getElementById('field-rim-tipo')?.value;
            const rccMult = document.getElementById('field-rcc-multiplo')?.value;
            subDetalhes.push(`* Rim: Histologia cod ${tipoRim || '—'}; Multifocal: ${rccMult === '1' ? 'Sim' : 'Não'}`);
        }
        // Tireoide
        if (document.getElementById('panel-branching-tireoide')?.style.display !== 'none') {
            const tipoTireoide = document.getElementById('field-tireoide-tipo')?.value;
            subDetalhes.push(`* Tireoide: Histologia cod ${tipoTireoide || '—'}`);
        }

        // História Familiar da Tabela
        const parentesAfetados = [];
        if (window.TabelaParentes && TabelaParentes.parentes) {
            TabelaParentes.parentes.forEach(p => {
                const cod = (p.codA || '').toUpperCase().trim();
                if (cod === 'A1') return;
                const diags = Array.isArray(p.diags) ? p.diags : [];
                const diagsCancer = diags.filter(d => {
                    const isStatus = window.TabelaParentes && typeof TabelaParentes.isStatusDiagnostico === 'function'
                        ? TabelaParentes.isStatusDiagnostico(d.tumor) || TabelaParentes.isStatusDiagnostico(d.codigo)
                        : (['HIST_DESC', 'SEM_HIST'].includes(d.codigo));
                    return !isStatus;
                });
                if (diagsCancer.length > 0) {
                    const rotulo = p.parentesco || cod;
                    const descDiags = diagsCancer.map(d => {
                        const tumorTxt = (d.outro && (d.tumor === 'Outros' || d.tumor === 'Outro' || String(d.tumor).toLowerCase().startsWith('outro')))
                            ? `Outros: ${d.outro}`
                            : d.tumor;
                        return `${tumorTxt}${d.idade ? ` aos ${d.idade}a` : ''}`;
                    }).join(', ');
                    const vital = p.estadoVital === 'Falecido' ? (p.idadeObito ? ` [† aos ${p.idadeObito}a]` : ' [†]') : '';
                    parentesAfetados.push(`- ${rotulo} (${cod}): ${descDiags}${vital}`);
                }
            });
        }

        // Exame Molecular
        const realizouMol = document.getElementById('field-realizou-mol')?.value;
        const variantesReportadas = [];
        if (realizouMol === '1') {
            const qtdVar = parseInt(document.getElementById('field-n-variantes')?.value, 10) || 1;
            for (let v = 1; v <= qtdVar; v++) {
                const geneVal = document.getElementById(`field-gene-${v}`)?.value;
                if (geneVal) {
                    let geneNome = geneVal;
                    if (window.REDCAP_DICTIONARY?.genes) {
                        const matchG = window.REDCAP_DICTIONARY.genes.find(g => String(g.value) === String(geneVal));
                        if (matchG) geneNome = matchG.label;
                    }
                    const c = document.getElementById(`field-c-${v}`)?.value || '';
                    const p = document.getElementById(`field-p-${v}`)?.value || '';
                    const classif = document.getElementById(`field-classificacao-${v}`)?.value || '';
                    const classifLabel = classif === '1' ? 'Patogênica' : (classif === '2' ? 'Provavelmente Patogênica' : 'VUS');
                    variantesReportadas.push(`- Variante #${v}: Gene ${geneNome} | c.${c || '—'} | p.${p || '—'} | Classificação: ${classifLabel}`);
                }
            }
        }

        // CDSS
        const resCdss = this.executarCdss();
        let cdssTexto = resCdss ? resCdss.resumoTexto : 'Não avaliado.';
        if (resCdss && resCdss.criteriosAtendidos.length > 0) {
            cdssTexto += '\nCritérios atendidos:\n' + resCdss.criteriosAtendidos.map(c => `  * [${c.sindrome}] ${c.descricao}`).join('\n');
        }

        // Dados adicionais de história familiar
        const consangRad = document.querySelector('input[name="consanguinidade"]:checked')?.value;
        const consangTxt = consangRad === '1' ? `Sim (${document.getElementById('field-esp-consanguinid')?.value || 'não especificado'})` : (consangRad === '2' ? 'Não' : 'Não informada');
        const conterRad = document.querySelector('input[name="conterraneidade"]:checked')?.value;
        const conterTxt = conterRad === '1' ? `Sim (${document.getElementById('field-esp-conterraneidad')?.value || 'não especificado'})` : (conterRad === '2' ? 'Não' : 'Não informada');
        const geneFamSel = document.getElementById('field-variante-familia');
        const geneFamNome = geneFamSel?.value ? (geneFamSel.selectedOptions[0]?.textContent || geneFamSel.value) : '';
        const addInfoTxt = document.getElementById('field-add-info')?.value || '';

        // Testagem Somática e Pré-teste
        const somaticoItens = [];
        if (document.querySelector('input[name="teste_somatico___4"]:checked')) somaticoItens.push('MSI-H detectado: ' + (document.getElementById('field-tumor-msi')?.value || 'tumor informado'));
        if (document.querySelector('input[name="teste_somatico___5"]:checked')) somaticoItens.push('dMMR detectado: ' + (document.getElementById('field-tumor-dmmr')?.value || 'biópsia informada'));
        if (document.querySelector('input[name="teste_somatico___1"]:checked')) somaticoItens.push('Variante somática PTEN');
        if (document.querySelector('input[name="teste_somatico___3"]:checked')) somaticoItens.push('Variante somática TP53');
        const olaparibeVal = document.getElementById('field-testar-olaparibe')?.value;
        if (olaparibeVal === '1') somaticoItens.push('Indicação potencial para Olaparibe (mama HER2-negativo alto risco)');

        const preTesteItens = [];
        const brcaProb = document.querySelector('input[name="pre_teste_brca"]')?.value;
        if (brcaProb) preTesteItens.push(`Probabilidade BRCA1/2: ${brcaProb}`);
        const slProb = document.querySelector('input[name="pre_teste_sl"]')?.value;
        if (slProb) preTesteItens.push(`Probabilidade Lynch (MMR): ${slProb}`);

        // Monta a máscara textual completa
        const mascara = `================================================================================
AMBULATÓRIO DE ACONSELHAMENTO GENÉTICO DO CÂNCER (AGC) — FMRP-USP / HCFMRP-USP
CONSULTA DE ONCOGENÉTICA • MÁSCARA PADRÃO DE EVOLUÇÃO CLÍNICA
================================================================================
DATA DO ATENDIMENTO : ${dataConsulta}
PACIENTE (PROBANDO) : ${nomeCompleto}
REGISTRO HC         : ${hc}
REGISTRO FAMILIAR   : ${rf}
DATA DE NASCIMENTO  : ${dob} (${idade} anos) | SEXO: ${sexoStr}
PERFIL DEMOGRÁFICO  : Raça/Cor: ${racaLabel} | Procedência: ${cidade}/${ufLabel}${bmi ? ` | IMC: ${bmi}` : ''}

--------------------------------------------------------------------------------
1. MOTIVO DO ENCAMINHAMENTO & HÁBITOS DE VIDA
--------------------------------------------------------------------------------
- Motivo(s): ${motivoStr}
- Hábitos: Tabagismo: ${document.getElementById('field-tobacco')?.value || 'Não inf.'} | Etilismo: ${document.getElementById('field-alcohol')?.value || 'Não inf.'}

--------------------------------------------------------------------------------
2. HISTÓRIA PESSOAL DE NEOPLASIAS (PROBANDO)
--------------------------------------------------------------------------------
${tumoresProbando.length > 0 ? tumoresProbando.join('\n') : 'Sem história pessoal de neoplasia relatada até o momento.'}
${subDetalhes.length > 0 ? '\nDetalhes Específicos & Biomarcadores:\n' + subDetalhes.join('\n') : ''}
${somaticoItens.length > 0 ? '\nTestagem Somática & Imunohistoquímica:\n' + somaticoItens.map(s => `- ${s}`).join('\n') : ''}

--------------------------------------------------------------------------------
3. HISTÓRIA FAMILIAR DE CÂNCER (HEREDOGRAMA ESTRUTURADO)
--------------------------------------------------------------------------------
- Total de familiares cadastrados: ${(window.TabelaParentes && TabelaParentes.parentes) ? TabelaParentes.parentes.length : 0}
- Consanguinidade: ${consangTxt} | Conterraneidade: ${conterTxt}
${geneFamNome ? `- Variante familiar conhecida: Gene ${geneFamNome}\n` : ''}${addInfoTxt ? `- Observações da Família: ${addInfoTxt}\n` : ''}Familiares acometidos por neoplasia:
${parentesAfetados.length > 0 ? parentesAfetados.join('\n') : 'Nenhum familiar afetado por neoplasia relatado.'}

--------------------------------------------------------------------------------
4. TESTAGEM GENÉTICA & EXAME MOLECULAR
--------------------------------------------------------------------------------
${realizouMol === '1' 
    ? (variantesReportadas.length > 0 
        ? 'Exame Molecular REALIZADO com variantes reportadas:\n' + variantesReportadas.join('\n')
        : 'Exame Molecular REALIZADO: Sem variantes patogênicas reportadas (Negativo/Informativo).')
    : 'Exame molecular ainda não realizado pelo probando.'}

--------------------------------------------------------------------------------
5. AVALIAÇÃO DE RISCO & DIRETRIZES NCCN (CDSS v3.2026)
--------------------------------------------------------------------------------
${preTesteItens.length > 0 ? 'Cálculos de Predição Pré-Teste:\n' + preTesteItens.map(p => `- ${p}`).join('\n') + '\n\n' : ''}${cdssTexto}

================================================================================
Conduta / Parecer:
[ ] Indicação de realização de painel multigênico germinativo por NGS
[ ] Coleta de amostra biológica para pesquisa AGC / HCFMRP-USP
[ ] Orientações de rastreamento de alto risco e redução de risco
[ ] Aconselhamento genético pré-teste realizado com termo assinado
================================================================================`;

        textarea.value = mascara;
    },

    copiarMascaraProntuario: function() {
        this.atualizarMascaraProntuario();
        const textarea = document.getElementById('textarea-mascara-prontuario');
        if (!textarea) return;

        textarea.select();
        navigator.clipboard.writeText(textarea.value).then(() => {
            this.mostrarToast('✓ Máscara copiada para a área de transferência!');
        }).catch(() => {
            // Fallback manual
            document.execCommand('copy');
            this.mostrarToast('✓ Máscara copiada com sucesso!');
        });
    },

    /**
     * =========================================================================
     * MÓDULO DE AUDITORIA DE CONFORMIDADE REDCAP (METADATA REAL-TIME COUNTERS)
     * =========================================================================
     */

    _auditoriaDebounceTimer: null,

    agendarAuditoriaCampos: function(delay = 400) {
        if (window._isBatchLoading) return;
        clearTimeout(this._auditoriaDebounceTimer);
        this._auditoriaDebounceTimer = setTimeout(() => {
            this.atualizarAuditoriaCampos();
        }, delay);
    },

    configurarAuditoriaCampos: function() {
        // Atualização em eventos de alteração de campos (debounced para evitar travamento)
        document.addEventListener('change', (e) => {
            if (window._isBatchLoading) return;
            if (e.target && e.target.classList && e.target.classList.contains('searchable-select-input')) return;
            this.agendarAuditoriaCampos(400);
        });

        document.addEventListener('input', (e) => {
            if (window._isBatchLoading) return;
            if (e.target && e.target.classList && e.target.classList.contains('searchable-select-input')) return;
            if (e.target && e.target.matches('input[type="number"], select')) {
                this.agendarAuditoriaCampos(500);
            }
        });

        // Ouvinte de busca no modal de auditoria
        const inBusca = document.getElementById('inspector-busca');
        if (inBusca) {
            inBusca.addEventListener('input', (e) => {
                this.filtrarTabelaAuditoria(e.target.value);
            });
        }

        // Fechamento de modal com a tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.fecharModalAuditoria();
            }
        });
    },

    /**
     * Avalia se um campo do esquema compilado está visível no estado atual do formulário
     */
    verificarVisibilidadeCampo: function(campo) {
        if (!campo) return false;

        // Se o campo não possui branching logic no REDCap, ele é um campo base (sempre visível)
        if (!campo.branching_logic || campo.branching_logic.trim() === '') {
            return true;
        }

        // Se possui branching logic, avalia via motor REDCap
        if (window.RedcapBranching && typeof window.RedcapBranching.evaluate === 'function') {
            return Boolean(window.RedcapBranching.evaluate(campo.branching_logic));
        }

        return true;
    },

    /**
     * Atualiza as barras de auditoria de conformidade em cada uma das 5 abas
     */
    atualizarAuditoriaCampos: function() {
        if (!document.querySelector('.redcap-tab-audit-card')) return;
        const schema = window.REDCAP_SCHEMA;
        if (!schema || !schema.fields_by_form) return;

        // 1. ABA 1: IDENTIFICAÇÃO & DEMOGRAFIA (identificao: 9 + demografia: 18 = 27)
        const camposAba1 = [
            ...(schema.fields_by_form['identificao'] || []),
            ...(schema.fields_by_form['demografia'] || [])
        ];
        if (camposAba1.length > 0) {
            const total1 = camposAba1.length;
            let visiveis1 = 0;
            camposAba1.forEach(c => {
                if (this.verificarVisibilidadeCampo(c)) visiveis1++;
            });
            const ocultos1 = total1 - visiveis1;

            const elTotal1 = document.getElementById('audit-total-tab-identificacao');
            const elVis1 = document.getElementById('audit-visible-tab-identificacao');
            const elOcult1 = document.getElementById('audit-hidden-tab-identificacao');
            if (elTotal1) elTotal1.textContent = total1;
            if (elVis1) elVis1.textContent = visiveis1;
            if (elOcult1) elOcult1.textContent = ocultos1;
        }

        // 2. ABA 2: EXAME MOLECULAR (exame_molecular: 67)
        const camposAba2 = schema.fields_by_form['exame_molecular'] || [];
        if (camposAba2.length > 0) {
            const total2 = camposAba2.length;
            let visiveis2 = 0;
            camposAba2.forEach(c => {
                if (this.verificarVisibilidadeCampo(c)) visiveis2++;
            });
            const ocultos2 = total2 - visiveis2;

            const elTotal2 = document.getElementById('audit-total-tab-molecular');
            const elVis2 = document.getElementById('audit-visible-tab-molecular');
            const elOcult2 = document.getElementById('audit-hidden-tab-molecular');
            if (elTotal2) elTotal2.textContent = total2;
            if (elVis2) elVis2.textContent = visiveis2;
            if (elOcult2) elOcult2.textContent = ocultos2;
        }

        // 3. ABA 3: HISTÓRIA PESSOAL & TUMORES E LESÕES (histria_pessoal: 70 + tumores_e_leses: 106 = 176)
        const camposAba3 = [
            ...(schema.fields_by_form['histria_pessoal'] || []),
            ...(schema.fields_by_form['tumores_e_leses'] || [])
        ];
        if (camposAba3.length > 0) {
            const total3 = camposAba3.length;
            let visiveis3 = 0;
            camposAba3.forEach(c => {
                if (this.verificarVisibilidadeCampo(c)) visiveis3++;
            });
            const ocultos3 = total3 - visiveis3;

            const elTotal3 = document.getElementById('audit-total-tab-historia-pessoal');
            const elVis3 = document.getElementById('audit-visible-tab-historia-pessoal');
            const elOcult3 = document.getElementById('audit-hidden-tab-historia-pessoal');
            if (elTotal3) elTotal3.textContent = total3;
            if (elVis3) elVis3.textContent = visiveis3;
            if (elOcult3) elOcult3.textContent = ocultos3;
        }

        // 4. ABA 4: HISTÓRIA FAMILIAR (7 INSTRUMENTOS hf_*)
        const elTotal4 = document.getElementById('audit-total-tab-historia-familiar');
        const elVis4 = document.getElementById('audit-visible-tab-historia-familiar');
        const elDiags4 = document.getElementById('audit-diags-tab-historia-familiar');
        
        let qtdParentes = 0;
        let totalDiags = 0;
        if (window.TabelaParentes && Array.isArray(TabelaParentes.parentes)) {
            qtdParentes = TabelaParentes.parentes.length;
            TabelaParentes.parentes.forEach(p => {
                const diagsList = Array.isArray(p.diags) ? p.diags : (Array.isArray(p.neoplasias) ? p.neoplasias : []);
                const cancerList = diagsList.filter(d => {
                    const isStatus = window.TabelaParentes && typeof TabelaParentes.isStatusDiagnostico === 'function'
                        ? TabelaParentes.isStatusDiagnostico(d.tumor) || TabelaParentes.isStatusDiagnostico(d.codigo)
                        : (['HIST_DESC', 'SEM_HIST'].includes(d.codigo));
                    return !isStatus;
                });
                totalDiags += cancerList.length;
            });
        }
        if (elVis4) elVis4.textContent = qtdParentes;
        if (elDiags4) elDiags4.textContent = totalDiags;

        if (window.RedcapCalibradorHF && window.TabelaParentes) {
            const calib = window.RedcapCalibradorHF.calibrarTabela(window.TabelaParentes.parentes);
            if (elTotal4) elTotal4.textContent = calib.estatisticas.totalVariaveisGeradas;
        } else if (elTotal4) {
            elTotal4.textContent = '7';
        }

        // 5. ABA 5: CRITÉRIOS DE TESTAGEM (critrios_de_testagem: 206)
        const camposAba5 = schema.fields_by_form['critrios_de_testagem'] || [];
        if (camposAba5.length > 0) {
            const total5 = camposAba5.length;
            let criteriosAtivos = 0;
            if (this.resultadoCdss && Array.isArray(this.resultadoCdss.criteriosAtendidos)) {
                criteriosAtivos = this.resultadoCdss.criteriosAtendidos.length;
            } else {
                camposAba5.forEach(c => {
                    if (c.branching_logic && this.verificarVisibilidadeCampo(c)) {
                        criteriosAtivos++;
                    }
                });
            }
            const pendentes5 = total5 - criteriosAtivos;

            const elTotal5 = document.getElementById('audit-total-tab-criterios');
            const elVis5 = document.getElementById('audit-visible-tab-criterios');
            const elOcult5 = document.getElementById('audit-hidden-tab-criterios');
            if (elTotal5) elTotal5.textContent = total5;
            if (elVis5) elVis5.textContent = criteriosAtivos;
            if (elOcult5) elOcult5.textContent = pendentes5;
        }
    },

    /**
     * Abre o modal detalhado do REDCap Inspector com listagem completa dos campos da aba
     */
    abrirModalAuditoria: function(tabId) {
        const schema = window.REDCAP_SCHEMA;
        if (!schema || !schema.fields_by_form) {
            alert('Esquema do REDCap ainda não carregado.');
            return;
        }

        const modal = document.getElementById('modal-redcap-inspector');
        const elTitulo = document.getElementById('modal-inspector-titulo');
        const elSubtitulo = document.getElementById('modal-inspector-subtitulo');
        const tbody = document.getElementById('tbody-inspector-campos');
        const inBusca = document.getElementById('inspector-busca');
        const btnPayload = document.getElementById('btn-copiar-payload-redcap');
        const btnCalibrado = document.getElementById('btn-copiar-texto-calibrado');
        if (!modal || !tbody) return;

        if (inBusca) inBusca.value = '';

        // Exibe botões de cópia especializados na aba de História Familiar
        if (btnPayload) btnPayload.style.display = (tabId === 'tab-historia-familiar') ? 'inline-block' : 'none';
        if (btnCalibrado) btnCalibrado.style.display = (tabId === 'tab-historia-familiar') ? 'inline-block' : 'none';

        let titulo = '';
        let subtitulo = '';
        let listaCampos = [];

        if (tabId === 'tab-identificacao') {
            const f1 = schema.fields_by_form['identificao'] || [];
            const f2 = schema.fields_by_form['demografia'] || [];
            listaCampos = [...f1, ...f2];
            titulo = '🔍 REDCap Inspector • 1. Identificação & Demografia';
            subtitulo = `Instrumentos: identificao (${f1.length} campos) + demografia (${f2.length} campos) • Total: ${listaCampos.length} variáveis`;
        } else if (tabId === 'tab-molecular') {
            listaCampos = schema.fields_by_form['exame_molecular'] || [];
            titulo = '🔍 REDCap Inspector • 2. Exame Molecular';
            subtitulo = `Instrumento: exame_molecular • Total: ${listaCampos.length} variáveis (Até 6 Variantes, Zigosidades e Tipos de Teste)`;
        } else if (tabId === 'tab-historia-pessoal') {
            const f1 = schema.fields_by_form['histria_pessoal'] || [];
            const f2 = schema.fields_by_form['tumores_e_leses'] || [];
            listaCampos = [...f1, ...f2];
            titulo = '🔍 REDCap Inspector • 3. História Pessoal & Tumores/Lesões';
            subtitulo = `Instrumentos: histria_pessoal (${f1.length} campos) + tumores_e_leses (${f2.length} campos) • Total: ${listaCampos.length} variáveis`;
        } else if (tabId === 'tab-historia-familiar') {
            let calib = null;
            if (window.RedcapCalibradorHF && window.TabelaParentes) {
                calib = window.RedcapCalibradorHF.calibrarTabela(window.TabelaParentes.parentes);
            }
            listaCampos = calib ? calib.camposInspector : [];
            titulo = '🔍 REDCap Inspector • 4. História Familiar (7 Instrumentos Calibrados)';
            subtitulo = calib
                ? `Instrumentos hf_* calibrados • ${calib.estatisticas.totalVariaveisGeradas} variáveis ativas a partir de ${calib.estatisticas.totalParentesFamilia} familiares registrados.`
                : 'Instrumentos agrupados: hf_pais_avs, hf_1grau, hf_2grau, hf_3grau, etc.';
        } else if (tabId === 'tab-criterios') {
            listaCampos = schema.fields_by_form['critrios_de_testagem'] || [];
            titulo = '🔍 REDCap Inspector • 5. Critérios de Testagem (CDSS NCCN)';
            subtitulo = `Instrumento: critrios_de_testagem • Total: ${listaCampos.length} variáveis computacionais e regras de recomendação`;
        }

        if (elTitulo) elTitulo.innerHTML = titulo;
        if (elSubtitulo) elSubtitulo.textContent = subtitulo;

        this.camposAuditoriaModal = listaCampos;
        this.renderizarLinhasInspector(listaCampos);

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    /**
     * Copia o Payload JSON calibrado da Aba de História Familiar
     */
    copiarPayloadAuditoria: function() {
        if (window.RedcapCalibradorHF && window.TabelaParentes) {
            window.RedcapCalibradorHF.copiarPayloadJSON(window.TabelaParentes.parentes);
        }
    },

    /**
     * Copia o Formato Calibrado legível da Aba de História Familiar
     */
    copiarTextoCalibradoAuditoria: function() {
        if (window.RedcapCalibradorHF && window.TabelaParentes) {
            window.RedcapCalibradorHF.copiarTextoCalibrado(window.TabelaParentes.parentes);
        }
    },

    renderizarLinhasInspector: function(campos) {
        const tbody = document.getElementById('tbody-inspector-campos');
        if (!tbody) return;

        if (!campos || campos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum campo encontrado para os critérios de busca.</td></tr>`;
            return;
        }

        let html = '';
        campos.forEach((c, idx) => {
            const isVisible = this.verificarVisibilidadeCampo(c);
            const labelLimpo = (c.label || c.raw_label || c.name || '')
                .replace(/<[^>]*>?/gm, '')
                .replace(/\s+/g, ' ')
                .trim();

            const badgeStatus = c.isPreenchido
                ? '<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">✅ Preenchido</span>'
                : (isVisible
                    ? '<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">👁️ Exibido</span>'
                    : '<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;">🔒 Oculto</span>');

            const badgeTipo = `<span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; background:rgba(37,99,235,0.08); color:var(--accent); text-transform:uppercase;">${c.type || 'text'}</span>`;

            const branchingDisplay = c.branching_logic 
                ? `<code style="font-size:11px; color:${isVisible ? 'var(--accent)' : 'var(--text-muted)'}; background:var(--bg-app); padding:2px 4px; border-radius:3px;">${c.branching_logic}</code>`
                : '<em style="font-size:11px; color:#94a3b8;">— Sempre ativo</em>';

            const valorHtml = (c.value !== undefined && c.value !== null)
                ? `<div style="margin-top:4px;"><span style="font-size:11px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:4px; border:1px solid #bae6fd; display:inline-block;">Valor: <code>${escapeHTML(c.value)}</code></span></div>`
                : '';

            html += `
                <tr class="inspector-row">
                    <td style="color:var(--text-muted); font-size:11px; font-weight:600; text-align:center;">${idx + 1}</td>
                    <td>
                        <strong style="font-family:monospace; color:var(--text-color); font-size:12px;">${c.name}</strong>
                        ${c.form ? `<div style="font-size:10px; color:var(--text-muted);">${c.form}</div>` : ''}
                    </td>
                    <td>${badgeTipo}</td>
                    <td style="font-size:12px; max-width:320px; color:var(--text-color); line-height:1.4;">
                        ${labelLimpo}
                        ${valorHtml}
                    </td>
                    <td style="text-align:center;">${badgeStatus}</td>
                    <td style="max-width:240px; word-break:break-all;">${branchingDisplay}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    filtrarTabelaAuditoria: function(termo) {
        if (!termo) {
            this.renderizarLinhasInspector(this.camposAuditoriaModal || []);
            return;
        }
        const t = termo.toLowerCase().trim();
        const filtrados = (this.camposAuditoriaModal || []).filter(c => {
            const nome = (c.name || '').toLowerCase();
            const label = (c.label || c.raw_label || '').toLowerCase();
            const rule = (c.branching_logic || '').toLowerCase();
            return nome.includes(t) || label.includes(t) || rule.includes(t);
        });
        this.renderizarLinhasInspector(filtrados);
    },

    fecharModalAuditoria: function() {
        const modal = document.getElementById('modal-redcap-inspector');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    /**
     * Sincroniza metadados diretamente com a API do REDCap em tempo real
     */
    sincronizarRedcapLive: function() {
        const btn = document.getElementById('btn-sync-redcap-live');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Sincronizando...';
        }
        fetch('sync_redcap_schema.php?json=1')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const diff = data.diff || {};
                    let msg = '✅ Sincronização concluída com sucesso via ' + data.source + '!\n';
                    msg += 'Total de variáveis mapeadas: ' + data.total_fields + '\n\n';
                    if (diff.deleted_fields && diff.deleted_fields.length > 0) {
                        msg += '🗑️ Campos excluídos no REDCap: ' + diff.deleted_fields.length + '\n';
                    }
                    if (diff.orphan_warnings && diff.orphan_warnings.length > 0) {
                        msg += '⚠️ ALERTA: ' + diff.orphan_warnings.length + ' campos excluídos ainda estão presentes no HTML do formulário!\n';
                    }
                    if (diff.modified_fields && diff.modified_fields.length > 0) {
                        msg += '✏️ Campos modificados (rótulos/opções): ' + diff.modified_fields.length + '\n';
                    }
                    if (diff.added_fields && diff.added_fields.length > 0) {
                        msg += '➕ Novos campos adicionados: ' + diff.added_fields.length + '\n';
                    }
                    if (!diff.deleted_fields?.length && !diff.modified_fields?.length && !diff.added_fields?.length) {
                        msg += 'Tudo 100% atualizado e calibrado com o REDCap.\n';
                    }
                    alert(msg);
                    window.location.reload();
                } else {
                    alert('Erro na sincronização: ' + (data.error || 'Falha ao sincronizar.'));
                }
            })
            .catch(err => {
                alert('Erro de comunicação ao sincronizar: ' + err.message);
            })
            .finally(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '🔄 Sincronizar REDCap';
                }
            });
    },

    /**
     * Limpa a seleção de um grupo de radio buttons (equivalente ao 'reset' do REDCap)
     */
    limparRadioGrupo: function(name) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) {
            checked.checked = false;
            checked.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
};

window.FormularioClinico = FormularioClinico;
