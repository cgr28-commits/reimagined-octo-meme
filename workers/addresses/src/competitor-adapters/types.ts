import type { CompetitorId, IntelligenceVehicleClass } from "../../shared/pricing-intelligence";

export type CompetitorQuoteRequest = {
  pickupLabel: string;
  dropoffLabel: string;
  tripDate?: string;
  tripTime?: string;
  passengers: number;
  suitcases: number;
  vehicleClass: IntelligenceVehicleClass;
  returnJourney: boolean;
};

export type CompetitorQuoteResult = {
  competitor: CompetitorId;
  priceGbp?: number;
  vehicleClass?: string;
  unavailableReason?: string;
  fetchedAt: string;
};

export interface CompetitorPricingAdapter {
  id: CompetitorId;
  fetchQuote(request: CompetitorQuoteRequest): Promise<CompetitorQuoteResult>;
}
