// One rule for "which vehicle picture belongs to this driver". Same logic on the backend,
// the client and the driver app, so all three always show the same vehicle.
//   b = black, bl = blue, r = red, g = gray, w = white
export type VehicleLike = {
  type?: string; color?: string; brand?: string; cargoType?: string; refrigerationType?: string;
  pricingCategory?: string[] | string; vehicleCategory?: string[] | string;
} | null | undefined;

const lowerList = (x: unknown): string[] =>
  (Array.isArray(x) ? x : typeof x === 'string' && x ? [x] : []).map((s) => String(s).toLowerCase().trim());

export function normalizeVehicleColor(color?: string): 'b' | 'bl' | 'r' | 'g' | 'w' {
  const c = String(color || '').toLowerCase().trim();
  if (!c) return 'b';
  if (c === 'b' || c === 'bl' || c === 'r' || c === 'g' || c === 'w') return c;
  if (c.includes('blue') || c.includes('navy')) return 'bl';
  if (c.includes('red') || c.includes('burgundy')) return 'r';
  if (c.includes('white') || c.includes('beige')) return 'w';
  if (c.includes('gray') || c.includes('grey') || c.includes('silver')) return 'g';
  return 'b';
}

const VARIANTS: Record<string, string[]> = {
  bicycle: ['b', 'bl', 'r'],
  motorbike: ['b', 'bl', 'r'],
  bus: ['b', 'bl', 'g', 'w'],
  car: ['b', 'bl', 'g', 'r', 'w'],
  closed: ['b', 'bl', 'g', 'r', 'w'],
  open: ['b', 'bl', 'g', 'r', 'w'],
  truck: ['b', 'bl', 'g', 'r', 'w'], // refrigerated
};

/** Returns the picture name, e.g. "abicyclebl" (blue bicycle) or "acarg" (gray car). */
export function resolveVehicleIconName(v: VehicleLike): string {
  const type = String(v?.type || '').toLowerCase().trim();
  const cats = [...lowerList(v?.pricingCategory), ...lowerList(v?.vehicleCategory)];
  const has = (s: string) => cats.some((c) => c.includes(s));
  let base = 'car';
  if (type === 'bicycle' || type === 'cyclist' || has('bicycle')) base = 'bicycle';
  else if (type === 'motorbike' || type === 'motorcycle' || has('motorbike')) base = 'motorbike';
  else if (type === 'minibus' || type === 'bus' || has('xxl') || cats.includes('bus')) base = 'bus';
  else if (type === 'truck' || has('truck')) {
    const refrigerated = String(v?.refrigerationType || '').toLowerCase() === 'refrigerated' || has('refrigerated');
    const open = String(v?.cargoType || '').toLowerCase() === 'open' || has('open_truck');
    base = refrigerated ? 'truck' : open ? 'open' : 'closed';
  } else if (has('aletwende')) return 'aletwende1';
  else if (String(v?.brand || '').toLowerCase() === 'women') return 'acarg'; // women-only cars: gray car
  const col = normalizeVehicleColor(v?.color);
  const variant = VARIANTS[base].includes(col) ? col : 'b';
  return `a${base}${variant}`;
}

/**
 * Returns the correct vehicle PNG asset for a driver based on their
 * vehicleCategory (from Firestore orders/drivers) and the color they
 * registered for their vehicle.
 *
 * Falls back to the black variant when no color-specific asset exists.
 */
export function getDriverVehicleIcon(vehicleCategory: string, color: string): string {
  const cat = (vehicleCategory || '').toLowerCase().trim();
  // 'Light Blue', 'Dark Gray', 'Silver' ... -> blue / gray / white / red / black
  const col = ({ b: 'black', bl: 'blue', r: 'red', g: 'gray', w: 'white' } as Record<string, string>)[normalizeVehicleColor(color)];

  // Bicycle
  if (cat === 'bicycle') {
    if (col === 'blue') return '/cars/abicyclebl.png';
    if (col === 'red') return '/cars/abicycler.png';
    return '/cars/abicycleb.png';
  }

  // Minibus / bus
  if (cat === 'minibus' || cat === 'bus' || cat === 'xl' || cat === 'xxl') {
    if (col === 'blue') return '/cars/abusbl.png';
    if (col === 'gray' || col === 'grey') return '/cars/abusg.png';
    if (col === 'white') return '/cars/abusw.png';
    return '/cars/abusb.png';
  }

  // Aletwende car (fixed — no colour variants)
  if (cat === 'aletwende' || cat === 'ride_aletwende') {
    return '/cars/aletwende1.png';
  }

  // Car (default passenger vehicle)
  if (cat === 'car') {
    if (col === 'blue') return '/cars/acarbl.png';
    if (col === 'gray' || col === 'grey') return '/cars/acarg.png';
    if (col === 'red') return '/cars/acarr.png';
    if (col === 'white') return '/cars/acarw.png';
    return '/cars/acarb.png';
  }

  // Closed truck
  if (cat === 'closed_truck' || cat === 'closed truck' || cat === 'delivery_truck_closed') {
    if (col === 'blue') return '/cars/aclosedbl.png';
    if (col === 'gray' || col === 'grey') return '/cars/aclosedg.png';
    if (col === 'red') return '/cars/aclosedr.png';
    if (col === 'white') return '/cars/aclosedw.png';
    return '/cars/aclosedb.png';
  }

  // Open truck / flatbed
  if (cat === 'open_truck' || cat === 'open truck' || cat === 'delivery_truck_flatbed') {
    if (col === 'blue') return '/cars/aopenbl.png';
    if (col === 'gray' || col === 'grey') return '/cars/aopeng.png';
    if (col === 'red') return '/cars/aopenr.png';
    if (col === 'white') return '/cars/aopenw.png';
    return '/cars/aopenb.png';
  }

  // Refrigerated truck (and generic "truck")
  if (
    cat === 'truck' ||
    cat === 'refrigerated' ||
    cat === 'refrigerated_truck' ||
    cat === 'delivery_truck_refrigerated' ||
    cat === 'delivery_truck'
  ) {
    if (col === 'blue') return '/cars/atruckbl.png';
    if (col === 'gray' || col === 'grey') return '/cars/atruckg.png';
    if (col === 'red') return '/cars/atruckr.png';
    if (col === 'white') return '/cars/atruckw.png';
    return '/cars/atruckb.png';
  }

  // Motorbike
  if (cat === 'motorbike' || cat === 'motorcycle' || cat === 'delivery_motorbike') {
    if (col === 'blue') return '/cars/amotorbikebl.png';
    if (col === 'red') return '/cars/amotorbiker.png';
    return '/cars/amotorbikeb.png';
  }

  // Default: black car
  return '/cars/acarb.png';
}

/** URL of a picture name from resolveVehicleIconName, e.g. 'acarg' -> '/cars/acarg.png'. */
export const vehicleIconUrl = (name: string) => `/cars/${name}.png`;
