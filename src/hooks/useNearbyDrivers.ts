import { useEffect, useMemo, useState } from 'react';
import { rideService } from '../services/rideService';
import { calculateDistance } from '../utils/etaCalculation';
import type { MapMarker } from '../components/MapLibreMap';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { API_BASE } from '../config/api';
import { resolveVehicleIconName } from '../utils/vehicleIconHelper';

const MAX_DISTANCE_KM = 5;

// 'ride'     -> only vehicles that take passengers (direct trips)
// 'delivery' -> only vehicles that deliver / courier
// undefined  -> everything. A vehicle that does both shows on either map.
export type NearbyService = 'ride' | 'delivery';

const matchesService = (services: string[] | undefined, wanted?: NearbyService): boolean => {
  if (!wanted) return true;
  if (!services || services.length === 0) return true; // unknown: do not hide it
  const s = services.map((x) => String(x).toLowerCase());
  return wanted === 'ride' ? s.includes('ride') : s.some((x) => x === 'delivery' || x === 'courier' || x === 'delivery_truck');
};

export const useNearbyDrivers = (latitude: number | null, longitude: number | null, service?: NearbyService): MapMarker[] => {
  const [polled, setPolled] = useState<MapMarker[]>([]);
  const [onlineDrivers, setOnlineDrivers] = useState(new Map<string, { vehicleCategory: string; vehicleColor?: string; vehicleIcon?: string }>());
  const [locations, setLocations] = useState(new Map<string, { lat: number; lng: number }>());
  const [profileColors] = useState(new Map<string, string>());
  // picture name worked out from each driver's registered vehicle (type, colour, cargo, brand...)
  const [profileIcons, setProfileIcons] = useState(new Map<string, string>());
  const [profileServices, setProfileServices] = useState(new Map<string, string[]>());

  useEffect(() => {
    let cancelled = false;
    const missingIds = Array.from(onlineDrivers.entries())
      .filter(([id]) => !profileIcons.has(id))
      .map(([id]) => id);

    if (missingIds.length > 0) {
      Promise.all(missingIds.map(async (driverId) => {
        const driverSnapshot = await getDoc(doc(db, 'drivers', driverId));
        const data: any = driverSnapshot.exists() ? driverSnapshot.data() : null;
        if (!data) return null;
        const vehicle = { ...(data.vehicle || {}), brand: data.vehicle?.brand, color: data.vehicle?.color ?? data.color ?? data.vehicleColor };
        const services: string[] = Array.isArray(data.vehicle?.services) ? data.vehicle.services : [];
        return [driverId, resolveVehicleIconName(vehicle), services] as const;
      })).then((results) => {
        if (cancelled) return;
        setProfileIcons((previous) => {
          const next = new Map(previous);
          results.forEach((result) => { if (result) next.set(result[0], result[1]); });
          return next;
        });
        setProfileServices((previous) => {
          const next = new Map(previous);
          results.forEach((result) => { if (result) next.set(result[0], result[2]); });
          return next;
        });
      }).catch(() => undefined);
    }

    return () => { cancelled = true; };
  }, [onlineDrivers, profileIcons]);

  useEffect(() => {
    const stopDrivers = rideService.startDriversListener((drivers) => {
      setOnlineDrivers(new Map(Array.from(drivers.entries()).map(([id, driver]) => [id, { vehicleCategory: driver.vehicleCategory, vehicleColor: driver.vehicleColor, vehicleIcon: driver.vehicleIcon }])));
    });
    const stopLocations = rideService.startLocationsListener((nextLocations) => {
      setLocations(new Map(nextLocations));
    });
    return () => {
      stopDrivers();
      stopLocations();
    };
  }, []);

  const liveMarkers = useMemo(() => {
    if (latitude == null || longitude == null) return [];
    return Array.from(onlineDrivers.entries()).flatMap(([driverId, driver]) => {
      const location = locations.get(driverId);
      if (!location || calculateDistance(latitude, longitude, location.lat, location.lng) > MAX_DISTANCE_KM) return [];
      // services come from the driver profile; until it is loaded we do not draw the driver at all when filtering
      if (service && !profileServices.has(driverId)) return [];
      if (!matchesService(profileServices.get(driverId), service)) return [];
      return [{ id: `nearby-driver-${driverId}`, type: 'driver' as const, lat: location.lat, lng: location.lng, label: driver.vehicleCategory, vehicleType: driver.vehicleCategory, vehicleColor: driver.vehicleColor || profileColors.get(driverId), vehicleIcon: driver.vehicleIcon || profileIcons.get(driverId) }];
    });
  }, [latitude, longitude, locations, onlineDrivers, profileColors, profileIcons, profileServices, service]);

  // Fallback: if the direct database read gives nothing (blocked rules, WebView hiccup),
  // ask the backend for drivers around the client and refresh every 6 s.
  const roundedLat = latitude == null ? null : Math.round(latitude * 500) / 500;
  const roundedLng = longitude == null ? null : Math.round(longitude * 500) / 500;
  const hasLive = liveMarkers.length > 0;
  useEffect(() => {
    if (roundedLat == null || roundedLng == null || hasLive) { setPolled([]); return; }
    let stopped = false;
    const run = async () => {
      try {
        const response = await fetch(`${API_BASE}/nearbyDrivers?lat=${roundedLat}&lng=${roundedLng}&radiusKm=${MAX_DISTANCE_KM}`);
        const json = await response.json();
        if (stopped || !Array.isArray(json?.drivers)) return;
        setPolled(json.drivers.filter((d: any) => matchesService(d.services, service)).map((d: any) => ({
          id: `nearby-driver-${d.id}`, type: 'driver' as const, lat: Number(d.lat), lng: Number(d.lng),
          label: d.vehicleCategory, vehicleType: d.vehicleCategory, vehicleColor: d.color || undefined, vehicleIcon: d.icon || undefined,
        })));
      } catch { /* keep the last list */ }
    };
    void run();
    const timer = setInterval(run, 6000);
    return () => { stopped = true; clearInterval(timer); };
  }, [roundedLat, roundedLng, hasLive, service]);

  return hasLive ? liveMarkers : polled;
};

export const LUSAKA_DEFAULT = { lat: -15.3875, lng: 28.3228 };

export default useNearbyDrivers;
