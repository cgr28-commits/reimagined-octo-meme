/** Local-only stand-in for Leaflet when it isn't installed (CI uses the real one). */
type Any = Record<string, unknown>;
const chain = (target: Any = {}): Any =>
  new Proxy(target, {
    get: (t, key) => (key in t ? t[key as string] : () => chain()),
  });
const L = {
  map: (el: HTMLElement) => {
    el.setAttribute("data-leaflet-stub", "true");
    el.textContent = "Map (Leaflet not installed in this sandbox)";
    return chain({ remove: () => undefined });
  },
  tileLayer: () => chain(),
  marker: () => chain(),
  circle: () => chain(),
  divIcon: () => ({}),
  latLngBounds: () => chain(),
};
export default L;
