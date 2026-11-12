import type { Category, Destination, Place } from '../types';

// Dados 100% dinâmicos e gratuitos, sem chave de API:
// - Photon (komoot / OpenStreetMap): autocomplete de destinos enquanto a pessoa digita
// - Wikipédia (busca geográfica): lugares em volta do destino, do mais ao menos conhecido
// - Wikidata: nome e descrição em português de cada lugar

export type Suggestion = {
  key: string;
  name: string;
  /** região e país, para diferenciar homônimos */
  detail: string;
  lat: number;
  lng: number;
  /** raio de busca de atrações, em km */
  radiusKm: number;
};

const request = async (url: string, init: RequestInit | undefined, ms: number, outer?: AbortSignal): Promise<Response> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
};

// ---------- Autocomplete ----------

type PhotonFeature = {
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    /** camada do Photon: city, district, locality, county, state */
    type?: string;
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    /** [minLng, maxLat, maxLng, minLat] */
    extent?: [number, number, number, number];
  };
  geometry: { coordinates: [number, number] };
};

// só lugares e divisões administrativas; fica de fora o que é comércio, prédio etc.
const PLACE_KEYS = new Set(['place', 'boundary']);

const radiusFor = (f: PhotonFeature): number => {
  const e = f.properties.extent;
  if (e) {
    // metade da diagonal da área, limitada para a consulta não ficar pesada
    const kmLat = Math.abs(e[1] - e[3]) * 111;
    const kmLng = Math.abs(e[2] - e[0]) * 111 * Math.cos((f.geometry.coordinates[1] * Math.PI) / 180);
    const half = Math.hypot(kmLat, kmLng) / 2;
    return Math.round(Math.min(12, Math.max(3, half)));
  }
  return f.properties.type === 'city' || f.properties.type === 'state' ? 8 : 5;
};

export const parseSuggestions = (features: PhotonFeature[]): Suggestion[] => {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const f of features) {
    const p = f.properties;
    const coords = f.geometry?.coordinates;
    if (!p?.name || !coords || coords.length < 2) continue;
    if (p.osm_key && !PLACE_KEYS.has(p.osm_key)) continue;
    const detail = [p.city && p.city !== p.name ? p.city : null, p.state && p.state !== p.name ? p.state : null, p.country]
      .filter(Boolean)
      .join(', ');
    const dedupe = `${p.name}|${detail}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      key: `${p.osm_type ?? 'X'}${p.osm_id ?? dedupe}`,
      name: p.name,
      detail,
      lat: coords[1],
      lng: coords[0],
      radiusKm: radiusFor(f),
    });
  }
  return out;
};

/** Sugestões de destino para o texto digitado. Cancele com o signal ao digitar de novo. */
export const suggestDestinations = async (text: string, signal?: AbortSignal): Promise<Suggestion[]> => {
  const q = text.trim();
  if (q.length < 2) return [];
  const res = await request(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&layer=city&layer=district&layer=locality&layer=county&layer=state`,
    { headers: { Accept: 'application/json' } },
    8000,
    signal,
  );
  if (!res.ok) throw new Error('Busca indisponível');
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return parseSuggestions(data.features ?? []).slice(0, 6);
};

// ---------- Lugares do destino ----------

export type WikiPage = {
  pageid: number;
  title: string;
  /** posição no ranking da busca (1 = mais conhecido) */
  index?: number;
  description?: string;
  coordinates?: { lat: number; lon: number }[];
  pageprops?: { wikibase_item?: string };
};

// A descrição curta da Wikipédia em inglês ("Art museum in Paris, France") diz o que o lugar é.
const EXCLUDE =
  /\b(city|capital|commune|town|municipality|arrondissement|region|department|prefecture|province|county|university|school|college|institute|institution|company|organi[sz]ation|agency|republic|empire|kingdom|government|parliament|assembly|senate|ministry|court|club|team|airport|station|railway|metro|tram|hospital|newspaper|magazine|publisher|bank|airline|embassy|library|treaty|battle|siege|war|massacre|attack|festival|award|election|party|union|association|federation|society|academy|laboratory|research|broadcaster|channel|radio|television|film|band|album|corporation|manufacturer|brand|demolished|constituency|diocese|archdiocese|hotel|prison|neighbou?rhood|suburb|circuit|indoor|sports venue|sporting|housing|residential|office|headquarters|shrine of remembrance)\b/i;

const RULES: [Category, RegExp, number][] = [
  ['museu', /\b(museum|art gallery|gallery|planetarium)\b/i, 90],
  ['praia', /\bbeach\b/i, 120],
  ['mirante', /\b(observation|viewpoint|lighthouse|ferris wheel|cable car|hill|mountain|peak|elevator|lift)\b/i, 45],
  ['natureza', /\b(park|garden|gardens|zoo|aquarium|lake|lagoon|island|forest|nature reserve|botanical|woodland)\b/i, 75],
  ['comida', /\b(market|food hall)\b/i, 60],
  ['noite', /\b(theatre|theater|opera|concert hall|cabaret|music venue)\b/i, 120],
  ['compras', /\b(shopping|department store|mall|arcade)\b/i, 60],
  ['bairro', /\b(square|plaza|quarter|district|street|avenue|boulevard|promenade|historic cent(re|er)|old town|waterfront|harbou?r)\b/i, 60],
  [
    'monumento',
    /\b(church|cathedral|basilica|chapel|monastery|abbey|convent|temple|shrine|mosque|synagogue|palace|castle|fort|fortress|monument|memorial|statue|arch|bridge|tower|fountain|ruins|archaeological|obelisk|landmark|tourist attraction|stadium|amphitheatre|cemetery|mausoleum|pagoda|ch[aâ]teau|mansion|historic|heritage|skyscraper|pyramid|gate|aqueduct|tomb)\b/i,
    45,
  ],
];

export const classifyDescription = (description: string): { cat: Category; dur: number } | null => {
  if (EXCLUDE.test(description)) return null;
  for (const [cat, re, dur] of RULES) if (re.test(description)) return { cat, dur };
  return null;
};

const GENERIC: Record<Category, string> = {
  museu: 'Museu ou galeria conhecido na região.',
  praia: 'Praia da região.',
  mirante: 'Ponto com vista panorâmica.',
  natureza: 'Área verde para caminhar e descansar.',
  comida: 'Mercado local com comida e produtos da região.',
  noite: 'Casa de espetáculos.',
  compras: 'Lugar de compras conhecido.',
  bairro: 'Região para explorar a pé.',
  monumento: 'Lugar histórico da região.',
};

export type Candidate = Place & { wikidata?: string };

/** Escolhe os lugares visitáveis mais conhecidos da resposta da Wikipédia, sem repetição. */
export const pickPlaces = (pages: WikiPage[], limit = 24): Candidate[] => {
  const ranked = [...pages].sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
  const seen = new Set<string>();
  const perCat = new Map<Category, number>();
  const out: Candidate[] = [];
  let stadium = false;
  for (const p of ranked) {
    const c = p.coordinates?.[0];
    if (!c || !p.description || /^list of/i.test(p.title)) continue;
    const kind = classifyDescription(p.description);
    if (!kind) continue;
    const name = p.title.replace(/\s*\([^)]*\)$/, ''); // tira desambiguação: "Tower (Paris)"
    const key = p.pageprops?.wikibase_item ?? name.toLowerCase();
    if (seen.has(key) || seen.has(name.toLowerCase())) continue;
    // limita cada categoria a um terço da lista (e estádios a um), para a votação ter variedade
    const used = perCat.get(kind.cat) ?? 0;
    if (used >= Math.ceil(limit / 3)) continue;
    if (/\b(stadium|arena)\b/i.test(p.description)) {
      if (stadium) continue;
      stadium = true;
    }
    perCat.set(kind.cat, used + 1);
    seen.add(key);
    seen.add(name.toLowerCase());
    out.push({
      id: `wp-${p.pageid}`,
      name,
      cat: kind.cat,
      lat: c.lat,
      lng: c.lon,
      dur: kind.dur,
      desc: GENERIC[kind.cat],
      wikidata: p.pageprops?.wikibase_item,
    });
    if (out.length >= limit) break;
  }
  return out;
};

type WdEntity = {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Aplica nome e descrição em português (ou inglês, na falta) vindos do Wikidata. */
export const applyWikidata = (places: Candidate[], entities: Record<string, WdEntity>): Place[] =>
  places.map(({ wikidata, ...p }) => {
    const e = wikidata ? entities[wikidata] : undefined;
    const label = e?.labels?.pt?.value;
    const desc = e?.descriptions?.pt?.value ?? e?.descriptions?.en?.value;
    return {
      ...p,
      name: label ? capitalize(label) : p.name,
      desc: desc ? `${capitalize(desc)}.` : p.desc,
    };
  });

export class PlacesError extends Error {
  constructor(
    public kind: 'rede' | 'vazio',
    message: string,
  ) {
    super(message);
  }
}

const PAGE = 50;

/** Uma página da busca geográfica, ordenada pelos artigos mais citados (os mais conhecidos). */
const searchNear = async (lat: number, lng: number, km: number, offset: number): Promise<WikiPage[]> => {
  const search = encodeURIComponent(`nearcoord:${km}km,${lat},${lng}`);
  const res = await request(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${search}` +
      `&gsrlimit=${PAGE}&gsroffset=${offset}&gsrsort=incoming_links_desc&gsrnamespace=0` +
      `&prop=coordinates|description|pageprops&ppprop=wikibase_item&colimit=${PAGE}`,
    undefined,
    12000,
  );
  if (!res.ok) throw new Error('Wikipédia indisponível');
  const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
  // renumera pelo offset para manter o ranking global entre os lotes
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p, i) => ({ ...p, index: offset + i + 1 }));
};

/** Busca os lugares do destino escolhido no autocomplete. */
export const loadDestination = async (s: Suggestion): Promise<Destination> => {
  let candidates: Candidate[] = [];
  // se a área for pequena e vier pouca coisa, amplia o raio uma vez
  for (const km of [s.radiusKm, Math.min(25, Math.round(s.radiusKm * 2.5))]) {
    let pages: WikiPage[];
    try {
      const batches = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => searchNear(s.lat, s.lng, km, i * PAGE)));
      pages = batches.flat();
    } catch {
      throw new PlacesError('rede', 'Não foi possível buscar os lugares agora. Verifique a internet e tente de novo.');
    }
    candidates = pickPlaces(pages);
    if (candidates.length >= 6) break;
  }
  if (candidates.length < 3)
    throw new PlacesError('vazio', `Encontramos poucos lugares conhecidos em ${s.name}. Tente uma cidade maior por perto.`);

  // descrições em português são um extra: se o Wikidata falhar, seguimos com as genéricas
  let entities: Record<string, WdEntity> = {};
  const ids = candidates.map((c) => c.wikidata).filter((x): x is string => !!x && /^Q\d+$/.test(x));
  if (ids.length) {
    try {
      const res = await request(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(0, 50).join('|')}&props=labels|descriptions&languages=pt|en&format=json&origin=*`,
        undefined,
        10000,
      );
      if (res.ok) entities = ((await res.json()) as { entities?: Record<string, WdEntity> }).entities ?? {};
    } catch {
      // segue sem descrições
    }
  }

  return {
    id: s.key,
    name: s.name,
    country: s.detail,
    lat: s.lat,
    lng: s.lng,
    places: applyWikidata(candidates, entities),
  };
};
