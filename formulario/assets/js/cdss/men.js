/**
 * 🧠 AGC Analytics — Módulo CDSS: Síndromes de Neoplasias Endócrinas Múltiplas (MEN)
 * Diretrizes para Rastreio de Genes de Predisposição Endócrina:
 * - NEM 1 (MEN1): Hiperparatireoidismo primário / adenomas de paratireoide aos < 30 anos, tumores neuroendócrinos enteropancreáticos, adenomas hipofisários.
 * - NEM 2 (RET): Carcinoma Medular de Tireoide (CMT) em qualquer idade, Feocromocitoma bilateral/unilateral, Hiperparatireoidismo (NEM 2A).
 */

(function(window) {
    'use strict';

    if (!window.CdssEngine) return;

    window.CdssEngine.registerModule('men', function(context) {
        const { tumoresProbando } = context;
        const criterios = [];
        let indicacao = false;

        // 1. Carcinoma Medular de Tireoide (CMT) em qualquer idade (Código 3 no tireoide_tipo ou texto medular)
        const tireoideTipoEl = document.querySelector('[data-redcap-field="tireoide_tipo"]');
        const isMedular = (tireoideTipoEl && tireoideTipoEl.value === '3') || 
            tumoresProbando.some(t => {
                const normNome = window.CdssEngine.norm(t.tipo);
                return normNome.includes("medular") && (normNome.includes("tireoide") || String(t.tipo) === "36");
            });

        if (isMedular) {
            indicacao = true;
            criterios.push({
                codigo: "nccn_men_medular_tireoide",
                sindrome: "NEM 2 (Síndrome de Neoplasia Endócrina Múltipla tipo 2)",
                descricao: "Carcinoma Medular de Tireoide (CMT) em qualquer idade",
                justificativa: "Indicação mandatória de sequenciamento germinativo do gene RET (NCCN v3.2026)."
            });
        }

        // 2. Feocromocitoma ou Paraganglioma (adrenal_tipo == '2' ou tumor '43')
        const adrenalTipoEl = document.querySelector('[data-redcap-field="adrenal_tipo"]');
        const temPheo = (adrenalTipoEl && adrenalTipoEl.value === '2') ||
            tumoresProbando.some(t => {
                const normNome = window.CdssEngine.norm(t.tipo);
                return normNome.includes("feocromocitoma") || normNome.includes("paraganglioma") || String(t.tipo) === "43";
            });

        if (temPheo) {
            indicacao = true;
            criterios.push({
                codigo: "nccn_men_pheo_paraganglioma",
                sindrome: "Predisposição a Feocromocitoma / Paraganglioma",
                descricao: "Diagnóstico de Feocromocitoma ou Paraganglioma",
                justificativa: "Indicação de testagem germinativa para genes RET, VHL, SDHB, SDHD, SDHC, SDHA, MAX, TMEM127."
            });
        }

        return { indicacao, criterios };
    });

})(window);
