// A raster belongs to one precise input scene and time. Reusing it for a
// different viewport, data version, centre, date or retry would be misleading.
export function shadowFrameMatches(frame, context) {
  return Boolean(frame && context && frame.area === context.area &&
    frame.buildings === context.buildings && frame.retryToken === context.retryToken && frame.generation === context.generation &&
    frame.timeKey != null && frame.timeKey === context.timeKey &&
    frame.latitude === context.latitude && frame.longitude === context.longitude);
}

// A frame may advance only after both the minimum display time and the next
// native image are ready; these two waits run concurrently.
export function playbackFrameReady(context, dwellFrame, futureFrame, nextTimeKey, native) {
  return shadowFrameMatches(dwellFrame, context) &&
    (!native || shadowFrameMatches(futureFrame, { ...context, timeKey: nextTimeKey }));
}
