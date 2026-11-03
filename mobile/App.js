import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import MapCanvas from './src/MapCanvas';
import { distanceMetres, searchNearby, searchPlaces, validCoordinate } from '../frontend/shared/places.mjs';
import { getScenes } from '../frontend/shared/scene-provider.mjs';
import { searchMadridFallback, searchMadridParks } from '../frontend/shared/ayala-fallback.mjs';
import { inMadridArea } from '../frontend/shared/madrid-scene.mjs';
import { atMinutes, formatTime, lightAt, lightForInterval, nearbyOutdoorScenes, prepareScene, sceneInsideBuilding, shadowShapes, solarWindows } from '../frontend/shared/estimate.mjs';
import { sunPosition } from '../frontend/solar.mjs';
import { shadowDirection } from '../frontend/map-shadows.mjs';
import { DEFAULT_LOCATION } from '../frontend/shared/default-location.mjs';
import { initialSelectedTime, TIME_END, TIME_START } from '../frontend/shared/time-selection.mjs';
import { isLanguage, languageKey, translate, translateDirection } from '../frontend/shared/i18n.mjs';

const msg = (es, en) => ({ es, en });
const knownErrors = {
  'No se ha dado permiso. Puedes mover el mapa y buscar desde ahí.': 'Location permission was not granted. You can move the map and search from there.',
  'No hemos podido localizarte.': 'Could not find your location.',
  'En la web, mueve el mapa hasta la zona que buscas.': 'On the web, move the map to the area you want to search.',
  'Para buscar direcciones, Android necesita permiso de ubicación. También puedes mover el mapa.': 'Android needs location permission to search addresses. You can also move the map.',
  'El teléfono no ha encontrado esa ciudad o dirección.': 'Your phone could not find that city or address.',
};
const describeError = (error, es, en) => knownErrors[error?.message] ? msg(error.message, knownErrors[error.message]) : msg(es, en);
const statusColor = { sun: '#a45b24', shade: '#536b74', night: '#536b74', unknown: '#777a70' };
const barColor = { sun: '#eeb54f', shade: '#718991', night: '#3f5062', unknown: '#c8cbc1' };
const shortDistance = (metres, language) => metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', language === 'en' ? '.' : ',')} km`;
const clockTime = (minutes) => minutes === 1440 ? '24:00' : formatTime(minutes);

// Show the first useful catalogue while a slow provider continues independently.
function firstWithResults(tasks) {
  return new Promise((resolve, reject) => {
    let waiting = tasks.length, successes = 0, lastError;
    for (const task of tasks) task.then((result) => {
      successes++;
      if (result.places.length) resolve(result);
    }, (error) => { lastError = error; }).finally(() => {
      if (--waiting === 0) successes ? resolve({ places: [], source: 'empty' }) : reject(lastError);
    });
  });
}

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
function Range({ label, value, min, max, step, onChange, valueText }) {
  return Platform.OS === 'web' ? <input type="range" aria-label={label} aria-valuetext={valueText} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ width: '100%', height: 42, marginTop: 4, accentColor: '#30463a', cursor: 'pointer' }} /> :
    <Slider style={styles.slider} accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: valueText }} minimumValue={min} maximumValue={max} step={step} value={value} onValueChange={onChange} minimumTrackTintColor="#eeb342" maximumTrackTintColor="#d9d7cb" thumbTintColor="#30463a" />;
}
function TimeScale() {
  return <View style={styles.timeScale} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text style={[styles.scale, styles.timeScaleFirst]}>06:00</Text>
    <Text style={[styles.scale, styles.timeScaleTick, { left: '35.294%' }]}>12:00</Text>
    <Text style={[styles.scale, styles.timeScaleTick, { left: '70.588%' }]}>18:00</Text>
    <Text style={[styles.scale, styles.timeScaleLast]}>23:00</Text>
  </View>;
}

function Main() {
  const { width } = useWindowDimensions();
  const [language, setLanguage] = useState('es');
  const languageTouched = useRef(false);
  const languageSave = useRef(Promise.resolve());
  const t = (es, en) => translate(language, es, en);
  const localized = (value) => typeof value === 'object' && value ? t(value.es, value.en) : value;
  const pointName = (point) => point?.i18nName ? localized(point.i18nName) : point?.name;
  const statusText = { sun: t('Sol estimado', 'Estimated sun'), shade: t('Sombra estimada', 'Estimated shade'), night: t('Es de noche', 'It is night'), unknown: t('Sin datos suficientes', 'Not enough data') };
  useEffect(() => {
    AsyncStorage.getItem(languageKey).then((value) => { if (!languageTouched.current && isLanguage(value)) setLanguage(value); }).catch(() => {});
  }, []);
  useEffect(() => { if (Platform.OS === 'web') document.documentElement.lang = language; }, [language]);
  function chooseLanguage(value) {
    languageTouched.current = true;
    setLanguage(value);
    languageSave.current = languageSave.current.then(() => AsyncStorage.setItem(languageKey, value)).catch(() => {});
  }
  const [mode, setMode] = useState('place');
  const [center, setCenter] = useState(DEFAULT_LOCATION), [camera, setCamera] = useState(null);
  const [originLabel, setOriginLabel] = useState('Zona del mapa');
  const [query, setQuery] = useState(''), [radius, setRadius] = useState(500);
  const [dayOffset, setDayOffset] = useState(0);
  const [minutes, setMinutes] = useState(() => { const now = new Date(); return initialSelectedTime(now.getHours() * 60 + now.getMinutes(), 15); });
  const [endEnabled, setEndEnabled] = useState(false), [endMinutes, setEndMinutes] = useState(900);
  const [places, setPlaces] = useState([]), [resultsType, setResultsType] = useState(null);
  const [selected, setSelected] = useState(null), [buildings, setBuildings] = useState([]), [coverage, setCoverage] = useState([]);
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [sunOnly, setSunOnly] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true), [showAllResults, setShowAllResults] = useState(false);
  const [mapBuildings, setMapBuildings] = useState([]), [mapStatus, setMapStatus] = useState('');
  const request = useRef(0);
  const myLocation = useRef(null);

  const searchRadius = radius;

  useEffect(() => {
    let cancelled = false;
    setMapBuildings([]);
    setMapStatus(msg('Cargando edificios de la zona…', 'Loading buildings in this area…'));
    const timer = setTimeout(() => {
      getScenes([center]).then((geometry) => {
        if (!cancelled) { setMapBuildings(geometry.buildings); setMapStatus(msg('Sombras aproximadas: hasta 45 edificios cercanos.', 'Approximate shadows: up to 45 nearby buildings.')); }
      }).catch(() => { if (!cancelled) setMapStatus(msg('No hay alturas disponibles para dibujar las sombras de esta zona.', 'Building heights are unavailable to draw shadows in this area.')); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [center.latitude, center.longitude]);

  const day = useMemo(() => { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + dayOffset); return value; }, [dayOffset]);
  const instant = useMemo(() => atMinutes(day, minutes), [day, minutes]);
  const scene = useMemo(() => {
    const area = selected && coverage.find((point) => distanceMetres(point, selected) < 5);
    return area ? prepareScene(selected, buildings, area.radius) : null;
  }, [selected, buildings, coverage]);
  const state = useMemo(() => scene ? lightAt(scene, instant) : 'unknown', [scene, instant]);
  const windows = useMemo(() => scene ? solarWindows(scene, day) : [], [scene, day]);
  const shadows = useMemo(() => shadowShapes(mapBuildings, center, instant), [mapBuildings, center, instant]);
  const mapSun = useMemo(() => {
    return sunPosition(instant, center.latitude, center.longitude);
  }, [center, instant]);
  const direction = useMemo(() => shadowDirection(mapSun), [mapSun]);
  const choices = useMemo(() => selected && scene ? nearbyOutdoorScenes(scene, buildings).map((choice) => ({ ...choice, windows: solarWindows(choice.scene, day) })) : [], [selected, scene, buildings, day]);
  const nearbyScenes = useMemo(() => {
    const scenes = {};
    if (resultsType !== 'nearby') return scenes;
    for (const place of places) if (place.kind === 'public') {
      const area = coverage.find((point) => distanceMetres(point, place) < 5);
      if (area) scenes[place.id] = prepareScene(place, buildings, area.radius);
    }
    return scenes;
  }, [places, buildings, coverage, resultsType]);
  const nearbyStates = useMemo(() => Object.fromEntries(Object.entries(nearbyScenes).map(([id, item]) => {
    return [id, lightForInterval(item, day, minutes, endEnabled ? endMinutes : minutes)];
  })), [nearbyScenes, day, endEnabled, endMinutes, minutes]);
  const visiblePlaces = sunOnly && resultsType === 'nearby' ? places.filter((place) => !nearbyStates[place.id] || ['sun', 'unknown'].includes(nearbyStates[place.id])).sort((a, b) => Number(nearbyStates[b.id] === 'sun') - Number(nearbyStates[a.id] === 'sun')) : places;
  const resultsAreForMode = (mode === 'place' && resultsType === 'search') || (mode === 'nearby' && resultsType === 'nearby');

  async function search() {
    const seq = ++request.current; setBusy(msg('Buscando lugares…', 'Searching for places…')); setError(''); setNotice('');
    setSelected(null); setBuildings([]); setCoverage([]); setSunOnly(false); setResultsType(null); setPlaces([]);
    setResultsOpen(true); setShowAllResults(false);
    const name = query.trim();
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) {
      setBusy(''); setError(msg('Escribe entre 2 y 80 caracteres para buscar.', 'Enter 2 to 80 characters to search.')); return;
    }
    const sources = [searchPlaces(name, center)];
    if (inMadridArea(center)) sources.push(searchMadridFallback(center, 5000, name), searchMadridParks(center, 5000, name));
    let waiting = sources.length, successes = 0, merged = [];
    await Promise.all(sources.map(async (source) => {
      try {
        const found = await source; successes++;
        for (const place of found) if (!merged.some((other) => other.id === place.id ||
          (other.name.toLocaleLowerCase('es') === place.name.toLocaleLowerCase('es') && distanceMetres(other, place) < 20))) merged.push(place);
        merged = merged.sort((a, b) => a.distance - b.distance).slice(0, 80);
      } catch { /* Other providers can still return results. */ }
      finally {
        waiting--;
        if (request.current !== seq) return;
        if (merged.length) {
          setPlaces([...merged]); setResultsType('search'); setBusy('');
          setNotice(msg(`Lugares encontrados hasta 5 km del mapa${waiting ? ' · buscando más…' : '.'}`, `Places found within 5 km of the map${waiting ? ' · searching for more…' : '.'}`));
        } else if (!waiting) {
          setPlaces([]); setBusy('');
          if (successes) setNotice(msg('No hay coincidencias cerca del mapa. Prueba una ciudad o mueve el mapa.', 'No matches near the map. Try a city or move the map.'));
          else setError(msg('No se han podido consultar los lugares. Vuelve a intentarlo.', 'Could not retrieve places. Please try again.'));
        }
      }
    }));
  }

  async function findNearby() {
    const seq = ++request.current; setBusy(msg('Buscando lugares cercanos…', 'Searching for nearby places…')); setError(''); setNotice('');
    setSelected(null); setBuildings([]); setCoverage([]); setSunOnly(true); setResultsType(null);
    setResultsOpen(true); setShowAllResults(false);
    try {
      const sources = [searchNearby(center, searchRadius).then((places) => ({ places, source: 'osm' }))];
      if (inMadridArea(center)) sources.push(Promise.allSettled([
        searchMadridFallback(center, searchRadius, ''), searchMadridParks(center, searchRadius),
      ]).then((results) => {
        if (results.every((result) => result.status === 'rejected')) throw new Error('Catálogos municipales no disponibles.');
        return { places: results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => a.distance - b.distance), source: 'madrid' };
      }));
      const { places: found, source } = await firstWithResults(sources);
      if (request.current !== seq) return;
      setPlaces(found); setResultsType('nearby');
      const points = found.filter((place) => place.kind === 'public').slice(0, source === 'madrid' ? 2 : 6);
      if (!points.length) { setNotice(msg(found.length ? 'Hemos encontrado locales, pero no conocemos la posición de sus mesas.' : 'No se han encontrado lugares en esta búsqueda.', found.length ? 'Businesses found, but their table locations are unknown.' : 'No places found in this search.')); return; }
      setBusy(msg('Calculando la luz de los lugares exteriores…', 'Calculating light at outdoor places…'));
      try {
        const geometry = source === 'madrid' ? await Promise.allSettled(points.map((point) => getScenes([point]))) : null;
        const combined = source === 'madrid' ? null : await getScenes(points);
        if (request.current !== seq) return;
        const usable = geometry?.flatMap((result, index) => result.status === 'fulfilled' ? [{ point: points[index], ...result.value }] : []);
        setBuildings(combined ? combined.buildings : usable.flatMap((item) => item.buildings));
        setCoverage(combined ? points.map((point) => ({ ...point, radius: combined.radius, source: combined.source })) : usable.map((item) => ({ ...item.point, radius: item.radius, source: item.source })));
        const count = combined ? points.length : usable.length;
        setNotice(msg(`Analizados ${count} ${count === 1 ? 'espacio exterior cercano' : 'espacios exteriores cercanos'}. Los locales necesitan una posición de mesas; no se incluyen árboles.`, `Analysed ${count} nearby outdoor ${count === 1 ? 'point' : 'points'}. Businesses need a table location; trees are not included.`));
      } catch {
        if (request.current === seq) setNotice(msg('Encontramos lugares, pero no hemos podido obtener los edificios para calcular su luz.', 'Places found, but building data could not be loaded to calculate their light.'));
      }
    } catch (err) {
      if (request.current === seq) { setPlaces([]); setError(describeError(err, 'No se ha podido buscar cerca.', 'Could not search nearby.')); }
    }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function selectPoint(point) {
    if (!validCoordinate(point)) return;
    const seq = ++request.current;
    const selectedPoint = { ...point, id: point.id || 'selected-point', name: point.name || point.i18nName?.es || 'Punto elegido en el mapa', i18nName: point.i18nName || (!point.name ? msg('Punto elegido en el mapa', 'Point selected on the map') : null), kind: point.kind || 'point' };
    setSelected(selectedPoint); setError(''); setNotice('');
    setCamera({ latitude: point.latitude, longitude: point.longitude, key: seq });
    if (coverage.some((area) => distanceMetres(area, point) < 5)) {
      setBusy(''); setNotice(msg('Cálculo aproximado para el punto elegido, no para todo el recinto.', 'Approximate calculation for the selected point, not the whole area.')); return;
    }
    setBusy(msg('Consultando edificios para este punto…', 'Checking buildings around this point…')); setBuildings([]); setCoverage([]);
    try {
      const geometry = await getScenes([point]);
      if (request.current !== seq) return;
      setBuildings(geometry.buildings); setCoverage([{ ...point, radius: geometry.radius, source: geometry.source }]);
      setNotice(msg(selectedPoint.kind === 'business' ? 'La marca es la ubicación aproximada del local, no la posición de las mesas. Toca las mesas en el mapa para una estimación de ese punto.' : 'Cálculo aproximado para el punto elegido, no para todo el recinto.', selectedPoint.kind === 'business' ? 'The marker shows the approximate business location, not its tables. Tap the tables on the map for an estimate at that point.' : 'Approximate calculation for the selected point, not the whole area.'));
    } catch { if (request.current === seq) setError(msg('No hay edificios suficientes disponibles para calcular la luz de este punto.', 'Not enough building data is available to calculate light at this point.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  function selectOutdoor(choice) {
    const seq = ++request.current;
    const point = { ...choice.point, id: `outside-${choice.direction}`, kind: 'approx', name: `Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.i18nName?.es || selected.name}`, i18nName: msg(`Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.i18nName?.es || selected.name}`, `Point ${translateDirection('en', choice.direction.toLocaleLowerCase('es'))} of ${selected.i18nName?.en || selected.name}`) };
    const area = coverage.find((item) => distanceMetres(item, selected) < 5);
    setCoverage((previous) => [...previous, { ...point, radius: choice.scene.radius, source: area?.source }]);
    setSelected(point); setCamera({ ...point, key: seq }); setError(''); setBusy('');
    setNotice(msg('Punto exterior aproximado; confirma en el mapa dónde están las mesas.', 'Approximate outdoor point; check where the tables are on the map.'));
  }

  async function useLocation() {
    const seq = ++request.current; setBusy(msg('Buscando tu ubicación…', 'Finding your location…')); setError(''); setNotice('');
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
      setNotice(msg('Ubicación lista. Busca cerca cuando quieras.', 'Location ready. Search nearby whenever you like.'));
    } catch (err) { if (request.current === seq) setError(describeError(err, 'No hemos podido localizarte.', 'Could not find your location.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function findCity() {
    const name = query.trim();
    if (name.length < 2 || name.length > 80) { setError(msg('Escribe el nombre de una ciudad o una dirección.', 'Enter the name of a city or an address.')); return; }
    const seq = ++request.current; setBusy(msg('Buscando con el teléfono…', 'Searching with your phone…')); setError('');
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
      setNotice(msg('Zona localizada. Toca un punto del mapa o busca lugares cerca.', 'Area found. Tap a point on the map or search for nearby places.'));
    } catch (err) { if (request.current === seq) setError(describeError(err, 'No se ha podido localizar la zona.', 'Could not locate the area.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || t('hora del teléfono', 'phone time');
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.logo}><Text style={styles.sunIcon}>☼ </Text>Rato al Sol<Text style={styles.accent}>.</Text></Text><View style={styles.languageControl} accessibilityRole="radiogroup" accessibilityLabel="Idioma / Language">{['es', 'en'].map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'es' ? 'Español' : 'English'} accessibilityState={{ checked: language === value }} {...(Platform.OS === 'web' ? { 'aria-checked': language === value } : {})} onPress={() => chooseLanguage(value)} style={[styles.languageOption, language === value && styles.languageSelected]}><Text style={[styles.languageText, language === value && styles.languageSelectedText]}>{value.toUpperCase()}</Text></Pressable>)}</View></View>
      <View style={styles.hero}><Text style={styles.eyebrow}>{t('EL SOL, A TU MANERA  ✳', 'SUNSHINE, YOUR WAY  ✳')}</Text><Text style={styles.title}>{t('Un buen sitio,', 'Find your place,')}{width < 350 || (language === 'en' && width < 440) ? '\n' : ' '}<Text style={styles.titleItalic}>{t('a la luz.', 'in the sun.')}</Text></Text><Text style={styles.intro}>{t('Encuentra un lugar y descubre cómo cambia su luz durante el día.', 'Find a place and discover how its light changes throughout the day.')}</Text></View>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'place' }} onPress={() => { setMode('place'); setSunOnly(false); }} style={[styles.tab, mode === 'place' && styles.tabActive]}><Text style={[styles.tabText, mode === 'place' && styles.tabTextActive]}>{t('⌕  Buscar lugar', '⌕  Find a place')}</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'nearby' }} onPress={() => { setMode('nearby'); setSunOnly(false); }} style={[styles.tab, mode === 'nearby' && styles.tabActive]}><Text style={[styles.tabText, mode === 'nearby' && styles.tabTextActive]}>{t('⌖  Cerca de mí', '⌖  Near me')}</Text></Pressable>
      </View>
      <View style={styles.searchPanel}>
        {mode === 'place' ? <>
          <Text style={styles.label}>{t('¿DÓNDE QUIERES SENTARTE?', 'WHERE WOULD YOU LIKE TO SIT?')}</Text>
          <View style={styles.searchRow}><TextInput accessibilityLabel={t('Nombre o tipo de lugar', 'Name or type of place')} value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder={t('Restaurante, parque, Soho…', 'Restaurant, park, Soho…')} placeholderTextColor="#9b9b90" returnKeyType="search" style={styles.input} /><Action onPress={search} disabled={!!busy}>{t('Buscar', 'Search')}</Action></View>
          <Pressable accessibilityRole="button" onPress={findCity} disabled={!!busy} style={styles.textAction}><Text style={styles.textActionLabel}>{t('Buscar ciudad o dirección con el teléfono ↗', 'Find a city or address with your phone ↗')}</Text></Pressable>
        </> : <>
          <View style={styles.rowBetween}><Text style={styles.label}>{t('DISTANCIA DESDE', 'DISTANCE FROM')} {t(originLabel, originLabel === 'Tu ubicación' ? 'Your location' : 'Map area').toUpperCase()}</Text><Pressable accessibilityRole="button" onPress={useLocation} disabled={!!busy} style={styles.textAction}><Text style={styles.textActionLabel}>{t('⌖  Mi ubicación', '⌖  My location')}</Text></Pressable></View>
          <View style={styles.rowBetween}><Text style={styles.distanceLabel}>{t('Distancia máxima', 'Maximum distance')}</Text><Text style={styles.rangeValue}>{shortDistance(radius, language)}</Text></View>
          <Range label={t('Distancia máxima', 'Maximum distance')} value={radius} min={500} max={5000} step={500} valueText={shortDistance(radius, language)} onChange={setRadius} />
          <View style={styles.rowBetween}><Text style={styles.scale}>500 m</Text><Text style={styles.scale}>5 km</Text></View>
          <View style={[styles.rowBetween, styles.nearbyRange]}><Text style={styles.distanceLabel}>{t('Hora de inicio', 'Start time')}</Text><Text style={styles.rangeValue}>{formatTime(minutes)}</Text></View>
          <Range label={t('Hora inicial de búsqueda', 'Search start time')} value={minutes} min={TIME_START} max={TIME_END} step={15} valueText={formatTime(minutes)} onChange={(value) => { setMinutes(value); setEndMinutes((previous) => Math.max(previous, value + 15)); }} />
          <TimeScale />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: endEnabled }} onPress={() => { setEndEnabled(!endEnabled); setEndMinutes((previous) => Math.max(previous, minutes + 15)); }} style={styles.rangeToggle}><Text style={styles.rangeToggleText}>{endEnabled ? '☑' : '☐'}  {t('Buscar durante una franja', 'Search over a time range')}</Text></Pressable>
          {endEnabled && <><View style={styles.rowBetween}><Text style={styles.distanceLabel}>{t('Hasta', 'Until')}</Text><Text style={styles.rangeValue}>{clockTime(endMinutes)}</Text></View>
            <Range label={t('Hora final de búsqueda', 'Search end time')} value={endMinutes} min={minutes + 15} max={1440} step={15} valueText={clockTime(endMinutes)} onChange={setEndMinutes} /></>}
          <Action onPress={findNearby} disabled={!!busy} style={styles.nearbyAction}>{t('Encontrar lugares cerca  ↗', 'Find nearby places  ↗')}</Action>
        </>}
        <Text style={styles.privacy}>{t('Al buscar se consulta OpenStreetMap y, en Madrid, el Ayuntamiento. Tu ubicación solo se usa si la eliges.', 'Searches use OpenStreetMap and, in Madrid, the City Council. Your location is only used if you choose it.')}</Text>
      </View>
      {!!busy && <Loading text={localized(busy)} />}
      {!!error && <View accessibilityRole="alert" style={[styles.alert, styles.feedback]}><Text style={styles.alertText}>{localized(error)}</Text></View>}
      {!!notice && <View style={[styles.note, styles.feedback]}><Text style={styles.noteText}>{localized(notice)}</Text></View>}
      {resultsAreForMode && <View style={styles.results}>
        <View style={styles.rowBetween}><View style={styles.resultBody}><Text style={styles.eyebrow}>{resultsType === 'nearby' ? t('CERCA DE TI', 'NEAR YOU') : t('RESULTADOS DE LA BÚSQUEDA', 'SEARCH RESULTS')}</Text><Text style={styles.sectionTitle}>{resultsOpen || !selected ? (resultsType === 'nearby' ? t('Lugares para disfrutar.', 'Places to enjoy.') : t('Elige un lugar.', 'Choose a place.')) : t('Lugar elegido.', 'Selected place.')}</Text></View><Text style={styles.resultCount}>{places.length}</Text></View>
        {!resultsOpen && selected ? <Pressable accessibilityRole="button" onPress={() => setResultsOpen(true)} style={styles.selectedResult}><Text style={styles.resultName} numberOfLines={2}>{pointName(selected)}</Text><Text style={styles.textActionLabel}>{t('Cambiar lugar ↗', 'Change place ↗')}</Text></Pressable> : <>
          {resultsType === 'nearby' && <View style={styles.filterRow}><Chip selected={!sunOnly} onPress={() => setSunOnly(false)}>{t('Todos', 'All')}</Chip><Chip selected={sunOnly} onPress={() => setSunOnly(true)}>{t('☼ Sol o sin confirmar', '☼ Sun or unconfirmed')}</Chip></View>}
          {visiblePlaces.length ? visiblePlaces.slice(0, showAllResults ? 30 : 4).map((place) => {
            const resultState = nearbyStates[place.id] || (resultsType === 'nearby' ? 'unknown' : null);
            return <Pressable key={place.id} accessibilityRole="button" onPress={() => { setResultsOpen(false); selectPoint(place); }} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
              <View style={styles.resultIcon}><Text style={styles.resultIconText}>{place.kind === 'public' ? '✳' : '↗'}</Text></View><View style={styles.resultBody}><Text style={styles.resultName}>{place.name}</Text><Text style={styles.resultMeta}>{shortDistance(place.distance, language)} · {place.categoryUnknown ? t('Terraza registrada · tipo sin confirmar', 'Registered outdoor seating · type unconfirmed') : place.kind === 'business' ? t('Posición de mesas desconocida', 'Table location unknown') : place.kind === 'public' ? t('Punto aproximado', 'Approximate point') : t('Lugar aproximado', 'Approximate location')}</Text>{resultState && <Text style={[styles.resultStatus, { color: statusColor[resultState] }]}>{statusText[resultState]} {endEnabled ? t(`de ${formatTime(minutes)} a ${clockTime(endMinutes)}`, `from ${formatTime(minutes)} to ${clockTime(endMinutes)}`) : t(`a las ${formatTime(minutes)}`, `at ${formatTime(minutes)}`)}</Text>}</View><Text style={styles.arrow}>↗</Text>
            </Pressable>;
          }) : <Text style={styles.body}>{sunOnly ? t('No hay lugares con sol estimado entre los que hemos podido analizar.', 'No places with estimated sun among those analysed.') : t('Todavía no hay resultados. Prueba otra zona o búsqueda.', 'No results yet. Try another area or search.')}</Text>}
          {visiblePlaces.length > 4 && <Pressable accessibilityRole="button" onPress={() => setShowAllResults(!showAllResults)} style={styles.textAction}><Text style={styles.textActionLabel}>{showAllResults ? t('Ver menos resultados ↑', 'Show fewer results ↑') : t(`Ver más resultados (${Math.min(visiblePlaces.length, 30)}) ↓`, `Show more results (${Math.min(visiblePlaces.length, 30)}) ↓`)}</Text></Pressable>}
          {resultsType === 'nearby' && <Text style={styles.small}>{t('El filtro conserva los lugares sin datos identificados como tales. Se calculan como máximo 6 puntos exteriores por consulta; en la alternativa municipal, 2. La franja se estima con muestras cada 30 minutos y no se modela la sombra de árboles.', 'The filter keeps places without data and labels them as such. Up to 6 outdoor points are calculated per search, or 2 using municipal data. Time ranges are sampled every 30 minutes; tree shade is not modelled.')}</Text>}
        </>}
      </View>}
      <View style={styles.mapSection}><MapCanvas camera={camera} places={resultsAreForMode ? visiblePlaces : []} selected={selected ? { ...selected, name: pointName(selected) } : null} language={language} shadows={shadows} sun={mapSun} onMove={(point) => { setCenter(point); setOriginLabel(myLocation.current && distanceMetres(myLocation.current, point) < 25 ? 'Tu ubicación' : 'Zona del mapa'); }} onPick={selectPoint} onPlace={selectPoint} />
        <Text style={styles.mapCaption}>✳  {t('Toca el punto exacto donde te sentarías.', 'Tap the exact point where you would sit.')} {localized(mapStatus)}</Text></View>
      {!!choices.length && <View style={styles.outdoorChoices}><Text style={styles.distanceLabel}>{t('Elige un punto exterior cercano', 'Choose a nearby outdoor point')}</Text><Text style={styles.small}>{t('La referencia está dentro de un edificio. Son puntos aproximados: elige dónde quieres estar.', 'The reference point is inside a building. These are approximate points: choose where you want to be.')}</Text>{choices.map((choice) => <Pressable key={choice.direction} accessibilityRole="button" onPress={() => selectOutdoor(choice)} style={styles.outdoorChoice}><Text style={styles.resultName}>{t(`${choice.direction} · a unos ${choice.metres} m ↗`, `${translateDirection(language, choice.direction)} · about ${choice.metres} m away ↗`)}</Text><Text style={styles.resultMeta}>{choice.windows.filter((window) => ['sun','shade'].includes(window.state)).map((window) => `${statusText[window.state]} ${clockTime(window.from)}–${clockTime(window.to)}`).join(' · ') || t('Sin horas suficientes para estimar', 'Not enough hours to estimate')}</Text></Pressable>)}</View>}
      <View style={styles.daylight}>
        <Text style={styles.eyebrow}>{t('DE UN VISTAZO', 'AT A GLANCE')}</Text><Text style={styles.sectionTitle}>{t('Sol y sombra durante el día', 'Sun and shade throughout the day')}</Text>
        <Text style={styles.daylightLabel}>{!selected ? t('Toca un punto del mapa para ver sus horas de luz.', 'Tap a point on the map to see its hours of light.') : !scene ? t('Sin datos suficientes para este punto.', 'Not enough data for this point.') : sceneInsideBuilding(scene) ? t(`${pointName(selected)} · Elige un punto exterior.`, `${pointName(selected)} · Choose an outdoor point.`) : t(`${pointName(selected)} · ${statusText[state]} a las ${formatTime(minutes)}`, `${pointName(selected)} · ${statusText[state]} at ${formatTime(minutes)}`)}</Text>
        <View accessible accessibilityLabel={windows.length ? windows.map((window) => t(`${statusText[window.state]} de ${clockTime(window.from)} a ${clockTime(window.to)}`, `${statusText[window.state]} from ${clockTime(window.from)} to ${clockTime(window.to)}`)).join('. ') : t('Aún sin horas disponibles', 'No hours available yet')} style={styles.daylightTrack}>{windows.map((window) => <View key={window.from} style={{ flex: window.to - window.from, backgroundColor: barColor[window.state] }} />)}</View>
        <View style={styles.rowBetween}><Text style={styles.scale}>00 h</Text><Text style={styles.scale}>06 h</Text><Text style={styles.scale}>12 h</Text><Text style={styles.scale}>18 h</Text><Text style={styles.scale}>24 h</Text></View>
        <View style={styles.daylightLegend}>{[['sun',t('Sol','Sun')],['shade',t('Sombra','Shade')],['night',t('Noche','Night')],['unknown',t('Sin datos','No data')]].map(([key, label]) => <View key={key} style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: barColor[key] }]} /><Text style={styles.scale}>{label}</Text></View>)}</View>
        <View style={styles.daylightHighlights}>{windows.filter((window) => ['sun','shade'].includes(window.state)).map((window) => <Text key={window.from} style={[styles.daylightHighlight, { color: statusColor[window.state] }]}>{window.state === 'sun' ? t('☼ Sol', '☼ Sun') : t('◒ Sombra', '◒ Shade')} · ≈ {clockTime(window.from)} – {clockTime(window.to)}</Text>)}</View>
        <Text style={styles.small}>{t('Horas aproximadas, calculadas cada 30 minutos. Sin nubes, árboles ni toldos.', 'Approximate times, calculated every 30 minutes. Clouds, trees and awnings are not included.')}</Text>
      </View>
      <View style={styles.timePanel}>
        <View style={styles.rowBetween}><View style={styles.timeHeading}><Text style={styles.eyebrow}>{t('DESCUBRE CÓMO CAMBIA LA LUZ', 'DISCOVER HOW THE LIGHT CHANGES')}</Text><Text style={styles.sectionTitle}>{t('Mueve la hora', 'Change time')} <Text style={styles.accent}>↗</Text></Text></View><Text style={styles.clock}>{formatTime(minutes)}</Text></View>
        <View style={styles.dayRow}><View style={styles.chips}><Chip selected={dayOffset === 0} onPress={() => setDayOffset(0)}>{t('Hoy', 'Today')}</Chip><Chip selected={dayOffset === 1} onPress={() => setDayOffset(1)}>{t('Mañana', 'Tomorrow')}</Chip></View><Text style={styles.dayText}>{day.toLocaleDateString(language === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short' })}</Text></View>
        <Range label={t('Hora para consultar el sol', 'Time to check sunlight')} value={minutes} min={TIME_START} max={TIME_END} step={15} valueText={formatTime(minutes)} onChange={(value) => { setMinutes(value); setEndMinutes((previous) => Math.max(previous, value + 15)); }} />
        <TimeScale />
        <Text style={styles.timezone}>{t('Hora de tu teléfono', 'Your phone’s time')} · {timezone}</Text>
        {!instant && <Text style={styles.distanceError}>{t('Esta hora no existe por el cambio al horario de verano. Elige otra hora.', 'This time does not exist due to the daylight saving time change. Choose another time.')}</Text>}
        {direction && <View style={styles.direction}><Text accessible={false} style={[styles.directionArrow, { transform: [{ rotate: `${direction.bearing}deg` }] }]}>↑</Text><Text style={styles.directionText}>{t(`A las ${formatTime(minutes)}, las sombras apuntan hacia el ${direction.label}.`, `At ${formatTime(minutes)}, shadows point ${translateDirection(language, direction.label)}.`)}</Text></View>}
      </View>
      {selected && <View style={styles.detail}>
        <Text style={styles.eyebrow}>{t('TU PUNTO EN EL MAPA', 'YOUR POINT ON THE MAP')}</Text><Text style={styles.detailTitle}>{pointName(selected)}</Text>
        <View style={[styles.status, { borderColor: statusColor[state] }]}><Text style={[styles.statusText, { color: statusColor[state] }]}>{state === 'sun' ? '☼' : state === 'shade' ? '◒' : '○'}  {statusText[state]} · {formatTime(minutes)}</Text></View>
        {selected.kind === 'business' && <Text style={styles.body}>{t('La marca es la ubicación aproximada del local, no de sus mesas. Toca las mesas en el mapa para consultar ese punto.', 'The marker shows the approximate business location, not its tables. Tap the tables on the map to check that point.')}</Text>}
        {scene ? <><Text style={styles.label}>{t('LUZ A LO LARGO DEL DÍA', 'LIGHT THROUGHOUT THE DAY')}</Text>
          <View style={styles.windows}>{windows.map((window) => <Text key={window.from} style={styles.window}>{statusText[window.state]} · ≈ {formatTime(window.from)} – {window.to === 1440 ? '24:00' : formatTime(window.to)}</Text>)}</View>
          <Text style={styles.small}>{t('Muestras cada 30 minutos. Alturas y posición aproximadas; no incluye nubes, árboles, toldos ni sombrillas.', 'Samples every 30 minutes. Approximate heights and location; clouds, trees, awnings and parasols are not included.')} {coverage[0]?.source === 'madrid' ? t('Alturas: Ayuntamiento de Madrid · CC BY 4.0.', 'Heights: Madrid City Council · CC BY 4.0.') : t('Edificios: OpenStreetMap.', 'Buildings: OpenStreetMap.')}</Text></> :
          <Text style={styles.body}>{t('Elige en el mapa el punto exterior exacto para intentar calcular sus horas de luz.', 'Choose the exact outdoor point on the map to try to calculate its hours of light.')}</Text>}
      </View>}
      <View style={styles.footer}><Text style={styles.footerTitle}>{t('Para perseguir el sol.', 'Chase the sun.')}<Text style={styles.accent}>{t(' O encontrar sombra.', ' Or find some shade.')}</Text></Text><Text style={styles.small}>{t('La luz es una estimación geométrica y puede variar. Datos de', 'Light is a geometric estimate and may vary. Data from')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>{t('OpenStreetMap y sus colaboradores', 'OpenStreetMap and contributors')}</Text> {t('y', 'and')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://datos.madrid.es/dataset/300750-0-servicio-mapas')}>{t('Ayuntamiento de Madrid', 'Madrid City Council')}</Text> (<Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://creativecommons.org/licenses/by/4.0/')}>CC BY 4.0</Text>). {t('Los resultados no indican apertura ni disponibilidad.', 'Results do not indicate opening times or availability.')}</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f5ec' }, page: { backgroundColor: '#f8f5ec', paddingHorizontal: 18, paddingBottom: 54, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { minHeight: 62, borderBottomWidth: 1, borderColor: '#e8e1d2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { color: '#253b31', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 22, fontWeight: '700', letterSpacing: -1 }, sunIcon: { color: '#e4a22e', fontFamily: 'System', fontSize: 21 }, accent: { color: '#c76d4b' }, languageControl: { flexDirection: 'row', borderWidth: 1, borderColor: '#e1dccc', borderRadius: 5, overflow: 'hidden' }, languageOption: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, languageSelected: { backgroundColor: '#e8ecdf' }, languageText: { color: '#657266', fontSize: 11, fontWeight: '700' }, languageSelectedText: { color: '#253b31' },
  hero: { paddingTop: 24, paddingBottom: 20 }, eyebrow: { color: '#68756a', fontWeight: '800', fontSize: 10, letterSpacing: 1.3, marginBottom: 8 },
  title: { color: '#263c32', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 36, lineHeight: 40, letterSpacing: -1.5, fontWeight: '700' }, titleItalic: { color: '#c97150', fontStyle: 'italic', fontWeight: '400' }, intro: { color: '#67746a', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 410 },
  tabs: { flexDirection: 'row', backgroundColor: '#e9e5db', padding: 4, borderRadius: 5 }, tab: { flex: 1, minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 3 }, tabActive: { backgroundColor: '#fffdf7' }, tabText: { color: '#737a6f', fontSize: 13, fontWeight: '700' }, tabTextActive: { color: '#2b4438' },
  searchPanel: { paddingTop: 18, paddingBottom: 16 }, label: { color: '#53675a', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 }, searchRow: { flexDirection: 'row', gap: 7 }, input: { flex: 1, minWidth: 0, minHeight: 48, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d9d5c9', borderRadius: 3, paddingHorizontal: 12, fontSize: 14, color: '#263c32' },
  button: { minHeight: 48, paddingHorizontal: 18, backgroundColor: '#30493b', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }, buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d5cdbb' }, buttonText: { color: '#fffdf7', fontSize: 13, fontWeight: '800' }, buttonTextSecondary: { color: '#314a3d' }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.72 },
  textAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 11 }, textActionLabel: { color: '#985039', fontSize: 12, fontWeight: '700' }, privacy: { color: '#657568', fontSize: 12, lineHeight: 18, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, chip: { minHeight: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d9d6c9', borderRadius: 22, backgroundColor: '#fffdf8' }, chipSelected: { borderColor: '#354c3e', backgroundColor: '#354c3e' }, chipText: { color: '#667269', fontSize: 12, fontWeight: '700' }, chipSelectedText: { color: '#fffdf8' },
  customDistance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginVertical: 12 }, distanceLabel: { color: '#667269', fontSize: 12, fontWeight: '700' }, distanceInput: { width: 112, minHeight: 42, paddingHorizontal: 10, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d9d5c9', borderRadius: 3, color: '#263c32', fontSize: 14 }, distanceError: { color: '#9e543f', fontSize: 12, marginBottom: 10 },
  rangeValue: { color: '#ad654b', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 19, fontWeight: '700' }, nearbyRange: { marginTop: 18 }, rangeToggle: { minHeight: 48, justifyContent: 'center' }, rangeToggleText: { color: '#435b4a', fontSize: 13, fontWeight: '700' }, nearbyAction: { marginTop: 15 },
  mapSection: { marginBottom: 16 }, mapCaption: { color: '#617266', fontSize: 12, lineHeight: 18, paddingTop: 7 },
  daylight: { padding: 16, borderWidth: 1, borderColor: '#e4dece', backgroundColor: '#fffdf8', marginBottom: 8 }, daylightLabel: { marginTop: 10, marginBottom: 12, color: '#617164', fontSize: 12, lineHeight: 18 }, daylightTrack: { height: 20, borderRadius: 3, overflow: 'hidden', backgroundColor: '#e2e1d8', flexDirection: 'row', marginBottom: 6 }, daylightLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendSwatch: { width: 9, height: 9, borderRadius: 2 }, daylightHighlights: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, daylightHighlight: { fontSize: 12, fontWeight: '700', lineHeight: 18 }, outdoorChoices: { padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#e4dece', backgroundColor: '#fffdf8' }, outdoorChoice: { minHeight: 54, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#e8e1d4' },
  timeHeading: { flex: 1 }, timePanel: { padding: 16, borderWidth: 1, borderColor: '#e4dece', backgroundColor: '#fffdf8' }, sectionTitle: { color: '#293f34', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }, clock: { color: '#c9704f', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 30 }, dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }, dayText: { color: '#617266', fontSize: 12 }, slider: { width: '100%', height: 42, marginTop: 4 }, scale: { color: '#617266', fontSize: 11 }, timeScale: { height: 17, marginTop: 2, position: 'relative' }, timeScaleFirst: { position: 'absolute', left: 0 }, timeScaleLast: { position: 'absolute', right: 0 }, timeScaleTick: { position: 'absolute', width: 44, marginLeft: -22, textAlign: 'center' }, timezone: { marginTop: 12, color: '#617266', fontSize: 12 }, direction: { marginTop: 14, padding: 11, backgroundColor: '#edf0e7', flexDirection: 'row', alignItems: 'center', gap: 10 }, directionArrow: { color: '#bd6849', fontSize: 22, fontWeight: '700', width: 24, textAlign: 'center' }, directionText: { flex: 1, color: '#536c5d', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 18 }, muted: { color: '#788579', fontSize: 13 }, alert: { backgroundColor: '#f7e4da', padding: 13 }, alertText: { color: '#9e543f', lineHeight: 19, fontSize: 13 }, note: { backgroundColor: '#e7ebe0', padding: 13 }, feedback: { marginBottom: 14 }, noteText: { color: '#596f61', lineHeight: 19, fontSize: 12 },
  detail: { backgroundColor: '#f0ecdf', marginTop: 15, padding: 17 }, detailTitle: { color: '#273c32', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 24, marginBottom: 13 }, status: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 5, marginBottom: 17 }, statusText: { fontSize: 14, fontWeight: '800' }, windows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, window: { backgroundColor: '#f7dfad', paddingVertical: 8, paddingHorizontal: 10, color: '#8b572e', fontWeight: '800', fontSize: 13 }, body: { fontSize: 13, lineHeight: 20, color: '#617164' }, small: { fontSize: 11, lineHeight: 17, color: '#7c887c', marginTop: 12 },
  results: { marginBottom: 18, borderWidth: 1, borderColor: '#e4dece', backgroundColor: '#fffdf8', padding: 16 }, resultCount: { color: '#738173', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 24 }, filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15, marginBottom: 6 }, result: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#e5e0d4', paddingVertical: 13, gap: 11 }, selectedResult: { minHeight: 48, justifyContent: 'center', gap: 5, marginTop: 10 }, resultIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#efdfc8', alignItems: 'center', justifyContent: 'center' }, resultIconText: { color: '#bb704f', fontSize: 17 }, resultBody: { flex: 1 }, resultName: { color: '#2b4035', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '700' }, resultMeta: { color: '#617266', fontSize: 12, marginTop: 3 }, resultStatus: { fontSize: 11, fontWeight: '800', marginTop: 4 }, arrow: { color: '#5d7566', fontSize: 16 },
  footer: { marginTop: 35, paddingTop: 20, borderTopWidth: 1, borderColor: '#e2dcce' }, footerTitle: { color: '#293f34', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, fontWeight: '700' }, link: { textDecorationLine: 'underline' },
});
