/**
 * Phone receptionist address lookup helpers — decide confirm vs clarify from
 * Google / served-airport suggestions. Never invents place IDs or coordinates.
 */

import type { AddressSuggestion } from "./google-places";

export type VoiceAddressRole = "pickup" | "dropoff";

export type VoiceAddressCandidate = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
};

export type VoiceAddressDecision =
  | {
      status: "confirm";
      candidate: VoiceAddressCandidate;
      say: string;
    }
  | {
      status: "clarify";
      options: VoiceAddressCandidate[];
      say: string;
    }
  | {
      status: "need_more";
      say: string;
    };

const MAX_CLARIFY = 3;

function asCandidate(item: AddressSuggestion): VoiceAddressCandidate | null {
  const placeId = String(item.id ?? "").trim();
  const label = String(item.label ?? item.address ?? "").trim();
  if (!placeId || !label) return null;
  return {
    placeId,
    label,
    mainText: String(item.mainText ?? label.split(",")[0] ?? label).trim() || label,
    secondaryText: String(item.secondaryText ?? "").trim(),
  };
}

/** Short spoken place for confirmation — hotel/street + area, not the full GB/IE suffix. */
export function spokenPlaceConfirmLabel(candidate: VoiceAddressCandidate): string {
  const main = candidate.mainText.replace(/\s+/g, " ").trim();
  const secondary = candidate.secondaryText.replace(/\s+/g, " ").trim();
  if (!secondary) return main;
  // Prefer a short area line: "Lanyon Place, Belfast" → keep first 1–2 commas.
  const shortSecondary = secondary
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(UK|United Kingdom|Ireland|Republic of Ireland)$/i.test(p))
    .slice(0, 2)
    .join(", ");
  if (!shortSecondary) return main;
  if (/^on\s+/i.test(shortSecondary)) return `${main} ${shortSecondary}`;
  // Hotels often have the street in secondary — “on …” reads naturally.
  if (/\b(street|road|avenue|place|lane|drive|way|court|close|crescent)\b/i.test(shortSecondary)) {
    return `${main} on ${shortSecondary}`;
  }
  return `${main}, ${shortSecondary}`;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !["the", "at", "in", "on", "near", "to", "from"].includes(t)),
  );
}

/** How well a suggestion covers the caller's words (0–1). */
export function voiceAddressMatchScore(query: string, candidate: VoiceAddressCandidate): number {
  const q = tokenSet(query);
  if (!q.size) return 0;
  const hay = tokenSet(`${candidate.mainText} ${candidate.secondaryText} ${candidate.label}`);
  let hit = 0;
  for (const t of q) if (hay.has(t)) hit += 1;
  return hit / q.size;
}

/**
 * Turn suggestion list into one confirm, a short clarify list, or ask-for-more.
 * Does not call Google — callers supply already-filtered suggestions.
 */
export function decideVoiceAddressMatches(
  query: string,
  suggestions: AddressSuggestion[],
  role: VoiceAddressRole = "pickup",
): VoiceAddressDecision {
  const trimmed = query.trim();
  const roleWord = role === "dropoff" ? "destination" : "pickup";
  const needMoreSay =
    role === "dropoff"
      ? "I couldn't quite place that destination. Could you give me the hotel or street name, or a postcode?"
      : "I couldn't quite place that pickup. Could you give me the hotel or street name, or a postcode?";

  if (trimmed.length < 3) {
    return {
      status: "need_more",
      say: role === "dropoff" ? "Where would you like us to take you?" : "Where would you like us to pick you up from?",
    };
  }

  const candidates = suggestions
    .map(asCandidate)
    .filter((c): c is VoiceAddressCandidate => Boolean(c))
    .slice(0, 8);

  if (!candidates.length) {
    return { status: "need_more", say: needMoreSay };
  }

  const scored = candidates
    .map((c) => ({ c, score: voiceAddressMatchScore(trimmed, c) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const second = scored[1];

  // One result, or a clear winner → confirm briefly.
  const confidentSingleton = candidates.length === 1;
  const confidentLead =
    top.score >= 0.6 && (!second || top.score - second.score >= 0.25 || second.score < 0.45);

  if (confidentSingleton || confidentLead) {
    const label = spokenPlaceConfirmLabel(top.c);
    return {
      status: "confirm",
      candidate: top.c,
      say: `Certainly. Is that ${label}?`,
    };
  }

  const options = scored.slice(0, MAX_CLARIFY).map((s) => s.c);
  if (options.length === 1) {
    const label = spokenPlaceConfirmLabel(options[0]!);
    return {
      status: "confirm",
      candidate: options[0]!,
      say: `Certainly. Is that ${label}?`,
    };
  }

  const spoken = options.map((o) => o.mainText).filter(Boolean);
  if (spoken.length === 2) {
    return {
      status: "clarify",
      options,
      say: `I've two close matches for that ${roleWord} — is it ${spoken[0]}, or ${spoken[1]}?`,
    };
  }
  return {
    status: "clarify",
    options,
    say: `I've a few matches — is it ${spoken.slice(0, -1).join(", ")}, or ${spoken[spoken.length - 1]}?`,
  };
}

/** After the caller confirms a placeId from a previous search. */
export function voiceAddressConfirmedSay(displayLabel: string, role: VoiceAddressRole = "pickup"): string {
  const short = displayLabel.split(",").slice(0, 2).join(",").trim() || displayLabel;
  if (role === "dropoff") {
    return `That's grand — ${short}. What date do you need the car?`;
  }
  return `No problem. And where are we taking you?`;
}
