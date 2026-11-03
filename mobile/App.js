import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import MapCanvas from './src/MapCanvas';
import { distanceMetres, searchNearby, searchPlaces, validCoordinate } from './src/places.mjs';
import { getScenes } from './src/scene-provider.mjs';
import { getAyalaFallback, searchMadridFallback, searchMadridParks } from './src/ayala-fallback.mjs';
import { atMinutes, formatTime, lightAt, prepareScene, shadowShapes, solarWindows } from './src/estimate.mjs';
import { sunPosition } from '../frontend/solar.mjs';
import { shadowDirection } from '../frontend/map-shadows.mjs';

const MADRID = { latitude: 40.42785, longitude: -3.6873 };
const RADIUS = [500, 1000, 2000, 5000];
const statusText = { sun: 'Sol estimado', shade: 'Sombra estimada', night: 'Es de noche', unknown: 'Sin datos suficientes' };
const statusColor = { sun: '#a45b24', shade: '#536b74', night: '#536b74', unknown: '#777a70' };
const shortDistance = (metres) => metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', ',')} km`;

function Action({ children, onPress, secondary = false, disabled = false, style }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled, pressed && styles.pressed, style]}>
    <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{children}</Text>
  </Pressable>;
}
function Chip({ children, selected, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
    <Text style={[styles.chipText, selected && styles.chipSelectedText]}>{children}</Text>
  </Pressable>;
}
function Loading({ text }) {
  return <View style={styles.loading}><ActivityIndicator color="#bd6547" /><Text style={styles.muted}>{text}</Text></View>;
}

function Main() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState('place');
  const [center, setCenter] = useState(MADRID), [camera, setCamera] = useState(null);
  const [originLabel, setOriginLabel] = useState('Zona del mapa');
  const [query, setQuery] = useState(''), [radius, setRadius] = useState(1000);
  const [customRadius, setCustomRadius] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [minutes, setMinutes] = useState(() => Math.round((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15 % 1440);
  const [places, setPlaces] = useState([]), [resultsType, setResultsType] = useState(null);
  const [selected, setSelected] = useState(null), [buildings, setBuildings] = useState([]), [coverage, setCoverage] = useState([]);
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [sunOnly, setSunOnly] = useState(false);
  const request = useRef(0);
  const myLocation = useRef(null);

  const radiusText = customRadius.trim();
  const radiusNumber = Number(radiusText.replace(',', '.'));
  const validRadius = !radiusText || (/^\d{1,2}(?:[.,]\d{1,2})?$/.test(radiusText) && radiusNumber >= 0.1 && radiusNumber <= 5);
  const searchRadius = radiusText && validRadius ? Math.round(radiusNumber * 1000) : radius;

  const day = useMemo(() => { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + dayOffset); return value; }, [dayOffset]);
  const instant = useMemo(() => atMinutes(day, minutes), [day, minutes]);
  const scene = useMemo(() => {
    const area = selected && coverage.find((point) => distanceMetres(point, selected) < 5);
    return area && !['business', 'place'].includes(selected.kind) ? prepareScene(selected, buildings, area.radius) : null;
  }, [selected, buildings, coverage]);
  const state = useMemo(() => scene ? lightAt(scene, instant) : 'unknown', [scene, instant]);
  const windows = useMemo(() => scene ? solarWindows(scene, day) : [], [scene, day]);
  const shadows = useMemo(() => scene ? shadowShapes(buildings, selected, instant) : [], [scene, buildings, selected, instant]);
  const direction = useMemo(() => {
    const point = selected || center;
    return shadowDirection(sunPosition(instant, point.latitude, point.longitude));
  }, [selected, center, instant]);
  const nearbyScenes = useMemo(() => {
    const scenes = {};
    if (resultsType !== 'nearby') return scenes;
    for (const place of places) if (place.kind === 'public') {
      const area = coverage.find((point) => distanceMetres(point, place) < 5);
      if (area) scenes[place.id] = prepareScene(place, buildings, area.radius);
    }
    return scenes;
  }, [places, buildings, coverage, resultsType]);
  const nearbyStates = useMemo(() => Object.fromEntries(Object.entries(nearbyScenes).map(([id, item]) => [id, lightAt(item, instant)])), [nearbyScenes, instant]);
  const visiblePlaces = sunOnly && resultsType === 'nearby' ? places.filter((place) => nearbyStates[place.id] === 'sun') : places;
  const sunWindows = windows.filter((window) => window.state === 'sun');
  const unknownWindows = windows.some((window) => window.state === 'unknown');

  async function search() {
    const seq = ++request.current; setBusy('Buscando lugares…'); setError(''); setNotice('');
    setSelected(null); setBuildings([]); setCoverage([]); setSunOnly(false); setResultsType(null);
    try {
      const found = await searchPlaces(query, center);
      if (request.current !== seq) return;
      setPlaces(found); setResultsType('search');
      setNotice(found.length ? `Lugares encontrados en un radio de 5 km del mapa.` : 'No hay coincidencias cerca del mapa. Prueba una ciudad o mueve el mapa.');
    } catch (err) {
      if (query.trim().length >= 2 && query.trim().length <= 80) {
        try {
          const sources = await Promise.allSettled([searchMadridFallback(center, 5000, query), searchMadridParks(center, 5000, query)]);
          const fallback = sources.flatMap((source) => source.status === 'fulfilled' ? source.value : []).sort((a, b) => a.distance - b.distance);
          if (request.current !== seq) return;
          if (fallback.length) { setPlaces(fallback); setResultsType('search'); setNotice('La búsqueda general no está disponible; mostramos coincidencias de los catálogos municipales de Madrid.'); return; }
        } catch { /* Preserve the original search error. */ }
      }
      if (request.current === seq) { setPlaces([]); setError(err?.message || 'No se ha podido buscar.'); }
    }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function findNearby() {
    if (!validRadius) return;
    const seq = ++request.current; setBusy('Buscando lugares cercanos…'); setError(''); setNotice('');
    setSelected(null); setBuildings([]); setCoverage([]); setSunOnly(false); setResultsType(null);
    try {
      const found = await searchNearby(center, searchRadius);
      if (request.current !== seq) return;
      setPlaces(found); setResultsType('nearby');
      const points = found.filter((place) => place.kind === 'public').slice(0, 6);
      if (!points.length) { setNotice(found.length ? 'Hemos encontrado locales, pero no conocemos la posición de sus mesas.' : 'No se han encontrado lugares en esta búsqueda.'); return; }
      setBusy('Calculando la luz de los lugares exteriores…');
      try {
        const geometry = await getScenes(points);
        if (request.current !== seq) return;
        setBuildings(geometry.buildings); setCoverage(points.map((point) => ({ ...point, radius: geometry.radius, source: geometry.source })));
        setNotice(`Analizados hasta ${points.length} espacios exteriores cercanos. Los locales necesitan una posición de mesas.`);
      } catch {
        if (request.current === seq) setNotice('Encontramos lugares, pero no hemos podido obtener los edificios para calcular su luz.');
      }
    } catch (err) {
      try {
        const sources = await Promise.allSettled([getAyalaFallback(center, searchRadius), searchMadridParks(center, searchRadius)]);
        const fallback = sources.flatMap((source) => source.status === 'fulfilled' ? source.value : []).sort((a, b) => a.distance - b.distance);
        if (request.current !== seq) return;
        if (fallback.length) {
          setPlaces(fallback); setResultsType('nearby');
          const points = fallback.filter((place) => place.kind === 'public').slice(0, 2);
          if (!points.length) { setNotice('Mostramos el censo de Ayala. No conocemos la posición de sus mesas.'); return; }
          setBusy('Calculando la luz de parques cercanos…');
          const geometry = await Promise.allSettled(points.map((point) => getScenes([point])));
          if (request.current !== seq) return;
          const usable = geometry.flatMap((result, index) => result.status === 'fulfilled' ? [{ point: points[index], ...result.value }] : []);
          setBuildings(usable.flatMap((item) => item.buildings));
          setCoverage(usable.map((item) => ({ ...item.point, radius: item.radius, source: item.source })));
          setNotice(`Búsqueda municipal alternativa: ${usable.length} puntos de parques analizados. La sombra de árboles no está incluida; las mesas de locales no están localizadas.`);
          return;
        }
      } catch { /* Preserve the original search error. */ }
      if (request.current === seq) { setPlaces([]); setError(err?.message || 'No se ha podido buscar cerca.'); }
    }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function selectPoint(point) {
    if (!validCoordinate(point)) return;
    const seq = ++request.current;
    const selectedPoint = { ...point, id: point.id || 'selected-point', name: point.name || 'Punto elegido en el mapa', kind: point.kind || 'point' };
    setSelected(selectedPoint); setError(''); setNotice('');
    setCamera({ latitude: point.latitude, longitude: point.longitude, key: seq });
    if (selectedPoint.kind === 'business' || selectedPoint.kind === 'place') {
      setBusy('');
      setNotice('La marca es el lugar aproximado. Toca en el mapa el punto exterior o las mesas para calcular su luz.');
      return;
    }
    if (coverage.some((area) => distanceMetres(area, point) < 5)) {
      setBusy(''); setNotice('Cálculo aproximado para el punto elegido, no para todo el recinto.'); return;
    }
    setBusy('Consultando edificios para este punto…'); setBuildings([]); setCoverage([]);
    try {
      const geometry = await getScenes([point]);
      if (request.current !== seq) return;
      setBuildings(geometry.buildings); setCoverage([{ ...point, radius: geometry.radius, source: geometry.source }]);
      setNotice('Cálculo aproximado para el punto elegido, no para todo el recinto.');
    } catch { if (request.current === seq) setError('No hay edificios suficientes disponibles para calcular la luz de este punto.'); }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function useLocation() {
    const seq = ++request.current; setBusy('Buscando tu ubicación…'); setError(''); setNotice('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('No se ha dado permiso. Puedes mover el mapa y buscar desde ahí.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (request.current !== seq) return;
      const point = { latitude: result.coords.latitude, longitude: result.coords.longitude };
      if (!validCoordinate(point)) throw new Error('No hemos podido localizarte.');
      myLocation.current = point;
      setCenter(point); setCamera({ ...point, key: seq }); setOriginLabel('Tu ubicación');
      setPlaces([]); setSelected(null); setBuildings([]); setCoverage([]); setResultsType(null);
      setNotice('Ubicación lista. Busca cerca cuando quieras.');
    } catch (err) { if (request.current === seq) setError(err?.message || 'No hemos podido localizarte.'); }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function findCity() {
    const name = query.trim();
    if (name.length < 2 || name.length > 80) { setError('Escribe el nombre de una ciudad o una dirección.'); return; }
    const seq = ++request.current; setBusy('Buscando con el teléfono…'); setError('');
    try {
      if (Platform.OS === 'web') throw new Error('En la web, mueve el mapa hasta la zona que buscas.');
      if (Platform.OS === 'android') {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Para buscar direcciones, Android necesita permiso de ubicación. También puedes mover el mapa.');
      }
      const matches = await Location.geocodeAsync(name);
      const point = matches.find(validCoordinate);
      if (!point) throw new Error('El teléfono no ha encontrado esa ciudad o dirección.');
      if (request.current !== seq) return;
      setCenter(point); setCamera({ latitude: point.latitude, longitude: point.longitude, key: seq }); setOriginLabel('Zona del mapa');
      setPlaces([]); setSelected(null); setBuildings([]); setCoverage([]); setResultsType(null);
      setNotice('Zona localizada. Toca un punto del mapa o busca lugares cerca.');
    } catch (err) { if (request.current === seq) setError(err?.message || 'No se ha podido localizar la zona.'); }
    finally { if (request.current === seq) setBusy(''); }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora del teléfono';
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.logo}><Text style={styles.sunIcon}>☼ </Text>Rato al Sol<Text style={styles.accent}>.</Text></Text><Text style={styles.headerNote}>BUSCA TU LUZ</Text></View>
      <View style={styles.hero}><Text style={styles.eyebrow}>EL SOL, A TU MANERA  ✳</Text><Text style={styles.title}>Un buen sitio,{width < 350 ? '\n' : ' '}<Text style={styles.titleItalic}>a la luz.</Text></Text><Text style={styles.intro}>Encuentra un lugar y descubre cómo cambia su luz durante el día.</Text></View>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'place' }} onPress={() => { setMode('place'); setSunOnly(false); }} style={[styles.tab, mode === 'place' && styles.tabActive]}><Text style={[styles.tabText, mode === 'place' && styles.tabTextActive]}>⌕  Buscar lugar</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'nearby' }} onPress={() => { setMode('nearby'); setSunOnly(false); }} style={[styles.tab, mode === 'nearby' && styles.tabActive]}><Text style={[styles.tabText, mode === 'nearby' && styles.tabTextActive]}>⌖  Cerca de mí</Text></Pressable>
      </View>
      <View style={styles.searchPanel}>
        {mode === 'place' ? <>
          <Text style={styles.label}>¿DÓNDE QUIERES SENTARTE?</Text>
          <View style={styles.searchRow}><TextInput accessibilityLabel="Nombre del lugar, ciudad o dirección" value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Una terraza, plaza, parque…" placeholderTextColor="#9b9b90" returnKeyType="search" style={styles.input} /><Action onPress={search} disabled={!!busy}>Buscar</Action></View>
          <Pressable accessibilityRole="button" onPress={findCity} disabled={!!busy} style={styles.textAction}><Text style={styles.textActionLabel}>Buscar ciudad o dirección con el teléfono ↗</Text></Pressable>
        </> : <>
          <View style={styles.rowBetween}><Text style={styles.label}>DISTANCIA DESDE {originLabel.toUpperCase()}</Text><Pressable accessibilityRole="button" onPress={useLocation} disabled={!!busy}><Text style={styles.textActionLabel}>⌖  Mi ubicación</Text></Pressable></View>
          <View style={styles.chips}>{RADIUS.map((r) => <Chip key={r} selected={!radiusText && radius === r} onPress={() => { setRadius(r); setCustomRadius(''); }}>{r < 1000 ? `${r} m` : `${r / 1000} km`}</Chip>)}</View>
          <View style={styles.customDistance}><Text style={styles.distanceLabel}>Otra distancia (km)</Text><TextInput accessibilityLabel="Otra distancia en kilómetros, entre 0,1 y 5" value={customRadius} onChangeText={setCustomRadius} placeholder="0,1 a 5" placeholderTextColor="#9b9b90" keyboardType="decimal-pad" maxLength={6} style={styles.distanceInput} /></View>
          {!validRadius && <Text style={styles.distanceError}>Introduce una distancia entre 0,1 y 5 km.</Text>}
          <Action onPress={findNearby} disabled={!!busy || !validRadius}>Encontrar lugares cerca  ↗</Action>
        </>}
        <Text style={styles.privacy}>Al buscar se consulta OpenStreetMap y, en Madrid, el Ayuntamiento. Tu ubicación solo se usa si la eliges.</Text>
      </View>
      {!!busy && <Loading text={busy} />}
      {!!error && <View accessibilityRole="alert" style={[styles.alert, styles.feedback]}><Text style={styles.alertText}>{error}</Text></View>}
      {!!notice && <View style={[styles.note, styles.feedback]}><Text style={styles.noteText}>{notice}</Text></View>}
      <View style={styles.mapSection}><MapCanvas camera={camera} places={places} selected={selected} shadows={shadows} onMove={(point) => { setCenter(point); setOriginLabel(myLocation.current && distanceMetres(myLocation.current, point) < 25 ? 'Tu ubicación' : 'Zona del mapa'); }} onPick={selectPoint} onPlace={selectPoint} />
        <Text style={styles.mapCaption}>✳  Toca el punto exacto donde te sentarías. Las sombras son orientativas.</Text></View>
      <View style={styles.timePanel}>
        <View style={styles.rowBetween}><View><Text style={styles.eyebrow}>DESCUBRE CÓMO CAMBIA LA LUZ</Text><Text style={styles.sectionTitle}>Mueve la hora <Text style={styles.accent}>↗</Text></Text></View><Text style={styles.clock}>{formatTime(minutes)}</Text></View>
        <View style={styles.dayRow}><View style={styles.chips}><Chip selected={dayOffset === 0} onPress={() => setDayOffset(0)}>Hoy</Chip><Chip selected={dayOffset === 1} onPress={() => setDayOffset(1)}>Mañana</Chip></View><Text style={styles.dayText}>{day.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</Text></View>
        <Slider style={styles.slider} accessibilityLabel="Hora para consultar el sol" minimumValue={0} maximumValue={1425} step={15} value={minutes} onValueChange={setMinutes} minimumTrackTintColor="#eeb342" maximumTrackTintColor="#d9d7cb" thumbTintColor="#30463a" />
        <View style={styles.rowBetween}><Text style={styles.scale}>00:00</Text><Text style={styles.scale}>06:00</Text><Text style={styles.scale}>12:00</Text><Text style={styles.scale}>18:00</Text><Text style={styles.scale}>23:45</Text></View>
        <Text style={styles.timezone}>Hora de tu teléfono · {timezone}</Text>
        {direction && <View style={styles.direction}><Text accessible={false} style={[styles.directionArrow, { transform: [{ rotate: `${direction.bearing}deg` }] }]}>↑</Text><Text style={styles.directionText}>A las {formatTime(minutes)}, las sombras apuntan hacia el {direction.label}.</Text></View>}
      </View>
      {selected && <View style={styles.detail}>
        <Text style={styles.eyebrow}>TU PUNTO EN EL MAPA</Text><Text style={styles.detailTitle}>{selected.name}</Text>
        <View style={[styles.status, { borderColor: statusColor[state] }]}><Text style={[styles.statusText, { color: statusColor[state] }]}>{state === 'sun' ? '☼' : state === 'shade' ? '◒' : '○'}  {statusText[state]} · {formatTime(minutes)}</Text></View>
        {scene ? <><Text style={styles.label}>HORAS CON SOL ESTIMADO</Text>
          {sunWindows.length ? <View style={styles.windows}>{sunWindows.map((window) => <Text key={window.from} style={styles.window}>≈ {formatTime(window.from)} – {formatTime(window.to)}</Text>)}</View> : <Text style={styles.body}>{unknownWindows ? 'Aún no hay horas de sol que podamos estimar con estos datos.' : 'No se estima sol directo en este punto durante este día.'}</Text>}
          <Text style={styles.small}>Muestras cada 30 minutos. {unknownWindows ? 'Hay horas sin datos suficientes. ' : ''}Alturas y posición aproximadas; no incluye nubes, árboles, toldos ni sombrillas. {coverage[0]?.source === 'madrid' ? 'Alturas: Ayuntamiento de Madrid · CC BY 4.0.' : 'Edificios: OpenStreetMap.'}</Text></> :
          <Text style={styles.body}>Elige en el mapa el punto exterior exacto para intentar calcular sus horas de luz.</Text>}
      </View>}
      {!!resultsType && <View style={styles.results}>
        <View style={styles.rowBetween}><View><Text style={styles.eyebrow}>{resultsType === 'nearby' ? 'CERCA DE TI' : 'RESULTADOS DE LA BÚSQUEDA'}</Text><Text style={styles.sectionTitle}>{resultsType === 'nearby' ? 'Lugares para disfrutar.' : 'Elige un lugar.'}</Text></View><Text style={styles.resultCount}>{places.length}</Text></View>
        {resultsType === 'nearby' && <View style={styles.filterRow}><Chip selected={!sunOnly} onPress={() => setSunOnly(false)}>Todos</Chip><Chip selected={sunOnly} onPress={() => setSunOnly(true)}>☼ Con sol estimado</Chip></View>}
        {visiblePlaces.length ? visiblePlaces.slice(0, 30).map((place) => {
          const resultState = nearbyStates[place.id];
          return <Pressable key={place.id} accessibilityRole="button" onPress={() => selectPoint(place)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
            <View style={styles.resultIcon}><Text style={styles.resultIconText}>{place.kind === 'public' ? '✳' : '↗'}</Text></View><View style={styles.resultBody}><Text style={styles.resultName}>{place.name}</Text><Text style={styles.resultMeta}>{shortDistance(place.distance)} · {place.kind === 'business' ? 'Posición de mesas desconocida' : place.kind === 'public' ? 'Punto aproximado' : 'Lugar aproximado'}</Text>{resultState && <Text style={[styles.resultStatus, { color: statusColor[resultState] }]}>{statusText[resultState]} a las {formatTime(minutes)}</Text>}</View><Text style={styles.arrow}>↗</Text>
          </Pressable>;
        }) : <Text style={styles.body}>{sunOnly ? 'No hay lugares con sol estimado entre los que hemos podido analizar.' : 'Todavía no hay resultados. Prueba otra zona o búsqueda.'}</Text>}
        {resultsType === 'nearby' && <Text style={styles.small}>Se calculan como máximo 6 puntos exteriores por consulta; en la alternativa municipal, 2. No se modela la sombra de árboles. Los demás lugares pueden tener sol, pero no disponemos de una estimación para ellos.</Text>}
      </View>}
      <View style={styles.footer}><Text style={styles.footerTitle}>Para perseguir el sol.<Text style={styles.accent}> O encontrar sombra.</Text></Text><Text style={styles.small}>La luz es una estimación geométrica y puede variar. Datos de <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>OpenStreetMap y sus colaboradores</Text> y <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://datos.madrid.es/dataset/300750-0-servicio-mapas')}>Ayuntamiento de Madrid</Text> (<Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://creativecommons.org/licenses/by/4.0/')}>CC BY 4.0</Text>). Los resultados no indican apertura ni disponibilidad.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f5ec' }, page: { backgroundColor: '#f8f5ec', paddingHorizontal: 18, paddingBottom: 54, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { minHeight: 62, borderBottomWidth: 1, borderColor: '#e8e1d2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { color: '#253b31', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 22, fontWeight: '700', letterSpacing: -1 }, sunIcon: { color: '#e4a22e', fontFamily: 'System', fontSize: 21 }, accent: { color: '#c76d4b' }, headerNote: { color: '#7c8174', fontWeight: '800', fontSize: 9, letterSpacing: 1.3 },
  hero: { paddingTop: 24, paddingBottom: 20 }, eyebrow: { color: '#84877a', fontWeight: '800', fontSize: 9, letterSpacing: 1.3, marginBottom: 8 },
  title: { color: '#263c32', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 36, lineHeight: 40, letterSpacing: -1.5, fontWeight: '700' }, titleItalic: { color: '#c97150', fontStyle: 'italic', fontWeight: '400' }, intro: { color: '#67746a', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 410 },
  tabs: { flexDirection: 'row', backgroundColor: '#e9e5db', padding: 4, borderRadius: 5 }, tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 3 }, tabActive: { backgroundColor: '#fffdf7' }, tabText: { color: '#737a6f', fontSize: 13, fontWeight: '700' }, tabTextActive: { color: '#2b4438' },
  searchPanel: { paddingTop: 18, paddingBottom: 16 }, label: { color: '#5f7064', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 }, searchRow: { flexDirection: 'row', gap: 7 }, input: { flex: 1, minWidth: 0, minHeight: 48, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d9d5c9', borderRadius: 3, paddingHorizontal: 12, fontSize: 14, color: '#263c32' },
  button: { minHeight: 48, paddingHorizontal: 18, backgroundColor: '#30493b', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }, buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d5cdbb' }, buttonText: { color: '#fffdf7', fontSize: 13, fontWeight: '800' }, buttonTextSecondary: { color: '#314a3d' }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.72 },
  textAction: { alignSelf: 'flex-start', paddingVertical: 11 }, textActionLabel: { color: '#ad654b', fontSize: 12, fontWeight: '700' }, privacy: { color: '#8c9185', fontSize: 11, lineHeight: 16, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, chip: { minHeight: 38, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d9d6c9', borderRadius: 20, backgroundColor: '#fffdf8' }, chipSelected: { borderColor: '#354c3e', backgroundColor: '#354c3e' }, chipText: { color: '#667269', fontSize: 12, fontWeight: '700' }, chipSelectedText: { color: '#fffdf8' },
  customDistance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginVertical: 12 }, distanceLabel: { color: '#667269', fontSize: 12, fontWeight: '700' }, distanceInput: { width: 112, minHeight: 42, paddingHorizontal: 10, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d9d5c9', borderRadius: 3, color: '#263c32', fontSize: 14 }, distanceError: { color: '#9e543f', fontSize: 12, marginBottom: 10 },
  mapSection: { marginBottom: 16 }, mapCaption: { color: '#7c877a', fontSize: 11, lineHeight: 16, paddingTop: 7 },
  timePanel: { padding: 16, borderWidth: 1, borderColor: '#e4dece', backgroundColor: '#fffdf8' }, sectionTitle: { color: '#293f34', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }, clock: { color: '#c9704f', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 30 }, dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }, dayText: { color: '#879084', fontSize: 12 }, slider: { width: '100%', height: 42, marginTop: 4 }, scale: { color: '#939b8e', fontSize: 10 }, timezone: { marginTop: 12, color: '#889287', fontSize: 11 }, direction: { marginTop: 14, padding: 11, backgroundColor: '#edf0e7', flexDirection: 'row', alignItems: 'center', gap: 10 }, directionArrow: { color: '#bd6849', fontSize: 22, fontWeight: '700', width: 24, textAlign: 'center' }, directionText: { flex: 1, color: '#536c5d', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 18 }, muted: { color: '#788579', fontSize: 13 }, alert: { backgroundColor: '#f7e4da', padding: 13 }, alertText: { color: '#9e543f', lineHeight: 19, fontSize: 13 }, note: { backgroundColor: '#e7ebe0', padding: 13 }, feedback: { marginBottom: 14 }, noteText: { color: '#596f61', lineHeight: 19, fontSize: 12 },
  detail: { backgroundColor: '#f0ecdf', marginTop: 15, padding: 17 }, detailTitle: { color: '#273c32', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 24, marginBottom: 13 }, status: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 5, marginBottom: 17 }, statusText: { fontSize: 14, fontWeight: '800' }, windows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, window: { backgroundColor: '#f7dfad', paddingVertical: 8, paddingHorizontal: 10, color: '#8b572e', fontWeight: '800', fontSize: 13 }, body: { fontSize: 13, lineHeight: 20, color: '#617164' }, small: { fontSize: 11, lineHeight: 17, color: '#7c887c', marginTop: 12 },
  results: { marginTop: 23, borderTopWidth: 1, borderColor: '#e4dece', paddingTop: 20 }, resultCount: { color: '#a8ab9d', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 24 }, filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15, marginBottom: 6 }, result: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#e5e0d4', paddingVertical: 13, gap: 11 }, resultIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#efdfc8', alignItems: 'center', justifyContent: 'center' }, resultIconText: { color: '#bb704f', fontSize: 17 }, resultBody: { flex: 1 }, resultName: { color: '#2b4035', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '700' }, resultMeta: { color: '#879184', fontSize: 11, marginTop: 3 }, resultStatus: { fontSize: 11, fontWeight: '800', marginTop: 4 }, arrow: { color: '#5d7566', fontSize: 16 },
  footer: { marginTop: 35, paddingTop: 20, borderTopWidth: 1, borderColor: '#e2dcce' }, footerTitle: { color: '#293f34', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, fontWeight: '700' }, link: { textDecorationLine: 'underline' },
});
