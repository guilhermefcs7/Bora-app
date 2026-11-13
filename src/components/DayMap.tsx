import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { APP_URL } from '../config';
import type { Place } from '../types';
import { RouteMap } from './RouteMap';

// Mapa real do dia (OpenStreetMap via Leaflet), sem chave de API.
// Os tiles do openstreetmap.org recusam pedidos sem Referer. Por isso o iframe da web não usa
// `sandbox` (herda a origem da página) e o WebView nativo recebe uma baseUrl.

const esc = (s: string) => s.replace(/[<>&"'\\]/g, ' ');

type Base = { name: string; lat: number; lng: number } | undefined;

const buildHtml = (stops: Place[], id: string, base: Base) => {
  const home = JSON.stringify(base ? { a: base.lat, o: base.lng, n: esc(base.name) } : null);
  const pts = JSON.stringify(stops.map((p) => ({ a: p.lat, o: p.lng, n: esc(p.name) })));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:#E6EDFD}
.h{background:#14213D;color:#fff;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}
.n{background:#C2410C;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}
.leaflet-tooltip{font:600 12px system-ui,sans-serif;color:#14213D}</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
function say(t){try{if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(t)}else{parent.postMessage({boraMap:t,id:"${id}"},"*")}}catch(e){}}
try{
var P=${pts};
var map=L.map("m",{zoomControl:true,scrollWheelZoom:false});
var tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"});
var told=false;tiles.on("tileload",function(){if(!told){told=true;say("ok")}});
tiles.addTo(map);
var H=${home};
var ll=P.map(function(p){return [p.a,p.o]});
if(H){ll=[[H.a,H.o]].concat(ll,[[H.a,H.o]]);L.marker([H.a,H.o],{icon:L.divIcon({className:"",html:'<div class="h">H</div>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map).bindTooltip("Hospedagem: "+H.n,{direction:"top",offset:[0,-12]})}
if(ll.length>1){L.polyline(ll,{color:"#1D4ED8",weight:4,opacity:.85,dashArray:"2 9",lineCap:"round"}).addTo(map)}
P.forEach(function(p,i){L.marker([p.a,p.o],{icon:L.divIcon({className:"",html:'<div class="n">'+(i+1)+'</div>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map).bindTooltip((i+1)+". "+p.n,{direction:"top",offset:[0,-12]})});
if(ll.length>1){map.fitBounds(ll,{padding:[34,34],maxZoom:16})}else{map.setView(ll[0],15)}
var acc=0;
window.addEventListener("wheel",function(e){
if(!e.altKey)return;
e.preventDefault();e.stopPropagation();
acc+=-(e.deltaY||e.deltaX);
if(Math.abs(acc)<40)return;
var step=acc>0?1:-1;acc=0;
map.setZoomAround(map.mouseEventToContainerPoint(e),map.getZoom()+step);
},{passive:false,capture:true});
window.__map=map;
}catch(e){say("fail")}
</script></body></html>`;
};

export const DayMap = ({ stops, height = 240, base }: { stops: Place[]; height?: number; base?: Base }) => {
  const id = useRef(`m${Math.random().toString(36).slice(2, 9)}`).current;
  const [ready, setReady] = useState(false);
  const key = `${stops.map((p) => p.id).join('|')}@${base ? `${base.lat},${base.lng}` : ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(stops, id, base), [key]);

  useEffect(() => setReady(false), [key]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = globalThis as unknown as {
      addEventListener?: (t: string, f: (e: { data?: { boraMap?: string; id?: string } }) => void) => void;
      removeEventListener?: (t: string, f: (e: { data?: { boraMap?: string; id?: string } }) => void) => void;
    };
    const onMsg = (e: { data?: { boraMap?: string; id?: string } }) => {
      if (e.data?.id === id && e.data.boraMap === 'ok') setReady(true);
    };
    w.addEventListener?.('message', onMsg);
    return () => w.removeEventListener?.('message', onMsg);
  }, [id]);

  const frameStyle = { position: 'absolute' as const, left: 0, top: 0, width: '100%', height: '100%', border: 0, opacity: ready ? 1 : 0 };

  return (
    <View style={{ height, borderRadius: 20, overflow: 'hidden' }}>
      <RouteMap stops={stops} height={height} />
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          key,
          title: 'Mapa do dia',
          srcDoc: html,
          style: frameStyle,
        })
      ) : (
        <WebView
          key={key}
          originWhitelist={['*']}
          source={{ html, baseUrl: APP_URL }}
          onMessage={(e) => e.nativeEvent.data === 'ok' && setReady(true)}
          scrollEnabled={false}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: ready ? 1 : 0, backgroundColor: 'transparent' }}
        />
      )}
      {Platform.OS === 'web' && ready && (
        <View pointerEvents="none" style={{ position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#14213D' }}>Alt + rolagem para zoom</Text>
        </View>
      )}
    </View>
  );
};
