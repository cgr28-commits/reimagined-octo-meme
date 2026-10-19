import { withBasePath } from '@/lib/paths';

/** Picture sources apply at desktop widths only; existing mobile fallbacks stay untouched. */
export default function DesktopVehicleSources({ vehicle, sizes = '100vw' }: {
  vehicle: 'saloon' | 'estate' | 'executive' | 'minibus';
  sizes?: string;
}) {
  const asset = vehicle === 'executive' ? 'business-class' : vehicle;
  return <>{(['avif', 'webp'] as const).map(format => (
    <source key={format} media="(min-width: 1024px)" type={`image/${format}`} sizes={sizes}
      srcSet={[640, 960, 1600].map(width => `${withBasePath(`/images/vehicles/desktop/${asset}-${width}.${format}`)} ${width}w`).join(', ')} />
  ))}</>;
}
