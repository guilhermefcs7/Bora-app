import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog } from './fixtures';
import { applyWikidata, classifyDescription, parseSuggestions, pickPlaces, type WikiPage } from '../src/lib/places';
import { consensusLabel, memberProgress, rankPlaces } from '../src/lib/consensus';
import { distanceKm, travel } from '../src/lib/geo';
import { dayDistanceKm, generateItinerary, itineraryPlaces, optimizeRoute, scheduleDay } from '../src/lib/itinerary';
import { mergeRemote } from '../src/lib/sync';
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
    pg(2, 2, 'Louvre', 'Art museum in Paris, France', 'Q19675'),
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
  assert.equal(classifyDescription('Avenue in Paris, France')?.cat, 'bairro');
  assert.equal(classifyDescription('Opera house in Paris')?.cat, 'noite');
  assert.equal(classifyDescription('French football club'), null);
  const done = applyWikidata(picked, {
    Q243: { labels: { pt: { value: 'Torre Eiffel' } }, descriptions: { pt: { value: 'torre no Champ de Mars em Paris, França' } } },
    Q4: { descriptions: { en: { value: 'park in Paris' } } },
  });
  assert.deepEqual([done[1].name, done[1].desc], ['Torre Eiffel', 'Torre no Champ de Mars em Paris, França.']);
  assert.equal(done[2].desc, 'Park in Paris.');
  assert.equal(done[0].desc, 'Museu ou galeria conhecido na região.');
  assert.equal('wikidata' in done[0], false);
});
