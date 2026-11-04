import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import { createShadowRasterPath } from './shadow-raster-path.mjs';

let nextFile = 0;
const removeLater = (uri) => {
  if (uri) setTimeout(() => { FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); }, 10000);
};

// Render outside the MapView. Work is split into small JavaScript batches;
// SVG rasterization and PNG encoding are native and may still pause the UI.
// onReady receives {uri, bounds}; onError receives no sensitive geometry.
export function ShadowRasterizer({ shadows, bounds, onReady, onError }) {
  const svg = useRef(null), callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [job, setJob] = useState(null);

  useEffect(() => {
    let cancelled = false, timer;
    setJob(null);
    if (!shadows?.features?.length || !bounds) return;
    try {
      const builder = createShadowRasterPath(shadows, bounds);
      const advance = () => {
        if (cancelled) return;
        try {
          if (builder.step(100)) setJob({ ...builder.result(), source: shadows, area: bounds });
          else timer = setTimeout(advance, 0);
        } catch { callbacks.current.onError?.(); }
      };
      // Let the time slider and map finish moving before preparing the mask.
      timer = setTimeout(advance, 180);
    } catch { callbacks.current.onError?.(); }
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shadows, bounds]);

  useEffect(() => {
    if (!job || job.source !== shadows || job.area !== bounds) return;
    let cancelled = false, file, watchdog;
    const timer = setTimeout(() => {
      try {
        if (!svg.current || !FileSystem.cacheDirectory) { callbacks.current.onError?.(); return; }
        watchdog = setTimeout(() => { cancelled = true; callbacks.current.onError?.(); }, 10000);
        svg.current.toDataURL(async (base64) => {
          clearTimeout(watchdog);
          if (cancelled) return;
          if (!base64) { callbacks.current.onError?.(); return; }
          file = `${FileSystem.cacheDirectory}rato-shadow-${Date.now()}-${nextFile++}.png`;
          try {
            await FileSystem.writeAsStringAsync(file, base64, { encoding: 'base64' });
            if (cancelled) { removeLater(file); return; }
            callbacks.current.onReady?.({ uri: file, bounds: job.bounds, source: job.source, area: job.area });
          } catch { removeLater(file); if (!cancelled) callbacks.current.onError?.(); }
        }, { width: job.width, height: job.height });
      } catch { clearTimeout(watchdog); callbacks.current.onError?.(); }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(watchdog); removeLater(file); };
  }, [job, shadows, bounds]);

  if (!job || job.source !== shadows || job.area !== bounds) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
    <Svg ref={svg} width={job.width} height={job.height} viewBox={`0 0 ${job.width} ${job.height}`}>
      <Path d={job.d} fill="#304349" fillOpacity={0.26} fillRule="nonzero" />
    </Svg>
  </View>;
}

// Give MapView an Overlay with bounds before assigning the image. On Apple
// Maps the renderer is created when the image loads, so this reduces its race.
// Render the Overlay itself as a direct MapView child, not a wrapper component.
export function useGroundShadowImage(image) {
  const [readyUri, setReadyUri] = useState(null);
  useEffect(() => {
    if (!image?.uri) return;
    const timer = setTimeout(() => setReadyUri(image.uri), 100);
    return () => clearTimeout(timer);
  }, [image]);
  return image?.uri && readyUri === image.uri ? { uri: image.uri } : undefined;
}
