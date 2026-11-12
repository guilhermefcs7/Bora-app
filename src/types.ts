export type Category =
  | 'monumento'
  | 'museu'
  | 'natureza'
  | 'comida'
  | 'mirante'
  | 'bairro'
  | 'compras'
  | 'noite'
  | 'praia';

export type Place = {
  id: string;
  name: string;
  cat: Category;
  lat: number;
  lng: number;
  /** duração estimada da visita, em minutos */
  dur: number;
  /** 0 = grátis, 1 a 3 = faixa de preço; ausente quando não se sabe */
  price?: 0 | 1 | 2 | 3;
  area?: string;
  desc: string;
  custom?: boolean;
  /** foto do lugar (miniatura da Wikipédia) */
  img?: string;
  /** descrição curta original, em inglês; usada só para deduzir o perfil do lugar */
  kind?: string;
  /** títulos dos artigos na Wikipédia, para o "ler mais" */
  wikiPt?: string;
  wikiEn?: string;
  /** texto do "ler mais", guardado depois da primeira leitura para abrir offline */
  more?: string;
};

export type Destination = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  places: Place[];
};

export type Pace = 'leve' | 'moderado' | 'intenso';

/** -1 = passo, 1 = bora, 2 = imperdível */
export type VoteValue = -1 | 1 | 2;

export type Member = { id: string; name: string; color: string };

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Trip = {
  id: string;
  /** código de convite de 6 caracteres */
  code: string;
  destination: string;
  lat: number;
  lng: number;
  days: number;
  pace: Pace;
  /** atividades por dia; viagens antigas só têm `pace` */
  perDay?: number;
  places: Place[];
  members: Member[];
  /** ids dos membros criados neste aparelho */
  localMemberIds: string[];
  /** votes[memberId][placeId] */
  votes: Record<string, Record<string, VoteValue>>;
  /** ids dos lugares por dia; null enquanto não gerado */
  itinerary: string[][] | null;
  checklist: ChecklistItem[];
  updatedAt: number;
  /** true quando a viagem já foi enviada ao Supabase */
  shared: boolean;
};

export type Profile = { id: string; name: string; color: string; interests?: string[] };

export type SavedPlace = Place & { destination: string };
