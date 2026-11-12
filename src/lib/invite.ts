import { APP_URL } from '../config';

/** Link que abre o app já na tela de entrar, com o código preenchido. */
export const inviteLink = (code: string) => `${APP_URL}#${code}`;

/**
 * Tira o código de convite de qualquer texto colado: um link, a mensagem de convite inteira ou o código puro.
 * Os códigos usam só letras maiúsculas e dígitos sem 0, 1, I e O.
 */
export const extractCode = (text: string): string => {
  const fromLink = text.match(/#([A-Za-z0-9]{6})(?![A-Za-z0-9])/);
  if (fromLink) return fromLink[1].toUpperCase();
  const token = text.match(/(?:^|[^A-Za-z0-9])([A-HJ-NP-Z2-9]{6})(?![A-Za-z0-9])/);
  if (token) return token[1];
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
};
