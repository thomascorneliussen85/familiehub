import fetch from 'node-fetch';
import { config } from '../config.js';

const ENTUR_URL = 'https://api.entur.io/journey-planner/v3/graphql';
let cache = { fetchedAt: 0, data: null };
const CACHE_MS = 60 * 1000;

const QUERY = `
query($id: String!) {
  stopPlace(id: $id) {
    name
    estimatedCalls(numberOfDepartures: 8) {
      expectedArrivalTime
      expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney {
        line { publicCode transportMode }
      }
    }
  }
}`;

export async function getBusDepartures() {
  const { stopId, clientName } = config.entur;
  if (!stopId) {
    return { configured: false, stopName: null, departures: [] };
  }
  if (Date.now() - cache.fetchedAt < CACHE_MS && cache.data) {
    return cache.data;
  }

  const res = await fetch(ENTUR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ET-Client-Name': clientName,
    },
    body: JSON.stringify({ query: QUERY, variables: { id: stopId } }),
  });
  if (!res.ok) throw new Error(`Entur-API svarte med status ${res.status}`);
  const json = await res.json();
  const stopPlace = json?.data?.stopPlace;
  const departures = (stopPlace?.estimatedCalls ?? []).map((call) => ({
    line: call.serviceJourney?.line?.publicCode ?? '?',
    mode: call.serviceJourney?.line?.transportMode ?? 'bus',
    destination: call.destinationDisplay?.frontText ?? '',
    time: call.expectedDepartureTime ?? call.expectedArrivalTime,
  }));
  const data = { configured: true, stopName: stopPlace?.name ?? null, departures };
  cache = { fetchedAt: Date.now(), data };
  return data;
}
