import type { Category, Place } from '../types';

// Perfil do lugar por regras: categoria + palavras da descrição curta do artigo.
// Sem IA e sem custo. Serve para dizer "para quem é" e casar com os interesses do perfil.

export type Interest =
  | 'arte'
  | 'historia'
  | 'arquitetura'
  | 'natureza'
  | 'gastronomia'
  | 'fotografia'
  | 'noite'
  | 'compras'
  | 'praia'
  | 'familia'
  | 'esporte';

export const interestInfo: Record<Interest, { label: string; likes: string; audience: string }> = {
  arte: { label: 'Arte', likes: 'arte', audience: 'Quem gosta de arte' },
  historia: { label: 'História', likes: 'história', audience: 'Fãs de história' },
  arquitetura: { label: 'Arquitetura', likes: 'arquitetura', audience: 'Quem repara em arquitetura' },
  natureza: { label: 'Natureza', likes: 'ar livre e natureza', audience: 'Quem gosta de ar livre' },
  gastronomia: { label: 'Gastronomia', likes: 'comer bem', audience: 'Quem viaja para comer' },
  fotografia: { label: 'Fotografia', likes: 'fotografar', audience: 'Quem gosta de fotografar' },
  noite: { label: 'Vida noturna', likes: 'programas à noite', audience: 'Quem curte sair à noite' },
  compras: { label: 'Compras', likes: 'compras', audience: 'Quem gosta de compras' },
  praia: { label: 'Praia', likes: 'sol e mar', audience: 'Quem quer sol e mar' },
  familia: { label: 'Família', likes: 'passeios em família', audience: 'Famílias com crianças' },
  esporte: { label: 'Esporte', likes: 'esporte e grandes eventos', audience: 'Fãs de esporte' },
};

export const allInterests = Object.keys(interestInfo) as Interest[];

const BASE: Record<Category, { interests: Interest[]; note: string; extra: string[] }> = {
  museu: {
    interests: ['arte', 'historia'],
    note: 'É passeio em lugar fechado, bom também para dia de chuva. Vale ir sem pressa.',
    extra: ['Dia de chuva'],
  },
  monumento: {
    interests: ['historia', 'arquitetura'],
    note: 'Costuma ser uma visita rápida, fácil de combinar com outros pontos por perto.',
    extra: ['Primeira vez na cidade'],
  },
  natureza: {
    interests: ['natureza', 'familia'],
    note: 'É ao ar livre, bom para desacelerar entre um passeio e outro.',
    extra: ['Descanso no meio do dia'],
  },
  comida: {
    interests: ['gastronomia'],
    note: 'Bom para provar comida local e sentir o dia a dia da cidade. Vá com fome.',
    extra: ['Grupos'],
  },
  mirante: {
    interests: ['fotografia'],
    note: 'Vale mais com céu limpo, principalmente no fim da tarde.',
    extra: ['Casais', 'Pôr do sol'],
  },
  bairro: {
    interests: ['fotografia'],
    note: 'É lugar para caminhar sem roteiro, parar onde der vontade e observar o movimento.',
    extra: ['Quem gosta de andar a pé'],
  },
  compras: {
    interests: ['compras'],
    note: 'Dá para encaixar em qualquer horário e funciona bem em dia de tempo ruim.',
    extra: ['Lembrancinhas'],
  },
  noite: {
    interests: ['noite', 'arte'],
    note: 'Rende mais à noite. Confira a programação e garanta ingresso antes.',
    extra: ['Casais', 'Grupos de amigos'],
  },
  praia: {
    interests: ['praia', 'natureza'],
    note: 'Depende do tempo: deixe para um dia de sol e leve protetor.',
    extra: ['Dia de sol'],
  },
};

// palavras da descrição em inglês -> interesses e públicos extras
const HINTS: [RegExp, Interest[], string[]][] = [
  [/\b(art|gallery|sculpture|painting)\b/i, ['arte'], []],
  [/\b(history|historic|historical|archaeolog|heritage|memorial|ancient|medieval|colonial)\b/i, ['historia'], []],
  [/\b(science|natural history|planetarium|technology|maritime)\b/i, ['familia'], ['Curiosos de todas as idades']],
  [/\b(church|cathedral|basilica|chapel|temple|mosque|synagogue|monastery|abbey|shrine|convent)\b/i, ['arquitetura', 'historia'], ['Quem busca um momento de calma']],
  [/\b(palace|castle|fort|fortress|ch[aâ]teau|mansion)\b/i, ['historia', 'arquitetura', 'familia'], []],
  [/\b(tower|skyscraper|observation|viewpoint|hill|lighthouse|ferris wheel|elevator)\b/i, ['fotografia'], ['Pôr do sol']],
  [/\b(park|garden|gardens|botanical|forest|lake)\b/i, ['natureza', 'familia'], ['Piquenique']],
  [/\b(zoo|aquarium|theme park|amusement)\b/i, ['familia'], ['Crianças']],
  [/\bbeach\b/i, ['praia'], []],
  [/\b(market|food)\b/i, ['gastronomia', 'compras'], []],
  [/\b(theatre|theater|opera|concert|cabaret)\b/i, ['noite', 'arte'], []],
  [/\b(square|plaza|street|avenue|boulevard|quarter|district|old town|historic cent(re|er)|promenade)\b/i, ['fotografia'], []],
  [/\b(shopping|mall|department store|arcade)\b/i, ['compras'], []],
  [/\b(bridge|arch|monument|statue|fountain|obelisk)\b/i, ['fotografia', 'arquitetura'], []],
];

export type PlaceProfile = {
  interests: Interest[];
  /** frase no tom "pode encaixar bem se você gosta de..." */
  pitch: string;
  /** para quem o lugar é mais recomendado */
  audience: string[];
};

const joinPt = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

const STADIUM = /\b(stadium|arena)\b/i;

export const profileOf = (place: Pick<Place, 'cat' | 'kind'>): PlaceProfile => {
  // estádio cai na categoria "monumento", mas o perfil é outro
  if (place.kind && STADIUM.test(place.kind)) {
    return {
      interests: ['esporte'],
      pitch: 'Pode encaixar bem se você gosta de esporte e grandes eventos. Confira antes se há jogo, show ou visita guiada no dia.',
      audience: ['Fãs de esporte', 'Grupos de amigos'],
    };
  }
  const base = BASE[place.cat];
  const hinted: Interest[] = [];
  const extra: string[] = [];
  for (const [re, ints, tags] of HINTS) {
    if (place.kind && re.test(place.kind)) {
      hinted.push(...ints);
      extra.push(...tags);
    }
  }
  // o que a descrição diz vem antes do padrão da categoria
  const interests = Array.from(new Set([...hinted, ...base.interests])).slice(0, 3);
  const audience = Array.from(new Set([...interests.map((i) => interestInfo[i].audience), ...extra, ...base.extra])).slice(0, 5);
  return {
    interests,
    pitch: `Pode encaixar bem se você gosta de ${joinPt(interests.map((i) => interestInfo[i].likes))}. ${base.note}`,
    audience,
  };
};

/** Interesses do perfil que este lugar atende. */
export const matchInterests = (place: Pick<Place, 'cat' | 'kind'>, mine: string[] | undefined): Interest[] =>
  profileOf(place).interests.filter((i) => (mine ?? []).includes(i));
