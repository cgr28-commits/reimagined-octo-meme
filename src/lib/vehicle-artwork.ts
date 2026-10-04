/**
 * Illustrative category artwork. Not a promise of a particular make or model.
 *
 * Executive keeps the previous Saloon file (`quote-saloon.webp`).
 * Estate and 7-seater keep their existing files.
 *
 * Standard Saloon uses `public/images/vehicles/quote-standard-saloon.webp`
 * (1400×700 transparent cutout). The chooser used to leave this null, which
 * painted the empty grey frame.
 */
import { withBasePath } from "@/lib/paths";

export const STANDARD_SALOON_IMAGE: string | null = withBasePath(
  "/images/vehicles/quote-standard-saloon.webp",
);
