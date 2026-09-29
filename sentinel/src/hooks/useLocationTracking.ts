/**
 * Day 10: GPS tracking while the app is open. Call it once, in DashboardScreen:
 *   const gps = useLocationTracking();   // 'starting' | 'tracking' | 'denied' | 'error'
 *
 * Install: npx expo install expo-location
 *
 * This works in Expo Go. Tracking with the screen off (background) additionally
 * needs expo-task-manager, the expo-location config plugin with
 * isAndroidBackgroundLocationEnabled / isIosBackgroundLocationEnabled, and a
 * development build, because Expo Go ignores config plugins.
 * iOS ignores timeInterval, so there updates arrive as the phone moves rather
 * than every 3 seconds.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { speedKmhFromFix } from '../engine/geo';
import { useSentinelStore } from '../store/sentinelStore';

export type GpsStatus = 'starting' | 'tracking' | 'denied' | 'error';

export function useLocationTracking(): GpsStatus {
  const setUserLocation = useSentinelStore((s) => s.setUserLocation);
  const [status, setStatus] = useState<GpsStatus>('starting');

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let previous: { latitude: number; longitude: number; timestamp: number } | null = null;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (!cancelled) setStatus('denied');
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 0 },
        ({ coords, timestamp }) => {
          const current = { latitude: coords.latitude, longitude: coords.longitude, timestamp };
          setUserLocation({
            ...current,
            speedKmh: speedKmhFromFix(coords.speed, previous, current),
            heading: coords.heading ?? null,
            accuracyM: coords.accuracy ?? null,
          });
          previous = current;
        },
      );
      if (cancelled) {
        sub.remove();
      } else {
        subscription = sub;
        setStatus('tracking');
      }
    })().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [setUserLocation]);

  return status;
}
