"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "my-airport-taxi-ni-pickup-address";

async function reverseGeocode(
  lat: number,
  lon: number,
  airportCode: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });

  if (airportCode) {
    params.set("airport", airportCode);
  }

  const response = await fetch(`/api/geocode?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { address?: string };
  return data.address ?? null;
}

export function usePickupAddress(airportCode = "") {
  const [address, setAddressState] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const setAddress = useCallback((value: string) => {
    setAddressState(value);
    setLocationError(null);

    if (value.trim()) {
      localStorage.setItem(STORAGE_KEY, value.trim());
    }
  }, []);

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationError("Location is not supported on this device.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const detected = await reverseGeocode(
            position.coords.latitude,
            position.coords.longitude,
            airportCode,
          );

          if (detected) {
            setAddress(detected);
          } else {
            setLocationError(
              airportCode === "DUB"
                ? "Could not resolve your address. Please enter a Northern Ireland or Republic of Ireland address."
                : "Could not resolve your address. Please enter a Northern Ireland address.",
            );
          }
        } catch {
          setLocationError("Could not detect your address. Please enter it manually.");
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        setLocationError("Location access denied. Enter your address or tap Use My Location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    );
  }, [airportCode, setAddress]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setAddressState(saved);
      return;
    }

    void detectLocation();
  }, [detectLocation]);

  return {
    address,
    setAddress,
    detectLocation,
    isLocating,
    locationError,
  };
}
