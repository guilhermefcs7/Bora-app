import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog } from './fixtures';
import { applyWikidata, classifyDescription, classifyPt, mergeSources, parseSpots, parseSuggestions, pickPlaces, type WikiPage } from '../src/lib/places';
import { consensusLabel, memberProgress, rankPlaces } from '../src/lib/consensus';
import { distanceKm, travel } from '../src/lib/geo';
import { dayDistanceKm, generateItinerary, itineraryPlaces, optimizeRoute, scheduleDay } from '../src/lib/itinerary';
import { mergeRemote } from '../src/lib/sync';
import { profileOf, matchInterests } from '../src/lib/audience';
import type { Trip } from '../src/types';

const lisboa = catalog[0];
const baseTrip = (): Trip => ({
  id: 't', code: 'ABC234', destination: lisboa.name, lat: lisboa.lat, lng: lisboa.lng, days: 3, pace: 'moderado',
  places: lisboa.places,
  members: [{ id: 'a', name: 'Ana', color: '#000' }, { id: 'b', name: 'Bia', color: '#111' }],
  localMemberIds: ['a'], votes: {}, itinerary: null, checklist: [], updatedAt: 1, shared: false,
});

test('fixtures: ids únicos e coordenadas plausíveis', () => {
  const ids = catalog.flatMap((d) => d.places.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const d of catalog) for (const p of d.places) assert.ok(distanceKm(d, p) < 40, `${p.name} longe demais de ${d.name}`);
});

test('distância: Lisboa a Belém fica perto de 7 km', () => {
  const d = distanceKm(lisboa.places[0], lisboa.places[3]);
  assert.ok(d > 6 && d < 9, String(d));
  assert.equal(travel(0.3).mode, 'a pé');
  assert.equal(travel(5).mode, 'de transporte');
});

test('consenso: ordena por pontos e calcula aprovação', () => {
  const t = baseTrip();
  const [p1, p2, p3] = t.places;
  t.votes = { a: { [p1.id]: 1, [p2.id]: 2, [p3.id]: -1 }, b: { [p1.id]: 1, [p2.id]: 1, [p3.id]: 1 } };
  const r = rankPlaces(t);
  assert.equal(r[0].place.id, p2.id);
  assert.equal(r[0].points, 3);
  assert.equal(r[1].place.id, p1.id);
  assert.equal(r[0].approval, 1);
  const third = r.find((x) => x.place.id === p3.id)!;
  assert.equal(third.points, 0);
  assert.equal(third.approval, 0.5);
  assert.equal(consensusLabel(r[0], 2), 'Todos aprovaram · 1 imperdível');
  assert.deepEqual(memberProgress(t, 'a'), { done: 3, total: t.places.length });
});

test('roteiro: só lugares aprovados, sem repetição, respeitando o ritmo', () => {
  const t = baseTrip();
  t.votes = { a: {}, b: {} };
  t.places.forEach((p, i) => { t.votes.a[p.id] = i < 10 ? 1 : -1; t.votes.b[p.id] = i < 8 ? 2 : -1; });
  const it = generateItinerary(t);
  assert.equal(it.length, 3);
  const flat = it.flat();
  assert.equal(new Set(flat).size, flat.length);
  assert.ok(flat.length <= 12);
  const approved = new Set(t.places.slice(0, 10).map((p) => p.id));
  for (const id of flat) assert.ok(approved.has(id));
  for (const day of it) assert.ok(day.length <= 4);
  // Belém (3 primeiros lugares) deve cair no mesmo dia
  const belem = t.places.slice(0, 3).map((p) => p.id);
  const dayOf = (id: string) => it.findIndex((d) => d.includes(id));
  assert.equal(new Set(belem.map(dayOf)).size, 1);
});

test('roteiro: sem votos positivos não quebra', () => {
  const t = baseTrip();
  t.votes = { a: Object.fromEntries(t.places.map((p) => [p.id, -1 as const])) };
  assert.deepEqual(generateItinerary(t), [[], [], []]);
});

test('rota otimizada nunca é mais longa que a original', () => {
  const stops = [lisboa.places[0], lisboa.places[10], lisboa.places[1], lisboa.places[3], lisboa.places[2]];
  const opt = optimizeRoute(stops);
  assert.equal(opt.length, stops.length);
  assert.ok(dayDistanceKm(opt) <= dayDistanceKm(stops) + 1e-9);
});

test('agenda: horários crescentes começando às 9h', () => {
  const s = scheduleDay(lisboa.places.slice(0, 4));
  assert.equal(s[0].start, 540);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].start >= s[i - 1].end);
  assert.equal(s[s.length - 1].next, undefined);
});

test('itineraryPlaces ignora ids que não existem mais', () => {
  const t = baseTrip();
  t.itinerary = [[t.places[0].id, 'sumiu']];
  assert.equal(itineraryPlaces(t)[0].length, 1);
});

test('merge: votos deste aparelho vencem, os dos outros vêm do servidor', () => {
  const local = baseTrip();
  const p = local.places[0].id;
  local.votes = { a: { [p]: 2 }, b: { [p]: 1 } };
  const remote = { ...baseTrip(), updatedAt: 5, votes: { a: { [p]: -1 as const }, b: { [p]: -1 as const } }, itinerary: [[p]] };
  const m = mergeRemote(local, remote);
  assert.equal(m.votes.a[p], 2);
  assert.equal(m.votes.b[p], -1);
  assert.deepEqual(m.itinerary, [[p]]);
  assert.equal(m.shared, true);
});

test('autocomplete: converte a resposta do Photon e descarta o que não é lugar', () => {
  const s = parseSuggestions([
    { properties: { osm_type: 'R', osm_id: 5400890, osm_key: 'place', osm_value: 'city', type: 'city', name: 'Lisbon', county: 'Lisbon', country: 'Portugal', extent: [-9.2298356, 38.7967584, -9.0863328, 38.6913994] }, geometry: { coordinates: [-9.1365919, 38.7077507] } },
    { properties: { osm_type: 'N', osm_id: 1, osm_key: 'place', osm_value: 'city', type: 'city', name: 'Lisburn', state: 'Northern Ireland', country: 'United Kingdom' }, geometry: { coordinates: [-6.046717, 54.5112856] } },
    { properties: { osm_type: 'N', osm_id: 2, osm_key: 'landuse', osm_value: 'commercial', type: 'locality', name: 'Casa Lisboa', country: 'Brasil' }, geometry: { coordinates: [0, 0] } },
    { properties: { osm_value: 'city', country: 'Sem nome' }, geometry: { coordinates: [0, 0] } },
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].name, s[0].detail, s[0].lat, s[0].lng], ['Lisbon', 'Portugal', 38.7077507, -9.1365919]);
  assert.ok(s[0].radiusKm >= 3 && s[0].radiusKm <= 12);
  assert.equal(s[1].detail, 'Northern Ireland, United Kingdom');
  assert.equal(s[1].radiusKm, 8);
});

test('lugares: classifica pela descrição, mantém o ranking e aplica Wikidata', () => {
  const pg = (pageid: number, index: number, title: string, description?: string, wd?: string): WikiPage => ({
    pageid, index, title, description, coordinates: [{ lat: 48.85 + pageid / 1000, lon: 2.35 }], pageprops: wd ? { wikibase_item: wd } : undefined,
  });
  const picked = pickPlaces([
    pg(4, 4, 'Jardin du Luxembourg', 'Park in Paris, France', 'Q4'),
    pg(1, 1, 'Paris', 'Capital and largest city of France', 'Q90'),
    { ...pg(2, 2, 'Louvre', 'Art museum in Paris, France', 'Q19675'), thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' } },
    pg(3, 3, 'Eiffel Tower', 'Tower in Paris, France', 'Q243'),
    pg(5, 5, 'University of Paris', 'Former university in Paris', 'Q5'),
    pg(6, 6, 'Gare du Nord', 'Railway station in Paris', 'Q6'),
    pg(7, 7, 'Eiffel Tower (replica)', 'Tower somewhere', 'Q243'),
    pg(8, 8, 'Sem descrição'),
    { pageid: 9, index: 9, title: 'Sem coordenada', description: 'Museum in Paris' },
    pg(10, 10, 'Pont Neuf (Paris)', 'Bridge in Paris, France'),
  ]);
  assert.deepEqual(picked.map((p) => p.name), ['Louvre', 'Eiffel Tower', 'Jardin du Luxembourg', 'Pont Neuf']);
  assert.deepEqual(picked.map((p) => p.cat), ['museu', 'monumento', 'natureza', 'monumento']);
  assert.equal(picked[0].id, 'wp-2');
  assert.deepEqual([picked[0].img, picked[0].kind, picked[0].wikiEn], ['https://upload.wikimedia.org/x.jpg', 'Art museum in Paris, France', 'Louvre']);
  assert.equal(classifyDescription('Avenue in Paris, France')?.cat, 'bairro');
  assert.equal(classifyDescription('Opera house in Paris')?.cat, 'noite');
  assert.equal(classifyDescription('French football club'), null);
  const done = applyWikidata(picked, {
    Q243: { labels: { pt: { value: 'Torre Eiffel' } }, descriptions: { pt: { value: 'torre no Champ de Mars em Paris, França' } }, sitelinks: { ptwiki: { title: 'Torre Eiffel' } } },
    Q4: { descriptions: { en: { value: 'park in Paris' } } },
  });
  assert.deepEqual([done[1].name, done[1].desc], ['Torre Eiffel', 'Torre no Champ de Mars em Paris, França.']);
  assert.equal(done[2].desc, 'Park in Paris.');
  assert.equal(done[1].wikiPt, 'Torre Eiffel');
  assert.equal(done[0].desc, 'Museu ou galeria conhecido na região.');
  assert.equal('wikidata' in done[0], false);
});

test('roteiro: espalha as atividades por todos os dias, sem dia vazio', () => {
  const t = { ...baseTrip(), days: 5, perDay: 4 };
  t.votes = { a: Object.fromEntries(t.places.map((p) => [p.id, 1 as const])) }; // 14 lugares aprovados
  const it = generateItinerary(t);
  const sizes = it.map((d) => d.length);
  assert.equal(it.length, 5);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 14);
  assert.ok(Math.min(...sizes) >= 2, `dias: ${sizes}`);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `dias: ${sizes}`);
});

test('roteiro: com menos lugares que dias, os dias livres ficam intercalados', () => {
  const t = { ...baseTrip(), days: 5, perDay: 4 };
  t.votes = { a: Object.fromEntries(t.places.slice(0, 3).map((p) => [p.id, 1 as const])) };
  const sizes = generateItinerary(t).map((d) => d.length);
  assert.deepEqual(sizes, [1, 0, 1, 0, 1]);
});

test('roteiro: respeita mais de 6 atividades por dia', () => {
  const t = { ...baseTrip(), days: 1, perDay: 9 };
  t.votes = { a: Object.fromEntries(t.places.map((p) => [p.id, 1 as const])) };
  assert.equal(generateItinerary(t)[0].length, 9);
});

test('perfil do lugar: interesses, público e frase amigável', () => {
  const museum = profileOf({ cat: 'museu', kind: 'Art museum in Paris, France' });
  assert.deepEqual(museum.interests.slice(0, 2), ['arte', 'historia']);
  assert.ok(museum.pitch.startsWith('Pode encaixar bem se você gosta de arte e história.'));
  assert.ok(museum.audience.includes('Quem gosta de arte') && museum.audience.includes('Dia de chuva'));
  const church = profileOf({ cat: 'monumento', kind: 'Catholic cathedral in Salvador, Brazil' });
  assert.ok(church.audience.includes('Quem busca um momento de calma'));
  assert.deepEqual(matchInterests({ cat: 'natureza', kind: 'Park in Dublin' }, ['familia', 'compras']), ['familia']);
  assert.deepEqual(matchInterests({ cat: 'natureza' }, undefined), []);
  assert.ok(profileOf({ cat: 'comida' }).pitch.includes('comer bem'));
  assert.deepEqual(profileOf({ cat: 'monumento', kind: 'Football stadium in Salvador, Brazil' }).interests, ['esporte']);
});

test('destino pequeno: Wikipédia em português completa a lista, classificando pelo título', () => {
  // títulos e descrições reais do entorno de Mucugê (Chapada Diamantina)
  assert.equal(classifyPt('Cachoeira da Califórnia', "queda d'água localizada no Parque Nacional da Chapada Diamantina")?.cat, 'natureza');
  assert.equal(classifyPt('Cachoeira da Piabinha')?.cat, 'natureza');
  assert.equal(classifyPt('Gruna do Brejo', 'Gruta artificial localizada em Andaraí, Bahia')?.cat, 'natureza');
  assert.equal(classifyPt('Rampa do Caim')?.cat, 'mirante');
  assert.equal(classifyPt('Poço da Madalena')?.cat, 'natureza');
  assert.equal(classifyPt('Rio Mucugê'), null);
  assert.equal(classifyPt('Andaraí', 'município do Estado da Bahia, Brasil'), null);
  assert.equal(classifyPt('Chapada Diamantina', 'região de chapadas localizada na Bahia, Brasil'), null);
  assert.equal(classifyPt('Monte Santo', 'município do estado da Bahia'), null);
  assert.equal(classifyPt('Mar de Espanha (Mucugê)'), null);

  const pg = (pageid: number, index: number, title: string, description?: string, wd?: string): WikiPage => ({
    pageid, index, title, description, coordinates: [{ lat: -13 - pageid / 1000, lon: -41.37 }], pageprops: wd ? { wikibase_item: wd } : undefined,
  });
  const en = [pg(1, 1, 'Mucugê', 'Municipality of Bahia, Brazil', 'Q1'), pg(2, 2, 'Chapada Diamantina National Park', 'National park in Bahia, Brazil', 'Q2')];
  const pt = [
    pg(11, 1, 'Parque Nacional da Chapada Diamantina', 'parque nacional brasileiro', 'Q2'),
    pg(12, 2, 'Cachoeira da Piabinha', undefined, 'Q12'),
    pg(13, 3, 'Rio Mucugê'),
    pg(14, 4, 'Rampa do Caim'),
  ];
  const merged = mergeSources(en, pt, 24);
  assert.deepEqual(merged.map((p) => p.name), ['Chapada Diamantina National Park', 'Cachoeira da Piabinha', 'Rampa do Caim']);
  assert.deepEqual([merged[1].id, merged[1].wikiPt, merged[1].wikiEn], ['wpp-12', 'Cachoeira da Piabinha', undefined]);
  assert.ok(profileOf(merged[1]).audience.includes('Banho de cachoeira'));
});

test('adicionar lugar: converte resultados da busca e sugere a categoria', () => {
  const s = parseSpots([
    { properties: { osm_type: 'N', osm_id: 5, osm_key: 'amenity', osm_value: 'restaurant', name: 'Sabor da Chapada', street: 'Rua Direita', city: 'Mucugê', state: 'Bahia' }, geometry: { coordinates: [-41.37, -13.0] } },
    { properties: { osm_type: 'W', osm_id: 6, osm_key: 'waterway', osm_value: 'waterfall', name: 'Cachoeira do Tiburtino', city: 'Mucugê' }, geometry: { coordinates: [-41.36, -13.01] } },
    { properties: { osm_key: 'amenity' }, geometry: { coordinates: [0, 0] } },
  ]);
  assert.deepEqual(s.map((x) => [x.name, x.cat, x.detail]), [['Sabor da Chapada', 'comida', 'Rua Direita, Mucugê'], ['Cachoeira do Tiburtino', 'natureza', 'Mucugê']]);
  assert.equal(s[0].lat, -13.0);
});
