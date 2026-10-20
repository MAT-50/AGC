/**
 * Calibrador Oficial de História Familiar para REDCap (FMRP-USP / CDSS AGC)
 * Mapeia a Tabela Autônoma de Parentes para as variáveis dos 7 instrumentos oficiais:
 * 1. hf_pais_e_avs
 * 2. hf_primeiro_grau
 * 3. hf_segundo_grau_comuns
 * 4. hf_segundo_grau_maternos
 * 5. hf_segundo_grau_paternos
 * 6. hf_terceiro_grau_comuns
 * 7. hf_terceiro_grau_maternos_e_paternos
 */

(function(window) {
    'use strict';

    // Dicionário de Rótulos de Tumores REDCap para História Familiar
    const TUMORES_HF_LABELS = {
        '0': 'Câncer de endométrio',
        '1': 'Câncer de pulmão',
        '2': 'Melanoma',
        '4': 'Câncer renal',
        '5': 'Câncer de mama',
        '6': 'Câncer de ovário',
        '7': 'Câncer colorretal',
        '8': 'Câncer de pâncreas',
        '9': 'Linfoma ou leucemia',
        '10': 'Outro câncer',
        '11': 'Síndrome de Cowden',
        '12': 'Síndrome de Bannayan-Riley-Ruvalcaba',
        '13': 'Câncer epitelial peritoneal / trompas de Falópio',
        '14': 'Osteossarcoma',
        '15': 'Sarcoma de partes moles',
        '16': 'Tumor de SNC',
        '17': 'Carcinoma adrenocortical',
        '18': 'Câncer gástrico',
        '19': 'Polipose juvenil',
        '20': 'Síndrome de Peutz-Jeghers',
        '21': 'Síndrome de von Hippel-Lindau (VHL)',
        '22': 'Câncer de intestino delgado',
        '23': 'Carcinoma urotelial',
        '24': 'Carcinoma / adenoma sebáceo',
        '25': 'Câncer de vias biliares',
        '26': 'Ceratoacantoma'
    };

    const RedcapCalibradorHF = {

        /**
         * Normaliza string removendo acentos e espaços extras para matching tolerante
         */
        normalizarTexto: function(txt) {
            return (txt || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
        },

        /**
         * Classifica um parente da tabela nas categorias e instrumentos do REDCap
         */
        classificarParente: function(p) {
            const codA = (p.codA || '').toUpperCase().trim();
            const b = parseInt(p.codB, 10) || 0;
            const c = parseInt(p.codC, 10) || 0;
            const sexo = (p.sexo || '').toUpperCase().trim();
            const parNorm = this.normalizarTexto(p.parentesco || '');

            // 1. Probando (A1 sem descendência): não vai para HF (já tem abas 1 a 3)
            if (codA === 'A1' && b === 0 && c === 0) {
                return { tipo: 'probando', ignorar: true };
            }

            // 2. Pais e Avós (hf_pais_e_avs)
            // Pai
            if (codA === 'B1' && b === 0 && c === 0 || parNorm === 'pai') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'dad_', rotuloParente: 'Pai' };
            }
            // Mãe
            if (codA === 'C1' && b === 0 && c === 0 || parNorm === 'mae') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'mom_', rotuloParente: 'Mãe' };
            }
            // Avô Paterno
            if (codA === 'D1' && b === 0 && c === 0 || parNorm === 'avo paterno') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'pgpa_', rotuloParente: 'Avô Paterno' };
            }
            // Avó Paterna
            if (codA === 'E1' && b === 0 && c === 0 || parNorm === 'avoa paterna' || parNorm === 'avo paterna') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'pgma_', rotuloParente: 'Avó Paterna' };
            }
            // Avô Materno
            if (codA === 'F1' && b === 0 && c === 0 || parNorm === 'avo materno') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'mgpa_', rotuloParente: 'Avô Materno' };
            }
            // Avó Materna
            if (codA === 'G1' && b === 0 && c === 0 || parNorm === 'avoa materna' || parNorm === 'avo materna') {
                return { tipo: 'fixo', form: 'hf_pais_e_avs', prefixo: 'mgma_', rotuloParente: 'Avó Materna' };
            }

            // 3. Primeiro Grau (hf_primeiro_grau)
            // Irmãos (Full brothers)
            if (codA.startsWith('A') && codA !== 'A1' && b === 0 && c === 0 && sexo === 'M' || parNorm === 'irmao') {
                return { tipo: 'dinamico', form: 'hf_primeiro_grau', grupo: 'bro', prefixo: 'bro', rotuloGrupo: 'Irmão', fieldCount: 'f_bro', checkField: 'fam_mem1', checkVal: '1', checkLabel: '1, Full brothers' };
            }
            // Irmãs (Full sisters)
            if (codA.startsWith('A') && codA !== 'A1' && b === 0 && c === 0 && sexo === 'F' || parNorm === 'irma') {
                return { tipo: 'dinamico', form: 'hf_primeiro_grau', grupo: 'sis', prefixo: 'sis', rotuloGrupo: 'Irmã', fieldCount: 'f_sis', checkField: 'fam_mem1', checkVal: '0', checkLabel: '0, Full sisters' };
            }
            // Filhos (Blood-related sons)
            if (codA === 'A1' && b > 0 && c === 0 && sexo === 'M' || parNorm === 'filho') {
                return { tipo: 'dinamico', form: 'hf_primeiro_grau', grupo: 'son', prefixo: 'son', rotuloGrupo: 'Filho', fieldCount: 'b_sons', checkField: 'fam_mem1', checkVal: '7', checkLabel: '7, Blood-related sons' };
            }
            // Filhas (Blood-related daughters)
            if (codA === 'A1' && b > 0 && c === 0 && sexo === 'F' || parNorm === 'filha') {
                return { tipo: 'dinamico', form: 'hf_primeiro_grau', grupo: 'dghtr', prefixo: 'dghtr', rotuloGrupo: 'Filha', fieldCount: 'b_dghtr', checkField: 'fam_mem1', checkVal: '6', checkLabel: '6, Blood-related daughters' };
            }

            // 4. Segundo Grau Comuns (hf_segundo_grau_comuns)
            // Netos
            if (codA === 'A1' && b > 0 && c > 0 && sexo === 'M' || parNorm === 'neto') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_comuns', grupo: 'b_g_son', prefixo: 'g_son', histPrefix: 'b_g_son', rotuloGrupo: 'Neto', fieldCount: 'b_g_sons', checkField: 'fam_mem2', checkVal: '13', checkLabel: '13, Grandsons' };
            }
            // Netas
            if (codA === 'A1' && b > 0 && c > 0 && sexo === 'F' || parNorm === 'neta') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_comuns', grupo: 'b_g_dghtr', prefixo: 'g_dghtr', histPrefix: 'b_g_dghtr', rotuloGrupo: 'Neta', fieldCount: 'b_g_dghtr', checkField: 'fam_mem2', checkVal: '12', checkLabel: '12, Granddaughters' };
            }
            // Sobrinhos
            if (codA.startsWith('A') && codA !== 'A1' && b > 0 && c === 0 && sexo === 'M' || parNorm === 'sobrinho') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_comuns', grupo: 'mnephew', prefixo: 'mnephew', histPrefix: 'mnephew', rotuloGrupo: 'Sobrinho', fieldCount: 'm_nephews', checkField: 'fam_mem2', checkVal: '15', checkLabel: '15, Nephews' };
            }
            // Sobrinhas
            if (codA.startsWith('A') && codA !== 'A1' && b > 0 && c === 0 && sexo === 'F' || parNorm === 'sobrinha') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_comuns', grupo: 'mniece', prefixo: 'mniece', histPrefix: 'mniece', rotuloGrupo: 'Sobrinha', fieldCount: 'm_nieces', checkField: 'fam_mem2', checkVal: '14', checkLabel: '14, Nieces' };
            }

            // 5. Segundo Grau Paterno (hf_segundo_grau_paternos)
            // Meio-irmão paterno
            if (codA === 'B1' && b > 0 && c === 0 && sexo === 'M' || parNorm.includes('meio-irmao paterno')) {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_paternos', grupo: 'p_h_bro', prefixo: 'p_h_bro', rotuloGrupo: 'Meio-Irmão Paterno', fieldCount: 'p_h_bro', checkField: 'fam_mem3', checkVal: '11', checkLabel: '11, Paternal Half Brothers' };
            }
            // Meia-irmã paterna
            if (codA === 'B1' && b > 0 && c === 0 && sexo === 'F' || parNorm.includes('meia-irma paterna')) {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_paternos', grupo: 'p_h_sis', prefixo: 'p_h_sis', rotuloGrupo: 'Meia-Irmã Paterna', fieldCount: 'p_h_sis', checkField: 'fam_mem3', checkVal: '10', checkLabel: '10, Paternal Half Sisters' };
            }
            // Tio paterno
            if (codA.startsWith('B') && codA !== 'B1' && b === 0 && c === 0 && sexo === 'M' || parNorm === 'tio paterno') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_paternos', grupo: 'puncle', prefixo: 'puncle', rotuloGrupo: 'Tio Paterno', fieldCount: 'p_uncles', checkField: 'fam_mem3', checkVal: '9', checkLabel: '9, Paternal uncles' };
            }
            // Tia paterna
            if (codA.startsWith('B') && codA !== 'B1' && b === 0 && c === 0 && sexo === 'F' || parNorm === 'tia paterna') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_paternos', grupo: 'paunt', prefixo: 'paunt', rotuloGrupo: 'Tia Paterna', fieldCount: 'p_aunts', checkField: 'fam_mem3', checkVal: '8', checkLabel: '8, Paternal aunts' };
            }

            // 6. Segundo Grau Materno (hf_segundo_grau_maternos)
            // Meio-irmão materno
            if (codA === 'C1' && b > 0 && c === 0 && sexo === 'M' || parNorm.includes('meio-irmao materno')) {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_maternos', grupo: 'm_h_bro', prefixo: 'm_h_bro', rotuloGrupo: 'Meio-Irmão Materno', fieldCount: 'm_h_bro', checkField: 'fam_mem4', checkVal: '3', checkLabel: '3, Maternal Half Brothers' };
            }
            // Meia-irmã materna
            if (codA === 'C1' && b > 0 && c === 0 && sexo === 'F' || parNorm.includes('meia-irma materna')) {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_maternos', grupo: 'm_h_sis', prefixo: 'm_h_sis', rotuloGrupo: 'Meia-Irmã Materna', fieldCount: 'm_h_sis', checkField: 'fam_mem4', checkVal: '2', checkLabel: '2, Maternal Half Sisters' };
            }
            // Tio materno
            if (codA.startsWith('C') && codA !== 'C1' && b === 0 && c === 0 && sexo === 'M' || parNorm === 'tio materno') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_maternos', grupo: 'muncle', prefixo: 'muncle', rotuloGrupo: 'Tio Materno', fieldCount: 'm_uncles', checkField: 'fam_mem4', checkVal: '5', checkLabel: '5, Maternal uncles' };
            }
            // Tia materna
            if (codA.startsWith('C') && codA !== 'C1' && b === 0 && c === 0 && sexo === 'F' || parNorm === 'tia materna') {
                return { tipo: 'dinamico', form: 'hf_segundo_grau_maternos', grupo: 'maunt', prefixo: 'maunt', rotuloGrupo: 'Tia Materna', fieldCount: 'm_aunts', checkField: 'fam_mem4', checkVal: '4', checkLabel: '4, Maternal aunts' };
            }

            // 7. Terceiro Grau Comuns (hf_terceiro_grau_comuns)
            // Bisnetos e Sobrinhos-netos
            if (parNorm.includes('bisneto') && sexo === 'M') {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_comuns', grupo: 'gg_sons', prefixo: 'gg_sons', rotuloGrupo: 'Bisneto', fieldCount: 'gg_sons', checkField: 'fam_mem_third1', checkVal: '1', checkLabel: '1, Great-grandson or Grandnephew', spec: '0', specLabel: '0, Great-grandson' };
            }
            if (parNorm.includes('sobrinho-neto') && sexo === 'M') {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_comuns', grupo: 'gg_sons', prefixo: 'gg_sons', rotuloGrupo: 'Sobrinho-Neto', fieldCount: 'gg_sons', checkField: 'fam_mem_third1', checkVal: '1', checkLabel: '1, Great-grandson or Grandnephew', spec: '2', specLabel: '2, Grandnephew' };
            }
            if (parNorm.includes('bisneta') && sexo === 'F') {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_comuns', grupo: 'gg_dghtr', prefixo: 'gg_dghtr', rotuloGrupo: 'Bisneta', fieldCount: 'gg_dghtr', checkField: 'fam_mem_third1', checkVal: '0', checkLabel: '0, Great-granddaughter or Grandniece', spec: '1', specLabel: '1, Great-granddaughter' };
            }
            if (parNorm.includes('sobrinha-neta') && sexo === 'F') {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_comuns', grupo: 'gg_dghtr', prefixo: 'gg_dghtr', rotuloGrupo: 'Sobrinha-Neta', fieldCount: 'gg_dghtr', checkField: 'fam_mem_third1', checkVal: '0', checkLabel: '0, Great-granddaughter or Grandniece', spec: '3', specLabel: '3, Grandniece' };
            }

            // 8. Terceiro Grau Paterno e Materno (hf_terceiro_grau_maternos_e_paternos)
            // Paternal Male (Primo paterno, Tio-avô paterno, Bisavô paterno)
            if (parNorm.includes('primo paterno') || (codA.startsWith('B') && codA !== 'B1' && b > 0 && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_male', prefixo: 'd3_p_male', rotuloGrupo: 'Primo Paterno', fieldCount: 'd3_p_male', checkField: 'fam_mem_third2', checkVal: '5', checkLabel: '5, Third-degree paternal male relative', spec: '2', specLabel: '2, Paternal Male first cousin' };
            }
            if (parNorm.includes('tio-avo paterno') || (codA.startsWith('D') && codA !== 'D1' && b === 0 && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_male', prefixo: 'd3_p_male', rotuloGrupo: 'Tio-Avô Paterno', fieldCount: 'd3_p_male', checkField: 'fam_mem_third2', checkVal: '5', checkLabel: '5, Third-degree paternal male relative', spec: '4', specLabel: '4, Paternal Great-uncle' };
            }
            if ((parNorm.includes('bisavo') && parNorm.includes('paterno') && sexo === 'M') || (['H1', 'J1'].includes(codA) && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_male', prefixo: 'd3_p_male', rotuloGrupo: 'Bisavô Paterno', fieldCount: 'd3_p_male', checkField: 'fam_mem_third2', checkVal: '5', checkLabel: '5, Third-degree paternal male relative', spec: '0', specLabel: '0, Paternal Great-grandfather' };
            }

            // Paternal Female (Prima paterna, Tia-avó paterna, Bisavó paterna)
            if (parNorm.includes('prima paterna') || (codA.startsWith('B') && codA !== 'B1' && b > 0 && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_female', prefixo: 'd3_p_female', rotuloGrupo: 'Prima Paterna', fieldCount: 'd3_p_female', checkField: 'fam_mem_third2', checkVal: '4', checkLabel: '4, Third-degree paternal female relative', spec: '3', specLabel: '3, Paternal female first cousin' };
            }
            if (parNorm.includes('tia-avoa paterna') || parNorm.includes('tia-avo paterna') || (codA.startsWith('D') && codA !== 'D1' && b === 0 && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_female', prefixo: 'd3_p_female', rotuloGrupo: 'Tia-Avó Paterna', fieldCount: 'd3_p_female', checkField: 'fam_mem_third2', checkVal: '4', checkLabel: '4, Third-degree paternal female relative', spec: '5', specLabel: '5, Paternal Great-aunt' };
            }
            if ((parNorm.includes('bisavo') && parNorm.includes('paterna') && sexo === 'F') || (['I1', 'K1'].includes(codA) && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_p_female', prefixo: 'd3_p_female', rotuloGrupo: 'Bisavó Paterna', fieldCount: 'd3_p_female', checkField: 'fam_mem_third2', checkVal: '4', checkLabel: '4, Third-degree paternal female relative', spec: '1', specLabel: '1, Paternal Great-grandmother' };
            }

            // Maternal Male (Primo materno, Tio-avô materno, Bisavô materno)
            if (parNorm.includes('primo materno') || (codA.startsWith('C') && codA !== 'C1' && b > 0 && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_male', prefixo: 'd3_m_male', rotuloGrupo: 'Primo Materno', fieldCount: 'd3_m_male', checkField: 'fam_mem_third2', checkVal: '3', checkLabel: '3, Third-degree maternal male relative', spec: '2', specLabel: '2, Maternal Male first cousin' };
            }
            if (parNorm.includes('tio-avo materno') || (codA.startsWith('F') && codA !== 'F1' && b === 0 && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_male', prefixo: 'd3_m_male', rotuloGrupo: 'Tio-Avô Materno', fieldCount: 'd3_m_male', checkField: 'fam_mem_third2', checkVal: '3', checkLabel: '3, Third-degree maternal male relative', spec: '4', specLabel: '4, Maternal Great-uncle' };
            }
            if ((parNorm.includes('bisavo') && parNorm.includes('materno') && sexo === 'M') || (['L1', 'N1'].includes(codA) && sexo === 'M')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_male', prefixo: 'd3_m_male', rotuloGrupo: 'Bisavô Materno', fieldCount: 'd3_m_male', checkField: 'fam_mem_third2', checkVal: '3', checkLabel: '3, Third-degree maternal male relative', spec: '0', specLabel: '0, Maternal Great-grandfather' };
            }

            // Maternal Female (Prima materna, Tia-avó materna, Bisavó materna)
            if (parNorm.includes('prima materna') || (codA.startsWith('C') && codA !== 'C1' && b > 0 && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_female', prefixo: 'd3_m_female', rotuloGrupo: 'Prima Materna', fieldCount: 'd3_m_female', checkField: 'fam_mem_third2', checkVal: '2', checkLabel: '2, Third-degree maternal female relative', spec: '3', specLabel: '3, Maternal female first cousin' };
            }
            if (parNorm.includes('tia-avoa materna') || parNorm.includes('tia-avo materna') || (codA.startsWith('F') && codA !== 'F1' && b === 0 && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_female', prefixo: 'd3_m_female', rotuloGrupo: 'Tia-Avó Materna', fieldCount: 'd3_m_female', checkField: 'fam_mem_third2', checkVal: '2', checkLabel: '2, Third-degree maternal female relative', spec: '5', specLabel: '5, Maternal Great-aunt' };
            }
            if ((parNorm.includes('bisavo') && parNorm.includes('materna') && sexo === 'F') || (['M1', 'O1'].includes(codA) && sexo === 'F')) {
                return { tipo: 'dinamico_spec', form: 'hf_terceiro_grau_maternos_e_paternos', grupo: 'd3_m_female', prefixo: 'd3_m_female', rotuloGrupo: 'Bisavó Materna', fieldCount: 'd3_m_female', checkField: 'fam_mem_third2', checkVal: '2', checkLabel: '2, Third-degree maternal female relative', spec: '1', specLabel: '1, Maternal Great-grandmother' };
            }

            // Fallback genérico para cônjuges ou parentes não consanguíneos
            return { tipo: 'outro', ignorar: true };
        },

        /**
         * Executa a calibração de toda a tabela de parentes gerando as variáveis REDCap
         * @param {Array} parentes Lista de parentes de TabelaParentes.parentes
         * @returns {Object} { camposInspector, payloadApi, textoCalibrado, estatisticas }
         */
        calibrarTabela: function(parentes) {
            const lista = Array.isArray(parentes) ? parentes : [];
            const camposInspector = [];
            const payloadApi = {};
            const linhasTexto = [];

            // 1. info_fam (Há informações sobre a história familiar?)
            // Se houver parentes além do probando na tabela ou algum diagnóstico cadastrado:
            const parentesFam = lista.filter(p => {
                const cod = (p.codA || '').toUpperCase().trim();
                const b = parseInt(p.codB, 10) || 0;
                const c = parseInt(p.codC, 10) || 0;
                return !(cod === 'A1' && b === 0 && c === 0);
            });

            const temHistoria = parentesFam.length > 0;
            const valInfoFam = temHistoria ? '1' : '0';
            const valInfoFamLabel = temHistoria ? '1, Sim' : '0, Não';

            payloadApi['info_fam'] = valInfoFam;
            linhasTexto.push(`info_fam = ${temHistoria ? 'sim' : 'não'}`);

            camposInspector.push({
                name: 'info_fam',
                form: 'hf_pais_e_avs',
                type: 'yesno',
                label: 'Há informações sobre a história familiar?',
                value: valInfoFamLabel,
                raw_value: valInfoFam,
                isPreenchido: true,
                branching_logic: ''
            });

            // Captura valores adicionais preenchidos nos novos campos da Aba 4 (hf_pais_e_avs)
            if (typeof document !== 'undefined') {
                // 1. info_fam (override se usuário escolheu explicitamente no select)
                const elInfoFam = document.getElementById('field-info-fam');
                if (elInfoFam && elInfoFam.value !== '') {
                    const val = elInfoFam.value;
                    payloadApi['info_fam'] = val;
                    linhasTexto[0] = `info_fam = ${val === '1' ? 'sim' : 'não'}`;
                    if (camposInspector[0]) {
                        camposInspector[0].value = (val === '1' ? '1, Sim' : '0, Não');
                        camposInspector[0].raw_value = val;
                    }
                }

                // 2. hist_familiar
                const chkHist1 = document.getElementById('field-hist-fam-1');
                const chkHist13 = document.getElementById('field-hist-fam-13');
                const chkHist18 = document.getElementById('field-hist-fam-18');
                const chkHist19 = document.getElementById('field-hist-fam-19');
                const histAtivos = [];
                if (chkHist1 && chkHist1.checked) { payloadApi['hist_familiar___1'] = '1'; histAtivos.push('1, Variante P/PP'); }
                if (chkHist13 && chkHist13.checked) { payloadApi['hist_familiar___13'] = '1'; histAtivos.push('13, Li-Fraumeni'); }
                if (chkHist18 && chkHist18.checked) { payloadApi['hist_familiar___18'] = '1'; histAtivos.push('18, Polipose'); }
                if (chkHist19 && chkHist19.checked) { payloadApi['hist_familiar___19'] = '1'; histAtivos.push('19, CS/PHTS/BRRS'); }
                if (histAtivos.length > 0) {
                    linhasTexto.push(`hist_familiar = ${histAtivos.join('; ')}`);
                    camposInspector.push({
                        name: 'hist_familiar',
                        form: 'hf_pais_e_avs',
                        type: 'checkbox',
                        label: 'Sobre a história familiar, algum parente tem/teve...',
                        value: histAtivos.join(', '),
                        raw_value: histAtivos.join(','),
                        isPreenchido: true,
                        branching_logic: "[info_fam] = '1'"
                    });
                }

                // 3. variante_familia & variante_familia_mult
                const selVar = document.getElementById('field-variante-familia');
                if (selVar && selVar.value) {
                    const geneTxt = selVar.selectedOptions[0]?.textContent || selVar.value;
                    payloadApi['variante_familia'] = selVar.value;
                    linhasTexto.push(`variante_familia = ${geneTxt}`);
                    camposInspector.push({
                        name: 'variante_familia',
                        form: 'hf_pais_e_avs',
                        type: 'dropdown',
                        label: 'Qual o gene em que há variante P/PP conhecida?',
                        value: geneTxt,
                        raw_value: selVar.value,
                        isPreenchido: true,
                        branching_logic: "[hist_familiar(1)] = '1'"
                    });
                }
                const inVarMult = document.getElementById('field-variante-familia-mult');
                if (inVarMult && inVarMult.value.trim()) {
                    payloadApi['variante_familia_mult'] = inVarMult.value.trim();
                    linhasTexto.push(`variante_familia_mult = ${inVarMult.value.trim()}`);
                    camposInspector.push({
                        name: 'variante_familia_mult',
                        form: 'hf_pais_e_avs',
                        type: 'text',
                        label: 'Em caso de variante familiar em mais de um gene, nomes:',
                        value: inVarMult.value.trim(),
                        raw_value: inVarMult.value.trim(),
                        isPreenchido: true,
                        branching_logic: "[variante_familia] = '99'"
                    });
                }

                // 4. consanguinidade & esp_consanguinid
                const radCons = document.querySelector('input[name="consanguinidade"]:checked');
                if (radCons && radCons.value) {
                    const mapCons = { '1': '1, Sim', '2': '2, Não', '3': '3, Desconhecido' };
                    payloadApi['consanguinidade'] = radCons.value;
                    linhasTexto.push(`consanguinidade = ${mapCons[radCons.value] || radCons.value}`);
                    camposInspector.push({
                        name: 'consanguinidade',
                        form: 'hf_pais_e_avs',
                        type: 'radio',
                        label: 'Consanguinidade?',
                        value: mapCons[radCons.value] || radCons.value,
                        raw_value: radCons.value,
                        isPreenchido: true,
                        branching_logic: "[info_fam] = '1'"
                    });
                }
                const inEspCons = document.getElementById('field-esp-consanguinid');
                if (inEspCons && inEspCons.value.trim()) {
                    payloadApi['esp_consanguinid'] = inEspCons.value.trim();
                    linhasTexto.push(`esp_consanguinid = ${inEspCons.value.trim()}`);
                    camposInspector.push({
                        name: 'esp_consanguinid',
                        form: 'hf_pais_e_avs',
                        type: 'text',
                        label: 'Especifique a consanguinidade',
                        value: inEspCons.value.trim(),
                        raw_value: inEspCons.value.trim(),
                        isPreenchido: true,
                        branching_logic: "[info_fam] = '1' && [consanguinidade] = '1'"
                    });
                }

                // 5. conterraneidade & esp_conterraneidad
                const radCont = document.querySelector('input[name="conterraneidade"]:checked');
                if (radCont && radCont.value) {
                    const mapCont = { '1': '1, Sim', '2': '2, Não', '3': '3, Desconhecido' };
                    payloadApi['conterraneidade'] = radCont.value;
                    linhasTexto.push(`conterraneidade = ${mapCont[radCont.value] || radCont.value}`);
                    camposInspector.push({
                        name: 'conterraneidade',
                        form: 'hf_pais_e_avs',
                        type: 'radio',
                        label: 'Conterraneidade?',
                        value: mapCont[radCont.value] || radCont.value,
                        raw_value: radCont.value,
                        isPreenchido: true,
                        branching_logic: "[info_fam] = '1'"
                    });
                }
                const inEspCont = document.getElementById('field-esp-conterraneidad');
                if (inEspCont && inEspCont.value.trim()) {
                    payloadApi['esp_conterraneidad'] = inEspCont.value.trim();
                    linhasTexto.push(`esp_conterraneidad = ${inEspCont.value.trim()}`);
                    camposInspector.push({
                        name: 'esp_conterraneidad',
                        form: 'hf_pais_e_avs',
                        type: 'text',
                        label: 'Especifique a conterraneidade',
                        value: inEspCont.value.trim(),
                        raw_value: inEspCont.value.trim(),
                        isPreenchido: true,
                        branching_logic: "[info_fam] = '1' && [conterraneidade] = '1'"
                    });
                }

                // 6. add_info
                const inAddInfo = document.getElementById('field-add-info');
                if (inAddInfo && inAddInfo.value.trim()) {
                    payloadApi['add_info'] = inAddInfo.value.trim();
                    linhasTexto.push(`add_info = ${inAddInfo.value.trim()}`);
                    camposInspector.push({
                        name: 'add_info',
                        form: 'hf_pais_e_avs',
                        type: 'notes',
                        label: 'Informações adicionais sobre história familiar',
                        value: inAddInfo.value.trim(),
                        raw_value: inAddInfo.value.trim(),
                        isPreenchido: true,
                        branching_logic: ''
                    });
                }
            }

            // Agrupador dos parentes por categoria
            const grupos = {
                // Pais e Avós
                dad: null,
                mom: null,
                pgpa: null,
                pgma: null,
                mgpa: null,
                mgma: null,
                // Dinâmicos (listas)
                bro: [],
                sis: [],
                son: [],
                dghtr: [],
                b_g_son: [],
                b_g_dghtr: [],
                mnephew: [],
                mniece: [],
                p_h_bro: [],
                p_h_sis: [],
                puncle: [],
                paunt: [],
                m_h_bro: [],
                m_h_sis: [],
                muncle: [],
                maunt: [],
                gg_sons: [],
                gg_dghtr: [],
                d3_p_male: [],
                d3_p_female: [],
                d3_m_male: [],
                d3_m_female: []
            };

            // Distribui cada parente no agrupador
            parentesFam.forEach(p => {
                const classe = this.classificarParente(p);
                if (classe.ignorar) return;

                if (classe.tipo === 'fixo') {
                    const chave = classe.prefixo.replace('_', '');
                    grupos[chave] = { parente: p, classe: classe };
                } else if (classe.tipo === 'dinamico' || classe.tipo === 'dinamico_spec') {
                    if (Array.isArray(grupos[classe.grupo])) {
                        grupos[classe.grupo].push({ parente: p, classe: classe });
                    }
                }
            });

            // Função auxiliar para processar um parente e extrair tumores e variáveis
            const processarParenteCampos = (p, prefix, formName, rotuloParente, specInfo) => {
                const diags = Array.isArray(p.diags) ? p.diags : [];

                // Separa tumores reais de opções de status (desconhecido / sem histórico)
                const diagsCancer = diags.filter(d => {
                    const nome = (d.tumor || '').trim().toLowerCase();
                    const cod = (d.codigo || '').trim();
                    if (cod === 'HIST_DESC' || cod === 'SEM_HIST') return false;
                    if (nome === 'histórico desconhecido' || nome === 'historico desconhecido' || nome === "don't know" || nome === 'desconhecido') return false;
                    if (nome === 'sem histórico' || nome === 'sem historico' || nome === 'none listed' || nome === 'sem neoplasias relatadas') return false;
                    return true;
                });

                const isDesconhecido = diags.some(d => {
                    const nome = (d.tumor || '').trim().toLowerCase();
                    const cod = (d.codigo || '').trim();
                    return cod === 'HIST_DESC' || nome === 'histórico desconhecido' || nome === 'historico desconhecido' || nome === "don't know" || nome === 'desconhecido';
                }) || (diagsCancer.length === 0 && String(p.history_code) === '0');

                const isSemHist = diags.some(d => {
                    const nome = (d.tumor || '').trim().toLowerCase();
                    const cod = (d.codigo || '').trim();
                    return cod === 'SEM_HIST' || nome === 'sem histórico' || nome === 'sem historico' || nome === 'none listed';
                }) || (diagsCancer.length === 0 && String(p.history_code) === '1');

                let histVal = '';
                let histLabel = '';

                if (diagsCancer.length > 0) {
                    histVal = '2';
                    histLabel = '2, History';
                } else if (isDesconhecido) {
                    histVal = '0';
                    histLabel = "0, Don't know";
                } else if (isSemHist) {
                    histVal = '1';
                    histLabel = '1, None listed';
                } else if (p.history_code !== undefined && p.history_code !== null && p.history_code !== '') {
                    histVal = String(p.history_code);
                    histLabel = histVal === '0' ? "0, Don't know" : (histVal === '2' ? "2, History" : "1, None listed");
                }

                const histField = `${prefix}history`;
                if (histVal !== '') {
                    payloadApi[histField] = histVal;
                    camposInspector.push({
                        name: histField,
                        form: formName,
                        type: 'dropdown',
                        label: `${rotuloParente} - Histórico Médico / Neoplasias`,
                        value: histLabel,
                        raw_value: histVal,
                        isPreenchido: true,
                        branching_logic: ''
                    });

                    linhasTexto.push(`${histField} = ${histLabel}`);
                }

                // Se houver especificação de parentesco de 3º grau (ex: d3_p_male1_spec)
                if (specInfo && specInfo.spec) {
                    const specField = `${prefix}spec`;
                    payloadApi[specField] = specInfo.spec;
                    camposInspector.push({
                        name: specField,
                        form: formName,
                        type: 'radio',
                        label: `Especificação de Parentesco de 3º Grau (${rotuloParente})`,
                        value: specInfo.specLabel || specInfo.spec,
                        raw_value: specInfo.spec,
                        isPreenchido: true,
                        branching_logic: `[${histField}] = '2'`
                    });
                    linhasTexto.push(`${specField} = ${specInfo.specLabel || specInfo.spec}`);
                }

                if (diagsCancer.length > 0) {
                    const codigosTumores = [];
                    diagsCancer.forEach(d => {
                        const cod = String(d.codigo !== undefined ? d.codigo : '').trim();
                        if (cod === '') return;
                        codigosTumores.push(cod);

                        // Checkbox REDCap individual
                        const chkField = `${prefix}med___${cod}`;
                        payloadApi[chkField] = '1';

                        // Idade do diagnóstico
                        const ageField = `${prefix}med${cod}`;
                        const idadeVal = (d.idade !== null && d.idade !== undefined && d.idade !== '') ? String(d.idade) : null;
                        payloadApi[ageField] = idadeVal !== null ? idadeVal : '';

                        const nomeTumor = TUMORES_HF_LABELS[cod] || d.tumor || `Tumor #${cod}`;
                        camposInspector.push({
                            name: ageField,
                            form: formName,
                            type: 'text',
                            label: `${rotuloParente} - Idade ao Diagnóstico: ${nomeTumor}`,
                            value: idadeVal !== null ? `${idadeVal} anos` : 'Idade não informada (NULL)',
                            raw_value: idadeVal !== null ? idadeVal : '',
                            isPreenchido: true,
                            branching_logic: `[${prefix}med(${cod})] = '1'`
                        });

                        linhasTexto.push(`${ageField} = ${idadeVal !== null ? idadeVal : 'NULL'}`);

                        // Outro câncer (código 10)
                        if (cod === '10' && d.outro) {
                            const otherField = `${prefix}othercan`;
                            payloadApi[otherField] = d.outro;
                            camposInspector.push({
                                name: otherField,
                                form: formName,
                                type: 'text',
                                label: `${rotuloParente} - Especificação de Outro Câncer`,
                                value: d.outro,
                                raw_value: d.outro,
                                isPreenchido: true,
                                branching_logic: `[${prefix}med(10)] = '1'`
                            });
                            linhasTexto.push(`${otherField} = ${d.outro}`);
                        }
                    });

                    // Campo de resumo dos códigos médicos selecionados (apenas exibição visual no inspector)
                    if (codigosTumores.length > 0) {
                        const medField = `${prefix}med`;
                        linhasTexto.splice(linhasTexto.indexOf(`${histField} = ${histLabel}`) + 1, 0, `${medField} = ${codigosTumores.join(',')}`);
                    }
                }
            };

            // 2. Processamento de Pais e Avós Fixos (hf_pais_e_avs)
            const paisAvosKeys = [
                { key: 'pgpa', prefix: 'pgpa_', rotulo: 'Avô Paterno' },
                { key: 'pgma', prefix: 'pgma_', rotulo: 'Avó Paterna' },
                { key: 'dad',  prefix: 'dad_',  rotulo: 'Pai' },
                { key: 'mom',  prefix: 'mom_',  rotulo: 'Mãe' },
                { key: 'mgpa', prefix: 'mgpa_', rotulo: 'Avô Materno' },
                { key: 'mgma', prefix: 'mgma_', rotulo: 'Avó Materna' }
            ];

            paisAvosKeys.forEach(pa => {
                const item = grupos[pa.key];
                if (item && item.parente) {
                    linhasTexto.push('');
                    processarParenteCampos(item.parente, pa.prefix, 'hf_pais_e_avs', pa.rotulo, null);
                }
            });

            // 3. Processamento de Grupos Dinâmicos
            // Mapeamento dos grupos com seus metadados REDCap
            const dinamicConfigs = [
                // 1º Grau
                { grupo: 'bro', form: 'hf_primeiro_grau', prefixo: 'bro', histPrefix: 'bro', countField: 'f_bro', checkField: 'fam_mem1', checkVal: '1', checkLabel: '1, Full brothers', famMemGen: '1', rotulo: 'Irmão' },
                { grupo: 'sis', form: 'hf_primeiro_grau', prefixo: 'sis', histPrefix: 'sis', countField: 'f_sis', checkField: 'fam_mem1', checkVal: '0', checkLabel: '0, Full sisters', famMemGen: '0', rotulo: 'Irmã' },
                { grupo: 'son', form: 'hf_primeiro_grau', prefixo: 'son', histPrefix: 'son', countField: 'b_sons', checkField: 'fam_mem1', checkVal: '7', checkLabel: '7, Blood-related sons', famMemGen: '7', rotulo: 'Filho' },
                { grupo: 'dghtr', form: 'hf_primeiro_grau', prefixo: 'dghtr', histPrefix: 'dghtr', countField: 'b_dghtr', checkField: 'fam_mem1', checkVal: '6', checkLabel: '6, Blood-related daughters', famMemGen: '6', rotulo: 'Filha' },
                // 2º Grau Comuns
                { grupo: 'b_g_son', form: 'hf_segundo_grau_comuns', prefixo: 'g_son', histPrefix: 'b_g_son', countField: 'b_g_sons', checkField: 'fam_mem2', checkVal: '13', checkLabel: '13, Grandsons', famMemGen: '13', rotulo: 'Neto' },
                { grupo: 'b_g_dghtr', form: 'hf_segundo_grau_comuns', prefixo: 'g_dghtr', histPrefix: 'b_g_dghtr', countField: 'b_g_dghtr', checkField: 'fam_mem2', checkVal: '12', checkLabel: '12, Granddaughters', famMemGen: '12', rotulo: 'Neta' },
                { grupo: 'mnephew', form: 'hf_segundo_grau_comuns', prefixo: 'mnephew', histPrefix: 'mnephew', countField: 'm_nephews', checkField: 'fam_mem2', checkVal: '15', checkLabel: '15, Nephews', famMemGen: '15', rotulo: 'Sobrinho' },
                { grupo: 'mniece', form: 'hf_segundo_grau_comuns', prefixo: 'mniece', histPrefix: 'mniece', countField: 'm_nieces', checkField: 'fam_mem2', checkVal: '14', checkLabel: '14, Nieces', famMemGen: '14', rotulo: 'Sobrinha' },
                // 2º Grau Paternos
                { grupo: 'p_h_bro', form: 'hf_segundo_grau_paternos', prefixo: 'p_h_bro', histPrefix: 'p_h_bro', countField: 'p_h_bro', checkField: 'fam_mem3', checkVal: '11', checkLabel: '11, Paternal Half Brothers', famMemGen: '11', rotulo: 'Meio-Irmão Paterno' },
                { grupo: 'p_h_sis', form: 'hf_segundo_grau_paternos', prefixo: 'p_h_sis', histPrefix: 'p_h_sis', countField: 'p_h_sis', countPrefix: 'p_h_sis', checkField: 'fam_mem3', checkVal: '10', checkLabel: '10, Paternal Half Sisters', famMemGen: '10', rotulo: 'Meia-Irmã Paterna' },
                { grupo: 'puncle', form: 'hf_segundo_grau_paternos', prefixo: 'puncle', histPrefix: 'puncle', countField: 'p_uncles', checkField: 'fam_mem3', checkVal: '9', checkLabel: '9, Paternal uncles', famMemGen: '9', rotulo: 'Tio Paterno' },
                { grupo: 'paunt', form: 'hf_segundo_grau_paternos', prefixo: 'paunt', histPrefix: 'paunt', countField: 'p_aunts', checkField: 'fam_mem3', checkVal: '8', checkLabel: '8, Paternal aunts', famMemGen: '8', rotulo: 'Tia Paterna' },
                // 2º Grau Maternos
                { grupo: 'm_h_bro', form: 'hf_segundo_grau_maternos', prefixo: 'm_h_bro', histPrefix: 'm_h_bro', countField: 'm_h_bro', checkField: 'fam_mem4', checkVal: '3', checkLabel: '3, Maternal Half Brothers', famMemGen: '3', rotulo: 'Meio-Irmão Materno' },
                { grupo: 'm_h_sis', form: 'hf_segundo_grau_maternos', prefixo: 'm_h_sis', histPrefix: 'm_h_sis', countField: 'm_h_sis', checkField: 'fam_mem4', checkVal: '2', checkLabel: '2, Maternal Half Sisters', famMemGen: '2', rotulo: 'Meia-Irmã Materna' },
                { grupo: 'muncle', form: 'hf_segundo_grau_maternos', prefixo: 'muncle', histPrefix: 'muncle', countField: 'm_uncles', checkField: 'fam_mem4', checkVal: '5', checkLabel: '5, Maternal uncles', famMemGen: '5', rotulo: 'Tio Materno' },
                { grupo: 'maunt', form: 'hf_segundo_grau_maternos', prefixo: 'maunt', histPrefix: 'maunt', countField: 'm_aunts', checkField: 'fam_mem4', checkVal: '4', checkLabel: '4, Maternal aunts', famMemGen: '4', rotulo: 'Tia Materna' },
                // 3º Grau Comuns
                { grupo: 'gg_sons', form: 'hf_terceiro_grau_comuns', prefixo: 'gg_sons', histPrefix: 'gg_sons', countField: 'gg_sons', checkField: 'fam_mem_third1', checkVal: '1', checkLabel: '1, Great-grandson or Grandnephew', rotulo: 'Bisneto / Sobrinho-Neto' },
                { grupo: 'gg_dghtr', form: 'hf_terceiro_grau_comuns', prefixo: 'gg_dghtr', histPrefix: 'gg_dghtr', countField: 'gg_dghtr', checkField: 'fam_mem_third1', checkVal: '0', checkLabel: '0, Great-granddaughter or Grandniece', rotulo: 'Bisneta / Sobrinha-Neta' },
                // 3º Grau Paterno e Materno
                { grupo: 'd3_p_male', form: 'hf_terceiro_grau_maternos_e_paternos', prefixo: 'd3_p_male', histPrefix: 'd3_p_male', countField: 'd3_p_male', checkField: 'fam_mem_third2', checkVal: '5', checkLabel: '5, Third-degree paternal male relative', rotulo: 'Parente Masculino de 3º Grau Paterno' },
                { grupo: 'd3_p_female', form: 'hf_terceiro_grau_maternos_e_paternos', prefixo: 'd3_p_female', histPrefix: 'd3_p_female', countField: 'd3_p_female', checkField: 'fam_mem_third2', checkVal: '4', checkLabel: '4, Third-degree paternal female relative', rotulo: 'Parente Feminino de 3º Grau Paterno' },
                { grupo: 'd3_m_male', form: 'hf_terceiro_grau_maternos_e_paternos', prefixo: 'd3_m_male', histPrefix: 'd3_m_male', countField: 'd3_m_male', checkField: 'fam_mem_third2', checkVal: '3', checkLabel: '3, Third-degree maternal male relative', rotulo: 'Parente Masculino de 3º Grau Materno' },
                { grupo: 'd3_m_female', form: 'hf_terceiro_grau_maternos_e_paternos', prefixo: 'd3_m_female', histPrefix: 'd3_m_female', countField: 'd3_m_female', checkField: 'fam_mem_third2', checkVal: '2', checkLabel: '2, Third-degree maternal female relative', rotulo: 'Parente Feminino de 3º Grau Materno' }
            ];

            dinamicConfigs.forEach(cfg => {
                const itens = grupos[cfg.grupo] || [];
                const qtd = itens.length;
                if (qtd === 0) return;

                linhasTexto.push('');

                // Quantidade de parentes no dropdown
                payloadApi[cfg.countField] = String(qtd);
                linhasTexto.push(`${cfg.countField} = ${qtd}`);

                // Checkbox de seleção do membro da família presente no instrumento específico
                const chkName = `${cfg.checkField}___${cfg.checkVal}`;
                payloadApi[chkName] = '1';
                linhasTexto.push(`${cfg.checkField} = ${cfg.checkLabel}`);

                // Checkbox de seleção do membro da família presente no hf_pais_e_avs geral (fam_mem)
                if (cfg.famMemGen) {
                    payloadApi[`fam_mem___${cfg.famMemGen}`] = '1';
                }

                camposInspector.push({
                    name: cfg.countField,
                    form: cfg.form,
                    type: 'dropdown',
                    label: `Quantidade de ${cfg.rotulo}s na Família`,
                    value: String(qtd),
                    raw_value: String(qtd),
                    isPreenchido: true,
                    branching_logic: ''
                });

                camposInspector.push({
                    name: chkName,
                    form: cfg.form,
                    type: 'checkbox',
                    label: `Membros da Família Presentes: ${cfg.checkLabel}`,
                    value: '1 (Marcado)',
                    raw_value: '1',
                    isPreenchido: true,
                    branching_logic: ''
                });

                // ORDENAÇÃO CRÍTICA DO REDCAP:
                // Parentes com histórico de câncer vêm PRIMEIRO nos slots (1, 2, 3...)!
                itens.sort((a, b) => {
                    const countCancer = (par) => {
                        if (!par || !Array.isArray(par.diags)) return 0;
                        return par.diags.filter(d => {
                            const nome = (d.tumor || '').trim().toLowerCase();
                            const cod = (d.codigo || '').trim();
                            return cod !== 'HIST_DESC' && cod !== 'SEM_HIST' && nome !== 'histórico desconhecido' && nome !== 'sem histórico' && nome !== "don't know" && nome !== 'none listed';
                        }).length;
                    };
                    return countCancer(b.parente) - countCancer(a.parente);
                });

                // Preenche os slots (até 4 no REDCap)
                const limiteSlots = Math.min(qtd, 4);
                for (let i = 0; i < limiteSlots; i++) {
                    const slotNum = i + 1;
                    const slotItem = itens[i];
                    const p = slotItem.parente;
                    const classe = slotItem.classe;

                    const prefix = `${cfg.prefixo}${slotNum}_`;
                    const rotuloSlot = `${cfg.rotulo} #${slotNum}`;
                    processarParenteCampos(p, prefix, cfg.form, rotuloSlot, classe);
                }
            });

            return {
                camposInspector: camposInspector,
                payloadApi: payloadApi,
                textoCalibrado: linhasTexto.join('\n'),
                estatisticas: {
                    totalParentesFamilia: parentesFam.length,
                    totalVariaveisGeradas: camposInspector.length,
                    totalVariaveisPreenchidas: camposInspector.filter(c => c.isPreenchido).length
                }
            };
        },

        /**
         * Retorna a lista de campos para alimentar o modal REDCap Inspector
         */
        obterCamposInspector: function(parentes) {
            const calib = this.calibrarTabela(parentes);
            return calib.camposInspector;
        },

        /**
         * Retorna apenas o payload de variáveis REDCap prontas para API ou CSV
         * @param {Array} [parentes] Lista de parentes (opcional, fallback para TabelaParentes.parentes)
         * @returns {Object} Dicionário chave-valor com variáveis e checkboxes REDCap
         */
        gerarPayloadApi: function(parentes) {
            const lista = parentes || (window.TabelaParentes ? window.TabelaParentes.parentes : []);
            const calib = this.calibrarTabela(lista);
            return calib.payloadApi || {};
        },

        /**
         * Copia o Payload JSON calibrado para a área de transferência
         */
        copiarPayloadJSON: function(parentes) {
            const calib = this.calibrarTabela(parentes);
            const jsonStr = JSON.stringify(calib.payloadApi, null, 2);
            navigator.clipboard.writeText(jsonStr).then(() => {
                alert('✅ Payload JSON do REDCap copiado com sucesso para a área de transferência!');
            }).catch(err => {
                console.error('Erro ao copiar payload:', err);
                prompt('Copie o payload JSON abaixo:', jsonStr);
            });
        },

        /**
         * Copia o texto no formato calibrado idêntico ao solicitado pelo usuário
         */
        copiarTextoCalibrado: function(parentes) {
            const calib = this.calibrarTabela(parentes);
            navigator.clipboard.writeText(calib.textoCalibrado).then(() => {
                alert('✅ Variáveis calibradas copiadas com sucesso no formato REDCap!');
            }).catch(err => {
                console.error('Erro ao copiar texto calibrado:', err);
                prompt('Copie o texto calibrado abaixo:', calib.textoCalibrado);
            });
        }
    };

    window.RedcapCalibradorHF = RedcapCalibradorHF;

})(window);
