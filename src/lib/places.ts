import type { Category, Destination, Place } from '../types';
import { MAX_KM } from '../config';
import { distanceKm } from './geo';

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
  thumbnail?: { source: string; width?: number; height?: number };
};

// A descrição curta da Wikipédia em inglês ("Art museum in Paris, France") diz o que o lugar é.
const EXCLUDE =
  /\b(city|capital|commune|town|municipality|arrondissement|region|department|prefecture|province|county|university|school|college|institute|institution|company|organi[sz]ation|agency|republic|empire|kingdom|government|parliament|assembly|senate|ministry|court|club|team|airport|station|railway|metro|tram|hospital|newspaper|magazine|publisher|bank|airline|embassy|library|treaty|battle|siege|war|massacre|attack|festival|award|election|party|union|association|federation|society|academy|laboratory|research|broadcaster|channel|radio|television|film|band|album|corporation|manufacturer|brand|demolished|constituency|diocese|archdiocese|hotel|prison|neighbou?rhood|suburb|circuit|indoor|sports venue|sporting|housing|residential|office|headquarters|shrine of remembrance)\b/i;

const RULES: [Category, RegExp, number][] = [
  ['museu', /\b(museum|art gallery|gallery|planetarium)\b/i, 90],
  ['praia', /\bbeach\b/i, 120],
  ['mirante', /\b(observation|viewpoint|lighthouse|ferris wheel|cable car|hill|mountain|peak|elevator|lift)\b/i, 45],
  ['natureza', /\b(park|garden|gardens|zoo|aquarium|lake|lagoon|island|forest|nature reserve|botanical|woodland|waterfall|cave|canyon|valley|trail|gorge|spring)\b/i, 90],
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

// Artigos da Wikipédia em português muitas vezes não têm descrição curta,
// então a classificação olha também o título ("Cachoeira da Fumaça", "Morro do Pai Inácio").
const EXCLUDE_PT =
  /(^|\s)(munic[ií]pio|cidade|distrito|aeroporto|aer[óo]dromo|rodovia|esta[çc][ãa]o|escola|col[ée]gio|universidade|faculdade|instituto|empresa|clube|microrregi[ãa]o|mesorregi[ãa]o|regi[ãa]o|bairro|usina|barragem|hospital|emissora|r[áa]dio|jornal|elei[çc][ãa]o|batalha|diocese|arquidiocese|povoado|rio|riacho|c[óo]rrego|curso|bacia|esp[ée]cie|g[êe]nero|fam[íi]lia|minera[çc][ãa]o|garimpo|lista)(\s|$)/i;

const RULES_PT: [Category, RegExp, number][] = [
  ['praia', /(^|\s)praia(\s|$)/i, 120],
  ['museu', /(^|\s)(museu|galeria|pinacoteca|planet[áa]rio)(\s|$)/i, 90],
  ['mirante', /(^|\s)(morro|pico|mirante|miradouro|monte|rampa|farol|elevador)(\s|$)/i, 90],
  [
    'natureza',
    /(^|\s)(cachoeira|cachoeir[ãa]o|queda|po[çc]o|gruta|gruna|caverna|lapa|parque|vale|c[âa]nion|canyon|trilha|lagoa|lago|serra|reserva|jardim|ilha|floresta|mata)(\s|$)/i,
    150,
  ],
  ['comida', /(^|\s)(mercado|feira)(\s|$)/i, 60],
  ['noite', /(^|\s)(teatro|[óo]pera)(\s|$)/i, 120],
  ['compras', /(^|\s)(shopping)(\s|$)/i, 60],
  ['bairro', /(^|\s)(pra[çc]a|largo|centro hist[óo]rico|cal[çc]ad[ãa]o|orla|vila)(\s|$)/i, 60],
  [
    'monumento',
    /(^|\s)(igreja|catedral|bas[íi]lica|capela|mosteiro|convento|santu[áa]rio|forte|fortaleza|castelo|pal[áa]cio|pa[çc]o|monumento|memorial|ponte|cemit[ée]rio|ru[íi]nas?|s[íi]tio|solar|sobrado|est[áa]dio|arena)(\s|$)/i,
    45,
  ],
];

// descrição que deixa claro que o artigo é sobre uma localidade ou organização, não um passeio
const HARD_PT = /(^|\s)(munic[ií]pio|cidade|distrito|bairro|povoado|aeroporto|empresa|clube|esta[çc][ãa]o)(\s|$)/i;

const words = (t: string) => ` ${t.replace(/[.,;:()]/g, ' ')} `;

/** Classifica um artigo em português pelo título e pela descrição. */
export const classifyPt = (title: string, description?: string): { cat: Category; dur: number } | null => {
  const clean = title.replace(/\s*\([^)]*\)$/, '');
  // a exclusão olha a descrição inteira; no título, só a primeira palavra ("Rio Mucugê", "Aeroporto de...")
  const firstWord = clean.split(/\s+/)[0] ?? '';
  if (EXCLUDE_PT.test(` ${firstWord} `)) return null;
  if (description && HARD_PT.test(words(description))) return null;
  // o título manda: "Cachoeira da Califórnia" é cachoeira mesmo que a descrição cite um parque ou região
  for (const [cat, re, dur] of RULES_PT) if (re.test(words(clean))) return { cat, dur };
  if (!description || EXCLUDE_PT.test(words(description))) return null;
  for (const [cat, re, dur] of RULES_PT) if (re.test(words(description))) return { cat, dur };
  return null;
};

export type Candidate = Place & { wikidata?: string };

/** Escolhe os lugares visitáveis mais conhecidos da resposta da Wikipédia, sem repetição. */
export const pickPlaces = (pages: WikiPage[], limit = 24, lang: 'en' | 'pt' = 'en', skip?: Set<string>): Candidate[] => {
  const ranked = [...pages].sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
  const seen = new Set<string>(skip);
  const perCat = new Map<Category, number>();
  const out: Candidate[] = [];
  let stadium = false;
  for (const p of ranked) {
    const c = p.coordinates?.[0];
    if (!c || /^list[ae]? (of|de)/i.test(p.title)) continue;
    const kind = lang === 'en' ? (p.description ? classifyDescription(p.description) : null) : classifyPt(p.title, p.description);
    if (!kind) continue;
    const name = p.title.replace(/\s*\([^)]*\)$/, ''); // tira desambiguação: "Tower (Paris)"
    const key = p.pageprops?.wikibase_item ?? name.toLowerCase();
    if (seen.has(key) || seen.has(name.toLowerCase())) continue;
    // limita cada categoria (e estádios a um), para a votação ter variedade.
    // Natureza fica fora do limite: em destino de ecoturismo ela é quase tudo.
    const used = perCat.get(kind.cat) ?? 0;
    if (kind.cat !== 'natureza' && used >= Math.ceil(limit / 3)) continue;
    if (/(^|\s)(stadium|arena|est[áa]dio)(\s|$)/i.test(words(`${p.title} ${p.description ?? ''}`))) {
      if (stadium) continue;
      stadium = true;
    }
    perCat.set(kind.cat, used + 1);
    seen.add(key);
    seen.add(name.toLowerCase());
    out.push({
      id: `${lang === 'pt' ? 'wpp' : 'wp'}-${p.pageid}`,
      name,
      cat: kind.cat,
      lat: c.lat,
      lng: c.lon,
      dur: kind.dur,
      desc: GENERIC[kind.cat],
      kind: lang === 'en' ? p.description : `${p.title} ${p.description ?? ''}`.trim(),
      img: p.thumbnail?.source,
      ...(lang === 'en' ? { wikiEn: p.title } : { wikiPt: p.title }),
      wikidata: p.pageprops?.wikibase_item,
    });
    if (out.length >= limit) break;
  }
  return out;
};

/** Junta as duas fontes: primeiro os da Wikipédia em inglês (melhor ranking), depois os só em português. */
export const mergeSources = (en: WikiPage[], pt: WikiPage[], limit: number): Candidate[] => {
  const first = pickPlaces(en, limit, 'en');
  if (first.length >= limit) return first;
  const taken = new Set<string>();
  for (const c of first) {
    if (c.wikidata) taken.add(c.wikidata);
    taken.add(c.name.toLowerCase());
  }
  return [...first, ...pickPlaces(pt, limit - first.length, 'pt', taken)];
};

type WdEntity = {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
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
      wikiPt: e?.sitelinks?.ptwiki?.title ?? p.wikiPt,
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
const searchNear = async (lang: 'en' | 'pt', lat: number, lng: number, km: number, offset: number): Promise<WikiPage[]> => {
  const search = encodeURIComponent(`nearcoord:${km}km,${lat},${lng}`);
  const res = await request(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${search}` +
      `&gsrlimit=${PAGE}&gsroffset=${offset}&gsrsort=incoming_links_desc&gsrnamespace=0` +
      `&prop=coordinates|description|pageprops|pageimages&ppprop=wikibase_item&colimit=${PAGE}` +
      `&piprop=thumbnail&pithumbsize=640&pilimit=${PAGE}`,
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

// ---------- Centro, textos e fotos ----------

const plain = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*\([^)]*\)$/, '')
    .split(',')[0]
    .trim();

/**
 * O autocomplete devolve o centro geométrico do município, que pode ficar longe da cidade.
 * O artigo da Wikipédia sobre o próprio destino aponta para a sede: quando existe, ele vira o centro.
 */
export const findCenter = (name: string, pages: WikiPage[], fallback: { lat: number; lng: number }) => {
  const target = plain(name);
  const hit = pages.find((p) => p.coordinates?.[0] && plain(p.title) === target);
  const c = hit?.coordinates?.[0];
  return c ? { lat: c.lat, lng: c.lon } : fallback;
};

type ExtractPage = { title: string; extract?: string };

/** Resumo curto de vários artigos de uma vez (a API aceita 20 por chamada). */
const loadExtracts = async (lang: 'pt' | 'en', titles: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < titles.length; i += 20) chunks.push(titles.slice(i, i + 20));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await request(
          `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&exsentences=3&exlimit=20&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`,
          undefined,
          12000,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          query?: {
            pages?: Record<string, ExtractPage>;
            normalized?: { from: string; to: string }[];
            redirects?: { from: string; to: string }[];
          };
        };
        const byTitle = new Map<string, string>();
        for (const p of Object.values(data.query?.pages ?? {})) if (p.extract) byTitle.set(p.title, p.extract.trim());
        // o título pedido pode ter sido normalizado ou redirecionado
        const alias = new Map<string, string>();
        for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
        const redirect = new Map<string, string>();
        for (const r of data.query?.redirects ?? []) redirect.set(r.from, r.to);
        for (const asked of chunk) {
          const step = alias.get(asked) ?? asked;
          const text = byTitle.get(redirect.get(step) ?? step);
          if (text && text.length > 40) out.set(asked, text);
        }
      } catch {
        // sem resumo para este lote
      }
    }),
  );
  return out;
};

type CommonsPage = { title?: string; index?: number; imageinfo?: { thumburl?: string; url?: string; mime?: string }[] };

const firstPhoto = (pages: Record<string, CommonsPage> | undefined): string | undefined => {
  const list = Object.values(pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of list) {
    const info = p.imageinfo?.[0];
    // só fotos: fica de fora mapa, brasão e ícone (svg, png)
    if (info?.thumburl && info.mime === 'image/jpeg') return info.thumburl;
  }
  return undefined;
};

/**
 * Segunda e terceira fontes de foto, no Wikimedia Commons:
 * primeiro arquivos cujo texto cita o nome do lugar, depois fotos tiradas a até 1 km dele.
 */
export const findPhoto = async (name: string, lat: number, lng: number): Promise<string | undefined> => {
  const base = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|mime&iiurlwidth=640';
  const clean = name.replace(/\s*\([^)]*\)$/, '').replace(/"/g, '');
  try {
    const res = await request(
      `${base}&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(`"${clean}" filetype:bitmap`)}`,
      undefined,
      10000,
    );
    if (res.ok) {
      const hit = firstPhoto(((await res.json()) as { query?: { pages?: Record<string, CommonsPage> } }).query?.pages);
      if (hit) return hit;
    }
  } catch {
    // tenta a busca por proximidade
  }
  try {
    const res = await request(`${base}&generator=geosearch&ggsnamespace=6&ggslimit=8&ggsradius=1000&ggscoord=${lat}|${lng}`, undefined, 10000);
    if (res.ok) return firstPhoto(((await res.json()) as { query?: { pages?: Record<string, CommonsPage> } }).query?.pages);
  } catch {
    // sem foto
  }
  return undefined;
};

/** Completa texto e foto dos lugares já escolhidos. Tudo aqui é opcional: falha vira ausência. */
const enrich = async (places: Place[]): Promise<Place[]> => {
  const ptTitles = places.filter((p) => p.wikiPt).map((p) => p.wikiPt!);
  const enTitles = places.filter((p) => !p.wikiPt && p.wikiEn).map((p) => p.wikiEn!);
  const noPhoto = places.filter((p) => !p.img).slice(0, 40);
  const [pt, en, photos] = await Promise.all([
    loadExtracts('pt', ptTitles),
    loadExtracts('en', enTitles),
    Promise.all(noPhoto.map((p) => findPhoto(p.name, p.lat, p.lng))),
  ]);
  const photoOf = new Map(noPhoto.map((p, i) => [p.id, photos[i]]));
  return places.map((p) => ({
    ...p,
    more: (p.wikiPt ? pt.get(p.wikiPt) : p.wikiEn ? en.get(p.wikiEn) : undefined) ?? p.more,
    img: p.img ?? photoOf.get(p.id),
  }));
};

/**
 * Busca os lugares do destino escolhido no autocomplete.
 * `wanted` = quantos lugares a viagem precisa (dias × atividades por dia).
 */
export const loadDestination = async (s: Suggestion, wanted = 16): Promise<Destination> => {
  // margem para a votação recusar parte dos lugares
  const limit = Math.min(80, Math.max(24, Math.ceil(wanted * 1.4)));
  const batchCount = limit > 40 ? 10 : 6;
  let candidates: Candidate[] = [];
  let usedKm = s.radiusKm;
  let center = { lat: s.lat, lng: s.lng };
  // Amplia o raio aos poucos. O último passo (MAX_KM) só entra quando o destino é pequeno e quase
  // nada apareceu: é o caso de bases de ecoturismo, onde as atrações ficam nos arredores.
  const steps = [s.radiusKm, Math.min(25, Math.round(s.radiusKm * 2.5)), MAX_KM];
  for (let i = 0; i < steps.length; i++) {
    const km = steps[i];
    let en: WikiPage[];
    let pt: WikiPage[] = [];
    try {
      const [enBatches, ptBatches] = await Promise.all([
        Promise.all(Array.from({ length: batchCount }, (_, b) => searchNear('en', s.lat, s.lng, km, b * PAGE))),
        // a Wikipédia em português é complemento: se falhar, seguimos só com a em inglês
        Promise.all(Array.from({ length: 4 }, (_, b) => searchNear('pt', s.lat, s.lng, km, b * PAGE))).catch(
          () => [] as WikiPage[][],
        ),
      ]);
      en = enBatches.flat();
      pt = ptBatches.flat();
    } catch {
      throw new PlacesError('rede', 'Não foi possível buscar os lugares agora. Verifique a internet e tente de novo.');
    }
    center = findCenter(s.name, [...en, ...pt], { lat: s.lat, lng: s.lng });
    candidates = mergeSources(en, pt, limit);
    usedKm = km;
    const enough = i < 1 ? Math.min(limit, wanted) : 8;
    if (candidates.length >= enough) break;
  }

  // descrições em português são um extra: se o Wikidata falhar, seguimos com as genéricas
  const entities: Record<string, WdEntity> = {};
  const ids = candidates.map((c) => c.wikidata).filter((x): x is string => !!x && /^Q\d+$/.test(x));
  // o Wikidata aceita 50 ids por chamada
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await request(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&props=labels|descriptions|sitelinks&sitefilter=ptwiki&languages=pt|en&format=json&origin=*`,
          undefined,
          10000,
        );
        if (res.ok) Object.assign(entities, ((await res.json()) as { entities?: Record<string, WdEntity> }).entities ?? {});
      } catch {
        // segue sem descrições
      }
    }),
  );

  // do mais perto do centro para o mais longe; fora do limite viável, não entra
  const placed = applyWikidata(candidates, entities)
    .map((p) => ({ p, km: distanceKm(center, p) }))
    .filter((x) => x.km <= MAX_KM)
    .sort((a, b) => a.km - b.km)
    .map(({ p, km }) => (km >= 2 ? { ...p, far: Math.round(km) } : p));

  return {
    id: s.key,
    name: s.name,
    country: s.detail,
    lat: center.lat,
    lng: center.lng,
    radiusKm: usedKm,
    places: await enrich(placed),
  };
};

// ---------- Adicionar lugar por busca ----------

export type SpotSuggestion = { key: string; name: string; detail: string; lat: number; lng: number; cat: Category };

const spotCategory = (key?: string, value?: string): Category => {
  if (key === 'tourism' && (value === 'museum' || value === 'gallery')) return 'museu';
  if (key === 'tourism' && value === 'viewpoint') return 'mirante';
  if (key === 'natural' && value === 'beach') return 'praia';
  if (key === 'natural' && value === 'peak') return 'mirante';
  if (key === 'natural' || key === 'waterway' || key === 'leisure') return 'natureza';
  if (key === 'amenity' && /^(restaurant|cafe|fast_food|food_court|ice_cream|marketplace)$/.test(value ?? '')) return 'comida';
  if (key === 'amenity' && /^(bar|pub|nightclub|theatre|cinema)$/.test(value ?? '')) return 'noite';
  if (key === 'shop') return 'compras';
  if (key === 'place') return 'bairro';
  return 'monumento';
};

type PhotonSpot = { properties: PhotonFeature['properties'] & { street?: string; district?: string }; geometry: PhotonFeature['geometry'] };

export const parseSpots = (features: PhotonSpot[]): SpotSuggestion[] => {
  const seen = new Set<string>();
  const out: SpotSuggestion[] = [];
  for (const f of features) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p?.name || !c || c.length < 2) continue;
    const detail = [p.street, p.district, p.city, p.state]
      .filter((x) => x && x !== p.name)
      .slice(0, 2)
      .join(', ');
    const dedupe = `${p.name}|${detail}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ key: `${p.osm_type ?? 'X'}${p.osm_id ?? dedupe}`, name: p.name, detail, lat: c[1], lng: c[0], cat: spotCategory(p.osm_key, p.osm_value) });
  }
  return out;
};

/** Busca qualquer lugar pelo nome (restaurante, cachoeira, pousada...), priorizando o entorno do destino. */
export const suggestSpots = async (text: string, lat: number, lng: number, signal?: AbortSignal): Promise<SpotSuggestion[]> => {
  const q = text.trim();
  if (q.length < 3) return [];
  const res = await request(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=${lat}&lon=${lng}`,
    { headers: { Accept: 'application/json' } },
    8000,
    signal,
  );
  if (!res.ok) throw new Error('Busca indisponível');
  const data = (await res.json()) as { features?: PhotonSpot[] };
  return parseSpots(data.features ?? []).slice(0, 6);
};


/** Texto do "ler mais": resumo do artigo da Wikipédia, em português quando existe. */
export const loadMore = async (place: Pick<Place, 'wikiPt' | 'wikiEn'>): Promise<{ text: string; url: string } | null> => {
  for (const [lang, title] of [
    ['pt', place.wikiPt],
    ['en', place.wikiEn],
  ] as const) {
    if (!title) continue;
    try {
      const res = await request(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        { headers: { Accept: 'application/json' } },
        10000,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
      if (data.extract && data.extract.length > 40)
        return { text: data.extract, url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
    } catch {
      // tenta o próximo idioma
    }
  }
  return null;
};

export const wikiUrl = (place: Pick<Place, 'wikiPt' | 'wikiEn'>): string | null =>
  place.wikiPt
    ? `https://pt.wikipedia.org/wiki/${encodeURIComponent(place.wikiPt.replace(/ /g, '_'))}`
    : place.wikiEn
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(place.wikiEn.replace(/ /g, '_'))}`
      : null;
