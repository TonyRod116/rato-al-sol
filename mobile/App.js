import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import MapCanvas from './src/MapCanvas';
import { distanceMetres, searchCategory, searchNearby, searchPlaces, validCoordinate } from '../frontend/shared/places.mjs';
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

function Action({ children, onPress, disabled = false, style }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed, style]}>
    <Text style={styles.buttonText}>{children}</Text>
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
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetScroll = useRef(null);
  const jumpToResults = useRef(false);
  const sheetGesture = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -24) setSheetExpanded(true);
      if (gesture.dy > 24) setSheetExpanded(false);
    },
  })).current;
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
  const [showAllResults, setShowAllResults] = useState(false);
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
    setSunOnly(false); setResultsType(null); setPlaces([]);
    setShowAllResults(false);
    const name = query.trim();
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) {
      setBusy(''); setError(msg('Escribe entre 2 y 80 caracteres para buscar.', 'Enter 2 to 80 characters to search.')); return;
    }
    const sources = [searchPlaces(name, center)];
    if (inMadridArea(center)) {
      const category = searchCategory(name);
      if (!category || category.kind !== 'public') sources.push(searchMadridFallback(center, 5000, name));
      if (!category || (category.kind === 'public' && !category.filter.includes('square'))) sources.push(searchMadridParks(center, 5000, name));
    }
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
    jumpToResults.current = true;
    setShowAllResults(false);
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
    setSelected(point); setCamera({ ...point, key: seq }); setError(''); setBusy(''); setSheetExpanded(false);
    sheetScroll.current?.scrollTo({ y: 0, animated: false });
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
      setSearchOpen(false); setMode('place'); setSheetExpanded(false);
    } catch (err) { if (request.current === seq) setError(describeError(err, 'No se ha podido localizar la zona.', 'Could not locate the area.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || t('hora del teléfono', 'phone time');
  const sheetHeight = sheetExpanded ? Math.max(340, Math.min(height - insets.top - 42, 690)) : Math.min(370, Math.max(330, height * 0.45));
  const choosePoint = (point) => {
    jumpToResults.current = false;
    setSearchOpen(false); setMode('place'); setSheetExpanded(false); selectPoint(point);
    requestAnimationFrame(() => sheetScroll.current?.scrollTo({ y: 0, animated: false }));
  };
  const changeTime = (value) => {
    setMinutes(value); setEndMinutes((previous) => Math.max(previous, value + 15));
  };
  const setView = (value) => {
    jumpToResults.current = false;
    if (value !== mode) { request.current++; setBusy(''); }
    setMode(value); setSheetExpanded(value === 'nearby'); setError(''); setNotice('');
    requestAnimationFrame(() => sheetScroll.current?.scrollTo({ y: 0, animated: false }));
  };
  const resultRows = (items) => items.slice(0, showAllResults ? 30 : 5).map((place) => {
    const resultState = resultsType === 'nearby' ? (nearbyStates[place.id] || 'unknown') : null;
    return <Pressable key={place.id} accessibilityRole="button" onPress={() => choosePoint(place)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
      <View style={styles.resultIcon}><Text style={styles.resultIconText}>{place.kind === 'public' ? '✳' : '⌖'}</Text></View>
      <View style={styles.resultBody}><Text style={styles.resultName}>{pointName(place)}</Text><Text style={styles.resultMeta}>{shortDistance(place.distance, language)} · {place.categoryUnknown ? t('Terraza registrada · tipo sin confirmar', 'Registered outdoor seating · type unconfirmed') : place.kind === 'business' ? t('Posición de mesas desconocida', 'Table location unknown') : t('Punto aproximado', 'Approximate point')}</Text>{resultState && <Text style={[styles.resultStatus, { color: statusColor[resultState] }]}>{statusText[resultState]} {endEnabled ? t(`de ${formatTime(minutes)} a ${clockTime(endMinutes)}`, `from ${formatTime(minutes)} to ${clockTime(endMinutes)}`) : t(`a las ${formatTime(minutes)}`, `at ${formatTime(minutes)}`)}</Text>}</View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.arrow}>›</Text>
    </Pressable>;
  });
  const feedback = <>
    {!!busy && <Loading text={localized(busy)} />}
    {!!error && <View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{localized(error)}</Text></View>}
    {!!notice && <Text style={styles.notice}>{localized(notice)}</Text>}
  </>;
  const daylight = <>
    <View style={styles.rowBetween}><Text style={styles.miniHeading}>{t('SOL Y SOMBRA · 24 H', 'SUN AND SHADE · 24 H')}</Text>{!sheetExpanded && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSheetExpanded(true)} style={styles.inlineDetails}><Text style={styles.textActionLabel}>{choices.length ? t('Punto exterior ↑', 'Outdoor point ↑') : t('Ver detalle ↑', 'See details ↑')}</Text></Pressable>}</View>
    <View accessible accessibilityLabel={windows.length ? windows.map((window) => t(`${statusText[window.state]} de ${clockTime(window.from)} a ${clockTime(window.to)}`, `${statusText[window.state]} from ${clockTime(window.from)} to ${clockTime(window.to)}`)).join('. ') : t('Aún sin horas disponibles', 'No hours available yet')} style={styles.daylightTrack}>
      {windows.map((window) => <View key={window.from} style={{ flex: window.to - window.from, backgroundColor: barColor[window.state] }} />)}
    </View>
    <View style={styles.rowBetween}><Text style={styles.scale}>00</Text><Text style={styles.scale}>06</Text><Text style={styles.scale}>12</Text><Text style={styles.scale}>18</Text><Text style={styles.scale}>24</Text></View>
  </>;
  const results = resultsAreForMode && <View style={styles.results} onLayout={(event) => {
    if (mode === 'nearby' && jumpToResults.current) {
      jumpToResults.current = false;
      const y = event.nativeEvent.layout.y;
      requestAnimationFrame(() => sheetScroll.current?.scrollTo({ y, animated: true }));
    }
  }}>
    <View style={styles.rowBetween}><Text style={styles.sectionTitle}>{resultsType === 'nearby' ? t('Lugares encontrados', 'Places found') : t('Resultados', 'Results')}</Text><Text style={styles.subtle}>{visiblePlaces.length}</Text></View>
    {resultsType === 'nearby' && <View style={styles.filterRow}><Chip selected={!sunOnly} onPress={() => setSunOnly(false)}>{t('Todos', 'All')}</Chip><Chip selected={sunOnly} onPress={() => setSunOnly(true)}>{t('Sol o sin confirmar', 'Sun or unconfirmed')}</Chip></View>}
    {visiblePlaces.length ? resultRows(visiblePlaces) : <Text style={styles.body}>{sunOnly ? t('No hay lugares con sol estimado entre los que hemos podido analizar.', 'No places with estimated sun among those analysed.') : t('No hay resultados. Prueba otra zona o búsqueda.', 'No results. Try another area or search.')}</Text>}
    {visiblePlaces.length > 5 && <Pressable accessibilityRole="button" onPress={() => setShowAllResults(!showAllResults)} style={styles.textAction}><Text style={styles.textActionLabel}>{showAllResults ? t('Ver menos ↑', 'Show less ↑') : t(`Ver más (${Math.min(visiblePlaces.length, 30)}) ↓`, `Show more (${Math.min(visiblePlaces.length, 30)}) ↓`)}</Text></Pressable>}
    {resultsType === 'nearby' && <Text style={styles.small}>{t('Los lugares sin datos siguen apareciendo identificados. Se analizan hasta 6 puntos exteriores (2 con datos municipales). La franja se estima cada 30 minutos; no incluye árboles.', 'Places without data remain visible and labelled. Up to 6 outdoor points are analysed (2 with municipal data). Time ranges are sampled every 30 minutes; trees are not included.')}</Text>}
  </View>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <StatusBar style="dark" />
    <View style={styles.app} accessibilityElementsHidden={searchOpen} importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'} {...(Platform.OS === 'web' ? { 'aria-hidden': searchOpen, inert: searchOpen } : {})}>
      <View style={[styles.mapArea, { bottom: sheetHeight }]}>
        <MapCanvas camera={camera} places={resultsAreForMode ? visiblePlaces : []} selected={selected ? { ...selected, name: pointName(selected) } : null} language={language} shadows={shadows} sun={mapSun} onMove={(point) => { setCenter(point); setOriginLabel(myLocation.current && distanceMetres(myLocation.current, point) < 25 ? 'Tu ubicación' : 'Zona del mapa'); }} onPick={choosePoint} onPlace={choosePoint} />
      </View>
      <View pointerEvents="box-none" style={styles.topControls}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}><Text style={styles.brand}><Text style={styles.brandSun}>☼ </Text>Rato al Sol<Text style={styles.accent}>.</Text></Text></View>
          <View style={styles.languageControl} accessibilityRole="radiogroup" accessibilityLabel="Idioma / Language">{['es', 'en'].map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'es' ? 'Español' : 'English'} accessibilityState={{ checked: language === value }} {...(Platform.OS === 'web' ? { 'aria-checked': language === value } : {})} onPress={() => chooseLanguage(value)} style={[styles.languageOption, language === value && styles.languageSelected]}><Text style={[styles.languageText, language === value && styles.languageSelectedText]}>{value.toUpperCase()}</Text></Pressable>)}</View>
        </View>
        <View style={styles.searchBarRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Buscar lugar, ciudad o dirección', 'Search for a place, city or address')} onPress={() => { setView('place'); setSearchOpen(true); }} style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}><Text style={styles.searchIcon}>⌕</Text><Text style={styles.searchPlaceholder} numberOfLines={1}>{t('Busca un lugar', 'Search for a place')}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Usar mi ubicación', 'Use my location')} onPress={useLocation} disabled={!!busy} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}><Text style={styles.locationIcon}>⌖</Text></Pressable>
        </View>
      </View>
      <View style={[styles.sheet, { height: sheetHeight }]}>
        <View {...sheetGesture.panHandlers} style={styles.handleArea}>
          <Pressable accessibilityRole="button" accessibilityLabel={sheetExpanded ? t('Reducir panel', 'Collapse panel') : t('Ampliar panel', 'Expand panel')} accessibilityState={{ expanded: sheetExpanded }} hitSlop={10} onPress={() => setSheetExpanded(!sheetExpanded)} style={styles.handleButton}><View style={styles.handle} /></Pressable>
        </View>
        <ScrollView ref={sheetScroll} style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={sheetExpanded}>
          {mode === 'place' ? <>
            <View style={styles.rowBetween}>
              <View style={styles.titleWrap}><Text style={styles.miniHeading}>{selected ? t('TU LUGAR', 'YOUR PLACE') : t('ENCUENTRA TU RATO AL SOL', 'FIND YOUR PLACE IN THE SUN')}</Text><Text style={styles.placeTitle} numberOfLines={2}>{selected ? pointName(selected) : t('¿Dónde te sentarías?', 'Where would you sit?')}</Text></View>
              <Text accessible={false} style={styles.largeSun}>{state === 'night' ? '☾' : state === 'shade' ? '◒' : '☼'}</Text>
            </View>
            <Text style={[styles.placeStatus, selected && { color: statusColor[state] }]}>{!selected ? t('Toca el mapa para consultar un punto.', 'Tap the map to check a point.') : busy ? localized(busy) : scene && sceneInsideBuilding(scene) ? t('Elige un punto exterior', 'Choose an outdoor point') : statusText[state]}</Text>
            {selected?.kind === 'business' && <Text style={styles.businessHint}>{t('La marca puede ser la entrada. Toca las mesas en el mapa.', 'The marker may be the entrance. Tap the tables on the map.')}</Text>}
            {!sheetExpanded && !!error && <Text accessibilityRole="alert" style={styles.alertText}>{localized(error)}</Text>}
            {!sheetExpanded && !selected && !!busy && <Text style={styles.notice}>{localized(busy)}</Text>}
            {!sheetExpanded && !selected && !busy && !!notice && <Text style={styles.notice}>{localized(notice)}</Text>}
            <View style={styles.timelineBlock}>{daylight}</View>
            <View style={styles.timeTitleRow}><View style={styles.daySwitch}><Pressable accessibilityRole="button" accessibilityState={{ selected: dayOffset === 0 }} onPress={() => setDayOffset(0)} style={[styles.dayButton, dayOffset === 0 && styles.dayButtonSelected]}><Text style={[styles.dayButtonText, dayOffset === 0 && styles.dayButtonTextSelected]}>{t('Hoy', 'Today')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: dayOffset === 1 }} onPress={() => setDayOffset(1)} style={[styles.dayButton, dayOffset === 1 && styles.dayButtonSelected]}><Text style={[styles.dayButtonText, dayOffset === 1 && styles.dayButtonTextSelected]}>{t('Mañana', 'Tomorrow')}</Text></Pressable></View><Text style={styles.clock}>{formatTime(minutes)}</Text></View>
            <Range label={t('Hora para consultar el sol', 'Time to check sunlight')} value={minutes} min={TIME_START} max={TIME_END} step={15} valueText={formatTime(minutes)} onChange={changeTime} />
            <TimeScale />
            {!instant && <Text accessibilityRole="alert" style={styles.alertText}>{t('Esta hora no existe por el cambio horario. Elige otra.', 'This time does not exist due to the clock change. Choose another time.')}</Text>}
            {sheetExpanded && <>
              {feedback}
              <View style={styles.legend}>{[['sun', t('Sol', 'Sun')], ['shade', t('Sombra', 'Shade')], ['night', t('Noche', 'Night')], ['unknown', t('Sin datos', 'No data')]].map(([key, label]) => <View key={key} style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: barColor[key] }]} /><Text style={styles.subtle}>{label}</Text></View>)}</View>
              {!!windows.length && <View style={styles.windows}>{windows.map((window) => <View key={window.from} style={styles.windowRow}><Text style={[styles.windowStatus, { color: statusColor[window.state] }]}>{statusText[window.state]}</Text><Text style={styles.windowTime}>≈ {clockTime(window.from)} – {clockTime(window.to)}</Text></View>)}</View>}
              {!!choices.length && <View style={styles.choices}><Text style={styles.sectionTitle}>{t('Puntos exteriores cercanos', 'Nearby outdoor points')}</Text><Text style={styles.body}>{t('La referencia está dentro de un edificio. Elige un punto aproximado y confirma dónde están las mesas.', 'The reference is inside a building. Choose an approximate point and check where the tables are.')}</Text>{choices.map((choice) => <Pressable key={choice.direction} accessibilityRole="button" onPress={() => selectOutdoor(choice)} style={styles.outdoorChoice}><Text style={styles.resultName}>{t(`${choice.direction} · a unos ${choice.metres} m`, `${translateDirection(language, choice.direction)} · about ${choice.metres} m away`)}  ›</Text><Text style={styles.resultMeta}>{choice.windows.filter((window) => ['sun', 'shade'].includes(window.state)).map((window) => `${statusText[window.state]} ${clockTime(window.from)}–${clockTime(window.to)}`).join(' · ') || t('Sin horas suficientes para estimar', 'Not enough hours to estimate')}</Text></Pressable>)}</View>}
              {direction && <Text style={styles.direction}>{t(`A las ${formatTime(minutes)}, las sombras apuntan hacia el ${direction.label}.`, `At ${formatTime(minutes)}, shadows point ${translateDirection(language, direction.label)}.`)}</Text>}
              <Text style={styles.small}>{t('Horas aproximadas, calculadas cada 30 minutos. No incluyen nubes, árboles, toldos ni sombrillas.', 'Approximate times, calculated every 30 minutes. Clouds, trees, awnings and parasols are not included.')}</Text>
              <Text style={styles.small}>{localized(mapStatus)} {t('Hora del teléfono', 'Phone time')}: {timezone}.</Text>
              <Text style={styles.small}>{t('Datos de', 'Data from')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>OpenStreetMap</Text> {t('y', 'and')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://datos.madrid.es/dataset/300750-0-servicio-mapas')}>{t('Ayuntamiento de Madrid', 'Madrid City Council')}</Text> (<Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://creativecommons.org/licenses/by/4.0/')}>CC BY 4.0</Text>). {t('No indican apertura ni disponibilidad.', 'Results do not indicate opening times or availability.')}</Text>
            </>}
          </> : <>
            <Text style={styles.miniHeading}>{t('ENCUENTRA UN RATO AL SOL', 'FIND YOUR PLACE IN THE SUN')}</Text><Text style={styles.placeTitle}>{t('Busca cerca', 'Find places nearby')}</Text>
            <Text style={styles.body}>{t('Elige a qué hora y hasta dónde quieres ir.', 'Choose a time and how far you want to go.')}</Text>
            <View style={styles.nearbySection}><View style={styles.rowBetween}><View style={styles.titleWrap}><Text style={styles.fieldLabel}>{t('Desde', 'From')}</Text><Text style={styles.fieldValue}>{t(originLabel, originLabel === 'Tu ubicación' ? 'Your location' : 'Map area')}</Text></View><Pressable accessibilityRole="button" onPress={useLocation} disabled={!!busy} style={styles.outlineButton}><Text style={styles.outlineText}>⌖  {t('Mi ubicación', 'My location')}</Text></Pressable></View></View>
            <View style={styles.nearbySection}><View style={styles.rowBetween}><Text style={styles.fieldLabel}>{t('Distancia máxima', 'Maximum distance')}</Text><Text style={styles.rangeValue}>{shortDistance(radius, language)}</Text></View><Range label={t('Distancia máxima', 'Maximum distance')} value={radius} min={500} max={5000} step={500} valueText={shortDistance(radius, language)} onChange={setRadius} /><View style={styles.rowBetween}><Text style={styles.scale}>500 m</Text><Text style={styles.scale}>5 km</Text></View></View>
            <View style={styles.nearbySection}><View style={styles.rowBetween}><Text style={styles.fieldLabel}>{t('Hora de inicio', 'Start time')}</Text><Text style={styles.rangeValue}>{formatTime(minutes)}</Text></View><Range label={t('Hora inicial de búsqueda', 'Search start time')} value={minutes} min={TIME_START} max={TIME_END} step={15} valueText={formatTime(minutes)} onChange={changeTime} /><TimeScale />
              <View style={styles.nearbyDays}><Text style={styles.fieldLabel}>{t('Día', 'Day')}</Text><View style={styles.daySwitch}><Pressable accessibilityRole="button" accessibilityState={{ selected: dayOffset === 0 }} onPress={() => setDayOffset(0)} style={[styles.dayButton, dayOffset === 0 && styles.dayButtonSelected]}><Text style={[styles.dayButtonText, dayOffset === 0 && styles.dayButtonTextSelected]}>{t('Hoy', 'Today')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: dayOffset === 1 }} onPress={() => setDayOffset(1)} style={[styles.dayButton, dayOffset === 1 && styles.dayButtonSelected]}><Text style={[styles.dayButtonText, dayOffset === 1 && styles.dayButtonTextSelected]}>{t('Mañana', 'Tomorrow')}</Text></Pressable></View></View>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: endEnabled }} onPress={() => { setEndEnabled(!endEnabled); setEndMinutes((previous) => Math.max(previous, minutes + 15)); }} style={styles.rangeToggle}><Text style={styles.rangeToggleText}>{endEnabled ? '☑' : '☐'}  {t('Buscar durante una franja', 'Search over a time range')}</Text></Pressable>
              {endEnabled && <><View style={styles.rowBetween}><Text style={styles.fieldLabel}>{t('Hasta', 'Until')}</Text><Text style={styles.rangeValue}>{clockTime(endMinutes)}</Text></View><Range label={t('Hora final de búsqueda', 'Search end time')} value={endMinutes} min={minutes + 15} max={1440} step={15} valueText={clockTime(endMinutes)} onChange={setEndMinutes} /></>}
            </View>
            <Action onPress={findNearby} disabled={!!busy} style={styles.nearbyAction}>{t('Buscar lugares con sol', 'Find sunny places')}</Action>
            {feedback}{results}
            <Text style={styles.small}>{t('La ubicación solo se usa si la eliges. Consultamos OpenStreetMap y, en Madrid, el Ayuntamiento.', 'Your location is only used if you choose it. We consult OpenStreetMap and, in Madrid, the City Council.')}</Text>
          </>}
        </ScrollView>
        <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 6) }]}>
          <Pressable accessibilityRole="tab" accessibilityLabel={t('Explorar', 'Explore')} accessibilityState={{ selected: mode === 'place' }} onPress={() => setView('place')} style={styles.navItem}><Text style={[styles.navIcon, mode === 'place' && styles.navSelected]}>⌾</Text><Text style={[styles.navText, mode === 'place' && styles.navSelected]}>{t('Explorar', 'Explore')}</Text><View style={[styles.navIndicator, mode === 'place' && styles.navIndicatorSelected]} /></Pressable>
          <Pressable accessibilityRole="tab" accessibilityLabel={t('Buscar sol', 'Find sun')} accessibilityState={{ selected: mode === 'nearby' }} onPress={() => setView('nearby')} style={styles.navItem}><Text style={[styles.navIcon, mode === 'nearby' && styles.navSelected]}>☼</Text><Text style={[styles.navText, mode === 'nearby' && styles.navSelected]}>{t('Buscar sol', 'Find sun')}</Text><View style={[styles.navIndicator, mode === 'nearby' && styles.navIndicatorSelected]} /></Pressable>
        </View>
      </View>
    </View>
    <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}><KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}><Pressable accessibilityRole="button" accessibilityLabel={t('Volver al mapa', 'Back to map')} onPress={() => setSearchOpen(false)} style={styles.backButton}><Text style={styles.backIcon}>‹</Text></Pressable><Text style={styles.modalTitle}>{t('Buscar un lugar', 'Find a place')}</Text></View>
        <View style={styles.searchInputRow}><TextInput accessibilityLabel={t('Nombre o tipo de lugar', 'Name or type of place')} value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder={t('Restaurante, parque, ciudad…', 'Restaurant, park, city…')} placeholderTextColor="#89948b" returnKeyType="search" autoFocus style={styles.input} /><Action onPress={search} disabled={!!busy}>{t('Buscar', 'Search')}</Action></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchResults}>
          <Text style={styles.body}>{t('Busca por nombre o tipo cerca del mapa, o localiza una ciudad.', 'Search by name or type near the map, or locate a city.')}</Text>
          <Pressable accessibilityRole="button" onPress={findCity} disabled={!!busy} style={styles.textAction}><Text style={styles.textActionLabel}>{t('Buscar ciudad o dirección con el teléfono ↗', 'Find a city or address with your phone ↗')}</Text></Pressable>
          {feedback}{results}
        </ScrollView>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf7ee' }, app: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: '#e9e5d9', overflow: 'hidden' }, mapArea: { position: 'absolute', top: 0, left: 0, right: 0 },
  topControls: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 6 }, brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, brandBadge: { backgroundColor: '#fffcf5', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 }, brand: { color: '#263f32', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, fontWeight: '700', letterSpacing: -0.7 }, brandSun: { color: '#cb8d24', fontFamily: 'System' }, accent: { color: '#c66e4e' },
  languageControl: { flexDirection: 'row', backgroundColor: '#fcfaf3', borderRadius: 22, overflow: 'hidden', elevation: 2 }, languageOption: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, languageSelected: { backgroundColor: '#304a3a' }, languageText: { color: '#617266', fontSize: 10, fontWeight: '800' }, languageSelectedText: { color: '#fffdf7' },
  searchBarRow: { flexDirection: 'row', gap: 9 }, searchBar: { flex: 1, minHeight: 50, backgroundColor: '#fffdf8', borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, elevation: 4, shadowColor: '#263f32', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, searchIcon: { fontSize: 28, color: '#304a3a', lineHeight: 32 }, searchPlaceholder: { color: '#79867b', fontSize: 14, flex: 1 }, locationButton: { width: 50, minHeight: 50, borderRadius: 15, backgroundColor: '#fffdf8', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#263f32', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, locationIcon: { color: '#304a3a', fontSize: 27 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fffcf5', borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden', elevation: 10, shadowColor: '#25372d', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } }, handleArea: { height: 25, alignItems: 'center' }, handleButton: { width: 90, height: 25, alignItems: 'center', justifyContent: 'center' }, handle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#d8c6a5' }, sheetScroll: { flex: 1 }, sheetContent: { paddingHorizontal: 20, paddingBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, titleWrap: { flex: 1, minWidth: 0 }, miniHeading: { color: '#7b897b', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 }, placeTitle: { color: '#263e31', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 23, letterSpacing: -0.5 }, largeSun: { color: '#e3a52f', fontSize: 36, lineHeight: 42, marginLeft: 8 }, placeStatus: { color: '#657568', fontSize: 13, lineHeight: 19, marginTop: 3, fontWeight: '600' }, businessHint: { color: '#805d48', fontSize: 11, lineHeight: 16, marginTop: 4 },
  timelineBlock: { marginTop: 10 }, inlineDetails: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 2 }, daylightTrack: { height: 11, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#dfdfd5', marginTop: 3, marginBottom: 5 }, scale: { color: '#7b897b', fontSize: 10 }, subtle: { color: '#79877b', fontSize: 11 },
  timeTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }, daySwitch: { flexDirection: 'row', backgroundColor: '#f0eee4', borderRadius: 18, padding: 2 }, dayButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }, dayButtonSelected: { backgroundColor: '#304b3b' }, dayButtonText: { color: '#617266', fontWeight: '700', fontSize: 11 }, dayButtonTextSelected: { color: '#fffdf7' }, clock: { color: '#ba6849', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 25, fontWeight: '700' }, slider: { width: '100%', height: 38 }, timeScale: { height: 15, position: 'relative' }, timeScaleFirst: { position: 'absolute', left: 0 }, timeScaleLast: { position: 'absolute', right: 0 }, timeScaleTick: { position: 'absolute', width: 44, marginLeft: -22, textAlign: 'center' },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ece6da', paddingTop: 3, backgroundColor: '#fffcf5' }, navItem: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center' }, navIcon: { color: '#8b958a', fontSize: 22, lineHeight: 24 }, navText: { color: '#8b958a', fontSize: 11, fontWeight: '700', marginTop: 1 }, navSelected: { color: '#304b3b' }, navIndicator: { height: 3, width: 38, borderRadius: 2, marginTop: 3 }, navIndicatorSelected: { backgroundColor: '#e6ab3a' },
  sectionTitle: { color: '#30483a', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', fontSize: 18 }, body: { color: '#687a6c', fontSize: 13, lineHeight: 19, marginTop: 5 }, small: { color: '#7b897c', fontSize: 11, lineHeight: 17, marginTop: 12 }, link: { textDecorationLine: 'underline' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendSwatch: { width: 9, height: 9, borderRadius: 3 }, windows: { marginTop: 14, borderTopWidth: 1, borderColor: '#eee8dc' }, windowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderColor: '#eee8dc', gap: 8 }, windowStatus: { fontSize: 12, fontWeight: '700', flex: 1 }, windowTime: { color: '#566d5d', fontSize: 12, fontWeight: '700' }, choices: { marginTop: 18 }, outdoorChoice: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee8dc', minHeight: 50 }, direction: { color: '#536d5d', backgroundColor: '#edf0e8', fontSize: 12, lineHeight: 18, padding: 12, borderRadius: 10, marginTop: 14 },
  nearbySection: { marginTop: 18 }, fieldLabel: { color: '#536b5b', fontSize: 12, fontWeight: '700' }, fieldValue: { color: '#2f4739', fontSize: 14, fontWeight: '700', marginTop: 3 }, rangeValue: { color: '#ba6849', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, fontWeight: '700' }, outlineButton: { minHeight: 44, borderWidth: 1, borderColor: '#d8ddcf', borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center' }, outlineText: { color: '#405b49', fontSize: 12, fontWeight: '700' }, nearbyDays: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, rangeToggle: { minHeight: 48, justifyContent: 'center', marginTop: 6 }, rangeToggleText: { color: '#435b4a', fontSize: 13, fontWeight: '700' }, nearbyAction: { marginTop: 18 },
  button: { minHeight: 50, paddingHorizontal: 18, backgroundColor: '#304b3b', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fffdf7', fontSize: 13, fontWeight: '800' }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.7 },
  chip: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d9ddd1', borderRadius: 22, backgroundColor: '#fffcf6' }, chipSelected: { borderColor: '#354d3e', backgroundColor: '#354d3e' }, chipText: { color: '#66796b', fontSize: 12, fontWeight: '700' }, chipSelectedText: { color: '#fffdf8' },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 12 }, muted: { color: '#687b6b', fontSize: 12, flex: 1 }, alert: { backgroundColor: '#f7e9df', padding: 12, borderRadius: 9, marginTop: 10 }, alertText: { color: '#98543c', lineHeight: 18, fontSize: 12 }, notice: { color: '#627569', fontSize: 12, lineHeight: 18, marginTop: 10 },
  results: { marginTop: 18 }, filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }, result: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee8dc', paddingVertical: 12, gap: 11 }, resultIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3e5cf', alignItems: 'center', justifyContent: 'center' }, resultIconText: { color: '#bd754f', fontSize: 20 }, resultBody: { flex: 1, minWidth: 0 }, resultName: { color: '#30483a', fontSize: 14, fontWeight: '700' }, resultMeta: { color: '#79877b', fontSize: 11, lineHeight: 16, marginTop: 3 }, resultStatus: { fontSize: 11, fontWeight: '800', marginTop: 4 }, arrow: { color: '#718576', fontSize: 27 }, textAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 8 }, textActionLabel: { color: '#a75e42', fontSize: 12, fontWeight: '700' },
  modalSafe: { flex: 1, backgroundColor: '#fffcf5' }, modalContent: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 18 }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 }, backIcon: { color: '#304b3b', fontSize: 36, lineHeight: 42 }, modalTitle: { color: '#30483a', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 23, fontWeight: '700' }, searchInputRow: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minWidth: 0, minHeight: 50, backgroundColor: '#f2f0e7', borderRadius: 12, paddingHorizontal: 13, fontSize: 15, color: '#263e31' }, searchResults: { paddingBottom: 30, paddingTop: 14 },
});
