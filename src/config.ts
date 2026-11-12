/** Endereço público da versão web. Usado nos links de convite e como Referer do mapa no app nativo. */
export const APP_URL = 'https://guilhermefcs7.github.io/Bora-app/';

/** Distância máxima, em km, de um lugar até o centro do destino para entrar na lista. */
export const MAX_KM = 50;

// Banco do grupo (Supabase). A chave abaixo é a "publishable": foi feita para ir no código do app,
// e o que ela pode fazer é limitado pelas políticas do banco (supabase/schema.sql).
// As variáveis de ambiente, quando definidas, têm prioridade (útil para apontar para outro projeto).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://nzyythbnrzxvwuxwcpwz.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_qASVEnqCq7jRcAYiVaFsIA_-fEFNA7E';
