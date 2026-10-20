/**
 * 🧠 AGC Analytics — Módulo CDSS: Câncer Renal Hereditário
 * Diretrizes NCCN v3.2026 para Rastreio de Genes de Predisposição ao Câncer Renal:
 * VHL (Von Hippel-Lindau), FH (HLRCC), FLCN (Birt-Hogg-Dubé), BAP1, MET (HPRC), PTEN
 */

(function(window) {
    'use strict';

    if (!window.CdssEngine) return;

    window.CdssEngine.registerModule('renal', function(context) {
        const { tumoresProbando, histFam } = context;
        const criterios = [];
        let indicacao = false;

        // Verifica tumores renais do probando
        const tumoresRenais = tumoresProbando.filter(t => {
            const normNome = window.CdssEngine.norm(t.tipo);
            return normNome.includes("rim") || normNome.includes("renal") || String(t.tipo) === "31";
        });

        // 1. Diagnóstico de Câncer Renal em idade precoce (<= 46 anos)
        const menorIdadeRenal = tumoresRenais.reduce((min, t) => {
            const id = parseInt(t.idadeDx, 10);
            return (!isNaN(id) && id > 0) ? Math.min(min, id) : min;
        }, 999);

        if (menorIdadeRenal <= 46) {
            indicacao = true;
            criterios.push({
                codigo: "nccn_renal_precoce",
                sindrome: "Câncer Renal Hereditário",
                descricao: `Câncer Renal diagnosticado aos ≤ 46 anos (aos ${menorIdadeRenal} anos)`,
                justificativa: "Diretriz NCCN para rastreio de síndromes hereditárias renais (VHL, FH, FLCN, BAP1)."
            });
        }

        // 2. Câncer renal multifocal ou bilateral sincrônico/metacrônico
        const rccMultiploEl = document.querySelector('[data-redcap-field="rcc_multiplo"]');
        const isMultiplo = (rccMultiploEl && rccMultiploEl.value === '1') || tumoresRenais.length >= 2;
        if (isMultiplo) {
            indicacao = true;
            criterios.push({
                codigo: "nccn_renal_multifocal",
                sindrome: "Câncer Renal Hereditário",
                descricao: "Carcinoma de células renais multifocal ou bilateral",
                justificativa: "Forte suspeita de predisposição germinativa (VHL, BHD, HLRCC)."
            });
        }

        // 3. História familiar de câncer renal em parente de 1º ou 2º grau
        if (histFam && histFam.renal_parentes_d1_d2 && histFam.renal_parentes_d1_d2.length > 0) {
            indicacao = true;
            criterios.push({
                codigo: "nccn_renal_familiar",
                sindrome: "Câncer Renal Hereditário",
                descricao: `História familiar de neoplasia renal em ${histFam.renal_parentes_d1_d2.length} parente(s) de 1º ou 2º grau`,
                justificativa: "Agregação familiar positiva de neoplasia renal."
            });
        }

        return { indicacao, criterios };
    });

})(window);
