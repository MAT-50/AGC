/**
 * Presets Didáticos e Dicionário Clínico
 * FMRP-USP - Ambulatório de Aconselhamento Genético do Câncer (AGC)
 */

// Lista oficial dos 40 tumores e condições clínicas mapeados no serviço
const LISTA_TUMORES_CLINICOS = [
    "CA de Mama",
    "CA de Ovário",
    "CA de Cólon",
    "CA de Reto",
    "CA de Próstata",
    "CA de Pâncreas",
    "CA de Estômago",
    "CA de Endométrio",
    "CA de Rim",
    "CA de Pulmão",
    "Melanoma",
    "Tumor de SNC",
    "Osteossarcoma",
    "Sarcoma",
    "CA Adrenocortical",
    "CA Urotelial",
    "CA de Tireoide",
    "Linfoma / Leucemia",
    "CA Int. Delgado",
    "CA de Colo Uterino",
    "CA de Vias Biliares",
    "CA de Esôfago",
    "CA de Fígado",
    "CA Perit/Tuba",
    "CA de Pele ñ-mel",
    "CA Sebáceo",
    "Ceratoacantoma",
    "Tumor Neuroendócrino",
    "Paraganglioma",
    "CA de Timo",
    "CA de Testículo",
    "CA de Pênis",
    "CA de Ânus",
    "CA de Cab/Pesc",
    "Síndrome de Cowden",
    "Sínd. Peutz-Jeghers",
    "Sínd. Polipose Juvenil",
    "Sínd. VHL",
    "Sínd. Lynch (Não esp.)",
    "Outro Câncer"
];

// Paleta de 40 cores clínicas distintas para a diferenciação visual no SVG
const PALETA_CORES_TUMORES = {
    "CA de Mama": "#0284c7",          // Azul Claro
    "CA de Ovário": "#059669",         // Verde Esmeralda
    "CA de Cólon": "#d97706",          // Âmbar
    "CA de Reto": "#b45309",           // Castanho
    "CA de Próstata": "#7c3aed",       // Roxo
    "CA de Pâncreas": "#ea580c",       // Laranja Quente
    "CA de Estômago": "#16a34a",       // Verde Folha
    "CA de Endométrio": "#db2777",      // Rosa Choque
    "CA de Rim": "#0891b2",            // Ciano Escuro
    "CA de Pulmão": "#64748b",         // Cinza Azulado
    "Melanoma": "#334155",             // Grafite Escuro
    "Tumor de SNC": "#dc2626",         // Vermelho Vivo
    "Osteossarcoma": "#e11d48",        // Carmim
    "Sarcoma": "#9333ea",              // Magenta Escuro
    "CA Adrenocortical": "#ca8a04",    // Amarelo Ocre
    "CA Urotelial": "#2563eb",         // Azul Royal
    "CA de Tireoide": "#475569",       // Cinza Ardósia
    "Linfoma / Leucemia": "#84cc16",   // Lima
    "CA Int. Delgado": "#f59e0b",      // Dourado
    "CA de Colo Uterino": "#f43f5e",   // Rosa Carmesim
    "CA de Vias Biliares": "#f97316",  // Tangerina
    "CA de Esôfago": "#854d0e",        // Marrom Dourado
    "CA de Fígado": "#a16207",         // Marrom Mostarda
    "CA Perit/Tuba": "#10b981",        // Menta
    "CA de Pele ñ-mel": "#94a3b8",     // Cinza Claro
    "CA Sebáceo": "#d946ef",           // Fúcsia
    "Ceratoacantoma": "#ec4899",       // Rosa Chiclete
    "Tumor Neuroendócrino": "#6366f1", // Índigo
    "Paraganglioma": "#4f46e5",        // Anil
    "CA de Timo": "#6b7280",           // Cinza Médio
    "CA de Testículo": "#3b82f6",      // Azul Celeste
    "CA de Pênis": "#1d4ed8",          // Azul Cobalto
    "CA de Ânus": "#78350f",           // Marrom Escuro
    "CA de Cab/Pesc": "#be123c",       // Bordô
    "Síndrome de Cowden": "#0d9488",   // Verde Petróleo
    "Sínd. Peutz-Jeghers": "#15803d",  // Verde Floresta
    "Sínd. Polipose Juvenil": "#b45309",// Ocre Escuro
    "Sínd. VHL": "#4338ca",            // Azul Ultramar
    "Sínd. Lynch (Não esp.)": "#b91c1c",// Vermelho Escuro
    "Outro Câncer": "#525252"          // Cinza Neutro
};

// Lista Padronizada de Parentescos para o Dropdown com Grau de Parentesco e Sexo
const DICIONARIO_PARENTESCOS = [
    { label: "Probando (Paciente)", categoria: "probando", sexo: "F", grau: "P", codA: "A1", codB: 0, codC: 0 },
    
    // 1º Grau (50% de compartilhamento genético)
    { label: "Pai", categoria: "pai", sexo: "M", grau: "1°", codA: "B1", codB: 0, codC: 0 },
    { label: "Mãe", categoria: "mae", sexo: "F", grau: "1°", codA: "C1", codB: 0, codC: 0 },
    { label: "Irmão", categoria: "irmao", sexo: "M", grau: "1°", codA: "A2", codB: 0, codC: 0 },
    { label: "Irmã", categoria: "irmao", sexo: "F", grau: "1°", codA: "A2", codB: 0, codC: 0 },
    { label: "Filho", categoria: "filho", sexo: "M", grau: "1°", codA: "A1", codB: 1, codC: 0 },
    { label: "Filha", categoria: "filho", sexo: "F", grau: "1°", codA: "A1", codB: 1, codC: 0 },

    // 2º Grau (25% de compartilhamento genético)
    { label: "Avô Paterno", categoria: "avo_pat", sexo: "M", grau: "2°", codA: "D1", codB: 0, codC: 0 },
    { label: "Avó Paterna", categoria: "avoa_pat", sexo: "F", grau: "2°", codA: "E1", codB: 0, codC: 0 },
    { label: "Avô Materno", categoria: "avo_mat", sexo: "M", grau: "2°", codA: "F1", codB: 0, codC: 0 },
    { label: "Avó Materna", categoria: "avoa_mat", sexo: "F", grau: "2°", codA: "G1", codB: 0, codC: 0 },
    { label: "Tio Paterno", categoria: "tio_pat", sexo: "M", grau: "2°", codA: "B2", codB: 0, codC: 0 },
    { label: "Tia Paterna", categoria: "tio_pat", sexo: "F", grau: "2°", codA: "B2", codB: 0, codC: 0 },
    { label: "Tio Materno", categoria: "tio_mat", sexo: "M", grau: "2°", codA: "C2", codB: 0, codC: 0 },
    { label: "Tia Materna", categoria: "tio_mat", sexo: "F", grau: "2°", codA: "C2", codB: 0, codC: 0 },
    { label: "Sobrinho", categoria: "sobrinho", sexo: "M", grau: "2°", codA: "A2", codB: 1, codC: 0 },
    { label: "Sobrinha", categoria: "sobrinho", sexo: "F", grau: "2°", codA: "A2", codB: 1, codC: 0 },
    { label: "Neto", categoria: "neto", sexo: "M", grau: "2°", codA: "A1", codB: 1, codC: 1 },
    { label: "Neta", categoria: "neto", sexo: "F", grau: "2°", codA: "A1", codB: 1, codC: 1 },
    { label: "Meio-Irmão Paterno", categoria: "meio_pat", sexo: "M", grau: "2°", codA: "B1", codB: 1, codC: 0 },
    { label: "Meia-Irmã Paterna", categoria: "meio_pat", sexo: "F", grau: "2°", codA: "B1", codB: 1, codC: 0 },
    { label: "Meio-Irmão Materno", categoria: "meio_mat", sexo: "M", grau: "2°", codA: "C1", codB: 1, codC: 0 },
    { label: "Meia-Irmã Materna", categoria: "meio_mat", sexo: "F", grau: "2°", codA: "C1", codB: 1, codC: 0 },

    // 3º Grau (12.5% de compartilhamento genético)
    { label: "Bisavô (pai do avô paterno)", categoria: "bisavo_pp", sexo: "M", grau: "3°", codA: "H1", codB: 0, codC: 0 },
    { label: "Bisavó (mãe do avô paterno)", categoria: "bisavo_pp", sexo: "F", grau: "3°", codA: "I1", codB: 0, codC: 0 },
    { label: "Bisavô (pai da avó paterna)", categoria: "bisavo_pm", sexo: "M", grau: "3°", codA: "J1", codB: 0, codC: 0 },
    { label: "Bisavó (mãe da avó paterna)", categoria: "bisavo_pm", sexo: "F", grau: "3°", codA: "K1", codB: 0, codC: 0 },
    { label: "Bisavô (pai do avô materno)", categoria: "bisavo_mp", sexo: "M", grau: "3°", codA: "L1", codB: 0, codC: 0 },
    { label: "Bisavó (mãe do avô materno)", categoria: "bisavo_mp", sexo: "F", grau: "3°", codA: "M1", codB: 0, codC: 0 },
    { label: "Bisavô (pai da avó materna)", categoria: "bisavo_mm", sexo: "M", grau: "3°", codA: "N1", codB: 0, codC: 0 },
    { label: "Bisavó (mãe da avó materna)", categoria: "bisavo_mm", sexo: "F", grau: "3°", codA: "O1", codB: 0, codC: 0 },
    { label: "Tio-Avô Paterno", categoria: "tio_avo_pat", sexo: "M", grau: "3°", codA: "D2", codB: 0, codC: 0 },
    { label: "Tia-Avó Paterna", categoria: "tio_avo_pat", sexo: "F", grau: "3°", codA: "D2", codB: 0, codC: 0 },
    { label: "Tio-Avô Materno", categoria: "tio_avo_mat", sexo: "M", grau: "3°", codA: "F2", codB: 0, codC: 0 },
    { label: "Tia-Avó Materna", categoria: "tio_avo_mat", sexo: "F", grau: "3°", codA: "F2", codB: 0, codC: 0 },
    { label: "Primo Paterno", categoria: "primo_pat", sexo: "M", grau: "3°", codA: "B2", codB: 1, codC: 0 },
    { label: "Prima Paterna", categoria: "primo_pat", sexo: "F", grau: "3°", codA: "B2", codB: 1, codC: 0 },
    { label: "Primo Materno", categoria: "primo_mat", sexo: "M", grau: "3°", codA: "C2", codB: 1, codC: 0 },
    { label: "Prima Materna", categoria: "primo_mat", sexo: "F", grau: "3°", codA: "C2", codB: 1, codC: 0 },
    { label: "Sobrinho-Neto", categoria: "sobrinho_neto", sexo: "M", grau: "3°", codA: "A2", codB: 1, codC: 1 },
    { label: "Sobrinha-Neta", categoria: "sobrinho_neto", sexo: "F", grau: "3°", codA: "A2", codB: 1, codC: 1 },
    { label: "Bisneto", categoria: "bisneto", sexo: "M", grau: "3°", codA: "A1", codB: 0, codC: 1 },
    { label: "Bisneta", categoria: "bisneto", sexo: "F", grau: "3°", codA: "A1", codB: 0, codC: 1 },
    { label: "Meio-Tio (filho do avô paterno)", categoria: "meio_tio_avo_pat", sexo: "M", grau: "3°", codA: "D1", codB: 1, codC: 0 },
    { label: "Meia-Tia (filha do avô paterno)", categoria: "meio_tio_avo_pat", sexo: "F", grau: "3°", codA: "D1", codB: 1, codC: 0 },
    { label: "Meio-Tio (filho da avó paterna)", categoria: "meio_tio_avoa_pat", sexo: "M", grau: "3°", codA: "E1", codB: 1, codC: 0 },
    { label: "Meia-Tia (filha da avó paterna)", categoria: "meio_tio_avoa_pat", sexo: "F", grau: "3°", codA: "E1", codB: 1, codC: 0 },
    { label: "Meio-Tio (filho do avô materno)", categoria: "meio_tio_avo_mat", sexo: "M", grau: "3°", codA: "F1", codB: 1, codC: 0 },
    { label: "Meia-Tia (filha do avô materno)", categoria: "meio_tio_avo_mat", sexo: "F", grau: "3°", codA: "F1", codB: 1, codC: 0 },
    { label: "Meio-Tio (filho da avó materna)", categoria: "meio_tio_avoa_mat", sexo: "M", grau: "3°", codA: "G1", codB: 1, codC: 0 },
    { label: "Meia-Tia (filha da avó materna)", categoria: "meio_tio_avoa_mat", sexo: "F", grau: "3°", codA: "G1", codB: 1, codC: 0 },
    { label: "Meio-Sobrinho Paterno", categoria: "meio_sobrinho_pat", sexo: "M", grau: "3°", codA: "B1", codB: 1, codC: 1 },
    { label: "Meia-Sobrinha Paterna", categoria: "meio_sobrinho_pat", sexo: "F", grau: "3°", codA: "B1", codB: 1, codC: 1 },
    { label: "Meio-Sobrinho Materno", categoria: "meio_sobrinho_mat", sexo: "M", grau: "3°", codA: "C1", codB: 1, codC: 1 },
    { label: "Meia-Sobrinha Materna", categoria: "meio_sobrinho_mat", sexo: "F", grau: "3°", codA: "C1", codB: 1, codC: 1 },

    // 4º Grau
    { label: "Filho de Tio-Avô Mat. (Primo da Mãe)", categoria: "primo_mae_mat", sexo: "M", grau: "4°", codA: "F2", codB: 1, codC: 0 },
    { label: "Filha de Tio-Avô Mat. (Prima da Mãe)", categoria: "primo_mae_mat", sexo: "F", grau: "4°", codA: "F2", codB: 1, codC: 0 }
];

// Pares canônicos de flexão de gênero para garantir consistência gramatical bidirecional
const PARES_GENERO_PARENTESCO = [
    { m: "Irmão", f: "Irmã", categoria: "irmao" },
    { m: "Filho", f: "Filha", categoria: "filho" },
    { m: "Neto", f: "Neta", categoria: "neto" },
    { m: "Bisneto", f: "Bisneta", categoria: "bisneto" },
    { m: "Sobrinho", f: "Sobrinha", categoria: "sobrinho" },
    { m: "Sobrinho-Neto", f: "Sobrinha-Neta", categoria: "sobrinho_neto" },
    { m: "Pai", f: "Mãe", categoria: "parental" },
    { m: "Tio Paterno", f: "Tia Paterna", categoria: "tio_pat" },
    { m: "Tio Materno", f: "Tia Materna", categoria: "tio_mat" },
    { m: "Meio-Tio (filho do avô paterno)", f: "Meia-Tia (filha do avô paterno)", categoria: "meio_tio_avo_pat" },
    { m: "Meio-Tio (filho da avó paterna)", f: "Meia-Tia (filha da avó paterna)", categoria: "meio_tio_avoa_pat" },
    { m: "Meio-Tio (filho do avô materno)", f: "Meia-Tia (filha do avô materno)", categoria: "meio_tio_avo_mat" },
    { m: "Meio-Tio (filho da avó materna)", f: "Meia-Tia (filha da avó materna)", categoria: "meio_tio_avoa_mat" },
    { m: "Primo Paterno", f: "Prima Paterna", categoria: "primo_pat" },
    { m: "Primo Materno", f: "Prima Materna", categoria: "primo_mat" },
    { m: "Meio-Irmão Paterno", f: "Meia-Irmã Paterna", categoria: "meio_pat" },
    { m: "Meio-Irmão Materno", f: "Meia-Irmã Materna", categoria: "meio_mat" },
    { m: "Meio-Sobrinho Paterno", f: "Meia-Sobrinha Paterna", categoria: "meio_sobrinho_pat" },
    { m: "Meio-Sobrinho Materno", f: "Meia-Sobrinha Materna", categoria: "meio_sobrinho_mat" },
    { m: "Avô Paterno", f: "Avó Paterna", categoria: "avo_pat" },
    { m: "Avô Materno", f: "Avó Materna", categoria: "avo_mat" },
    { m: "Tio-Avô Paterno", f: "Tia-Avó Paterna", categoria: "tio_avo_pat" },
    { m: "Tio-Avô Materno", f: "Tia-Avó Materna", categoria: "tio_avo_mat" },
    { m: "Filho de Tio-Avô Mat. (Primo da Mãe)", f: "Filha de Tio-Avô Mat. (Prima da Mãe)", categoria: "primo_mae_mat" },
    { m: "Bisavô (pai do avô paterno)", f: "Bisavó (mãe do avô paterno)", categoria: "bisavo_pp" },
    { m: "Bisavô (pai da avó paterna)", f: "Bisavó (mãe da avó paterna)", categoria: "bisavo_pm" },
    { m: "Bisavô (pai do avô materno)", f: "Bisavó (mãe do avô materno)", categoria: "bisavo_mp" },
    { m: "Bisavô (pai da avó materna)", f: "Bisavó (mãe da avó materna)", categoria: "bisavo_mm" },
    // Compatibilidade reversa com termos legados
    { m: "Bisavô Paterno-Paterno", f: "Bisavó Paterno-Paterna", categoria: "bisavo_pp" },
    { m: "Bisavô Paterno-Materno", f: "Bisavó Paterno-Materna", categoria: "bisavo_pm" },
    { m: "Bisavô Materno-Paterno", f: "Bisavó Materno-Paterna", categoria: "bisavo_mp" },
    { m: "Bisavô Materno-Materno", f: "Bisavó Materno-Materna", categoria: "bisavo_mm" },
    { m: "Meio-Tio Paterno", f: "Meia-Tia Paterna", categoria: "meio_tio_avo_pat" },
    { m: "Meio-Tio Materno", f: "Meia-Tia Materna", categoria: "meio_tio_avo_mat" },
    { m: "Meio-Tio", f: "Meia-Tia", categoria: "meio_tio_avo_pat" },
    { m: "Meio-Sobrinho", f: "Meia-Sobrinha", categoria: "meio_sobrinho_pat" },
    { m: "Padrasto (Cônjuge da Mãe)", f: "Madrasta (Cônjuge do Pai)", categoria: "conjuge" },
    { m: "Padrasto", f: "Madrasta", categoria: "conjuge" }
];

/**
 * Função Algorítmica de Dedução de Parentesco pelo Código e Sexo
 * O código genealógico define estritamente a posição topológica na árvore;
 * o Sexo define a forma gramatical (ex: A2.1 com M = Sobrinho; A2.1 com F = Sobrinha).
 */
function deduzirParentescoPorCodigo(codA, codB, codC, sexo) {
    const a = (codA || "").toUpperCase().trim();
    const b = parseInt(codB, 10) || 0;
    const c = parseInt(codC, 10) || 0;
    const isFem = (sexo === "F");

    if (!a) return "";

    // 1. Probando
    if (a === "A1" && b === 0 && c === 0) {
        return "Probando (Paciente)";
    }

    // 2. Cônjuges (Z1.A1, Z2.A1, Z1.B1, etc.)
    if (a.startsWith("Z")) {
        const valZ = validarCodigoCodA(a);
        if (valZ.valido && valZ.isConjuge) {
            const idxPrefix = valZ.indiceConjuge > 1 ? `${valZ.indiceConjuge}º ` : "";
            const idxPrefixFem = valZ.indiceConjuge > 1 ? `${valZ.indiceConjuge}ª ` : "";
            if (valZ.parceiro === "A1") {
                return `${idxPrefix}Cônjuge do Probando`;
            }
            if (valZ.parceiro === "B1") {
                return isFem ? `${idxPrefixFem}Madrasta (Cônjuge do Pai)` : `${idxPrefix}Cônjuge do Pai`;
            }
            if (valZ.parceiro === "C1") {
                return !isFem ? `${idxPrefix}Padrasto (Cônjuge da Mãe)` : `${idxPrefixFem}Cônjuge da Mãe`;
            }
            if (typeof TabelaParentes !== "undefined" && Array.isArray(TabelaParentes.parentes)) {
                const parceiroNode = TabelaParentes.parentes.find(p => p.codA === valZ.parceiro && (parseInt(p.codB, 10) || 0) === 0);
                if (parceiroNode && parceiroNode.parentesco) {
                    const rotulo = parceiroNode.parentesco;
                    if (rotulo.startsWith("Irmão")) return `${idxPrefix}Cônjuge do Irmão (${valZ.parceiro})`;
                    if (rotulo.startsWith("Irmã")) return `${idxPrefix}Cônjuge da Irmã (${valZ.parceiro})`;
                    if (rotulo.startsWith("Tio")) return `${idxPrefix}Cônjuge do ${rotulo} (${valZ.parceiro})`;
                    if (rotulo.startsWith("Tia")) return `${idxPrefix}Cônjuge da ${rotulo} (${valZ.parceiro})`;
                    if (rotulo.startsWith("Filho")) return `${idxPrefix}Cônjuge do Filho (Nora)`;
                    if (rotulo.startsWith("Filha")) return `${idxPrefix}Cônjuge da Filha (Genro)`;
                    return `${idxPrefix}Cônjuge de ${rotulo} (${valZ.parceiro})`;
                }
            }
            return `${idxPrefix}Cônjuge de ${valZ.parceiro}${b > 0 ? '.' + b : ''}`;
        }
        return "Cônjuge";
    }

    const letra = a.charAt(0);
    const num = parseInt(a.substring(1), 10) || 1;

    // 3. Ramo A: Probando, Irmãos, Filhos, Netos, Bisnetos, Sobrinhos, Sobrinhos-Netos
    if (letra === "A") {
        if (num === 1) {
            // Descendência direta do Probando
            if (b > 0 && c === 0) return isFem ? "Filha" : "Filho";
            if (b > 0 && c > 0) return isFem ? "Neta" : "Neto";
            if (b === 0 && c > 0) return isFem ? "Bisneta" : "Bisneto";
        } else {
            // Fratria de Irmãos do Probando (A2, A3, A4...)
            if (b === 0 && c === 0) return isFem ? "Irmã" : "Irmão";
            if (b > 0 && c === 0) return isFem ? "Sobrinha" : "Sobrinho"; // Filha ou filho do irmão/irmã A_num
            if (b > 0 && c > 0) return isFem ? "Sobrinha-Neta" : "Sobrinho-Neto";
        }
    }

    // 4. Ramo B: Pai, Tios Paternos, Primos Paternos, Meios-Irmãos, Meios-Sobrinhos
    if (letra === "B") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Pai";
            if (b > 0 && c === 0) return isFem ? "Meia-Irmã Paterna" : "Meio-Irmão Paterno";
            if (b > 0 && c > 0) return isFem ? "Meia-Sobrinha Paterna" : "Meio-Sobrinho Paterno";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia Paterna" : "Tio Paterno";
            return isFem ? "Prima Paterna" : "Primo Paterno";
        }
    }

    // 5. Ramo C: Mãe, Tias Maternas, Primos Maternos, Meios-Irmãos, Meios-Sobrinhos
    if (letra === "C") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Mãe";
            if (b > 0 && c === 0) return isFem ? "Meia-Irmã Materna" : "Meio-Irmão Materno";
            if (b > 0 && c > 0) return isFem ? "Meia-Sobrinha Materna" : "Meio-Sobrinho Materno";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia Materna" : "Tio Materno";
            return isFem ? "Prima Materna" : "Primo Materno";
        }
    }

    // 6. Ramo D: Avô Paterno, Meios-Tios (filhos do avô paterno), Tios-Avós Paternos
    if (letra === "D") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Avô Paterno";
            if (b > 0 && c === 0) return isFem ? "Meia-Tia (filha do avô paterno)" : "Meio-Tio (filho do avô paterno)";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia-Avó Paterna" : "Tio-Avô Paterno";
            return isFem ? "Prima Paterna" : "Primo Paterno";
        }
    }

    // 7. Ramo E: Avó Paterna, Meias-Tias (filhas da avó paterna), Tias-Avós Paternas
    if (letra === "E") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Avó Paterna";
            if (b > 0 && c === 0) return isFem ? "Meia-Tia (filha da avó paterna)" : "Meio-Tio (filho da avó paterna)";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia-Avó Paterna" : "Tio-Avô Paterno";
            return isFem ? "Prima Paterna" : "Primo Paterno";
        }
    }

    // 8. Ramo F: Avô Materno, Meios-Tios (filhos do avô materno), Tios-Avós Maternos
    if (letra === "F") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Avô Materno";
            if (b > 0 && c === 0) return isFem ? "Meia-Tia (filha do avô materno)" : "Meio-Tio (filho do avô materno)";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia-Avó Materna" : "Tio-Avô Materno";
            return isFem ? "Filha de Tio-Avô Mat. (Prima da Mãe)" : "Filho de Tio-Avô Mat. (Primo da Mãe)";
        }
    }

    // 9. Ramo G: Avó Materna, Meias-Tias (filhas da avó materna), Tias-Avós Maternas
    if (letra === "G") {
        if (num === 1) {
            if (b === 0 && c === 0) return "Avó Materna";
            if (b > 0 && c === 0) return isFem ? "Meia-Tia (filha da avó materna)" : "Meio-Tio (filho da avó materna)";
        } else {
            if (b === 0 && c === 0) return isFem ? "Tia-Avó Materna" : "Tio-Avô Materno";
            return isFem ? "Prima Materna" : "Primo Materno";
        }
    }

    // 10. Bisavós (Opção A: Formato Descritivo)
    if (letra === "H" && b === 0) return "Bisavô (pai do avô paterno)";
    if (letra === "I" && b === 0) return "Bisavó (mãe do avô paterno)";
    if (letra === "J" && b === 0) return "Bisavô (pai da avó paterna)";
    if (letra === "K" && b === 0) return "Bisavó (mãe da avó paterna)";
    if (letra === "L" && b === 0) return "Bisavô (pai do avô materno)";
    if (letra === "M" && b === 0) return "Bisavó (mãe do avô materno)";
    if (letra === "N" && b === 0) return "Bisavô (pai da avó materna)";
    if (letra === "O" && b === 0) return "Bisavó (mãe da avó materna)";

    return `Familiar (${a}.${b}.${c})`;
}

/**
 * Validação rigorosa e normalização do campo codA
 * Suporta consanguíneos (A1, B1, C2) e cônjuges múltiplos/canônicos (Z1.A1, Z2.A1, Z1.A2)
 * Também aceita e normaliza formatos legados/rápidos (ZA1, ZA2, Z.A1, Z2A1)
 */
function validarCodigoCodA(codA) {
    if (!codA || typeof codA !== 'string') {
        return { valido: false, mensagem: "Código obrigatório" };
    }
    const limpo = codA.toUpperCase().trim();
    // Regex suporta:
    // 1. Canônico pontuado: Z1.A1, Z2.A1, Z1.B2, Z.A1
    // 2. Rápido / legado sem ponto: ZA1, ZA2, Z1A1, Z2B1
    // 3. Consanguíneo: A1, A2, B1, C1, D2, etc.
    const regex = /^(?:Z([1-9]\d*)?\.?)?([A-O])([1-9]\d*)$/;
    const match = limpo.match(regex);
    if (!match) {
        return { 
            valido: false, 
            mensagem: "Código inválido. Formato esperado: Letra A-O (ex: A1, B1) ou Cônjuge Z[n].Letra+Num (ex: Z1.A1, Z1.A2, Z2.A1)" 
        };
    }

    const isConjuge = limpo.startsWith("Z");
    const indiceConjuge = isConjuge ? (parseInt(match[1], 10) || 1) : 0;
    const temIndiceExplicito = isConjuge && Boolean(match[1]);
    const ramo = match[2];
    const numero = parseInt(match[3], 10);
    const parceiro = `${ramo}${numero}`;
    const codigoCanico = isConjuge ? `Z${indiceConjuge}.${parceiro}` : parceiro;

    return {
        valido: true,
        codigoLimpo: limpo,
        codigoCanico: codigoCanico,
        ramo: ramo,
        numero: numero,
        isConjuge: isConjuge,
        indiceConjuge: indiceConjuge,
        temIndiceExplicito: temIndiceExplicito,
        parceiro: parceiro
    };
}

/**
 * Flexão dinâmica e canônica de gênero do parentesco
 * Utiliza o mapa de pares PARES_GENERO_PARENTESCO para garantir consistência gramatical
 * total e perfeita correspondência com o select de parentescos.
 */
function flexionarGeneroParentesco(parentesco, novoSexo) {
    if (!parentesco) return parentesco;
    const par = PARES_GENERO_PARENTESCO.find(p => p.m === parentesco || p.f === parentesco);
    if (par) {
        if (novoSexo === "F") return par.f;
        if (novoSexo === "M") return par.m;
    }
    return parentesco;
}

window.LISTA_TUMORES_CLINICOS = LISTA_TUMORES_CLINICOS;
window.PALETA_CORES_TUMORES = PALETA_CORES_TUMORES;
window.DICIONARIO_PARENTESCOS = DICIONARIO_PARENTESCOS;
window.PARES_GENERO_PARENTESCO = PARES_GENERO_PARENTESCO;
window.deduzirParentescoPorCodigo = deduzirParentescoPorCodigo;
window.validarCodigoCodA = validarCodigoCodA;
window.flexionarGeneroParentesco = flexionarGeneroParentesco;

