import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import MapCanvas from './src/MapCanvas';
import { clearPlacesMemoryCache, distanceMetres, searchCategory, searchNearby, searchPlaces, validCoordinate } from '../frontend/shared/places.mjs';
import { getScenes } from '../frontend/shared/scene-provider.mjs';
import { clearMadridSearchMemoryCache, searchMadridFallback, searchMadridParks } from '../frontend/shared/ayala-fallback.mjs';
import { clearBarcelonaSearchMemoryCache, inBarcelonaArea, searchBarcelonaTerraces } from '../frontend/shared/barcelona-terraces.mjs';
import { inMadridArea } from '../frontend/shared/madrid-scene.mjs';
import { atMinutes, formatTime, lightAt, lightForInterval, nearbyOutdoorScenes, prepareScene, sceneInsideBuilding, solarWindows } from '../frontend/shared/estimate.mjs';
import { sunPosition } from '../frontend/solar.mjs';
import { buildingShadows, shadowDirection } from '../frontend/map-shadows.mjs';
import { clearViewportBuildingMemoryCache, getViewportBuildings, viewportBounds } from '../frontend/viewport-buildings.mjs';
import { DEFAULT_LOCATION } from '../frontend/shared/default-location.mjs';
import { createViewportLoader, expandedMadridViewport } from './src/viewport.mjs';
import { ShadowRasterizer } from './src/ShadowOverlay';
import { shadowSunStatus } from './src/shadow-status.mjs';
import { buildingCache, sceneCache, searchCache, clearOfflineData, cacheGeneration } from './src/offline-data';
import { createCachedServices } from './src/cached-services.mjs';
import { firstWithResults } from './src/first-results.mjs';
import { initialSelectedTime, TIME_END, TIME_START } from '../frontend/shared/time-selection.mjs';
import { isLanguage, languageKey, translate, translateDirection } from '../frontend/shared/i18n.mjs';

const msg = (es, en) => ({ es, en });
const cachedServices = createCachedServices({ scenes: getScenes, sceneCache, searchCache, generation: cacheGeneration });
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
const emptyShadows = { type: 'FeatureCollection', features: [] };

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
  const [view3D, setView3D] = useState(true), [map3DAvailable, setMap3DAvailable] = useState(true);
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
  const [nearbySourceFailure, setNearbySourceFailure] = useState(false);
  const [sunOnly, setSunOnly] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [mapBounds, setMapBounds] = useState(null), [mapBuildings, setMapBuildings] = useState(null);
  const [visibleBounds, setVisibleBounds] = useState(null);
  const [mapStatus, setMapStatus] = useState(''), [mapIssue, setMapIssue] = useState(false);
  const [mapFailed, setMapFailed] = useState(false), [mapRetry, setMapRetry] = useState(0);
  const [mapStale, setMapStale] = useState(false), [cacheNotice, setCacheNotice] = useState('');
  const [searchNeedsRefresh, setSearchNeedsRefresh] = useState(false);
  const request = useRef(0);
  const pendingCamera = useRef(null);
  const myLocation = useRef(null);
  const forceSearch = useRef(false);
  const refreshMap = useRef(false), skipMapLoad = useRef(false), saveMapTimers = useRef(new Set());
  const viewportLoader = useRef(null);
  if (!viewportLoader.current) viewportLoader.current = createViewportLoader(getViewportBuildings, Date.now,
    Platform.OS === 'web' ? undefined : expandedMadridViewport);

  const searchRadius = radius;

  function updateSavedMap() {
    refreshMap.current = true;
    clearViewportBuildingMemoryCache(); clearPlacesMemoryCache();
    viewportLoader.current = createViewportLoader(getViewportBuildings, Date.now,
      Platform.OS === 'web' ? undefined : expandedMadridViewport);
    setMapRetry((value) => value + 1);
  }

  async function clearSavedData() {
    for (const timer of saveMapTimers.current) clearTimeout(timer);
    saveMapTimers.current.clear();
    const clearing = clearOfflineData();
    request.current++; setBusy('');
    refreshMap.current = false; skipMapLoad.current = true; setMapRetry((value) => value + 1);
    clearViewportBuildingMemoryCache(); clearPlacesMemoryCache(); clearMadridSearchMemoryCache(); clearBarcelonaSearchMemoryCache();
    viewportLoader.current = createViewportLoader(getViewportBuildings, Date.now,
      Platform.OS === 'web' ? undefined : expandedMadridViewport);
    if (mapBuildings) {
      const stale = Number.isFinite(mapBuildings.fetchedAt) && Date.now() - mapBuildings.fetchedAt >= 30 * 86400000;
      setMapStale(stale); setMapIssue(Boolean(mapBuildings.omitted) || stale); setMapFailed(false);
      setMapStatus(stale ? msg('Edificios guardados hace más de 30 días. Toca para actualizar.', 'Buildings were saved over 30 days ago. Tap to update.')
        : mapBuildings.omitted ? msg('Sombras aproximadas; algunos edificios no tienen altura disponible.', 'Approximate shadows; some buildings have no available height.')
          : msg('Sombras aproximadas de la zona visible.', 'Approximate shadows in the visible area.'));
    } else {
      setMapIssue(true); setMapFailed(true); setMapStale(false);
      setMapStatus(msg('Toca para cargar los edificios de la zona.', 'Tap to load buildings in this area.'));
    }
    const ok = await clearing;
    setCacheNotice(ok ? msg('Zonas y búsquedas guardadas borradas de este dispositivo.', 'Saved areas and searches were removed from this device.')
      : msg('No se han podido borrar todos los datos guardados. Vuelve a intentarlo.', 'Could not remove all saved data. Please try again.'));
  }

  function focusCamera(point, key) {
    const position = { latitude: point.latitude, longitude: point.longitude };
    pendingCamera.current = { ...position, until: Date.now() + 2000 };
    setCenter(position);
    setCamera({ ...position, key });
  }

  useEffect(() => () => { for (const timer of saveMapTimers.current) clearTimeout(timer); saveMapTimers.current.clear(); }, []);
  useEffect(() => {
    if (skipMapLoad.current) { skipMapLoad.current = false; return; }
    if (!mapBounds) return;
    let cancelled = false, timer;
    const generation = cacheGeneration();
    const force = refreshMap.current;
    refreshMap.current = false;
    const applyGeometry = (geometry) => {
      const stale = Number.isFinite(geometry.fetchedAt) && Date.now() - geometry.fetchedAt >= 30 * 86400000;
      setMapBuildings(geometry); setMapFailed(false); setMapStale(stale);
      setMapIssue(Boolean(geometry.omitted) || stale);
      setMapStatus(stale
        ? msg('Edificios guardados hace más de 30 días. Toca para actualizar.', 'Buildings were saved over 30 days ago. Tap to update.')
        : geometry.omitted
          ? msg('Sombras aproximadas; algunos edificios no tienen altura disponible.', 'Approximate shadows; some buildings have no available height.')
          : msg('Sombras aproximadas de los edificios de la zona visible.', 'Approximate building shadows in the visible area.'));
    };
    const cached = viewportLoader.current.find(mapBounds);
    if (cached && !force) { applyGeometry(cached); return; }
    const previous = force ? mapBuildings : null;
    if (!previous) setMapBuildings(null);
    setMapIssue(true); setMapFailed(false); setMapStale(false);
    setMapStatus(msg('Cargando edificios de la zona.', 'Loading buildings in this area.'));
    const load = async () => {
      const saved = !force && Platform.OS !== 'web' ? await buildingCache.find(mapBounds) : null;
      if (cancelled || cacheGeneration() !== generation) return;
      if (saved) {
        const geometry = { ...saved.value, fetchedAt: saved.fetchedAt };
        viewportLoader.current.prime(geometry); applyGeometry(geometry); return;
      }
      timer = setTimeout(() => {
        if (cancelled || cacheGeneration() !== generation) return;
        viewportLoader.current.get(mapBounds).then((geometry) => {
          if (!cancelled && cacheGeneration() === generation) {
            applyGeometry(geometry);
            if (Platform.OS !== 'web') {
              const saveTimer = setTimeout(() => {
                saveMapTimers.current.delete(saveTimer);
                if (cacheGeneration() === generation) void buildingCache.save(geometry, { fetchedAt: geometry.fetchedAt ?? Date.now() });
              }, 1200);
              saveMapTimers.current.add(saveTimer);
            }
          }
        }).catch((error) => {
          if (!cancelled && cacheGeneration() === generation) {
            if (previous) { setMapBuildings(previous); setMapStale(true); }
            setMapIssue(true);
            const zoomRequired = error?.message?.startsWith('Acerca el mapa');
            setMapFailed(!zoomRequired);
            setMapStatus(zoomRequired
              ? msg('Acerca el mapa para cargar las sombras.', 'Zoom in to load shadows.')
              : previous ? msg('No se ha podido actualizar; los edificios guardados tienen más de 30 días. Toca para reintentar.', 'Could not update; saved buildings are over 30 days old. Tap to retry.')
                : msg('No se han podido cargar los edificios. Toca para reintentar.', 'Could not load buildings. Tap to retry.'));
          }
        });
      }, 400);
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mapBounds, mapRetry]);

  const day = useMemo(() => { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + dayOffset); return value; }, [dayOffset]);
  const instant = useMemo(() => atMinutes(day, minutes), [day, minutes]);
  const scene = useMemo(() => {
    const area = selected && coverage.find((point) => distanceMetres(point, selected) < 5);
    const distance = area ? distanceMetres(area, selected) : 0;
    return area ? prepareScene(selected, buildings, area.radius - (distance < .001 ? 0 : Math.ceil(distance + 2))) : null;
  }, [selected, buildings, coverage]);
  const state = useMemo(() => scene ? lightAt(scene, instant) : 'unknown', [scene, instant]);
  const windows = useMemo(() => scene ? solarWindows(scene, day) : [], [scene, day]);
  const mapSun = useMemo(() => {
    return sunPosition(instant, center.latitude, center.longitude);
  }, [center, instant]);
  const sunStatus = shadowSunStatus(mapSun);
  const shadows = useMemo(() => mapBuildings && visibleBounds ? buildingShadows(mapBuildings, mapSun, visibleBounds,
    Platform.OS === 'web' ? undefined : { maxVertices: 120000 }) : emptyShadows, [mapBuildings, mapSun, visibleBounds]);
  const [nativeShadowResult, setNativeShadowResult] = useState(null);
  const shadowContext = useRef(null);
  shadowContext.current = { source: shadows, area: visibleBounds, retryToken: mapRetry };
  function acceptShadowResult(result) {
    const current = shadowContext.current;
    if (result.source === current.source && result.area === current.area && result.retryToken === current.retryToken) setNativeShadowResult(result);
  }
  const currentShadowResult = nativeShadowResult?.source === shadows && nativeShadowResult?.area === visibleBounds && nativeShadowResult?.retryToken === mapRetry ? nativeShadowResult : null;
  const shadowPending = Platform.OS !== 'web' && shadows.features.length > 0 && !currentShadowResult;
  const shadowFailed = Platform.OS !== 'web' && currentShadowResult?.failed;
  const direction = useMemo(() => shadowDirection(mapSun), [mapSun]);
  const choices = useMemo(() => selected && scene ? nearbyOutdoorScenes(scene, buildings).map((choice) => ({ ...choice, windows: solarWindows(choice.scene, day) })) : [], [selected, scene, buildings, day]);
  const nearbyScenes = useMemo(() => {
    const scenes = {};
    if (resultsType !== 'nearby') return scenes;
    for (const place of places) if (place.kind === 'public') {
      const area = coverage.find((point) => distanceMetres(point, place) < 5);
      if (area) {
        const distance = distanceMetres(area, place);
        scenes[place.id] = prepareScene(place, buildings, area.radius - (distance < .001 ? 0 : Math.ceil(distance + 2)));
      }
    }
    return scenes;
  }, [places, buildings, coverage, resultsType]);
  const nearbyStates = useMemo(() => Object.fromEntries(Object.entries(nearbyScenes).map(([id, item]) => {
    return [id, lightForInterval(item, day, minutes, endEnabled ? endMinutes : minutes)];
  })), [nearbyScenes, day, endEnabled, endMinutes, minutes]);
  const visiblePlaces = sunOnly && resultsType === 'nearby' ? places.filter((place) => !nearbyStates[place.id] || ['sun', 'unknown'].includes(nearbyStates[place.id])).sort((a, b) => Number(nearbyStates[b.id] === 'sun') - Number(nearbyStates[a.id] === 'sun')) : places;
  const resultsAreForMode = (mode === 'place' && resultsType === 'search') || (mode === 'nearby' && resultsType === 'nearby');

  async function search() {
    const seq = ++request.current; setBusy(msg('Buscando lugares…', 'Searching for places…')); setError(''); setNotice(''); setNearbySourceFailure(false);
    const force = forceSearch.current; forceSearch.current = false; setSearchNeedsRefresh(false);
    if (force) { clearPlacesMemoryCache(); clearMadridSearchMemoryCache(); clearBarcelonaSearchMemoryCache(); }
    setSunOnly(false); setResultsType(null); setPlaces([]);
    setShowAllResults(false);
    const name = query.trim();
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) {
      setBusy(''); setError(msg('Escribe entre 2 y 80 caracteres para buscar.', 'Enter 2 to 80 characters to search.')); return;
    }
    const city = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (city === 'barcelona' || city === 'madrid') { goToCity(city); return; }
    let oldCache = false, partialCache = false;
    const source = (provider, operation) => cachedServices.cachedSearch({ source: provider, query: name, center, radius: 5000 }, operation, { force }).then((result) => {
      oldCache ||= Boolean(result.stale); partialCache ||= Boolean(result.partial);
      if (request.current === seq && (result.stale || result.partial)) setSearchNeedsRefresh(true);
      return result.places;
    });
    const sources = [source('osm-search', () => searchPlaces(name, center))];
    if (inMadridArea(center)) {
      const category = searchCategory(name);
      if (!category || category.kind !== 'public') sources.push(source('madrid-terraces', () => searchMadridFallback(center, 5000, name)));
      if (!category || (category.kind === 'public' && !category.filter.includes('square'))) sources.push(source('madrid-parks', () => searchMadridParks(center, 5000, name)));
    }
    if (inBarcelonaArea(center)) sources.push(source('barcelona-terraces', () => searchBarcelonaTerraces(center, 5000, name)));
    let waiting = sources.length, successes = 0, failures = 0, merged = [];
    await Promise.all(sources.map(async (source) => {
      try {
        const found = await source; successes++;
        for (const place of found) if (!merged.some((other) => other.id === place.id ||
          (other.name.toLocaleLowerCase('es') === place.name.toLocaleLowerCase('es') && distanceMetres(other, place) < 20))) merged.push(place);
        merged = merged.sort((a, b) => a.distance - b.distance).slice(0, 80);
      } catch { failures++; /* Other providers can still return results. */ }
      finally {
        waiting--;
        if (request.current !== seq) return;
        if (merged.length) {
          setPlaces([...merged]); setResultsType('search'); setBusy('');
          setNotice(msg(`Lugares encontrados hasta 5 km del mapa${waiting ? ' · buscando más…' : '.'}${failures || partialCache ? ' La búsqueda puede estar incompleta.' : ''}${oldCache ? ' Algunos resultados se guardaron hace más de un día.' : ''}`, `Places found within 5 km of the map${waiting ? ' · searching for more…' : '.'}${failures || partialCache ? ' Results may be incomplete.' : ''}${oldCache ? ' Some results were saved over a day ago.' : ''}`));
        } else if (!waiting) {
          setPlaces([]); setBusy('');
          if (successes) setNotice(failures || partialCache || oldCache ? msg('No hay coincidencias en los datos disponibles; la búsqueda puede estar incompleta o desactualizada.', 'No matches in available data; results may be incomplete or out of date.') : msg('No hay coincidencias cerca del mapa. Prueba una ciudad o mueve el mapa.', 'No matches near the map. Try a city or move the map.'));
          else setError(msg('No se han podido consultar los lugares. Vuelve a intentarlo.', 'Could not retrieve places. Please try again.'));
        }
      }
    }));
  }

  async function findNearby() {
    const seq = ++request.current; setBusy(msg('Buscando lugares cercanos…', 'Searching for nearby places…')); setError(''); setNotice(''); setNearbySourceFailure(false);
    const force = forceSearch.current; forceSearch.current = false; setSearchNeedsRefresh(false);
    if (force) { clearPlacesMemoryCache(); clearMadridSearchMemoryCache(); clearBarcelonaSearchMemoryCache(); }
    setSelected(null); setBuildings([]); setCoverage([]); setSunOnly(true); setResultsType(null);
    jumpToResults.current = true;
    setShowAllResults(false);
    try {
      const warnSourceFailure = () => { if (request.current === seq) setNearbySourceFailure(true); };
      const source = (provider, operation) => cachedServices.cachedSearch({ source: provider, query: '', center, radius: searchRadius }, operation, { force }).then((result) => {
        if (request.current === seq && (result.stale || result.partial)) setSearchNeedsRefresh(true);
        return result;
      });
      const sources = [source('osm-nearby', () => searchNearby(center, searchRadius)).then((result) => ({ ...result, source: 'osm' }))];
      if (inMadridArea(center)) sources.push(Promise.allSettled([
        source('madrid-terraces', () => searchMadridFallback(center, searchRadius, '')), source('madrid-parks', () => searchMadridParks(center, searchRadius)),
      ]).then((results) => {
        if (results.every((result) => result.status === 'rejected')) throw new Error('Catálogos municipales no disponibles.');
        if (results.some((result) => result.status === 'rejected')) warnSourceFailure();
        const ok = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        return { places: ok.flatMap((result) => result.places).sort((a, b) => a.distance - b.distance), source: 'madrid', stale: ok.some((result) => result.stale), partial: ok.some((result) => result.partial) };
      }));
      if (inBarcelonaArea(center)) sources.push(source('barcelona-terraces', () => searchBarcelonaTerraces(center, searchRadius)).then((result) => ({ ...result, source: 'barcelona' })));
      const { places: found, source: selectedSource, stale: searchStale, partial: searchPartial } = await firstWithResults(sources, warnSourceFailure);
      if (request.current !== seq) return;
      setPlaces(found); setResultsType('nearby');
      const points = found.filter((place) => place.kind === 'public').slice(0, selectedSource === 'madrid' ? 2 : 6);
      if (!points.length) { setNotice(msg((found.length ? 'Hemos encontrado locales, pero no conocemos la posición de sus mesas.' : 'No se han encontrado lugares en esta búsqueda.') + (searchPartial || searchStale ? ' Los resultados pueden estar incompletos o desactualizados.' : ''), (found.length ? 'Businesses found, but their table locations are unknown.' : 'No places found in this search.') + (searchPartial || searchStale ? ' Results may be incomplete or out of date.' : ''))); return; }
      setBusy(msg('Calculando la luz de los lugares exteriores…', 'Calculating light at outdoor places…'));
      try {
        const geometry = selectedSource === 'madrid' ? await Promise.allSettled(points.map((point) => cachedServices.cachedScenes([point]))) : null;
        const combined = selectedSource === 'madrid' ? null : await cachedServices.cachedScenes(points);
        if (request.current !== seq) return;
        const usable = geometry?.flatMap((result, index) => result.status === 'fulfilled' ? [{ point: points[index], ...result.value }] : []);
        setBuildings(combined ? combined.buildings : usable.flatMap((item) => item.buildings));
        setCoverage(combined ? points.map((point) => ({ ...point, radius: combined.radius, source: combined.source, stale: Boolean(combined.cacheInfo?.stale), limited: Boolean(combined.cacheInfo?.limited) })) : usable.map((item) => ({ ...item.point, radius: item.radius, source: item.source, stale: Boolean(item.cacheInfo?.stale), limited: Boolean(item.cacheInfo?.limited) })));
        const count = combined ? points.length : usable.length;
        const old = combined?.cacheInfo?.stale || usable?.some((item) => item.cacheInfo?.stale);
        const limited = combined?.cacheInfo?.limited || usable?.some((item) => item.cacheInfo?.limited);
        setNotice(msg(`Analizados ${count} ${count === 1 ? 'espacio exterior cercano' : 'espacios exteriores cercanos'}. Los locales necesitan una posición de mesas; no se incluyen árboles.${old ? ' Algunos edificios se guardaron hace más de 30 días.' : ''}${limited ? ' La zona guardada tiene cobertura reducida.' : ''}${searchPartial || searchStale ? ' Los lugares pueden estar incompletos o desactualizados.' : ''}`, `Analysed ${count} nearby outdoor ${count === 1 ? 'point' : 'points'}. Businesses need a table location; trees are not included.${old ? ' Some building data was saved over 30 days ago.' : ''}${limited ? ' The saved area has limited coverage.' : ''}${searchPartial || searchStale ? ' Places may be incomplete or out of date.' : ''}`));
      } catch {
        if (request.current === seq) setNotice(msg(`Encontramos lugares, pero no hemos podido obtener los edificios para calcular su luz.${searchPartial || searchStale ? ' Los lugares pueden estar incompletos o desactualizados.' : ''}`, `Places found, but building data could not be loaded to calculate their light.${searchPartial || searchStale ? ' Places may be incomplete or out of date.' : ''}`));
      }
    } catch (err) {
      if (request.current === seq) { setPlaces([]); setError(describeError(err, 'No se ha podido buscar cerca.', 'Could not search nearby.')); }
    }
    finally { if (request.current === seq) setBusy(''); }
  }

  async function selectPoint(point, force = false) {
    if (!validCoordinate(point)) return;
    if (force) clearPlacesMemoryCache();
    const seq = ++request.current;
    const selectedPoint = { ...point, id: point.id || 'selected-point', name: point.name || point.i18nName?.es || 'Punto elegido en el mapa', i18nName: point.i18nName || (!point.name ? msg('Punto elegido en el mapa', 'Point selected on the map') : null), kind: point.kind || 'point' };
    setSelected(selectedPoint); setError(''); setNotice(''); setNearbySourceFailure(false);
    focusCamera(point, seq);
    const existingCoverage = coverage.find((area) => distanceMetres(area, point) < 5);
    if (existingCoverage && !force) {
      setBusy(''); setNotice(msg(`Cálculo aproximado para el punto elegido, no para todo el recinto.${existingCoverage.stale ? ' Los edificios se guardaron hace más de 30 días.' : ''}${existingCoverage.limited ? ' La zona guardada tiene cobertura reducida.' : ''}`, `Approximate calculation for the selected point, not the whole area.${existingCoverage.stale ? ' Building data was saved over 30 days ago.' : ''}${existingCoverage.limited ? ' The saved area has limited coverage.' : ''}`)); return;
    }
    const previous = force ? { buildings, coverage } : null;
    setBusy(msg('Consultando edificios para este punto…', 'Checking buildings around this point…')); if (!previous) { setBuildings([]); setCoverage([]); }
    try {
      const geometry = await cachedServices.cachedScenes([point], { force });
      if (request.current !== seq) return;
      setBuildings(geometry.buildings); setCoverage([{ ...point, radius: geometry.radius, source: geometry.source, stale: Boolean(geometry.cacheInfo?.stale), limited: Boolean(geometry.cacheInfo?.limited) }]);
      const old = geometry.cacheInfo?.stale;
      setNotice(msg((selectedPoint.kind === 'business' ? 'La marca es la ubicación aproximada del local, no la posición de las mesas. Toca las mesas en el mapa para una estimación de ese punto.' : 'Cálculo aproximado para el punto elegido, no para todo el recinto.') + (old ? ' Los edificios se guardaron hace más de 30 días.' : '') + (geometry.cacheInfo?.limited ? ' La zona guardada tiene cobertura reducida.' : ''), (selectedPoint.kind === 'business' ? 'The marker shows the approximate business location, not its tables. Tap the tables on the map for an estimate at that point.' : 'Approximate calculation for the selected point, not the whole area.') + (old ? ' Building data was saved over 30 days ago.' : '') + (geometry.cacheInfo?.limited ? ' The saved area has limited coverage.' : '')));
    } catch { if (request.current === seq) setError(previous ? msg('No se han podido actualizar los edificios; seguimos usando los datos guardados.', 'Could not update buildings; saved data is still in use.') : msg('No hay edificios suficientes disponibles para calcular la luz de este punto.', 'Not enough building data is available to calculate light at this point.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  function selectOutdoor(choice) {
    const seq = ++request.current;
    const point = { ...choice.point, id: `outside-${choice.direction}`, kind: 'approx', name: `Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.i18nName?.es || selected.name}`, i18nName: msg(`Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.i18nName?.es || selected.name}`, `Point ${translateDirection('en', choice.direction.toLocaleLowerCase('es'))} of ${selected.i18nName?.en || selected.name}`) };
    const area = coverage.find((item) => distanceMetres(item, selected) < 5);
    setCoverage((previous) => [...previous, { ...point, radius: choice.scene.radius, source: area?.source, stale: Boolean(area?.stale), limited: Boolean(area?.limited) }]);
    setSelected(point); focusCamera(point, seq); setError(''); setBusy(''); setSheetExpanded(false);
    sheetScroll.current?.scrollTo({ y: 0, animated: false });
    setNotice(msg('Punto exterior aproximado; confirma en el mapa dónde están las mesas.', 'Approximate outdoor point; check where the tables are on the map.'));
  }

  async function useLocation() {
    const seq = ++request.current; setBusy(msg('Buscando tu ubicación…', 'Finding your location…')); setError(''); setNotice(''); setNearbySourceFailure(false);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('No se ha dado permiso. Puedes mover el mapa y buscar desde ahí.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (request.current !== seq) return;
      const point = { latitude: result.coords.latitude, longitude: result.coords.longitude };
      if (!validCoordinate(point)) throw new Error('No hemos podido localizarte.');
      myLocation.current = point;
      focusCamera(point, seq); setOriginLabel('Tu ubicación');
      setPlaces([]); setSelected(null); setBuildings([]); setCoverage([]); setResultsType(null);
      setNotice(msg('Ubicación lista. Busca cerca cuando quieras.', 'Location ready. Search nearby whenever you like.'));
    } catch (err) { if (request.current === seq) setError(describeError(err, 'No hemos podido localizarte.', 'Could not find your location.')); }
    finally { if (request.current === seq) setBusy(''); }
  }

  function goToCity(city) {
    const seq = ++request.current;
    const point = city === 'barcelona' ? { latitude: 41.39172, longitude: 2.16495 } : DEFAULT_LOCATION;
    focusCamera(point, seq); setOriginLabel('Zona del mapa');
    setPlaces([]); setSelected(null); setBuildings([]); setCoverage([]); setResultsType(null);
    setBusy(''); setError(''); setNotice(''); setNearbySourceFailure(false);
    setSearchOpen(false); setMode('place'); setSheetExpanded(false);
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
      focusCamera(point, seq); setOriginLabel('Zona del mapa');
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
    setMode(value); setSheetExpanded(value === 'nearby'); setError(''); setNotice(''); setNearbySourceFailure(false);
    requestAnimationFrame(() => sheetScroll.current?.scrollTo({ y: 0, animated: false }));
  };
  const resultRows = (items) => items.slice(0, showAllResults ? 30 : 5).map((place) => {
    const resultState = resultsType === 'nearby' ? (nearbyStates[place.id] || 'unknown') : null;
    return <Pressable key={place.id} accessibilityRole="button" onPress={() => choosePoint(place)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
      <View style={styles.resultIcon}><Text style={styles.resultIconText}>{place.kind === 'public' ? '✳' : '⌖'}</Text></View>
      <View style={styles.resultBody}><Text style={styles.resultName}>{pointName(place)}</Text><Text style={styles.resultMeta}>{shortDistance(place.distance, language)} · {place.categoryUnknown ? t('Terraza registrada · tipo sin confirmar', 'Registered outdoor seating · type unconfirmed') : place.kind === 'business' ? t('Posición de mesas desconocida', 'Table location unknown') : t('Punto aproximado', 'Approximate point')}{place.municipalPeriod ? t(` · ${place.municipalPeriod.semester === 1 ? '1.er' : '2.º'} sem. ${place.municipalPeriod.year}`, ` · H${place.municipalPeriod.semester} ${place.municipalPeriod.year}`) : ''}</Text>{resultState && <Text style={[styles.resultStatus, { color: statusColor[resultState] }]}>{statusText[resultState]} {endEnabled ? t(`de ${formatTime(minutes)} a ${clockTime(endMinutes)}`, `from ${formatTime(minutes)} to ${clockTime(endMinutes)}`) : t(`a las ${formatTime(minutes)}`, `at ${formatTime(minutes)}`)}</Text>}</View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.arrow}>›</Text>
    </Pressable>;
  });
  const feedback = <>
    {!!busy && <Loading text={localized(busy)} />}
    {!!error && <View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{localized(error)}</Text></View>}
    {!!notice && <Text style={styles.notice}>{localized(notice)}</Text>}
    {nearbySourceFailure && !error && <Text accessibilityRole="alert" style={styles.notice}>{t('Algunas fuentes no están disponibles; los resultados pueden estar incompletos.', 'Some sources are unavailable; results may be incomplete.')}</Text>}
    {searchNeedsRefresh && !busy && (searchOpen || mode === 'nearby') && <Pressable accessibilityRole="button" onPress={() => { forceSearch.current = true; if (searchOpen) void search(); else void findNearby(); }} style={styles.textAction}><Text style={styles.textActionLabel}>{t('Actualizar resultados', 'Refresh results')}</Text></Pressable>}
  </>;
  const mapAction = shadows.limitExceeded ? undefined
    : shadowFailed ? () => setMapRetry((value) => value + 1)
      : mapFailed ? (mapStale ? updateSavedMap : () => setMapRetry((value) => value + 1))
        : !shadowPending && mapStale ? updateSavedMap : undefined;
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
    {visiblePlaces.some((place) => place.municipalPeriod) && <Text style={styles.small}>{t('Fuente:', 'Source:')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://opendata-ajuntament.barcelona.cat/data/en/dataset/terrasses-comercos-vigents')}>{t('Ayuntamiento de Barcelona', 'Barcelona City Council')}</Text> · <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://creativecommons.org/licenses/by/4.0/')}>CC BY 4.0</Text>. {t('Autorizaciones; apertura y posición de mesas sin confirmar.', 'Permits; opening and table positions unconfirmed.')}</Text>}
    {resultsType === 'nearby' && <Text style={styles.small}>{t('Los lugares sin datos siguen apareciendo identificados. Se analizan hasta 6 puntos exteriores (2 con datos municipales). La franja se estima cada 30 minutos; no incluye árboles.', 'Places without data remain visible and labelled. Up to 6 outdoor points are analysed (2 with municipal data). Time ranges are sampled every 30 minutes; trees are not included.')}</Text>}
  </View>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <StatusBar style="dark" />
    <View style={styles.app} accessibilityElementsHidden={searchOpen} importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'} {...(Platform.OS === 'web' ? { 'aria-hidden': searchOpen, inert: searchOpen } : {})}>
      <View style={[styles.mapArea, { bottom: sheetHeight }]}>
        <MapCanvas camera={camera} places={resultsAreForMode ? visiblePlaces : []} selected={selected ? { ...selected, name: pointName(selected) } : null} language={language} shadows={shadows} groundShadow={currentShadowResult?.uri ? currentShadowResult : null} sun={mapSun} view3D={view3D} on3DAvailable={(available) => { setMap3DAvailable(available); if (!available) setView3D(false); }} onMove={(point) => {
          const pending = pendingCamera.current;
          if (pending && Date.now() < pending.until && distanceMetres(pending, point) > 40) return;
          pendingCamera.current = null;
          const bounds = viewportBounds(point.bounds);
          if (!bounds) {
            setMapBuildings(null);
            setMapIssue(true);
            setMapFailed(false);
            setMapStatus(msg('Acerca el mapa para cargar las sombras.', 'Zoom in to load shadows.'));
          }
          setCenter({ latitude: point.latitude, longitude: point.longitude });
          setMapBounds((previous) => bounds?.join(',') === previous?.join(',') ? previous : bounds);
          setVisibleBounds((previous) => point.visibleBounds?.join(',') === previous?.join(',') ? previous : point.visibleBounds);
          setOriginLabel(myLocation.current && distanceMetres(myLocation.current, point) < 25 ? 'Tu ubicación' : 'Zona del mapa');
        }} onPick={choosePoint} onPlace={choosePoint} />
        {mapBuildings?.source === 'osm' && <Text accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={styles.mapAttribution}>Datos © OpenStreetMap</Text>}
        {!map3DAvailable && <Text style={styles.mapFallback}>{t('3D no disponible · mapa en 2D', '3D unavailable · showing 2D map')}</Text>}
        {(mapIssue || shadows.limitExceeded || shadowPending || shadowFailed || sunStatus) && <Text accessibilityRole={mapAction ? 'button' : undefined} onPress={mapAction} style={[styles.mapFallback, { top: map3DAvailable ? 115 : 150 }]}>{shadows.limitExceeded ? t('Acerca el mapa para ver las sombras.', 'Zoom in to see the shadows.') : shadowFailed ? t('No se han podido dibujar las sombras. Toca para reintentar.', 'Could not draw shadows. Tap to retry.') : mapFailed ? localized(mapStatus) : shadowPending ? t('Calculando sombras de la zona…', 'Calculating shadows in this area…') : mapStale ? localized(mapStatus) : sunStatus === 'night' ? t('Es de noche a esta hora. Cambia la hora para ver sombras.', 'It is night at this time. Change the time to see shadows.') : sunStatus === 'low' ? t('El sol está muy bajo. Cambia la hora para ver sombras.', 'The sun is too low. Change the time to see shadows.') : localized(mapStatus)}</Text>}
      </View>
      {Platform.OS !== 'web' && <ShadowRasterizer shadows={shadows} bounds={visibleBounds} retryToken={mapRetry} onReady={acceptShadowResult} onError={(failure) => acceptShadowResult({ ...failure, failed: true })} />}
      <View pointerEvents="box-none" style={styles.topControls}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}><Text style={styles.brand}><Text style={styles.brandSun}>☼ </Text>Rato al Sol<Text style={styles.accent}>.</Text></Text></View>
          <View style={styles.languageControl} accessibilityRole="radiogroup" accessibilityLabel="Idioma / Language">{['es', 'en'].map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'es' ? 'Español' : 'English'} accessibilityState={{ checked: language === value }} {...(Platform.OS === 'web' ? { 'aria-checked': language === value } : {})} onPress={() => chooseLanguage(value)} style={[styles.languageOption, language === value && styles.languageSelected]}><Text style={[styles.languageText, language === value && styles.languageSelectedText]}>{value.toUpperCase()}</Text></Pressable>)}</View>
        </View>
        <View style={styles.searchBarRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Buscar lugar, ciudad o dirección', 'Search for a place, city or address')} onPress={() => { setView('place'); setSearchOpen(true); }} style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}><Text style={styles.searchIcon}>⌕</Text><Text style={styles.searchPlaceholder} numberOfLines={1}>{t('Busca un lugar', 'Search for a place')}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={view3D ? t('Ver mapa en 2D', 'View map in 2D') : t('Ver mapa en 3D', 'View map in 3D')} accessibilityState={{ disabled: !map3DAvailable, pressed: view3D }} disabled={!map3DAvailable} onPress={() => setView3D(!view3D)} style={({ pressed }) => [styles.locationButton, !map3DAvailable && styles.disabled, pressed && styles.pressed]}><Text style={styles.mapModeText}>{view3D ? '3D' : '2D'}</Text></Pressable>
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
              {Platform.OS !== 'web' && selected && coverage.some((area) => (area.stale || area.limited) && distanceMetres(area, selected) < 5) && <Pressable accessibilityRole="button" onPress={() => selectPoint(selected, true)} style={styles.textAction}><Text style={styles.textActionLabel}>{t('Actualizar edificios de este punto', 'Update buildings for this point')}</Text></Pressable>}
              {Platform.OS !== 'web' && <><Text style={styles.small}>{t('Para abrir zonas y búsquedas visitadas más rápido, se guardan datos y consultas en este dispositivo.', 'To reopen visited areas and searches faster, data and queries are saved on this device.')}</Text><Pressable accessibilityRole="button" onPress={clearSavedData} style={styles.textAction}><Text style={styles.textActionLabel}>{t('Borrar datos guardados', 'Clear saved data')}</Text></Pressable>{!!cacheNotice && <Text accessibilityRole="alert" style={styles.small}>{localized(cacheNotice)}</Text>}</>}
              <Text style={styles.small}>{t('Datos de', 'Data from')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>OpenStreetMap</Text>, <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://datos.madrid.es/dataset/300750-0-servicio-mapas')}>{t('Ayuntamiento de Madrid', 'Madrid City Council')}</Text> {t('y', 'and')} <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://opendata-ajuntament.barcelona.cat/data/en/dataset/terrasses-comercos-vigents')}>{t('Ayuntamiento de Barcelona', 'Barcelona City Council')}</Text> (<Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL('https://creativecommons.org/licenses/by/4.0/')}>CC BY 4.0</Text>). {t('No indican apertura ni disponibilidad.', 'Results do not indicate opening times or availability.')}</Text>
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
            <Text style={styles.small}>{t('La ubicación solo se usa si la eliges. Consultamos OpenStreetMap y los datos municipales disponibles.', 'Your location is only used if you choose it. We consult OpenStreetMap and available city data.')}</Text>
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
          <View style={styles.cityShortcuts}><Pressable accessibilityRole="button" onPress={() => goToCity('barcelona')} style={styles.cityShortcut}><Text style={styles.cityShortcutText}>Barcelona ↗</Text></Pressable><Pressable accessibilityRole="button" onPress={() => goToCity('madrid')} style={styles.cityShortcut}><Text style={styles.cityShortcutText}>Madrid ↗</Text></Pressable></View>
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
  searchBarRow: { flexDirection: 'row', gap: 7 }, searchBar: { flex: 1, minWidth: 0, minHeight: 50, backgroundColor: '#fffdf8', borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, elevation: 4, shadowColor: '#263f32', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, searchIcon: { fontSize: 28, color: '#304a3a', lineHeight: 32 }, searchPlaceholder: { color: '#79867b', fontSize: 14, flex: 1 }, locationButton: { width: 46, minHeight: 50, borderRadius: 15, backgroundColor: '#fffdf8', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#263f32', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, locationIcon: { color: '#304a3a', fontSize: 27 }, mapModeText: { color: '#304a3a', fontSize: 13, fontWeight: '800' }, mapFallback: { position: 'absolute', top: 115, alignSelf: 'center', maxWidth: '90%', textAlign: 'center', backgroundColor: '#fffcf5', color: '#526b5b', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, fontSize: 11 }, mapAttribution: { position: 'absolute', bottom: 4, right: 6, backgroundColor: '#fffcf5', color: '#304a3a', fontSize: 10, paddingHorizontal: 4, paddingVertical: 2 },
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
  modalSafe: { flex: 1, backgroundColor: '#fffcf5' }, modalContent: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 18 }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 }, backIcon: { color: '#304b3b', fontSize: 36, lineHeight: 42 }, modalTitle: { color: '#30483a', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 23, fontWeight: '700' }, searchInputRow: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minWidth: 0, minHeight: 50, backgroundColor: '#f2f0e7', borderRadius: 12, paddingHorizontal: 13, fontSize: 15, color: '#263e31' }, searchResults: { paddingBottom: 30, paddingTop: 14 }, cityShortcuts: { flexDirection: 'row', gap: 8, marginTop: 12 }, cityShortcut: { minHeight: 44, borderWidth: 1, borderColor: '#d8ddcf', borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }, cityShortcutText: { color: '#405b49', fontSize: 13, fontWeight: '700' },
});
