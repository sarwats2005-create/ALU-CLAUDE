import { LoaderOverlay } from '@/components/Loader';

/** Shown by Next.js while any page inside the app is loading (moving between pages, first load). */
export default function Loading() {
  return <LoaderOverlay />;
}
