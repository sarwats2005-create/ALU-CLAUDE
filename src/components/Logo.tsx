import { cx } from '@/lib/cx';

/** ALU FACTORY mark: white industrial factory on a Royal Blue rounded square (the owner's icon). */
export function Logo({ size = 36, className, framed }: { size?: number; className?: string; framed?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/app-icon.png"
      width={size}
      height={size}
      alt="ALU FACTORY"
      className={cx('shrink-0 select-none', framed && 'rounded-[24%]', className)}
      draggable={false}
    />
  );
}
