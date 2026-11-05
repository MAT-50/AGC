/**
 * 📋 AGC Analytics — Validador de Registros HC (Produção / GitHub Pages)
 * Versão Pública / LGPD Compliant — Nenhuma base de pacientes reais é exportada.
 */
(function(window) {
    'use strict';

    window.REGISTROS_HC_REDCAP = {};

    window.RegistroHcValidator = {
        /**
         * Normaliza o valor digitado do HC removendo pontuações e convertendo para maiúsculas
         */
        normalizar: function(valor) {
            if (!valor) return '';
            return String(valor).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
        },

        /**
         * Em ambiente de produção pública (GitHub Pages / Offline), a busca local retorna null
         * para garantir a segurança dos dados e evitar exposição de registros hospitalares.
         */
        buscar: function(hc) {
            return null;
        }
    };
})(typeof window !== 'undefined' ? window : this);