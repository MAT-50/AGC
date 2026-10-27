/**
 * 🧠 AGC Analytics — Motor CDSS de Rastreio e Indicação NCCN (v3.2026)
 * Ambulatório de Aconselhamento Genético do Câncer (AGC)
 * Faculdade de Medicina de Ribeirão Preto — Universidade de São Paulo (FMRP-USP)
 * 
 * Biblioteca oficial que executa as 160 regras e campos calculados do CDSS,
 * avaliando em tempo real:
 * - Agregação familiar por grau de parentesco (1º, 2º e 3º graus) e linhagem (materna vs paterna)
 * - Critérios clínicos para HBOC (Mama/Ovário/Pâncreas/Próstata)
 * - Critérios clínicos para Síndrome de Lynch (Amsterdam/Bethesda/NCCN)
 * - Critérios clínicos de Chompret para Síndrome de Li-Fraumeni (LFS/TP53)
 * - Critérios clínicos para Síndrome de Cowden / PHTS (PTEN)
 * - Critérios clínicos para CDH1, VHL e Poliposes Hereditárias
 * - Indicação Geral de Testagem NCCN (nccn_indicacao)
 */

const CdssEngine = {
    versao: "3.2026",

    /**
     * Lista dos tumores pertencentes ao espectro de cada síndrome
     */
    ESPECTROS: {
        lynch: [
            "CA de Cólon", "CA de Reto", "CA de Endométrio", "CA de Ovário", "CA de Estômago",
            "CA Int. Delgado", "CA de Vias Biliares", "CA Urotelial", "Tumor de SNC",
            "CA Sebáceo", "Ceratoacantoma", "Sínd. Lynch (Não esp.)"
        ],
        lfs: [
            "Sarcoma", "Osteossarcoma", "CA de Mama", "Tumor de SNC",
            "CA Adrenocortical", "Linfoma / Leucemia", "CA de Colo Uterino"
        ],
        hboc: [
            "CA de Mama", "CA de Ovário", "CA de Pâncreas", "CA de Próstata", "CA Perit/Tuba"
        ],
        cowden: [
            "CA de Mama", "CA de Tireoide", "CA de Endométrio", "CA de Rim",
            "Melanoma", "CA de Cólon", "Síndrome de Cowden"
        ],
        vhl: [
            "CA de Rim", "Tumor Neuroendócrino", "Paraganglioma", "Sínd. VHL"
        ]
    },

    modulosAdicionais: {},

    /**
     * Registra módulos de diretrizes adicionais (ex: renal, men)
     */
    registerModule: function(nome, fnAvaliador) {
        if (typeof fnAvaliador === "function") {
            this.modulosAdicionais[nome] = fnAvaliador;
            console.log(`🔌 CDSS: Módulo plugável '${nome}' registrado com sucesso.`);
        }
    },

    /**
     * Normalizador canônico que converte tanto códigos brutos do REDCap ('16', '23', etc.)
     * quanto descrições textuais livres para o vocabulário padronizado do CDSS.
     */
    resolverTumorNome: function(codOuNome) {
        if (!codOuNome) return "";
        const str = String(codOuNome).trim();
        const mapaCodigos = {
            "1": "CA de Adrenal",
            "3": "CA Urotelial",
            "7": "CA de Cólon",
            "9": "CA de Endométrio",
            "11": "CA de Estômago",
            "14": "Leucemia",
            "15": "Linfoma",
            "16": "CA de Mama",
            "17": "Melanoma",
            "21": "CA de Olho",
            "23": "CA de Ovário",
            "24": "CA de Pâncreas",
            "25": "CA de Pele não-melanoma",
            "28": "CA de Próstata",
            "29": "CA de Pulmão",
            "30": "CA de Reto",
            "31": "CA de Rim",
            "33": "Tumor de SNC",
            "34": "CA de Testículo",
            "36": "CA de Tireoide",
            "38": "CA de Vias Biliares",
            "40": "CA Int. Delgado",
            "41": "Tumor Neuroendócrino",
            "42": "Osteossarcoma",
            "43": "Paraganglioma",
            "44": "Sarcoma",
            "45": "CA Perit/Tuba",
            "46": "CA de Pleura",
            "106": "Doença de Lhermitte-Duclos",
            "110": "Hemangioblastoma do SNC",
            "111": "Hemangioblastoma retiniano",
            "113": "Lipoma",
            "115": "Neuroma mucocutâneo",
            "118": "Papiloma oral",
            "119": "Pólipos adenomatosos",
            "123": "Triquilemoma",
            "221": "Pólipos de Peutz-Jeghers",
            "222": "Pólipos juvenis",
            "223": "Macrocefalia"
        };
        if (mapaCodigos[str]) return mapaCodigos[str];
        return str;
    },

    /**
     * Normalizador de texto para comparações insensíveis a acentos
     */
    norm: function(str) {
        const resolvido = this.resolverTumorNome(str);
        return (resolvido || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    /**
     * Obtém valor de campo de forma universal e resiliente:
     * 1. dadosPaciente[fieldName]
     * 2. input radio checked (name ou data-redcap-field)
     * 3. select / input / textarea com data-redcap-field
     * 4. select / input / textarea com name
     * 5. element por ID convenção field-nome-com-hifens
     */
    getVal: function(dadosPaciente, fieldName, defaultValue = '') {
        if (dadosPaciente && dadosPaciente[fieldName] !== undefined && dadosPaciente[fieldName] !== null && String(dadosPaciente[fieldName]).trim() !== '') {
            return String(dadosPaciente[fieldName]).trim();
        }
        if (typeof document !== 'undefined') {
            try {
                // 1. Radio selecionado
                const radio = document.querySelector(`input[type="radio"][name="${fieldName}"]:checked, input[type="radio"][data-redcap-field="${fieldName}"]:checked`);
                if (radio) return String(radio.value).trim();

                // 2. Select ou Input por data-redcap-field
                const elRc = document.querySelector(`select[data-redcap-field="${fieldName}"], input[data-redcap-field="${fieldName}"], textarea[data-redcap-field="${fieldName}"]`);
                if (elRc && elRc.value !== undefined && elRc.value !== null && String(elRc.value).trim() !== '') {
                    return String(elRc.value).trim();
                }

                // 3. Elemento por name
                const elName = document.querySelector(`[name="${fieldName}"]`);
                if (elName && elName.value !== undefined && elName.value !== null && String(elName.value).trim() !== '') {
                    return String(elName.value).trim();
                }

                // 4. Elemento por id (convenção field-nome-com-hifens)
                const idHyphen = 'field-' + fieldName.replace(/_/g, '-');
                const elId = document.getElementById(idHyphen);
                if (elId && elId.value !== undefined && elId.value !== null && String(elId.value).trim() !== '') {
                    return String(elId.value).trim();
                }
            } catch (e) {}
        }
        return String(defaultValue).trim();
    },

    /**
     * Avalia se um campo booleano ou checkbox está ativo (true / '1')
     */
    getBool: function(dadosPaciente, fieldName) {
        if (dadosPaciente) {
            if (dadosPaciente[fieldName] === '1' || dadosPaciente[fieldName] === 1 || dadosPaciente[fieldName] === true) return true;
            if (fieldName.includes('___')) {
                const parts = fieldName.split('___');
                const parenKey = `${parts[0]}(${parts[1]})`;
                if (dadosPaciente[parenKey] === '1' || dadosPaciente[parenKey] === 1 || dadosPaciente[parenKey] === true) return true;
            }
        }
        if (typeof document !== 'undefined') {
            try {
                const chk = document.querySelector(`input[type="checkbox"][name="${fieldName}"], input[type="checkbox"][data-field-name="${fieldName}"]`);
                if (chk) return Boolean(chk.checked);
            } catch (e) {}
        }
        return false;
    },

    /**
     * Determina o grau de parentesco em relação ao probando
     * Retorna: 1 (1º grau), 2 (2º grau), 3 (3º grau), 0 (próprio probando) ou 4 (mais distante/não consanguíneo)
     */
    obterGrauParentesco: function(parente) {
        const codA = (parente.codA || "").toUpperCase().trim();
        const codB = parseInt(parente.codB, 10) || 0;
        const codC = parseInt(parente.codC, 10) || 0;

        if (codA === "A1" && codB === 0 && codC === 0) return 0; // Probando

        // Se for cônjuge
        if (codA.startsWith("Z") || parente.grau === "N") return 99;

        // Se tiver o grau explicitado no dicionário do parente
        if (parente.grau && ["1", "2", "3", "4"].includes(String(parente.grau).replace("°", ""))) {
            return parseInt(String(parente.grau).replace("°", ""), 10);
        }

        // Dedução pelas coordenadas tridimensionais
        if (codA.startsWith("A")) {
            if (codB === 0) return 1; // Irmãos (A2, A3...) = 1º grau
            if (codC === 0) {
                if (codA === "A1") return 1; // Filhos do probando = 1º grau
                return 2; // Sobrinhos (filhos de irmãos) = 2º grau
            }
            if (codA === "A1") return 2; // Netos do probando = 2º grau
            return 3; // Sobrinhos-netos = 3º grau
        }

        if (codA.startsWith("B") || codA.startsWith("C")) {
            // Pais e tios
            if (codB === 0) {
                const num = parseInt(codA.slice(1), 10) || 1;
                return num === 1 ? 1 : 2; // B1/C1 = Pais (1º grau) | B2/C2... = Tios (2º grau)
            }
            if (codC === 0) {
                const num = parseInt(codA.slice(1), 10) || 1;
                return num === 1 ? 2 : 3; // Meios-irmãos = 2º grau | Primos = 3º grau
            }
            return 3;
        }

        if (codA.startsWith("D") || codA.startsWith("E") || codA.startsWith("F") || codA.startsWith("G")) {
            // Avós e Tios-avós
            const num = parseInt(codA.slice(1), 10) || 1;
            if (codB === 0 && codC === 0) {
                return num === 1 ? 2 : 3; // Avô/Avó = 2º grau | Tio-avô = 3º grau
            }
            return 3;
        }

        if (["H", "I", "J", "K", "L", "M", "N", "O"].some(l => codA.startsWith(l))) {
            // Bisavós
            return 3;
        }

        return 3; // Fallback seguro para parentes cadastrados na história familiar
    },

    /**
     * Determina a linhagem biológica do parente:
     * 'M' = Linhagem Materna
     * 'P' = Linhagem Paterna
     * 'A' = Ambos / Fratria direta / Probando
     */
    obterLinhagem: function(parente) {
        const codA = (parente.codA || "").toUpperCase().trim();
        if (codA.startsWith("C") || codA.startsWith("F") || codA.startsWith("G") || ["L", "M", "N", "O"].some(l => codA.startsWith(l))) {
            return "M"; // Materno
        }
        if (codA.startsWith("B") || codA.startsWith("D") || codA.startsWith("E") || ["H", "I", "J", "K"].some(l => codA.startsWith(l))) {
            return "P"; // Paterno
        }
        return "A"; // Probando, irmãos e descendentes diretos
    },

    /**
     * MÓDULO 1: Agregador de História Familiar
     * Processa a tabela de parentes e sintetiza as variáveis agregadas (hist_familiar_*)
     */
    processarHistoriaFamiliar: function(parentes) {
        const aggr = {
            mama_d1: false,
            mama_d2: false,
            mama_d3: false,
            menor_idade_mama_d2: 999,
            menor_idade_mama_d3: 999,
            mama_homem: false,

            ovario_d1: false,
            ovario_d2: false,
            ovario_d3: false,

            pancreas_d1: false,
            pancreas_d2: false,
            pancreas_d3: false,

            prostata_d1: false,
            prostata_d2: false,
            prostata_d3: false,
            prostata_alto_risco: false,

            colon_d1: false,
            colon_d2: false,
            colon_d3: false,
            menor_idade_colon: 999,

            endometrio_d1: false,
            endometrio_d2: false,
            endometrio_d3: false,
            menor_idade_endometrio: 999,

            osteo_d1: false,
            osteo_d2: false,
            menor_idade_osteo: 999,

            sarcoma_d1: false,
            sarcoma_d2: false,
            menor_idade_sarcoma: 999,

            snc_d1: false,
            snc_d2: false,
            menor_idade_snc: 999,

            adrenal_d1: false,
            adrenal_d2: false,
            menor_idade_adrenal: 999,

            adrenal_qualquer: false,
            plexo_coroide_qualquer: false,

            gastrico_difuso_d2: false,
            gastrico_difuso_d3: false,
            gastrico_d2_mat: 0,
            gastrico_d2_pat: 0,
            gastrico_d2_com: 0,
            menor_idade_gastrico_d2: 999,

            // Contagens para o critério de agregação de mama + próstata no mesmo lado
            contagem_mama_prost_mat: 0,
            contagem_mama_prost_pat: 0,

            // Contagens de parentes do espectro Lynch
            lynch_parentes_d1_d2: [],
            lynch_menor_50_d1_d2: 0,

            // Contagens de parentes do espectro LFS
            lfs_parentes_d1_d2_menor_56: 0
        };

        if (!Array.isArray(parentes)) return aggr;

        parentes.forEach(p => {
            const codA = (p.codA || "").toUpperCase().trim();
            if (codA === "A1" && (parseInt(p.codB, 10) || 0) === 0 && (parseInt(p.codC, 10) || 0) === 0) {
                return; // Ignora o próprio probando na história familiar
            }

            const grau = this.obterGrauParentesco(p);
            if (grau > 3) return; // Apenas parentes consanguíneos até 3º grau

            const lado = this.obterLinhagem(p);
            const sexo = (p.sexo || "I").toUpperCase();
            const diags = Array.isArray(p.diags) ? p.diags : (Array.isArray(p.diagnosticos) ? p.diagnosticos : []);

            diags.forEach(d => {
                const tumor = (d.tumor || "").trim();
                const idadeDx = parseInt(d.idadeDx !== undefined ? d.idadeDx : d.idade, 10) || 999;
                const normTumor = this.norm(tumor);
                const codTumor = String(d.codigo || "").trim();

                // --- MAMA (cod 5 em parentes) ---
                if (normTumor.includes("mama") || codTumor === "5") {
                    if (grau <= 1) aggr.mama_d1 = true;
                    if (grau <= 2) {
                        aggr.mama_d2 = true;
                        if (idadeDx < aggr.menor_idade_mama_d2) aggr.menor_idade_mama_d2 = idadeDx;
                    }
                    if (grau <= 3) {
                        aggr.mama_d3 = true;
                        if (idadeDx < aggr.menor_idade_mama_d3) aggr.menor_idade_mama_d3 = idadeDx;
                        if (sexo === "M") aggr.mama_homem = true;

                        if (lado === "M" || lado === "A") aggr.contagem_mama_prost_mat++;
                        if (lado === "P" || lado === "A") aggr.contagem_mama_prost_pat++;
                    }
                }

                // --- OVÁRIO / TUBA / PERITÔNEO (cod 6 se F, cod 13 em parentes) ---
                if (normTumor.includes("ovario") || normTumor.includes("perit") || normTumor.includes("tuba") || (sexo === "F" && (codTumor === "6" || codTumor === "13"))) {
                    if (grau <= 1) aggr.ovario_d1 = true;
                    if (grau <= 2) aggr.ovario_d2 = true;
                    if (grau <= 3) aggr.ovario_d3 = true;
                }

                // --- PÂNCREAS (cod 8 em parentes) ---
                if (normTumor.includes("pancreas") || codTumor === "8") {
                    if (grau <= 1) aggr.pancreas_d1 = true;
                    if (grau <= 2) aggr.pancreas_d2 = true;
                    if (grau <= 3) aggr.pancreas_d3 = true;
                }

                // --- PRÓSTATA (cod 6 se M em parentes) ---
                if (normTumor.includes("prostata") || (sexo === "M" && codTumor === "6")) {
                    if (grau <= 1) aggr.prostata_d1 = true;
                    if (grau <= 2) aggr.prostata_d2 = true;
                    if (grau <= 3) {
                        aggr.prostata_d3 = true;
                        if (lado === "M" || lado === "A") aggr.contagem_mama_prost_mat++;
                        if (lado === "P" || lado === "A") aggr.contagem_mama_prost_pat++;
                    }
                }

                // --- CÓLON / RETO (cod 7 em parentes) ---
                if (normTumor.includes("colon") || normTumor.includes("reto") || codTumor === "7") {
                    if (grau <= 1) aggr.colon_d1 = true;
                    if (grau <= 2) {
                        aggr.colon_d2 = true;
                        if (idadeDx < aggr.menor_idade_colon) aggr.menor_idade_colon = idadeDx;
                    }
                    if (grau <= 3) aggr.colon_d3 = true;
                }

                // --- ENDOMÉTRIO (cod 0 se F em parentes) ---
                if (normTumor.includes("endometrio") || normTumor.includes("utero") || (sexo === "F" && codTumor === "0")) {
                    if (grau <= 1) aggr.endometrio_d1 = true;
                    if (grau <= 2) {
                        aggr.endometrio_d2 = true;
                        if (idadeDx < aggr.menor_idade_endometrio) aggr.menor_idade_endometrio = idadeDx;
                    }
                    if (grau <= 3) aggr.endometrio_d3 = true;
                }

                // --- OSTEOSSARCOMA (cod 14 em parentes) ---
                if (normTumor.includes("osteossarcoma") || codTumor === "14") {
                    if (grau <= 1) aggr.osteo_d1 = true;
                    if (grau <= 2) {
                        aggr.osteo_d2 = true;
                        if (idadeDx < aggr.menor_idade_osteo) aggr.menor_idade_osteo = idadeDx;
                    }
                }

                // --- SARCOMA DE PARTES MOLES (cod 15 em parentes) ---
                if ((normTumor.includes("sarcoma") && !normTumor.includes("osteossarcoma")) || codTumor === "15") {
                    if (grau <= 1) aggr.sarcoma_d1 = true;
                    if (grau <= 2) {
                        aggr.sarcoma_d2 = true;
                        if (idadeDx < aggr.menor_idade_sarcoma) aggr.menor_idade_sarcoma = idadeDx;
                    }
                }

                // --- TUMOR DE SNC / CÉREBRO (cod 16 em parentes) ---
                if (normTumor.includes("snc") || normTumor.includes("cerebro") || normTumor.includes("sistema nervoso") || normTumor.includes("plexo") || normTumor.includes("coroide") || codTumor === "16") {
                    if (grau <= 1) aggr.snc_d1 = true;
                    if (grau <= 2) {
                        aggr.snc_d2 = true;
                        if (idadeDx < aggr.menor_idade_snc) aggr.menor_idade_snc = idadeDx;
                    }
                    if (normTumor.includes("plexo") || normTumor.includes("coroide")) aggr.plexo_coroide_qualquer = true;
                }

                // --- CARCINOMA ADRENOCORTICAL / ADRENAL (cod 17 em parentes) ---
                if (normTumor.includes("adrenocortical") || normTumor.includes("adrenal") || codTumor === "17") {
                    aggr.adrenal_qualquer = true;
                    if (grau <= 1) aggr.adrenal_d1 = true;
                    if (grau <= 2) {
                        aggr.adrenal_d2 = true;
                        if (idadeDx < aggr.menor_idade_adrenal) aggr.menor_idade_adrenal = idadeDx;
                    }
                }

                // --- GÁSTRICO DIFUSO / ESTÔMAGO (cod 18 em parentes) ---
                if (normTumor.includes("estomago") || normTumor.includes("gastrico") || codTumor === "18") {
                    if (grau <= 2) {
                        aggr.gastrico_difuso_d2 = true;
                        if (idadeDx < aggr.menor_idade_gastrico_d2) aggr.menor_idade_gastrico_d2 = idadeDx;
                        if (lado === 'M') aggr.gastrico_d2_mat++;
                        else if (lado === 'P') aggr.gastrico_d2_pat++;
                        else aggr.gastrico_d2_com++;
                    }
                    if (grau <= 3) aggr.gastrico_difuso_d3 = true;
                }

                // --- ESPECTRO LYNCH AGREGADO ---
                const lynchCodigos = ["0", "7", "8", "13", "16", "18", "22", "23", "24", "25", "26"];
                const isLynchTumor = lynchCodigos.includes(codTumor) ||
                    (sexo === 'F' && codTumor === "6") ||
                    normTumor.includes("colon") || normTumor.includes("reto") ||
                    normTumor.includes("endometrio") || normTumor.includes("estomago") || normTumor.includes("gastrico") ||
                    normTumor.includes("ovario") || normTumor.includes("perit") || normTumor.includes("tuba") ||
                    normTumor.includes("pancreas") || normTumor.includes("urotelial") || normTumor.includes("ureter") ||
                    normTumor.includes("vias biliares") || normTumor.includes("delgado") ||
                    normTumor.includes("sebaceo") || normTumor.includes("ceratoacantoma") || normTumor.includes("queratoacantoma") ||
                    normTumor.includes("snc") || normTumor.includes("sistema nervoso") ||
                    this.ESPECTROS.lynch.some(e => normTumor.includes(this.norm(e)) || this.norm(e).includes(normTumor));

                if (isLynchTumor) {
                    if (grau <= 2) {
                        aggr.lynch_parentes_d1_d2.push({ parente: p, tumor: tumor, idadeDx: idadeDx, grau: grau });
                        if (idadeDx < 50) aggr.lynch_menor_50_d1_d2++;
                    }
                }

                // --- ESPECTRO LFS AGREGADO ---
                const isLfsTumor = normTumor.includes("sarcoma") || normTumor.includes("osteossarcoma") ||
                    normTumor.includes("adrenocortical") || normTumor.includes("adrenal") ||
                    normTumor.includes("plexo") || normTumor.includes("coroide") ||
                    normTumor.includes("snc") || normTumor.includes("sistema nervoso") ||
                    normTumor.includes("leucemia") || normTumor.includes("linfoma") ||
                    normTumor.includes("mama") ||
                    this.ESPECTROS.lfs.some(e => normTumor.includes(this.norm(e)) || this.norm(e).includes(normTumor));

                if (isLfsTumor) {
                    if (grau <= 2 && idadeDx < 56) {
                        aggr.lfs_parentes_d1_d2_menor_56++;
                    }
                }
            });
        });

        return aggr;
    },

    /**
     * MÓDULO 2: Avaliador Central de Critérios NCCN e Síndromes
     */
    avaliar: function(dadosPaciente, parentes) {
        const histFam = this.processarHistoriaFamiliar(parentes);

        // Extrai fatos do probando
        const idadeAtual = parseInt(dadosPaciente.idade, 10) || 0;
        const valSexo = String(dadosPaciente.sexo || dadosPaciente.sex || "1").toUpperCase().trim();
        const sexo = (valSexo === "2" || valSexo === "M" || valSexo === "MASCULINO") ? "M" : "F";
        const ashkenazi = dadosPaciente.ashkenazi === "1" || dadosPaciente.ashkenazi === 1 || dadosPaciente.ashkenazi === true;

        const tumoresProbando = Array.isArray(dadosPaciente.tumores) ? dadosPaciente.tumores : [];
        const temMamaProbando = tumoresProbando.some(t => String(t.codigo) === "16" || this.norm(t.tipo).includes("mama"));
        const temOvarioProbando = tumoresProbando.some(t => ["23", "45"].includes(String(t.codigo)) || this.norm(t.tipo).includes("ovario") || this.norm(t.tipo).includes("tuba") || this.norm(t.tipo).includes("perit"));
        const temPancreasProbando = tumoresProbando.some(t => String(t.codigo) === "24" || this.norm(t.tipo).includes("pancreas"));
        const temProstataProbando = tumoresProbando.some(t => String(t.codigo) === "28" || this.norm(t.tipo).includes("prostata"));
        const temColonProbando = tumoresProbando.some(t => ["7", "30"].includes(String(t.codigo)) || this.norm(t.tipo).includes("colon") || this.norm(t.tipo).includes("reto"));
        const temEndometrioProbando = tumoresProbando.some(t => String(t.codigo) === "9" || this.norm(t.tipo).includes("endometrio"));

        // Menor idade de diagnóstico de mama no probando
        let menorIdadeMamaProbando = 999;
        let temMamaTriploNegativo = false;
        let temMultiplosMama = 0;
        let temMamaLobular = false;

        tumoresProbando.forEach(t => {
            const n = this.norm(t.tipo);
            const id = parseInt(t.idadeDx, 10) || 999;
            const det = this.norm(t.detalhes || "");

            if (String(t.codigo) === "16" || n.includes("mama")) {
                if (id < menorIdadeMamaProbando) menorIdadeMamaProbando = id;
                temMultiplosMama++;
                if (t.triploNegativo || dadosPaciente.temMamaTriploNegativo || det.includes("triplo") || det.includes("tn") || (det.includes("rh-") && det.includes("her2-"))) {
                    temMamaTriploNegativo = true;
                }
                if (det.includes("lobular")) {
                    temMamaLobular = true;
                }
            }
        });

        const resultado = {
            versaoNCCN: this.versao,
            avaliadoEm: new Date().toISOString(),
            sindromes: {},
            criteriosAtendidos: [],
            indicacaoGeral: false,
            resumoTexto: ""
        };

        // =========================================================================
        // 1. SÍNDROME HBOC (CÂNCER DE MAMA E OVÁRIO HEREDITÁRIO)
        // =========================================================================
        // 1. SÍNDROME HBOC (CÂNCER DE MAMA E OVÁRIO HEREDITÁRIO - NCCN CRIT-2)
        // =========================================================================
        const regrasMama = {};
        const genesMamaHboc = [8, 9, 35, 15, 2, 5, 10, 40, 41, 11, 61, 53, 55]; // BRCA1, BRCA2, PALB2, CHEK2, etc.

        // mama_crit_var_familiar (NCCN CRIT-1 / CRIT-2): Variante P/LP conhecida em gene de mama na família
        const varFamMama = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        const varSomatico = parseInt(this.getVal(dadosPaciente, "variante_somatico", "0"), 10) || 0;
        const histFamMut = this.getBool(dadosPaciente, "hist_familiar___1") || (dadosPaciente.hist_familiar_1 === '1');
        regrasMama.mama_crit_var_familiar = genesMamaHboc.includes(varFamMama) || (histFamMut && genesMamaHboc.includes(varFamMama));
        if (regrasMama.mama_crit_var_familiar) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_var_familiar",
                sindrome: "HBOC",
                descricao: "História familiar de variante patogênica (P/LP) conhecida em gene de predisposição a câncer de mama (BRCA1, BRCA2, PALB2, TP53, etc.)",
                justificativa: "Parente de qualquer grau portador de variante patogênica catalogada."
            });
        }

        // mama_crit_1: Decisão de tratamento sistêmico usando inibidores de PARP / Olaparibe adjuvante
        const testarOlaparibe = temMamaProbando && (parseInt(this.getVal(dadosPaciente, "testar_olaparibe", "0"), 10) === 1);
        regrasMama.mama_crit_1 = testarOlaparibe;
        if (regrasMama.mama_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_1",
                sindrome: "HBOC",
                descricao: "Auxílio em decisão de terapia com inibidores de PARP ou olaparibe adjuvante para CA de mama HER2-negativo de alto risco",
                justificativa: "Indicação de testagem germinativa para orientação terapêutica oncológica."
            });
        }

        // mama_crit_2: CA Mama <= 50 anos
        regrasMama.mama_crit_2 = temMamaProbando && menorIdadeMamaProbando <= 50;
        if (regrasMama.mama_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_2",
                sindrome: "HBOC",
                descricao: "Câncer de mama diagnosticado aos ≤ 50 anos no probando",
                justificativa: `Probando com diagnóstico de CA de mama aos ${menorIdadeMamaProbando} anos.`
            });
        }

        // mama_crit_3: CA Mama Triplo Negativo (qualquer idade NCCN)
        regrasMama.mama_crit_3 = temMamaProbando && temMamaTriploNegativo;
        if (regrasMama.mama_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_3",
                sindrome: "HBOC",
                descricao: "Câncer de mama triplo-negativo diagnosticado em qualquer idade",
                justificativa: "Probando com CA de mama triplo-negativo catalogado."
            });
        }

        // mama_crit_4: Múltiplos cânceres primários de mama
        regrasMama.mama_crit_4 = temMultiplosMama >= 2;
        if (regrasMama.mama_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_4",
                sindrome: "HBOC",
                descricao: "Múltiplos tumores primários de mama (sincrônicos ou metacrônicos)",
                justificativa: `Probando com ${temMultiplosMama} tumores primários de mama catalogados.`
            });
        }

        // mama_crit_5: Mama Lobular + História de Câncer Gástrico Difuso
        const temGastricoDifuso = (dadosPaciente.estomago_tipo === '1' || dadosPaciente.hist_familiar_gas_dif_d2 === '1' || dadosPaciente.hist_familiar_gas_dif_d3 === '1');
        regrasMama.mama_crit_5 = temMamaLobular && temGastricoDifuso;
        if (regrasMama.mama_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_5",
                sindrome: "HBOC / CDH1",
                descricao: "Câncer de mama lobular com história pessoal ou familiar de câncer gástrico difuso",
                justificativa: "Associação de carcinoma lobular de mama com câncer gástrico difuso (suspeita de CDH1)."
            });
        }

        // mama_crit_6: CA Mama em homem
        regrasMama.mama_crit_6 = temMamaProbando && sexo === "M";
        if (regrasMama.mama_crit_6) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_6",
                sindrome: "HBOC",
                descricao: "Câncer de mama masculino em qualquer idade",
                justificativa: "Probando do sexo masculino diagnosticado com câncer de mama."
            });
        }

        // mama_crit_7: CA Mama + Ashkenazi
        regrasMama.mama_crit_7 = temMamaProbando && ashkenazi;
        if (regrasMama.mama_crit_7) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_7",
                sindrome: "HBOC",
                descricao: "Câncer de mama + ascendência judaica Ashkenazi",
                justificativa: "Probando acometido por CA de mama com ascendência judaica Ashkenazi relatada."
            });
        }

        // mama_crit_8: CA Mama + parente até 3º grau com CA Mama <= 50 anos
        regrasMama.mama_crit_8 = temMamaProbando && histFam.mama_d3 && histFam.menor_idade_mama_d3 <= 50;
        if (regrasMama.mama_crit_8) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_8",
                sindrome: "HBOC",
                descricao: "Câncer de mama no probando + parente de até 3º grau com CA de mama ≤ 50 anos",
                justificativa: `Familiar de até 3º grau acometido por CA de mama aos ${histFam.menor_idade_mama_d3} anos.`
            });
        }

        // mama_crit_9: CA Mama + parente de até 3º grau com CA Mama masculino
        regrasMama.mama_crit_9 = temMamaProbando && histFam.mama_homem;
        if (regrasMama.mama_crit_9) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_9",
                sindrome: "HBOC",
                descricao: "Câncer de mama no probando + parente de até 3º grau com CA de mama masculino",
                justificativa: "História familiar positiva para câncer de mama masculino."
            });
        }

        // mama_crit_10: CA Mama + parente de até 3º grau com CA de Ovário
        regrasMama.mama_crit_10 = temMamaProbando && histFam.ovario_d3;
        if (regrasMama.mama_crit_10) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_10",
                sindrome: "HBOC",
                descricao: "Câncer de mama no probando + parente de até 3º grau com CA de Ovário/Tuba/Peritôneo",
                justificativa: "História familiar positiva para CA de ovário ou trompa/peritôneo em parente próximo."
            });
        }

        // mama_crit_11: CA Mama + parente de até 3º grau com CA de Pâncreas
        regrasMama.mama_crit_11 = temMamaProbando && histFam.pancreas_d3;
        if (regrasMama.mama_crit_11) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_11",
                sindrome: "HBOC",
                descricao: "Câncer de mama no probando + parente de até 3º grau com CA de Pâncreas",
                justificativa: "História familiar positiva para câncer de pâncreas."
            });
        }

        // mama_crit_12: CA Mama + parente com CA de Próstata metastático ou de alto risco
        const histProstAltoRisco = (dadosPaciente.parente_prost_metas === '1' || dadosPaciente.parente_prost_risco === '1');
        regrasMama.mama_crit_12 = temMamaProbando && histProstAltoRisco;
        if (regrasMama.mama_crit_12) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_12",
                sindrome: "HBOC",
                descricao: "Câncer de mama no probando + parente de até 3º grau com CA de próstata metastático ou alto risco",
                justificativa: "História familiar de neoplasia de próstata de alto risco/metastática."
            });
        }

        // mama_crit_13: CA Mama + >= 2 diagnósticos de mama e/ou próstata do mesmo lado familiar
        regrasMama.mama_crit_13 = temMamaProbando && (histFam.contagem_mama_prost_mat >= 2 || histFam.contagem_mama_prost_pat >= 2);
        if (regrasMama.mama_crit_13) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_13",
                sindrome: "HBOC",
                descricao: "Câncer de mama + ≥ 2 diagnósticos de mama e/ou próstata do mesmo lado da família",
                justificativa: "Agregação de múltiplos tumores de mama/próstata na mesma linhagem parental."
            });
        }

        // mama_crit_14: Modelo de Probabilidade Pré-Teste BRCA1/2 > 5%
        const preTesteBrca = parseFloat(this.getVal(dadosPaciente, "pre_teste_brca", "0")) || 0;
        regrasMama.mama_crit_14 = preTesteBrca > 5;
        if (regrasMama.mama_crit_14) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_14",
                sindrome: "HBOC",
                descricao: "Probabilidade pré-teste > 5% de variante patogênica em BRCA1/2 por modelo preditivo (Tyrer-Cuzick, BRCAPRO, CanRisk)",
                justificativa: `Probabilidade calculada em modelo de ${preTesteBrca}%.`
            });
        }

        // prostata_mama_crit: Parente de 1º/2º grau atendendo critérios de mama/próstata
        const parenteIndicado = parseInt(this.getVal(dadosPaciente, "parente_indicado", "0"), 10) === 1;
        regrasMama.prostata_mama_crit = parenteIndicado;
        if (regrasMama.prostata_mama_crit) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_mama_crit",
                sindrome: "HBOC",
                descricao: "Indivíduo com parente de 1º ou 2º grau atendendo a critérios de testagem para Mama ou Próstata",
                justificativa: "História familiar positiva em parente próximo elegível para testagem."
            });
        }

        // mama_crit_somatico: Variante somática tumoral com relevância germinativa em gene HBOC
        const isHbocSomatic = genesMamaHboc.includes(varSomatico);
        const temSomaticoRelevante = this.getBool(dadosPaciente, "teste_somatico___2");
        regrasMama.mama_crit_somatico = isHbocSomatic || (temSomaticoRelevante && (varSomatico === 0 || isHbocSomatic));
        if (regrasMama.mama_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "mama_crit_somatico",
                sindrome: "HBOC / Genômica",
                descricao: "Variante P/LP identificada em teste genômico somático tumoral com implicações clínicas na linhagem germinativa",
                justificativa: "Laudo somático tumoral positivo recomendando validação e aconselhamento germinativo."
            });
        }

        // mama_indicacao
        const mamaIndicacao = Object.values(regrasMama).some(v => v === true);
        resultado.sindromes.mama_indicacao = mamaIndicacao;


        // =========================================================================
        // 2. CRITÉRIOS PARA CÂNCER DE OVÁRIO / TUBA / PERITÔNEO (NCCN)
        // =========================================================================
        const regrasOvario = {};
        const genesOvario = [2, 8, 9, 10, 16, 26, 28, 29, 35, 40, 41];
        const varFamOvario = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        const preTesteBrcaOvario = parseFloat(this.getVal(dadosPaciente, "pre_teste_brca", "0")) || 0;
        const ovarioGrupo = this.getVal(dadosPaciente, "ovario_grupo");
        const periTubaEpitelial = this.getVal(dadosPaciente, "peri_tuba_epitelial");
        const ovarioTipo = this.getVal(dadosPaciente, "ovario_tipo");
        const parenteOvarioEpit = this.getVal(dadosPaciente, "parente_ovario_epit");

        // ovario_crit_1: Pessoal CA Ovário/Tuba/Peritôneo em qualquer idade
        const temTubaPeritonioProbando = tumoresProbando.some(t => String(t.codigo || t.cod) === '45' || this.norm(t.tipo).includes("peritonio") || this.norm(t.tipo).includes("tuba"));
        regrasOvario.ovario_crit_1 = (temOvarioProbando || ovarioGrupo === '1' || ovarioGrupo === '2' || periTubaEpitelial === '1' || temTubaPeritonioProbando);
        if (regrasOvario.ovario_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_1",
                sindrome: "Ovário / HBOC",
                descricao: "História pessoal de câncer de ovário, tuba uterina ou peritôneo em qualquer idade",
                justificativa: "Probando acometido por neoplasia de ovário, trompa ou peritôneo."
            });
        }

        // ovario_crit_2: Pessoal CA Ovário Não Epitelial Raro (SCTAT, SCCOHT, Sertoli-Leydig)
        // Somente subtipos raros sindrômicos (1, 2, 7). Subtipos como 4 (Outra), 3 (Sertoli) ou 6 (Granulosa) NÃO disparam ovario_crit_2.
        regrasOvario.ovario_crit_2 = temOvarioProbando && ['1', '2', '7'].includes(ovarioTipo);
        if (regrasOvario.ovario_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_2",
                sindrome: "Ovário / Hereditário",
                descricao: "História pessoal de tumor ovariano não epitelial raro (SCTAT, SCCOHT ou Sertoli-Leydig)",
                justificativa: "Subtipo histológico raro com alta correlação a síndromes hereditárias monogênicas (Peutz-Jeghers, DICER1, SMARCA4)."
            });
        }

        // ovario_crit_3: Familiar de 1º ou 2º grau com CA Epitelial de Ovário/Tuba/Peritôneo
        const temHfOvarD2Epit = (parenteOvarioEpit === '1' && (this.getVal(dadosPaciente, "hist_familiar_ovar_d2") === '1' || histFam.ovario_d2));
        const temHfPeriTubaD2 = (this.getVal(dadosPaciente, "hist_familiar_peri_tuba_d2") === '1' || histFam.peri_tuba_d2);
        regrasOvario.ovario_crit_3 = (temHfOvarD2Epit || temHfPeriTubaD2);
        if (regrasOvario.ovario_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_3",
                sindrome: "Ovário / HBOC",
                descricao: "História familiar de câncer de ovário, trompa ou peritôneo em parente de 1º ou 2º grau",
                justificativa: "Parente de 1º ou 2º grau acometido por neoplasia epitelial do trato ginecológico alto."
            });
        }

        // ovario_crit_4: Modelo pré-teste BRCA1/2 > 5%
        regrasOvario.ovario_crit_4 = preTesteBrcaOvario > 5;
        if (regrasOvario.ovario_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_4",
                sindrome: "Ovário / HBOC",
                descricao: "Probabilidade pré-teste > 5% de variante patogênica em BRCA1/2 por modelo preditivo (Tyrer-Cuzick, BRCAPRO, CanRisk)",
                justificativa: `Probabilidade calculada de ${preTesteBrcaOvario}%.`
            });
        }

        // ovario_crit_5: Variante P/LP Familiar conhecida em gene de suscetibilidade a câncer de ovário
        regrasOvario.ovario_crit_5 = genesOvario.includes(varFamOvario);
        if (regrasOvario.ovario_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_5",
                sindrome: "Ovário / Genômica",
                descricao: "História familiar de variante patogênica (P/LP) em gene de suscetibilidade a câncer de ovário (BRCA1/2, BRIP1, PALB2, RAD51C/D, MMR)",
                justificativa: "Familiar portador de variante patogênica catalogada em gene de risco ovariano."
            });
        }

        // ovario_crit_somatico: Variante somática tumoral com relevância germinativa em gene de ovário
        const isOvarioSomatic = genesOvario.includes(varSomatico);
        regrasOvario.ovario_crit_somatico = isOvarioSomatic || (temSomaticoRelevante && (varSomatico === 0 || isOvarioSomatic));
        if (regrasOvario.ovario_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "ovario_crit_somatico",
                sindrome: "Ovário / Genômica",
                descricao: "Variante P/LP somática em gene de predisposição a câncer de ovário com implicações germinativas",
                justificativa: "Achado molecular somático em gene de ovário."
            });
        }

        const ovarioIndicacao = Object.values(regrasOvario).some(v => v === true);
        resultado.sindromes.ovario_indicacao = ovarioIndicacao;

        // =========================================================================
        // 3. CRITÉRIOS PARA CÂNCER DE PÂNCREAS (NCCN)
        // =========================================================================
        const regrasPancreas = {};
        const genesPancreas = [2, 8, 9, 14, 16, 26, 28, 29, 35, 53, 55]; // ATM, BRCA1/2, CDKN2A, MMR, PALB2, STK11, TP53
        const varFamPancreas = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        const preTesteBrcaPancreas = parseFloat(this.getVal(dadosPaciente, "pre_teste_brca", "0")) || 0;

        // pancreas_crit_1: Pessoal Câncer de Pâncreas Exócrino (incluindo células acinares)
        regrasPancreas.pancreas_crit_1 = temPancreasProbando;
        if (regrasPancreas.pancreas_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "pancreas_crit_1",
                sindrome: "Pâncreas",
                descricao: "História pessoal de adenocarcinoma pancreático exócrino ou carcinoma de células acinares em qualquer idade",
                justificativa: "Probando diagnosticado com câncer exócrino de pâncreas."
            });
        }

        // pancreas_crit_2: Familiar de 1º grau com CA de Pâncreas Exócrino
        regrasPancreas.pancreas_crit_2 = (histFam.pancreas_d1 || this.getVal(dadosPaciente, "hist_familiar_pancr_d1") === '1');
        if (regrasPancreas.pancreas_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "pancreas_crit_2",
                sindrome: "Pâncreas",
                descricao: "História familiar de câncer de pâncreas exócrino em parente de 1º grau (pai, mãe, irmão, filho)",
                justificativa: "Parente de 1º grau com neoplasia de pâncreas exócrino."
            });
        }

        // pancreas_crit_3: Modelo Pré-teste BRCA1/2 > 5%
        regrasPancreas.pancreas_crit_3 = preTesteBrcaPancreas > 5;
        if (regrasPancreas.pancreas_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "pancreas_crit_3",
                sindrome: "Pâncreas",
                descricao: "Probabilidade pré-teste > 5% de variante em BRCA1/2 por modelo preditivo (Tyrer-Cuzick, BRCAPRO, CanRisk)",
                justificativa: `Probabilidade calculada de ${preTesteBrcaPancreas}%.`
            });
        }

        // pancreas_crit_4: Variante P/LP Familiar conhecida em gene de pâncreas (NCCN CRIT-1)
        regrasPancreas.pancreas_crit_4 = genesPancreas.includes(varFamPancreas);
        if (regrasPancreas.pancreas_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "pancreas_crit_4",
                sindrome: "Pâncreas / Genômica",
                descricao: "História familiar de variante patogênica (P/LP) em gene de suscetibilidade a câncer de pâncreas (BRCA1/2, PALB2, ATM, CDKN2A, STK11, TP53, MMR)",
                justificativa: "Parente portador de variante patogênica catalogada em gene de risco pancreático."
            });
        }

        // pancreas_crit_5_somatico: Variante somática tumoral com relevância germinativa em gene de pâncreas
        const isPancreasSomatic = genesPancreas.includes(varSomatico);
        regrasPancreas.pancreas_crit_5_somatico = isPancreasSomatic || (temSomaticoRelevante && (varSomatico === 0 || isPancreasSomatic));
        if (regrasPancreas.pancreas_crit_5_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "pancreas_crit_5_somatico",
                sindrome: "Pâncreas / Genômica",
                descricao: "Variante P/LP somática em gene de predisposição a câncer de pâncreas com implicações germinativas",
                justificativa: "Achado molecular somático em gene de risco pancreático."
            });
        }

        const pancreasIndicacao = Object.values(regrasPancreas).some(v => v === true);
        resultado.sindromes.pancreas_indicacao = pancreasIndicacao;

        // =========================================================================
        // 4. CRITÉRIOS PARA CÂNCER DE PRÓSTATA (NCCN GUIDELINES)
        // =========================================================================
        const regrasProstata = {};
        const genesProstata = [2, 9, 15, 21, 28]; // ATM, BRCA2, CHEK2, HOXB13, MSH2 (conforme NCCN/REDCap)
        const varFamProstata = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        const prostMetas = (this.getVal(dadosPaciente, "prostata_metastat") === '1');
        const prostLinfo = (this.getVal(dadosPaciente, "prostata_linfon") === '1');
        const prostRisco = this.getVal(dadosPaciente, "prostata_risco");

        // prostata_crit_1: Metastático ou Linfonodo Positivo
        regrasProstata.prostata_crit_1 = temProstataProbando && (prostMetas || prostLinfo);
        if (regrasProstata.prostata_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_1",
                sindrome: "Próstata",
                descricao: "Câncer de próstata metastático (Estágio IVB) ou com linfonodos positivos (Estágio IVA)",
                justificativa: "Doença avançada/metastática com indicação de testagem germinativa e potencial benefício de inibidores de PARP."
            });
        }

        // prostata_crit_2: Risco Alto ou Muito Alto
        regrasProstata.prostata_crit_2 = temProstataProbando && (prostRisco === '4' || prostRisco === '5');
        if (regrasProstata.prostata_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_2",
                sindrome: "Próstata",
                descricao: "Câncer de próstata clinicamente localizado de alto risco ou muito alto risco",
                justificativa: "Estratificação de risco clínico desfavorável segundo diretrizes NCCN."
            });
        }

        // prostata_crit_3: CA Próstata + Ashkenazi
        regrasProstata.prostata_crit_3 = (temProstataProbando && ashkenazi);
        if (regrasProstata.prostata_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_3",
                sindrome: "Próstata",
                descricao: "Câncer de próstata em qualquer idade + ascendência judaica Ashkenazi",
                justificativa: "Probando com CA de próstata e histórico étnico de alelos fundadores."
            });
        }

        // prostata_crit_4: CA Próstata + parente até 3º grau com CA Mama <= 50 anos
        regrasProstata.prostata_crit_4 = (temProstataProbando && histFam.mama_d3 && histFam.menor_idade_mama_d3 <= 50);
        if (regrasProstata.prostata_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_4",
                sindrome: "Próstata / HBOC",
                descricao: "Câncer de próstata + parente de até 3º grau com CA de mama diagnosticado aos ≤ 50 anos",
                justificativa: "História familiar de neoplasia mamária precoce."
            });
        }

        // prostata_crit_5: CA Próstata + parente até 3º grau com CA Mama Masculino
        regrasProstata.prostata_crit_5 = (temProstataProbando && histFam.mama_homem);
        if (regrasProstata.prostata_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_5",
                sindrome: "Próstata / HBOC",
                descricao: "Câncer de próstata + parente de até 3º grau com CA de mama masculino",
                justificativa: "História familiar positiva para câncer de mama em homem."
            });
        }

        // prostata_crit_6: CA Próstata + parente até 3º grau com CA Ovário/Tuba/Peritôneo
        regrasProstata.prostata_crit_6 = (temProstataProbando && histFam.ovario_d3);
        if (regrasProstata.prostata_crit_6) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_6",
                sindrome: "Próstata / HBOC",
                descricao: "Câncer de próstata + parente de até 3º grau com CA de ovário, trompa ou peritôneo",
                justificativa: "História familiar positiva para neoplasia epitelial de ovário/anexos."
            });
        }

        // prostata_crit_7: CA Próstata + parente até 3º grau com CA Pâncreas
        regrasProstata.prostata_crit_7 = (temProstataProbando && histFam.pancreas_d3);
        if (regrasProstata.prostata_crit_7) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_7",
                sindrome: "Próstata / HBOC",
                descricao: "Câncer de próstata + parente de até 3º grau com CA de pâncreas",
                justificativa: "História familiar positiva para câncer de pâncreas."
            });
        }

        // prostata_crit_8: CA Próstata + parente até 3º grau com CA Próstata metastático ou alto risco
        regrasProstata.prostata_crit_8 = (temProstataProbando && histProstAltoRisco);
        if (regrasProstata.prostata_crit_8) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_8",
                sindrome: "Próstata",
                descricao: "Câncer de próstata + parente de até 3º grau com neoplasia de próstata metastática ou de alto risco",
                justificativa: "Agrupamento familiar de doença prostática agressiva."
            });
        }

        // prostata_crit_9: CA Próstata + >= 2 diagnósticos mama/próstata do mesmo lado
        regrasProstata.prostata_crit_9 = (temProstataProbando && (histFam.contagem_mama_prost_mat >= 2 || histFam.contagem_mama_prost_pat >= 2));
        if (regrasProstata.prostata_crit_9) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_9",
                sindrome: "Próstata / HBOC",
                descricao: "Câncer de próstata + ≥ 2 diagnósticos de mama e/ou próstata do mesmo lado da família",
                justificativa: "Agregação familiar de tumores do espectro mama-próstata."
            });
        }

        // prostata_crit_var_familiar: Variante conhecida em genes de próstata
        regrasProstata.prostata_crit_var_familiar = genesProstata.includes(varFamProstata);
        if (regrasProstata.prostata_crit_var_familiar) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_var_familiar",
                sindrome: "Próstata / Genômica",
                descricao: "História familiar de variante patogênica (P/LP) em gene de suscetibilidade a câncer de próstata (BRCA1/2, ATM, CHEK2, HOXB13, PALB2, TP53)",
                justificativa: "Parente portador de variante patogênica catalogada."
            });
        }

        // prostata_crit_somatico: Variante somática tumoral relevante em gene de próstata
        const genesProstataSomatico = [2, 8, 9, 15, 21, 28];
        const isProstataSomatic = genesProstataSomatico.includes(varSomatico);
        regrasProstata.prostata_crit_somatico = isProstataSomatic || (temSomaticoRelevante && (varSomatico === 0 || isProstataSomatic));
        if (regrasProstata.prostata_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "prostata_crit_somatico",
                sindrome: "Próstata / Genômica",
                descricao: "Variante P/LP somática em gene de suscetibilidade a câncer de próstata com implicações germinativas",
                justificativa: "Achado molecular somático em gene de risco prostático."
            });
        }

        const prostataIndicacao = Object.values(regrasProstata).some(v => v === true) || parenteIndicado;
        resultado.sindromes.prostata_indicacao = prostataIndicacao;

        // =========================================================================
        // 5. CRITÉRIOS PARA SÍNDROME DE LYNCH (NCCN GUIDELINES)
        // =========================================================================
        const regrasLynch = {};

        // Variante familiar conhecida em genes MMR (MLH1=26, MSH2=28, MSH6=29, PMS2=36, EPCAM=16)
        const varFam = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasLynch.lynch_crit_1 = [16, 26, 28, 29, 36].includes(varFam);
        if (regrasLynch.lynch_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_1",
                sindrome: "Lynch",
                descricao: "Variante patogênica (P/LP) conhecida de Síndrome de Lynch na família (MLH1, MSH2, MSH6, PMS2 ou EPCAM)",
                justificativa: `Histórico familiar de variante patogênica em gene de reparo MMR.`
            });
        }

        // Helper universal para detectar neoplasias do espectro de Lynch no probando (NCCN Guidelines)
        const isTumorLynchProbando = (t) => {
            const n = this.norm(t.tipo || "");
            const d = this.norm(t.detalhes || "");
            const cod = String(t.codigo || t.cod || "");

            // 1. Exclusões expressas: hemangioblastoma (110)
            if (cod === "110" || n.includes("hemangioblastoma")) return false;
            // Exclui tumores que NÃO pertencem ao espectro de Lynch:
            // 2 = Câncer de Ânus (HPV / CEC)
            // 20 = Câncer dos Músculos (Rabdomiossarcoma / Sarcoma)
            // 25 = Câncer de Pele não-melanoma (CBC / CEC cutâneo comum - apenas neoplasias sebáceas/Muir-Torre 102/120 são Lynch)
            if (cod === "2" || cod === "20" || cod === "25") return false;

            // 2. Câncer de Ovário (código 23): integra o espectro de tumores relacionados a Lynch conforme diretrizes
            if (cod === "23" || n.includes("ovario")) {
                return true;
            }

            // 3. Câncer de Endométrio (código 9): APENAS carcinoma epitelial pertence ao espectro
            // Sarcoma uterino (não epitelial = '2') não é Lynch
            if (cod === "9" || n.includes("endometrio")) {
                const endoTipo = this.getVal(dadosPaciente, "endometrio_tipo");
                if (endoTipo === "2" || d.includes("sarcoma") || d.includes("leiomio")) return false;
                return true;
            }

            // 4. Tumor de SNC (código 33): Variante Turcot (Glioblastoma e astrocitoma)
            if (cod === "33" || n.includes("snc") || n.includes("sistema nervoso") || n.includes("cerebro")) {
                const sncTipo = this.getVal(dadosPaciente, "tumor_snc_tipo");
                const sncLoc = this.getVal(dadosPaciente, "tumor_snc_local");
                return sncTipo === "1" || sncTipo === "7" || sncLoc === "1" || n.includes("glioblastoma") || n.includes("astrocitoma") || d.includes("glioblastoma") || d.includes("astrocitoma");
            }

            // 5. Câncer de Pâncreas Exócrino (código 24): apenas exócrino (adenocarcinoma), não PNET
            if (cod === "24") return true;
            if (n.includes("pancreas")) {
                if (n.includes("neuroendocrino") || d.includes("neuroendocrino") || this.getVal(dadosPaciente, "neuroendocrino_local") === "1") return false;
                return true;
            }

            // 6. Câncer Gástrico / Estômago (código 11)
            if (cod === "11" || n.includes("estomago") || n.includes("gastrico")) return true;

            // 7. Demais neoplasias comprovadas do espectro NCCN:
            // Cólon (7), Reto (30), Intestino delgado (40), Câncer urotelial (3), Vias biliares (38),
            // Adenoma sebáceo (102), Queratoacantoma (120)
            return ["7", "30", "40", "3", "38", "102", "120"].includes(cod) ||
                n.includes("colon") || n.includes("reto") || n.includes("delgado") ||
                n.includes("urotelial") || n.includes("ureter") || n.includes("vias biliares") ||
                n.includes("sebaceo") || n.includes("ceratoacantoma") || n.includes("queratoacantoma");
        };

        // lynch_crit_2: CA do espectro no paciente < 50 anos
        const menorIdadeLynchProbando = tumoresProbando
            .filter(isTumorLynchProbando)
            .reduce((min, t) => Math.min(min, parseInt(t.idadeDx, 10) || 999), 999);

        regrasLynch.lynch_crit_2 = (menorIdadeLynchProbando < 50);
        if (regrasLynch.lynch_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_2",
                sindrome: "Lynch",
                descricao: "Câncer relacionado à Síndrome de Lynch diagnosticado antes dos 50 anos",
                justificativa: `Probando com diagnóstico de tumor do espectro aos ${menorIdadeLynchProbando} anos.`
            });
        }

        // lynch_crit_3: Múltiplas neoplasias do espectro sincrônicas ou metacrônicas no paciente
        const nLynchProbando = tumoresProbando.filter(isTumorLynchProbando).length;
        regrasLynch.lynch_crit_3 = nLynchProbando >= 2;
        if (regrasLynch.lynch_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_3",
                sindrome: "Lynch",
                descricao: "Múltiplas neoplasias primárias do espectro de Lynch sincrônicas ou metacrônicas",
                justificativa: `Probando acometido por ${nLynchProbando} tumores primários do espectro de Lynch.`
            });
        }

        // lynch_crit_4: CA do espectro no probando + parente 1º/2º grau < 50 anos
        regrasLynch.lynch_crit_4 = (nLynchProbando >= 1) && (histFam.lynch_menor_50_d1_d2 >= 1);
        if (regrasLynch.lynch_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_4",
                sindrome: "Lynch",
                descricao: "Câncer do espectro de Lynch no paciente + parente de 1º ou 2º grau com neoplasia < 50 anos",
                justificativa: "História pessoal e familiar positiva com diagnóstico precoce na família."
            });
        }

        // lynch_crit_5: Tumor do espectro + >= 2 parentes com Lynch do mesmo lado da família
        const contMatLynch = (histFam.lynch_parentes_d1_d2 || []).filter(p => p.parente && (this.obterLinhagem(p.parente) === 'M' || this.obterLinhagem(p.parente) === 'A')).length;
        const contPatLynch = (histFam.lynch_parentes_d1_d2 || []).filter(p => p.parente && (this.obterLinhagem(p.parente) === 'P' || this.obterLinhagem(p.parente) === 'A')).length;
        regrasLynch.lynch_crit_5 = (nLynchProbando >= 1) && (contPatLynch >= 2 || contMatLynch >= 2);
        if (regrasLynch.lynch_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_5",
                sindrome: "Lynch",
                descricao: "Câncer relacionado à SL + 2 parentes (1° ou 2°) com Câncer relacionado à SL do mesmo lado",
                justificativa: `História pessoal e familiar com agregação de múltiplos casos de Lynch.`
            });
        }

        // lynch_crit_6: 1 parente de 1º grau com CCR ou Endométrio < 50 anos
        regrasLynch.lynch_crit_6 = (histFam.colon_d1 && histFam.menor_idade_colon < 50) || (histFam.endometrio_d1 && histFam.menor_idade_endometrio < 50);
        if (regrasLynch.lynch_crit_6) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_6",
                sindrome: "Lynch",
                descricao: "Parente de 1º grau com Câncer Colorretal ou de Endométrio diagnosticado antes dos 50 anos",
                justificativa: "Parente de 1º grau com diagnóstico precoce de CCR ou CE."
            });
        }

        // lynch_crit_7: Parente de 1º ou 2º grau com CCR/CE + segundo tumor sincrônico/metacrônico
        const sincParente = (this.getVal(dadosPaciente, "parente_ls_sinc") === '1');
        regrasLynch.lynch_crit_7 = (histFam.colon_d2 || histFam.endometrio_d2) && sincParente;
        if (regrasLynch.lynch_crit_7) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_7",
                sindrome: "Lynch",
                descricao: "Parente de 1º ou 2º grau com CCR ou CE e um segundo câncer relacionado à SL síncrono ou metacrônico",
                justificativa: "Parente com múltiplos tumores primários do espectro de Lynch."
            });
        }

        // lynch_crit_8: >= 2 parentes de 1º ou 2º grau do espectro com >= 1 antes dos 50 anos
        regrasLynch.lynch_crit_8 = ((contPatLynch >= 2 || contMatLynch >= 2) && (histFam.lynch_menor_50_d1_d2 >= 1));
        if (regrasLynch.lynch_crit_8) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_8",
                sindrome: "Lynch",
                descricao: "≥ 2 parentes de 1º ou 2º grau com tumores do espectro, incluindo ≥ 1 diagnosticado antes dos 50 anos",
                justificativa: "Múltiplos parentes de 1º/2º grau afetados pelo espectro de Lynch com diagnóstico precoce."
            });
        }

        // lynch_crit_9: >= 3 parentes de 1º ou 2º grau com tumores do espectro
        regrasLynch.lynch_crit_9 = (contPatLynch >= 3 || contMatLynch >= 3);
        if (regrasLynch.lynch_crit_9) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_9",
                sindrome: "Lynch",
                descricao: "≥ 3 parentes de 1º ou 2º grau com cânceres relacionados à Síndrome de Lynch",
                justificativa: "Forte agregação familiar (≥ 3 familiares afetados do mesmo lado da linhagem)."
            });
        }

        // lynch_crit_10: Predição de risco pré-teste >= 5% (PREMM5 / MMRpro / MMRpredict)
        const preTesteSl = parseFloat(this.getVal(dadosPaciente, "pre_teste_sl", "0")) || 0;
        regrasLynch.lynch_crit_10 = preTesteSl > 5;
        if (regrasLynch.lynch_crit_10) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_10",
                sindrome: "Lynch",
                descricao: "Indivíduo com risco de ≥ 5% em modelo preditivo de genes MMR (PREMM₅ / MMRpro / MMRpredict)",
                justificativa: `Probabilidade calculada de ${preTesteSl}% (> 5%).`
            });
        }

        // lynch_suges_1: Sugestão NCCN se PREMM5 > 2.5% sem história pessoal de CCR/CE
        regrasLynch.lynch_suges_1 = preTesteSl > 2.5 && preTesteSl <= 5;
        if (regrasLynch.lynch_suges_1) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_suges_1",
                sindrome: "Lynch (Sugestão NCCN)",
                descricao: "Indivíduo sem história de CCR ou CE com risco entre 2,5% e 5% em modelo preditivo (PREMM₅)",
                justificativa: `Probabilidade calculada de ${preTesteSl}% (entre 2,5% e 5%).`
            });
        }

        // lynch_crit_11: Teste somático / biópsia com dMMR ou MSI-H, ou variante somática em gene MMR
        const somatico4 = this.getBool(dadosPaciente, "teste_somatico___4");
        const somatico5 = this.getBool(dadosPaciente, "teste_somatico___5");
        const somatico6 = this.getBool(dadosPaciente, "teste_somatico___6");
        const isLynchSomatic = [16, 26, 28, 29, 36].includes(varSomatico);
        const somaticoLynchP = this.getBool(dadosPaciente, "teste_somatico___2");
        regrasLynch.lynch_crit_11 = (somatico4 || somatico5 || somatico6 || isLynchSomatic || (somaticoLynchP && (varSomatico === 0 || isLynchSomatic)));
        if (regrasLynch.lynch_crit_11) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_11",
                sindrome: "Lynch",
                descricao: "História pessoal de tumor com deficiência de MMR (dMMR), instabilidade de microssatélites alta (MSI-H) ou variante somática em gene MMR",
                justificativa: "Evidência tumoral/somática de alteração nas vias de reparo de incompatibilidade."
            });
        }

        // lynch_crit_12_somatico (NCCN Guidelines): Variante P/LP somática tumoral com implicações germinativas
        regrasLynch.lynch_crit_12 = isLynchSomatic || (somaticoLynchP && (varSomatico === 0 || isLynchSomatic));
        if (regrasLynch.lynch_crit_12) {
            resultado.criteriosAtendidos.push({
                codigo: "lynch_crit_12",
                sindrome: "Lynch / Genômica Tumoral",
                descricao: "Variante patogênica (P/LP) identificada em teste genômico somático do tumor em genes MMR com implicações germinativas",
                justificativa: "Achado somático tumoral que requer investigação germinativa para Síndrome de Lynch."
            });
        }

        // Indicação estrita de Lynch baseia-se nos critérios diagnósticos (lynch_crit_*), excluindo sugestões isoladas
        const lynchIndicacao = Object.keys(regrasLynch)
            .filter(k => k.startsWith('lynch_crit_'))
            .some(k => regrasLynch[k] === true);
        resultado.sindromes.lynch_indicacao = lynchIndicacao;


        // =========================================================================
        // 5. CRITÉRIOS DE CHOMPRET / SÍNDROME DE LI-FRAUMENI (LFS / TP53)
        // =========================================================================
        const regrasLFS = {};

        // slf_crit_1: Família com variante TP53 P/LP conhecida (55)
        const varFamTp53 = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasLFS.slf_crit_1 = (varFamTp53 === 55);
        if (regrasLFS.slf_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_1",
                sindrome: "Li-Fraumeni (LFS)",
                descricao: "História familiar de variante patogênica (P/LP) conhecida em TP53",
                justificativa: "Parente portador de variante patogênica em TP53 catalogado."
            });
        }

        // slf_crit_chompret_13: CA de Mama diagnosticado antes dos 31 anos (< 31 anos)
        const mamaMenor31 = temMamaProbando && menorIdadeMamaProbando < 31;
        regrasLFS.slf_crit_chompret_13 = mamaMenor31;
        if (mamaMenor31) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_13",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Câncer de mama diagnosticado antes dos 31 anos (< 31 anos)",
                justificativa: `Probando com diagnóstico de CA de mama aos ${menorIdadeMamaProbando} anos (critério diagnóstico estrito de Chompret).`
            });
        }

        // slf_crit_chompret_10: Carcinoma Adrenocortical (ACC) em qualquer idade
        const temAdrenalProbando = tumoresProbando.some(t => String(t.codigo || t.cod) === '1' || this.norm(t.tipo).includes("adrenal"));
        const adrenalTipo = parseInt(this.getVal(dadosPaciente, "adrenal_tipo", "0"), 10) || 0;
        const temACC = (temAdrenalProbando && adrenalTipo === 1) || tumoresProbando.some(t => this.norm(t.tipo).includes("adrenocortical") || this.norm(t.detalhes || "").includes("adrenocortical"));
        regrasLFS.slf_crit_chompret_10 = temACC;
        if (temACC) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_10",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Carcinoma Adrenocortical (ACC) em qualquer idade de início",
                justificativa: "Diagnóstico patognomônico de carcinoma adrenocortical."
            });
        }

        // slf_crit_chompret_11: Carcinoma de Plexo Coroide (CPC) em qualquer idade
        const temSncProbando = tumoresProbando.some(t => String(t.codigo || t.cod) === '33' || this.norm(t.tipo).includes("snc") || this.norm(t.tipo).includes("sistema nervoso"));
        const sncTipo = parseInt(this.getVal(dadosPaciente, "tumor_snc_tipo", "0"), 10) || 0;
        const temCPC = (temSncProbando && sncTipo === 2) || tumoresProbando.some(t => this.norm(t.tipo).includes("plexo") || this.norm(t.tipo).includes("coroide") || this.norm(t.detalhes || "").includes("plexo"));
        regrasLFS.slf_crit_chompret_11 = temCPC;
        if (temCPC) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_11",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Carcinoma do Plexo Coroide em qualquer idade de início",
                justificativa: "Diagnóstico patognomônico de carcinoma do plexo coroide."
            });
        }

        // slf_crit_chompret_12: Rabdomiossarcoma embrionário anaplásico
        const temSarcomaProbando = tumoresProbando.some(t => String(t.codigo || t.cod) === '44' || String(t.codigo || t.cod) === '20' || this.norm(t.tipo).includes("sarcoma"));
        const rmsSubtipo = parseInt(this.getVal(dadosPaciente, "rabdomiossarcoma_subtipo", "0"), 10) || 0;
        const temRMS = (temSarcomaProbando && rmsSubtipo === 1) || tumoresProbando.some(t => this.norm(t.tipo).includes("rabdomiossarcoma") && this.norm(t.detalhes || "").includes("anaplas"));
        regrasLFS.slf_crit_chompret_12 = temRMS;
        if (temRMS) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_12",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Rabdomiossarcoma do subtipo embrionário anaplásico em qualquer idade",
                justificativa: "Diagnóstico de rabdomiossarcoma anaplásico característico de LFS."
            });
        }

        // slf_crit_chompret_7: Mama < 46 anos + parente de 1º/2º grau com tumor do espectro < 56 anos (exceto mama)
        const mamaMenor46 = temMamaProbando && menorIdadeMamaProbando < 46;
        const famOsteoMenor56 = (histFam.osteo_d2 && histFam.menor_idade_osteo < 56) ||
                                (this.getVal(dadosPaciente, "hist_familiar_osteo_d2") === '1' && parseFloat(this.getVal(dadosPaciente, "hist_familiar_osteo_idade", "999")) < 56);
        const famSarcoMenor56 = (histFam.sarcoma_d2 && histFam.menor_idade_sarcoma < 56) ||
                                (this.getVal(dadosPaciente, "hist_familiar_sarco_d2") === '1' && parseFloat(this.getVal(dadosPaciente, "hist_familiar_sarco_idade", "999")) < 56);
        const famSncMenor56 = (histFam.snc_d2 && histFam.menor_idade_snc < 56) ||
                              (this.getVal(dadosPaciente, "hist_familiar_snc_d2") === '1' && parseFloat(this.getVal(dadosPaciente, "hist_familiar_snc_idade", "999")) < 56);
        const famAdrenoMenor56 = (histFam.adrenal_d2 && histFam.menor_idade_adrenal < 56) ||
                                 (this.getVal(dadosPaciente, "hist_familiar_adreno_d2") === '1' && parseFloat(this.getVal(dadosPaciente, "hist_familiar_adreno_idade", "999")) < 56);
        const parenteLfsNaoMama = (famOsteoMenor56 || famSarcoMenor56 || famSncMenor56 || famAdrenoMenor56);
        regrasLFS.slf_crit_chompret_7 = (mamaMenor46 && parenteLfsNaoMama);
        if (regrasLFS.slf_crit_chompret_7) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_7",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Câncer de mama < 46 anos + parente de 1º ou 2º grau com tumor do espectro LFS < 56 anos (sarcoma, SNC, adrenal)",
                justificativa: "Critério de Chompret de agregação familiar com tumor precoce de mama."
            });
        }

        // slf_crit_chompret_9: Múltiplos tumores (exceto múltiplos de mama), dois do espectro LFS com primeiro câncer < 46 anos
        const idadePrimeiroCancerGeral = tumoresProbando.reduce((min, t) => Math.min(min, parseInt(t.idadeDx, 10) || 999), 999);
        let nLfsNaoMama = 0;
        let nLfsMama = 0;
        tumoresProbando.forEach(t => {
            const cod = String(t.codigo || t.cod || "");
            const n = this.norm(t.tipo || "");
            if (cod === '16' || n.includes('mama')) {
                nLfsMama++;
            } else if (['42', '44', '33'].includes(cod) ||
                       (cod === '1' && adrenalTipo === 1) ||
                       (n.includes('sarcoma') && !n.includes('osteossarcoma')) ||
                       n.includes('osteossarcoma') ||
                       (n.includes('snc') && !n.includes('hemangioblastoma')) ||
                       n.includes('adrenocortical')) {
                nLfsNaoMama++;
            }
        });
        const tem2DoEspectroNaoMamaExclusivo = (nLfsNaoMama >= 2) || (nLfsMama >= 1 && nLfsNaoMama >= 1) ||
                                               (this.getVal(dadosPaciente, "sarcoma_multiplo") === '1' || this.getVal(dadosPaciente, "snc_multiplo") === '1');
        regrasLFS.slf_crit_chompret_9 = (idadePrimeiroCancerGeral < 46 && tem2DoEspectroNaoMamaExclusivo);
        if (regrasLFS.slf_crit_chompret_9) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_chompret_9",
                sindrome: "Li-Fraumeni (Chompret)",
                descricao: "Múltiplos tumores do espectro de LFS (exceto múltiplos de mama) com primeiro câncer < 46 anos",
                justificativa: `Probando com múltiplos tumores do espectro de Li-Fraumeni iniciados aos ${idadePrimeiroCancerGeral} anos.`
            });
        }

        // slf_crit_4: Variante somática TP53 (teste_somatico(3) < 30 anos OU variante_somatico = 55 independente da idade)
        const somaticoTp53 = this.getBool(dadosPaciente, "teste_somatico___3") || (varSomatico === 55);
        const idadePrimeiroC = tumoresProbando.reduce((min, t) => Math.min(min, parseInt(t.idadeDx, 10) || 999), 999);
        regrasLFS.slf_crit_4 = (somaticoTp53 && idadePrimeiroC < 30) || (varSomatico === 55);
        if (regrasLFS.slf_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_4",
                sindrome: "Li-Fraumeni (Genômica)",
                descricao: "Variante patogênica em TP53 em teste somático tumoral + diagnóstico de qualquer câncer < 30 anos",
                justificativa: "Achado somático tumoral precoce indicativo de investigação germinativa."
            });
        }

        // slf_crit_5: Parente falecido não testado compatível
        const histFamTp53Falecido = this.getBool(dadosPaciente, "hist_familiar___13");
        regrasLFS.slf_crit_5 = histFamTp53Falecido;
        if (histFamTp53Falecido) {
            resultado.criteriosAtendidos.push({
                codigo: "slf_crit_5",
                sindrome: "Li-Fraumeni (LFS)",
                descricao: "Parente de 1º ou 2º grau falecido e não testado com critérios clínicos para Síndrome de Li-Fraumeni",
                justificativa: "História familiar compatível com Li-Fraumeni em parente falecido sem teste."
            });
        }

        const slfIndicacao = Object.values(regrasLFS).some(v => v === true);
        resultado.sindromes.slf_indicacao = slfIndicacao;


        // =========================================================================
        // 6. SÍNDROME DE COWDEN / PHTS (PTEN - NCCN GUIDELINES)
        // =========================================================================
        const regrasPten = {};
        const varFamPten = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasPten.pten_crit_1 = (varFamPten === 61);
        if (regrasPten.pten_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_1",
                sindrome: "Cowden / PHTS",
                descricao: "História familiar de variante patogênica (P/LP) conhecida em PTEN",
                justificativa: "Parente portador de variante patogênica em PTEN catalogado."
            });
        }

        const temLhermitteDuclos = tumoresProbando.some(t => this.norm(t.tipo).includes("lhermitte") || parseInt(t.tipoPrimario || t.cod, 10) === 106);
        regrasPten.pten_crit_7 = temLhermitteDuclos;
        if (temLhermitteDuclos) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_7",
                sindrome: "Cowden / PHTS",
                descricao: "Doença de Lhermitte-Duclos (gangliocitoma displásico cerebelar) em adulto",
                justificativa: "Achado patognomônico para Síndrome de Cowden."
            });
        }

        const temMacrocefalia = tumoresProbando.some(t => this.norm(t.tipo).includes("macrocefalia") || parseInt(t.tipoPrimario || t.cod, 10) === 223);
        const temAutismo = tumoresProbando.some(t => this.norm(t.tipo).includes("autis") || parseInt(t.tipoPrimario || t.cod, 10) === 224);
        
        // Contagem de critérios maiores PTEN
        const temMamaPten = tumoresProbando.some(t => this.norm(t.tipo).includes("mama") || parseInt(t.tipoPrimario || t.cod, 10) === 16);
        const temEndometrioPten = tumoresProbando.some(t => this.norm(t.tipo).includes("endometr") || parseInt(t.tipoPrimario || t.cod, 10) === 9);
        const temHamartomaPten = tumoresProbando.some(t => [108, 208].includes(parseInt(t.tipoPrimario || t.cod, 10)));
        const temPigmentacaoGlande = tumoresProbando.some(t => parseInt(t.tipoPrimario || t.cod, 10) === 220);
        
        let countMajorPten = 0;
        if (temMamaPten) countMajorPten++;
        if (temEndometrioPten) countMajorPten++;
        if (temLhermitteDuclos) countMajorPten++;
        if (temMacrocefalia) countMajorPten++;
        if (temHamartomaPten) countMajorPten++;
        if (temPigmentacaoGlande) countMajorPten++;
        if (dadosPaciente.crit_maior_pten !== undefined && dadosPaciente.crit_maior_pten !== '') {
            countMajorPten = Math.max(countMajorPten, parseInt(dadosPaciente.crit_maior_pten, 10) || 0);
        }

        // pten_crit_4: >= 2 critérios maiores (um sendo macrocefalia)
        regrasPten.pten_crit_4 = temMacrocefalia && (countMajorPten >= 2);
        if (regrasPten.pten_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_4",
                sindrome: "Cowden / PHTS",
                descricao: "Dois ou mais critérios maiores para PTEN (um sendo macrocefalia)",
                justificativa: "Associação de macrocefalia com outro critério maior do espectro de Cowden."
            });
        }

        regrasPten.pten_crit_8 = (temAutismo && temMacrocefalia);
        if (regrasPten.pten_crit_8) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_8",
                sindrome: "Cowden / PHTS",
                descricao: "Transtorno do espectro autista associado a macrocefalia",
                justificativa: "Associação de TEA com perímetro cefálico aumentado (megalocefalia)."
            });
        }

        const somaticoPten = this.getBool(dadosPaciente, "teste_somatico___1") || (varSomatico === 61);
        regrasPten.pten_crit_12 = somaticoPten;
        if (somaticoPten) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_12",
                sindrome: "Cowden / PHTS",
                descricao: "Variante patogênica (P/LP) em PTEN detectada em teste genômico somático do tumor",
                justificativa: "Laudo somático tumoral positivo indicando necessidade de investigação germinativa."
            });
        }

        const histFamPtenFalecido = this.getBool(dadosPaciente, "hist_familiar___19");
        regrasPten.pten_crit_13 = histFamPtenFalecido;
        if (histFamPtenFalecido) {
            resultado.criteriosAtendidos.push({
                codigo: "pten_crit_13",
                sindrome: "Cowden / PHTS",
                descricao: "Parente de 1º ou 2º grau falecido e não testado com quadro clínico compatível com CS/PHTS ou BRRS",
                justificativa: "História familiar de quadro clínico característico de CS/PHTS em parente não testado."
            });
        }

        const ptenIndicacao = Object.values(regrasPten).some(v => v === true) || (parseInt(this.getVal(dadosPaciente, "pten_clinical_dx", "0"), 10) === 1);
        resultado.sindromes.pten_indicacao = ptenIndicacao;

        // =========================================================================
        // 7. POLIPOSE ADENOMATOSA (FAP / MAP / PPAP - NCCN GUIDELINES)
        // =========================================================================
        const regrasPolipAden = {};
        
        // Critério 1: >= 20 adenomas cumulativos
        const nPolipoAdenoma = parseInt(this.getVal(dadosPaciente, "n_polipo_adenoma", "0"), 10) || 0;
        regrasPolipAden.polip_aden_crit_1 = (nPolipoAdenoma === 1);
        if (regrasPolipAden.polip_aden_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_1",
                sindrome: "Polipose Adenomatosa",
                descricao: "Presença de 20 ou mais pólipos adenomatosos cumulativos",
                justificativa: "Paciente com histórico cumulativo de >= 20 adenomas (FAP / AFAP / MAP)."
            });
        }

        // Critério 2: Conhecida PV em gene de polipose adenomatosa na família
        const varFamPolip = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        const genesAdenomaLegado = [1, 3, 30, 34, 38, 39];
        regrasPolipAden.polip_aden_crit_2 = genesAdenomaLegado.includes(varFamPolip);
        if (regrasPolipAden.polip_aden_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_2",
                sindrome: "Polipose Adenomatosa",
                descricao: "Variante patogênica conhecida em gene de polipose adenomatosa na família (APC, AXIN2, MUTYH, NTHL1, POLD1, POLE)",
                justificativa: `Histórico familiar de variante patogênica catalogada no gene ID ${varFamPolip}.`
            });
        }

        // Critério 3: CHRPE multifocal ou bilateral
        const retinaBiMulti = parseInt(this.getVal(dadosPaciente, "trofia_retina_bi_multi", "0"), 10) || 0;
        regrasPolipAden.polip_aden_crit_3 = [1, 2, 3].includes(retinaBiMulti);
        if (regrasPolipAden.polip_aden_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_3",
                sindrome: "Polipose Adenomatosa",
                descricao: "Hipertrofia congênita do epitélio pigmentar da retina (CHRPE) bilateral ou multifocal",
                justificativa: "Achado oftalmológico patognomônico de FAP/Gardner."
            });
        }

        // Critério 4: Carcinoma papilífero de tireoide variante cribiforme-morular
        const tireoideVar = parseInt(this.getVal(dadosPaciente, "tireoide_variante", "0"), 10) || 0;
        regrasPolipAden.polip_aden_crit_4 = (tireoideVar === 3);
        if (regrasPolipAden.polip_aden_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_4",
                sindrome: "Polipose Adenomatosa",
                descricao: "Carcinoma papilífero da tireoide subtipo cribiforme-morular",
                justificativa: "Histologia patognomônica de variante cribiforme-morular associada a mutações germinativas em APC."
            });
        }

        // Critério 5: História familiar de polipose sem possibilidade/desejo de teste no afetado
        const histFam18 = this.getBool(dadosPaciente, "hist_familiar___18");
        regrasPolipAden.polip_aden_crit_5 = !!histFam18;
        if (regrasPolipAden.polip_aden_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_5",
                sindrome: "Polipose Adenomatosa",
                descricao: "História familiar de polipose em que os familiares não desejam ou não podem realizar testagem",
                justificativa: "Parente com polipose não testado ou impossibilitado."
            });
        }

        // Critério 6: Variante somática em gene de polipose adenomatosa
        const genesAdenomaExpandido = [1, 3, 19, 20, 27, 30, 32, 34, 38, 39, 44, 62];
        const isAdenSomatic = genesAdenomaExpandido.includes(varSomatico);
        regrasPolipAden.polip_aden_crit_somatico = isAdenSomatic || (temSomaticoRelevante && (varSomatico === 0 || isAdenSomatic));
        if (regrasPolipAden.polip_aden_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_aden_crit_somatico",
                sindrome: "Polipose Adenomatosa / Genômica",
                descricao: "Variante somática patogênica em gene de polipose adenomatosa com implicações germinativas",
                justificativa: "Achado molecular somático em gene de polipose adenomatosa."
            });
        }

        const polipAdenIndicacao = Object.values(regrasPolipAden).some(v => v === true);
        resultado.sindromes.polip_aden_indicacao = polipAdenIndicacao;


        // =========================================================================
        // 8. SÍNDROME DA POLIPOSE JUVENIL (JPS - NCCN GUIDELINES)
        // =========================================================================
        const regrasPolipJuv = {};
        
        // Critério 1: >= 5 pólipos juvenis do cólon
        const polipoJuvenilColon = parseInt(this.getVal(dadosPaciente, "polipo_juvenil_colon", "0"), 10) || 0;
        regrasPolipJuv.polip_juve_crit_1 = (polipoJuvenilColon === 1);
        if (regrasPolipJuv.polip_juve_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_juve_crit_1",
                sindrome: "Polipose Juvenil (JPS)",
                descricao: "Presença de 5 ou mais pólipos juvenis do cólon",
                justificativa: "Paciente com achado endoscópico/histopatológico de >= 5 pólipos juvenis colônicos."
            });
        }

        // Critério 2: Múltiplos pólipos juvenis distribuídos ao longo do trato GI
        const polipoJuvenilMultiplo = parseInt(this.getVal(dadosPaciente, "polipo_juvenil_multiplo", "0"), 10) || 0;
        regrasPolipJuv.polip_juve_crit_2 = (polipoJuvenilMultiplo === 1);
        if (regrasPolipJuv.polip_juve_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_juve_crit_2",
                sindrome: "Polipose Juvenil (JPS)",
                descricao: "Múltiplos pólipos juvenis encontrados ao longo de todo o trato gastrointestinal",
                justificativa: "Comprometimento hamartomatoso difuso do trato GI (estômago, delgado e cólon)."
            });
        }

        // Critério 3: Qualquer número de pólipos juvenis com história familiar de JPS
        const temPolipoJuvProbando = tumoresProbando.some(t => this.norm(t.tipo).includes("juvenil") || parseInt(t.tipoPrimario || t.cod, 10) === 222);
        const parenteJuvD3 = parentes.some(p => (p.diags || p.diagnosticos || []).some(d => String(d.codigo) === "19" || this.norm(d.tumor).includes("juvenil")));
        regrasPolipJuv.polip_juve_crit_3 = (temPolipoJuvProbando && parenteJuvD3);
        if (regrasPolipJuv.polip_juve_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_juve_crit_3",
                sindrome: "Polipose Juvenil (JPS)",
                descricao: "Qualquer número de pólipos juvenis em indivíduo com história familiar de JPS",
                justificativa: "Probando com pólipos juvenis e parente de até 3º grau com diagnóstico de JPS."
            });
        }

        // Extensão NCCN: Variante familiar conhecida em BMPR1A (7) ou SMAD4 (51)
        const varFamJuv = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasPolipJuv.polip_juve_crit_var_fam = [7, 51].includes(varFamJuv);
        if (regrasPolipJuv.polip_juve_crit_var_fam) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_juve_crit_var_fam",
                sindrome: "Polipose Juvenil (JPS)",
                descricao: "História familiar de variante patogênica (P/LP) em gene de JPS (BMPR1A ou SMAD4)",
                justificativa: `Parente portador de variante patogênica catalogada no gene ID ${varFamJuv}.`
            });
        }

        // Critério Somático JPS: BMPR1A (7) ou SMAD4 (51)
        const isJpsSomatic = [7, 51].includes(varSomatico);
        regrasPolipJuv.polip_juve_crit_somatico = isJpsSomatic || (temSomaticoRelevante && (varSomatico === 0 || isJpsSomatic));
        if (regrasPolipJuv.polip_juve_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "polip_juve_crit_somatico",
                sindrome: "Polipose Juvenil / Genômica",
                descricao: "Variante somática patogênica em BMPR1A ou SMAD4 com implicações germinativas",
                justificativa: "Achado molecular somático em gene de JPS."
            });
        }

        const polipJuvIndicacao = Object.values(regrasPolipJuv).some(v => v === true);
        resultado.sindromes.polip_juve_indicacao = polipJuvIndicacao;


        // =========================================================================
        // 9. SÍNDROME DE PEUTZ-JEGHERS (PJS - NCCN GUIDELINES)
        // =========================================================================
        const regrasPjs = {};
        
        // Critério 1: >= 2 pólipos de PJS confirmados histologicamente
        const polipoPjsConfirmado = parseInt(this.getVal(dadosPaciente, "polipo_pjs_confirmado", "0"), 10) || 0;
        regrasPjs.pjs_crit_1 = (polipoPjsConfirmado === 1);
        if (regrasPjs.pjs_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_1",
                sindrome: "Peutz-Jeghers (PJS)",
                descricao: "Presença de 2 ou mais pólipos de Peutz-Jeghers confirmados histologicamente",
                justificativa: "Pólipos hamartomatosos característicos com proliferação arboriforme de músculo liso."
            });
        }

        // Critérios 2, 3 e 4: Pólipos de PJS (221), Hiperpigmentação (211) e História Familiar de PJS (20)
        const temPolipoPjsProbando = tumoresProbando.some(t => this.norm(t.tipo).includes("peutz") || this.norm(t.tipo).includes("pjs") || parseInt(t.tipoPrimario || t.cod, 10) === 221);
        const temHiperpigProbando = tumoresProbando.some(t => this.norm(t.tipo).includes("hiperpigment") || parseInt(t.tipoPrimario || t.cod, 10) === 211);
        const parentePjsD3 = parentes.some(p => (p.diags || p.diagnosticos || []).some(d => String(d.codigo) === "20" || this.norm(d.tumor).includes("peutz")));

        // Critério 2: Qualquer número de pólipos de PJS com história familiar de PJS em parentes próximos
        regrasPjs.pjs_crit_2 = (temPolipoPjsProbando && parentePjsD3);
        if (regrasPjs.pjs_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_2",
                sindrome: "Peutz-Jeghers (PJS)",
                descricao: "Pólipo de Peutz-Jeghers em indivíduo com história familiar de PJS em parentes próximos",
                justificativa: "Probando com pólipo de PJS e história familiar positiva de Peutz-Jeghers."
            });
        }

        // Critério 3: Hiperpigmentação mucocutânea característica com história familiar de PJS em parentes próximos
        regrasPjs.pjs_crit_3 = (temHiperpigProbando && parentePjsD3);
        if (regrasPjs.pjs_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_3",
                sindrome: "Peutz-Jeghers (PJS)",
                descricao: "Hiperpigmentação mucocutânea característica com história familiar de PJS em parentes próximos",
                justificativa: "Máculas melanocíticas características nos lábios/mucosa oral com histórico familiar de PJS."
            });
        }

        // Critério 4: Pólipo de PJS e hiperpigmentação mucocutânea concomitante
        regrasPjs.pjs_crit_4 = (temPolipoPjsProbando && temHiperpigProbando);
        if (regrasPjs.pjs_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_4",
                sindrome: "Peutz-Jeghers (PJS)",
                descricao: "Presença simultânea de pólipo de PJS e hiperpigmentação mucocutânea característica",
                justificativa: "Quadro clínico e endoscópico patognomônico de Síndrome de Peutz-Jeghers."
            });
        }

        // Extensão NCCN: Variante familiar conhecida em STK11 (53)
        const varFamPjs = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasPjs.pjs_crit_var_fam = (varFamPjs === 53);
        if (regrasPjs.pjs_crit_var_fam) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_var_fam",
                sindrome: "Peutz-Jeghers (PJS)",
                descricao: "História familiar de variante patogênica (P/LP) em STK11",
                justificativa: "Parente portador de variante patogênica catalogada no gene STK11."
            });
        }

        // Critério Somático PJS: STK11 (53)
        const isStk11Somatic = (varSomatico === 53);
        regrasPjs.pjs_crit_somatico = isStk11Somatic || (temSomaticoRelevante && (varSomatico === 0 || isStk11Somatic));
        if (regrasPjs.pjs_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "pjs_crit_somatico",
                sindrome: "Peutz-Jeghers / Genômica",
                descricao: "Variante somática patogênica em STK11 com implicações germinativas",
                justificativa: "Achado molecular somático em STK11."
            });
        }

        const pjsIndicacao = Object.values(regrasPjs).some(v => v === true);
        resultado.sindromes.pjs_indicacao = pjsIndicacao;


        // =========================================================================
        // 10. SÍNDROME DE VON HIPPEL-LINDAU (VHL - CRITÉRIOS HOLANDÊS E DINAMARQUÊS)
        // =========================================================================
        const regrasVhl = {};

        // Avaliação de Heredograma: Parentes de 1º e 2º graus com VHL (código 21)
        const parenteVhlG1 = parentes.some(p => this.obterGrauParentesco(p) === 1 && (p.diags || p.diagnosticos || []).some(d => String(d.codigo) === "21" || this.norm(d.tumor).includes("vhl") || this.norm(d.tumor).includes("hippel")));
        const parenteVhlG2 = parentes.some(p => this.obterGrauParentesco(p) === 2 && (p.diags || p.diagnosticos || []).some(d => String(d.codigo) === "21" || this.norm(d.tumor).includes("vhl") || this.norm(d.tumor).includes("hippel")));

        // Contagem de Hemangioblastomas (SNC = 110, Retiniano = 111)
        let nHb = 0;
        tumoresProbando.forEach(t => {
            const cod = parseInt(t.tipoPrimario || t.cod, 10);
            if (cod === 110 || cod === 111 || this.norm(t.tipo).includes("hemangioblastoma")) nHb++;
        });

        // Contagem de Tumores VHL
        let nTumorVhl = 0;
        tumoresProbando.forEach(t => {
            const cod = parseInt(t.tipoPrimario || t.cod, 10);
            if ([110, 111, 122, 43].includes(cod) || this.norm(t.tipo).includes("hemangioblastoma") || this.norm(t.tipo).includes("endolinf") || this.norm(t.tipo).includes("paraganglioma")) {
                nTumorVhl++;
            }
        });

        // Feocromocitoma
        const pheoMultiplo = (this.getVal(dadosPaciente, "pheo_multiplo") === '1');
        const temAdrenalProbandoVhl = tumoresProbando.some(t => String(t.codigo || t.cod) === '1' || this.norm(t.tipo).includes("adrenal"));
        if (pheoMultiplo) nTumorVhl += 2;
        else if ((temAdrenalProbandoVhl && adrenalTipo === 2) || tumoresProbando.some(t => this.norm(t.tipo).includes("feocromocitoma"))) nTumorVhl += 1;

        // RCC
        const rccMultiplo = (this.getVal(dadosPaciente, "rcc_multiplo") === '1');
        const rimTipo = parseInt(this.getVal(dadosPaciente, "rim_tipo", "0"), 10) || 0;
        const temRimProbandoVhl = tumoresProbando.some(t => String(t.codigo || t.cod) === '31' || this.norm(t.tipo).includes("rim") || this.norm(t.tipo).includes("renal"));
        if (rccMultiplo) nTumorVhl += 2;
        else if ((temRimProbandoVhl && rimTipo === 1) || tumoresProbando.some(t => this.norm(t.tipo).includes("celulas renais") || this.norm(t.tipo).includes("rcc"))) nTumorVhl += 1;

        // PNET
        const pnetMultiplo = (this.getVal(dadosPaciente, "pnet_multiplo") === '1');
        const pnetLocal = parseInt(this.getVal(dadosPaciente, "neuroendocrino_local", "0"), 10) || 0;
        const temNeuroProbandoVhl = tumoresProbando.some(t => String(t.codigo || t.cod) === '41' || this.norm(t.tipo).includes("neuroendocrino"));
        if (pnetMultiplo) nTumorVhl += 2;
        else if ((temNeuroProbandoVhl && pnetLocal === 1) || tumoresProbando.some(t => this.norm(t.tipo).includes("neuroendocrino") && this.norm(t.tipo).includes("pancrea"))) nTumorVhl += 1;

        // Manifestações VHL (inclui cistos múltiplos renais 215 e pancreáticos 214)
        let nManifesVhl = nTumorVhl;
        tumoresProbando.forEach(t => {
            const cod = parseInt(t.tipoPrimario || t.cod, 10);
            if ([214, 215].includes(cod) || this.norm(t.tipo).includes("cistos renais") || this.norm(t.tipo).includes("cistos pancreaticos")) {
                nManifesVhl++;
            }
        });

        // Critério Holandês COM HF
        regrasVhl.vhl_hol_com_hf = (nTumorVhl >= 1 && (parenteVhlG1 || parenteVhlG2));
        if (regrasVhl.vhl_hol_com_hf) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_hol_com_hf",
                sindrome: "Von Hippel-Lindau (VHL)",
                descricao: "Critério Holandês (com história familiar): ≥ 1 tumor relacionado a VHL e parente de 1º ou 2º grau com VHL",
                justificativa: "Probando com tumor do espectro VHL e parente de 1º ou 2º grau com diagnóstico de VHL."
            });
        }

        // Critério Holandês SEM HF
        regrasVhl.vhl_hol_sem_hf = (nManifesVhl >= 2);
        if (regrasVhl.vhl_hol_sem_hf) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_hol_sem_hf",
                sindrome: "Von Hippel-Lindau (VHL)",
                descricao: "Critério Holandês (sem história familiar): ≥ 2 manifestações relacionadas a VHL",
                justificativa: `Probando acometido por ${nManifesVhl} manifestações clínicas do espectro VHL.`
            });
        }

        // Critério Dinamarquês COM HF
        regrasVhl.vhl_din_com_hf = (nManifesVhl >= 1 && parenteVhlG1);
        if (regrasVhl.vhl_din_com_hf) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_din_com_hf",
                sindrome: "Von Hippel-Lindau (VHL)",
                descricao: "Critério Dinamarquês (com história familiar): ≥ 1 manifestação de VHL e parente de 1º grau com VHL",
                justificativa: "Probando com manifestação de VHL e parente de 1º grau afetado."
            });
        }

        // Critério Dinamarquês SEM HF
        regrasVhl.vhl_din_sem_hf = (nHb >= 2 || (nHb === 1 && (nManifesVhl - nHb) >= 1));
        if (regrasVhl.vhl_din_sem_hf) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_din_sem_hf",
                sindrome: "Von Hippel-Lindau (VHL)",
                descricao: "Critério Dinamarquês (sem história familiar): ≥ 2 Hemangioblastomas OU 1 Hemangioblastoma e ≥ 1 outra manifestação de VHL",
                justificativa: "Apresentação diagnóstica clínica característica de VHL sem história familiar prévia."
            });
        }

        // Extensão NCCN: Variante familiar conhecida em VHL (58)
        const varFamVhl = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasVhl.vhl_crit_var_fam = (varFamVhl === 58);
        if (regrasVhl.vhl_crit_var_fam) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_crit_var_fam",
                sindrome: "Von Hippel-Lindau (VHL)",
                descricao: "História familiar de variante patogênica (P/LP) em VHL",
                justificativa: "Parente portador de variante patogênica catalogada no gene VHL."
            });
        }

        // Critério Somático VHL: VHL (58)
        const isVhlSomatic = (varSomatico === 58);
        regrasVhl.vhl_crit_somatico = isVhlSomatic || (temSomaticoRelevante && (varSomatico === 0 || isVhlSomatic));
        if (regrasVhl.vhl_crit_somatico) {
            resultado.criteriosAtendidos.push({
                codigo: "vhl_crit_somatico",
                sindrome: "Von Hippel-Lindau / Genômica",
                descricao: "Variante somática patogênica em VHL com implicações germinativas",
                justificativa: "Achado molecular somático em VHL."
            });
        }

        const vhlIndicacao = Object.values(regrasVhl).some(v => v === true);
        resultado.sindromes.vhl_indicacao = vhlIndicacao;


        // =========================================================================
        // 11. CÂNCER GÁSTRICO DIFUSO HEREDITÁRIO (CDH1 - NCCN GUIDELINES)
        // =========================================================================
        const regrasCdh1 = {};

        // Critério 1: Variante patogênica conhecida de CDH1 na família (código 11)
        const varFamCdh1 = parseInt(this.getVal(dadosPaciente, "variante_familia", "0"), 10) || 0;
        regrasCdh1.cdh1_crit_1 = (varFamCdh1 === 11);
        if (regrasCdh1.cdh1_crit_1) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_1",
                sindrome: "Câncer Gástrico Difuso Hereditário (CDH1)",
                descricao: "Indivíduo com variante patogênica (P/LP) conhecida no gene CDH1 na família",
                justificativa: "Parente portador de variante patogênica catalogada no gene CDH1."
            });
        }

        // Critério 2: Probando com câncer gástrico difuso (CGD / DGC) em qualquer idade
        const estomagoTipo = parseInt(this.getVal(dadosPaciente, "estomago_tipo", "0"), 10) || 0;
        const temGastricoProbandoCdh1 = tumoresProbando.some(t => String(t.codigo || t.cod) === '11' || this.norm(t.tipo).includes("estomago") || this.norm(t.tipo).includes("gastrico"));
        const temGastricoDifusoProbando = temGastricoProbandoCdh1 && (estomagoTipo === 1 || tumoresProbando.some(t => this.norm(t.tipo).includes("gastrico difuso") || this.norm(t.detalhes || "").includes("difuso")));
        regrasCdh1.cdh1_crit_2 = temGastricoDifusoProbando;
        if (regrasCdh1.cdh1_crit_2) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_2",
                sindrome: "Câncer Gástrico Difuso Hereditário (CDH1)",
                descricao: "Indivíduo com câncer gástrico difuso (CGD) diagnosticado em qualquer idade",
                justificativa: "Diagnóstico histopatológico confirmado de adenocarcinoma gástrico difuso no probando."
            });
        }

        // Critério 3: HF de >= 2 parentes (1º/2º grau) com CA gástrico, sendo >= 1 diagnosticado <= 50 anos
        const nGastricoD2 = (histFam.gastrico_d2_com || 0) + Math.max(histFam.gastrico_d2_mat || 0, histFam.gastrico_d2_pat || 0);
        const menorIdadeGastricoD2 = histFam.menor_idade_gastrico_d2 || 999;
        regrasCdh1.cdh1_crit_3 = (nGastricoD2 >= 2 && menorIdadeGastricoD2 <= 50);
        if (regrasCdh1.cdh1_crit_3) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_3",
                sindrome: "Câncer Gástrico Difuso Hereditário (CDH1)",
                descricao: "História familiar de ≥ 2 parentes de 1º ou 2º grau com câncer gástrico, sendo pelo menos um diagnosticado ≤ 50 anos",
                justificativa: `Agregação familiar de ${nGastricoD2} parentes de 1º/2º grau com neoplasia gástrica, menor idade: ${menorIdadeGastricoD2} anos.`
            });
        }

        // Critério 4: HF de >= 2 parentes (1º/2º grau) com CA gástrico, sendo >= 1 confirmado como difuso
        const gasDifD2 = (this.getVal(dadosPaciente, "hist_familiar_gas_dif_d2") === '1');
        regrasCdh1.cdh1_crit_4 = (nGastricoD2 >= 2 && gasDifD2);
        if (regrasCdh1.cdh1_crit_4) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_4",
                sindrome: "Câncer Gástrico Difuso Hereditário (CDH1)",
                descricao: "História familiar de ≥ 2 parentes de 1º ou 2º grau com câncer gástrico, sendo pelo menos um confirmado como difuso",
                justificativa: `Agregação familiar de neoplasia gástrica com confirmação histológica de subtipo difuso em parente de 1º ou 2º grau.`
            });
        }

        // Critério 5 (NCCN Bullet 4): Critério de Mama Lobular associado a CDH1 (mama_crit_5)
        regrasCdh1.cdh1_crit_5 = !!regrasMama.mama_crit_5;
        if (regrasCdh1.cdh1_crit_5) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_5",
                sindrome: "Câncer Gástrico Difuso Hereditário (CDH1)",
                descricao: "Critério NCCN de Mama Lobular associado a CDH1 (Câncer de mama lobular com história pessoal ou familiar de CGD)",
                justificativa: "Associação sindrômica de carcinoma lobular de mama com histórico de câncer gástrico difuso."
            });
        }

        // Critério 6: Variante patogênica em CDH1 em teste somático com relevância germinativa
        const isCdh1Somatic = (varSomatico === 11);
        const somaticoCdh1 = isCdh1Somatic || (temSomaticoRelevante && (varSomatico === 0 || isCdh1Somatic));
        regrasCdh1.cdh1_crit_6 = (somaticoCdh1 && (temGastricoDifusoProbando || temMamaLobular));
        if (regrasCdh1.cdh1_crit_6) {
            resultado.criteriosAtendidos.push({
                codigo: "cdh1_crit_6",
                sindrome: "Câncer Gástrico Difuso Hereditário (Genômica)",
                descricao: "Variante somática tumoral potencialmente patogênica em CDH1 com implicações clínicas germinativas",
                justificativa: "Achado de variante somática em tumor compatível com o espectro clínico de CDH1."
            });
        }

        const cdh1Indicacao = Object.values(regrasCdh1).some(v => v === true);
        resultado.sindromes.cdh1_indicacao = cdh1Indicacao;


        // =========================================================================
        // 12. EXECUÇÃO DE MÓDULOS PLUGÁVEIS (EX: RENAL, MEN, COWDEN)
        // =========================================================================
        for (const [modNome, fnModulo] of Object.entries(this.modulosAdicionais)) {
            try {
                const resMod = fnModulo({ dadosClinicos, parentes, tumoresProbando, histFam, resultado });
                if (resMod && resMod.indicacao) {
                    resultado.sindromes[modNome + "_indicacao"] = true;
                    if (resMod.criterios && Array.isArray(resMod.criterios)) {
                        resultado.criteriosAtendidos.push(...resMod.criterios);
                    }
                }
            } catch(eMod) {
                console.warn(`Erro na execução do módulo CDSS '${modNome}':`, eMod);
            }
        }

        // =========================================================================
        // 13. CONCLUSÃO GLOBAL DE INDICAÇÃO NCCN (nccn_indicacao)
        // =========================================================================
        const temCriterioGeralNccn = (varFamMama > 0 || varFam > 0 || histFamMut || temSomaticoRelevante || varSomatico > 0 || testarOlaparibe);
        const indicacaoModulos = Object.keys(this.modulosAdicionais).some(m => resultado.sindromes[m + "_indicacao"] === true);
        const indicacaoGlobal = mamaIndicacao || ovarioIndicacao || pancreasIndicacao || prostataIndicacao || lynchIndicacao || slfIndicacao || ptenIndicacao || polipAdenIndicacao || polipJuvIndicacao || pjsIndicacao || vhlIndicacao || cdh1Indicacao || indicacaoModulos || temCriterioGeralNccn;
        resultado.indicacaoGeral = indicacaoGlobal;
        resultado.sindromes.nccn_indicacao = indicacaoGlobal;
        resultado.sindromes.nccn_crit_geral = temCriterioGeralNccn;


        // Monta o resumo formatado para o prontuário
        if (indicacaoGlobal) {
            const listaSindromes = [];
            if (mamaIndicacao) listaSindromes.push("Síndrome HBOC (Câncer de Mama e Ovário)");
            if (ovarioIndicacao) listaSindromes.push("Suscetibilidade a Câncer de Ovário / Peritôneo");
            if (pancreasIndicacao) listaSindromes.push("Suscetibilidade a Câncer de Pâncreas");
            if (prostataIndicacao) listaSindromes.push("Suscetibilidade a Câncer de Próstata");
            if (lynchIndicacao) listaSindromes.push("Síndrome de Lynch (Câncer Colorretal)");
            if (slfIndicacao) listaSindromes.push("Síndrome de Li-Fraumeni (Critérios de Chompret)");
            if (ptenIndicacao) listaSindromes.push("Síndrome de Cowden / PHTS (PTEN)");
            if (polipAdenIndicacao) listaSindromes.push("Polipose Adenomatosa (FAP / MAP / PPAP)");
            if (polipJuvIndicacao) listaSindromes.push("Polipose Juvenil (JPS)");
            if (pjsIndicacao) listaSindromes.push("Síndrome de Peutz-Jeghers (PJS)");
            if (vhlIndicacao) listaSindromes.push("Síndrome de Von Hippel-Lindau (VHL)");
            if (cdh1Indicacao) listaSindromes.push("Câncer Gástrico Difuso Hereditário (CDH1)");
            for (const modNome of Object.keys(this.modulosAdicionais)) {

                if (resultado.sindromes[modNome + "_indicacao"]) {
                    listaSindromes.push(`Módulo ${modNome.toUpperCase()}`);
                }
            }

            resultado.resumoTexto = `Critérios NCCN v3.2026 ATENDIDOS para testagem genética em: ${listaSindromes.join("; ")}.\nTotal de ${resultado.criteriosAtendidos.length} critério(s) satisfeito(s).`;
        } else {
            resultado.resumoTexto = "Critérios NCCN formais de testagem genética germinativa não preenchidos no momento com base nos dados relatados.";
        }

        return resultado;
    }
};

window.CdssEngine = CdssEngine;

// Se executando em ambiente Node.js / CommonJS
if (typeof module !== "undefined" && module.exports) {
    module.exports = CdssEngine;
}
