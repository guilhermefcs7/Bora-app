# Bora

App gratuito de planejamento de viagens em grupo para iOS, Android e web.
Cada pessoa dá swipe nos lugares, o app calcula o consenso e monta um roteiro por dia com rota otimizada.

Feito com Expo (React Native) e TypeScript. Sem APIs pagas e sem chave obrigatória.

## Rodar no celular (2 minutos)

1. Instale o **Expo Go** no celular (App Store ou Google Play).
2. No computador, com Node 20 ou mais novo:

   ```bash
   npm install
   npx expo start
   ```

3. Escaneie o QR code com a câmera (iOS) ou com o Expo Go (Android). Celular e computador na mesma rede Wi-Fi.

Se o Expo Go reclamar da versão do SDK, atualize o Expo Go.

## O que funciona

| Área | Funcionalidade |
| --- | --- |
| Viagens | Criar com destino, dias (1 a 14) e atividades por dia (1 a 12); listar; excluir |
| Destinos | Campo com autocomplete: digite e escolha qualquer cidade ou região do mundo. Os lugares do destino são buscados na hora, do mais ao menos conhecido, com nome e descrição em português quando existem |
| Votação | Swipe: direita bora, esquerda passo, para cima imperdível. Botões equivalentes, desfazer, filtro por categoria, adicionar lugar manual |
| Grupo | Código de convite, progresso de cada pessoa, ranking de consenso. Modo "passa o celular" para várias pessoas no mesmo aparelho |
| Lugares | Foto, frase "pode encaixar bem se você gosta de…", público recomendado e "Ler mais" com o resumo da Wikipédia. Interesses do perfil destacam os lugares que combinam |
| Roteiro | Atividades espalhadas por todos os dias, agrupadas por proximidade; mapa real do dia (OpenStreetMap); horários e deslocamentos estimados; mover para qualquer dia, reordenar, remover, otimizar, abrir no app de mapas, compartilhar como texto |
| Extras | Checklist da viagem, lugares salvos, perfil com nome e cor |
| Offline | Viagens já criadas ficam no aparelho: votar, ver e editar o roteiro funcionam sem rede. Criar viagem precisa de internet |

## De onde vêm os dados

Nenhuma chave de API e nenhum destino embutido. Serviços públicos e gratuitos:

| Serviço | Uso |
| --- | --- |
| Photon (komoot, dados do OpenStreetMap) | Autocomplete de destinos enquanto você digita |
| Wikipédia em inglês (busca geográfica `nearcoord`) | Lugares em volta do destino, ordenados pelos artigos mais citados |
| Wikidata | Nome e descrição de cada lugar em português |
| Wikipédia (resumo do artigo e miniatura) | Foto e texto do "Ler mais" |
| OpenStreetMap + Leaflet | Mapa do dia no roteiro |

São serviços abertos, sem garantia de disponibilidade e com limites de uso justo. Para uso pessoal funcionam bem; para publicar o app para muita gente, vale ter um servidor próprio no meio.

## Ligar a sincronização entre aparelhos (opcional)

Sem configurar nada, o app roda em **modo local**. Para amigos entrarem pelo código, cada um no seu celular:

1. Crie um projeto gratuito em https://supabase.com.
2. No **SQL Editor**, cole e rode `supabase/schema.sql`.
3. Em **Project Settings > API**, copie a URL e a chave `anon`.
4. Copie `.env.example` para `.env` e preencha:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

5. Reinicie com `npx expo start -c`.

Segurança: não há login. Quem tem o código de 6 caracteres participa da viagem, e as políticas do banco liberam leitura e escrita para a chave pública. Serve para uso entre amigos; não guarde dados sensíveis.

Observação: a sincronização foi escrita e testada na parte de lógica (junção de votos), mas não foi exercitada contra um projeto Supabase real. Teste com dois aparelhos antes de depender dela.

## Gerar APK / IPA instalável

Precisa de conta Expo (gratuita). Para iOS, também de conta de desenvolvedor Apple (paga).

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview   # gera um APK para instalar direto
eas build -p ios --profile production    # exige conta Apple Developer
```

As variáveis do `.env` precisam estar também no EAS (`eas env:create`) para entrarem no build.

## Versão web

```bash
npm run build:web      # gera dist/ com caminhos relativos
npx serve dist         # testar localmente
```

A pasta `dist/` pode ser publicada em qualquer hospedagem estática (Netlify, Vercel, GitHub Pages).

## Comandos

```bash
npm run typecheck   # checagem de tipos
npm test            # testes da lógica (consenso, roteiro, rotas, merge)
```

## Estrutura

```
App.tsx                    raiz: provedores e roteamento
src/lib/consensus.ts       ranking do grupo
src/lib/itinerary.ts       geração do roteiro, otimização de rota, horários
src/lib/places.ts          autocomplete de destinos e busca dos lugares
src/lib/sync.ts            Supabase (opcional)
src/store.tsx              estado, persistência e sincronização
src/lib/audience.ts        perfil do lugar: interesses, público e frase
src/components/            SwipeDeck, DayMap, PlaceDetail, ícones e UI
src/screens/               telas
supabase/schema.sql        tabelas e políticas
tests/                     testes
```

## Limites conhecidos

- Horários e deslocamentos são estimativas por distância em linha reta ajustada, não rotas reais.
- Lugares adicionados manualmente entram com a coordenada do centro do destino.
- Os lugares vêm de artigos da Wikipédia perto do destino, classificados pela descrição curta. Restaurantes e bares quase não aparecem; dá para adicionar à mão. Às vezes entra um item fora do lugar (um bairro, um estádio).
- Duração de visita é estimativa por categoria. Não há preço nem horário de funcionamento.
- O mapa do roteiro precisa de internet; sem ela aparece um desenho simples da rota. O traçado liga as paradas em linha reta, não segue as ruas.
- "Para quem é" e a frase de cada lugar são geradas por regras (categoria + palavras da descrição), não por IA: são sugestões, não curadoria.
- Sem importação de Instagram/TikTok, PDF ou calendário nesta versão.
