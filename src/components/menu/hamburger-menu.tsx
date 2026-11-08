'use client';
/*
 * Springy menus (adapted from the hamburger-menu skill; styles in src/app/menu.css).
 *
 *   <DropdownMenu label="Sort" trigger={(p) => <button {...p}>Sort</button>}>
 *     <DropdownItem onSelect={() => setSort('new')}>Newest</DropdownItem>
 *   </DropdownMenu>
 *
 *   <MenuOverlay open={open} onClose={close} label="More" panelClassName="hm-panel-bottom">
 *     <MenuLink as={Link} href="/vault" icon={<Vault />}>Vault</MenuLink>
 *   </MenuOverlay>
 *
 * Everything renders on <body> (a blurred or transformed ancestor would trap position: fixed) and stays
 * mounted while its closing animation plays.
 */
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { cx } from '@/lib/cx';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keeps something mounted while its closing animation plays (`ms` = longest exit animation). */
export function usePresence(open: boolean, ms = 260) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), reducedMotion() ? 110 : ms);
    return () => window.clearTimeout(id);
  }, [open, ms]);
  return mounted;
}

const CloseCtx = createContext<() => void>(() => {});

/* ───────────── Full-screen menu panel (blurred page behind, rows bounce in one after another) ───────────── */

export function MenuOverlay({
  open,
  onClose,
  label,
  panelClassName,
  style,
  children,
}: {
  open: boolean;
  /** `refocus` is false when the menu closes because a link was followed. */
  onClose: (refocus: boolean) => void;
  label: string;
  panelClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const mounted = usePresence(open, 260);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !mounted) return;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Capture phase + stopPropagation: Escape / Tab are ours while the menu is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current(true);
      } else if (e.key === 'Tab' && panel.current) trapTab(e, panel.current);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, mounted]);

  if (!mounted || typeof document === 'undefined') return null;

  let i = 0;
  const items = Children.map(children, (child) =>
    isValidElement(child) ? (
      <li className="hm-item" style={{ '--i': i++ } as CSSProperties}>
        {child}
      </li>
    ) : null,
  );

  return createPortal(
    <div className="hm-overlay" data-state={open ? 'open' : 'closed'} style={style} onClick={() => closeRef.current(true)}>
      <div className="hm-backdrop" aria-hidden="true" />
      <nav ref={panel} className={cx('hm-panel', panelClassName)} aria-label={label} onClick={(e) => e.stopPropagation()}>
        <CloseCtx.Provider value={() => closeRef.current(false)}>
          <ul className="hm-list">{items}</ul>
        </CloseCtx.Provider>
      </nav>
    </div>,
    document.body,
  );
}

/** A row in a MenuOverlay. Pass `as={Link}` for client-side navigation. Following it closes the menu. */
export function MenuLink({
  href,
  icon,
  current,
  children,
  as: As = 'a',
}: {
  href: string;
  icon?: ReactNode;
  current?: boolean;
  children: ReactNode;
  as?: ElementType;
}) {
  const close = useContext(CloseCtx);
  return (
    <As href={href} className="hm-link" aria-current={current ? 'page' : undefined} onClick={close}>
      {icon ? <span className="hm-icon">{icon}</span> : null}
      <span className="hm-label">{children}</span>
      <ChevronRight className="hm-chevron h-[18px] w-[18px]" aria-hidden="true" />
    </As>
  );
}

/* ───────────── Anchored dropdown for any trigger (select-like lists and action menus) ───────────── */

export type DropdownTriggerProps = {
  ref: Ref<HTMLButtonElement>;
  'aria-haspopup': 'menu' | 'listbox';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
};

const ITEM_SEL = '[role="menuitem"]:not([aria-disabled="true"]), [role="option"]:not([aria-disabled="true"])';
const MAX_H = 384; // 24rem

export function DropdownMenu({
  trigger,
  label,
  role = 'menu',
  disabled,
  children,
}: {
  trigger: (props: DropdownTriggerProps) => ReactElement;
  label: string;
  /** 'listbox' for choosing a value (items take `selected`), 'menu' for actions. */
  role?: 'menu' | 'listbox';
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const mounted = usePresence(open, 190);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const [pos, setPos] = useState<CSSProperties>({});

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Under the trigger, the trigger's width at least; flips above when there is more room there; never off-screen.
  const place = useCallback(() => {
    const b = btn.current;
    const m = menu.current;
    if (!b || !m) return;
    const r = b.getBoundingClientRect();
    const rtl = getComputedStyle(b).direction === 'rtl';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Apply the final min-width before measuring, so the width used for alignment is the rendered one.
    const minW = Math.min(r.width, vw - 16);
    m.style.minWidth = `${minW}px`;
    const w = Math.min(m.offsetWidth, vw - 16);
    const natural = m.scrollHeight;
    const below = vh - r.bottom - 16;
    const above = r.top - 16;
    const up = natural > below && above > below;
    const maxH = Math.max(120, Math.min(MAX_H, up ? above : below));
    const h = Math.min(natural, maxH);
    const x = Math.max(8, Math.min(rtl ? r.right - w : r.left, vw - w - 8));
    setPos({
      minWidth: minW,
      maxHeight: maxH,
      '--hm-x': `${x}px`,
      '--hm-y': `${up ? r.top - 6 - h : r.bottom + 6}px`,
      '--hm-origin': `${up ? 'bottom' : 'top'} ${rtl ? 'right' : 'left'}`,
    } as CSSProperties);
  }, []);

  useLayoutEffect(() => {
    if (open && mounted) place();
  }, [open, mounted, place]);

  useEffect(() => {
    if (!open || !mounted) return;
    const m = menu.current;
    const items = () => Array.from(m?.querySelectorAll<HTMLElement>(ITEM_SEL) ?? []);
    const first = m?.querySelector<HTMLElement>('[aria-selected="true"]') ?? items()[0];
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest' });

    const onDoc = (e: PointerEvent) => {
      if (!m?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    // Capture phase on window, so a surrounding Dialog never sees the Escape / Tab meant for this list.
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const go = (el: HTMLElement | undefined) => {
        e.preventDefault();
        e.stopPropagation();
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: 'nearest' });
      };
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === 'ArrowDown') go(list[i + 1] ?? list[0]);
      else if (e.key === 'ArrowUp') go(list[i - 1] ?? list[list.length - 1]);
      else if (e.key === 'Home') go(list[0]);
      else if (e.key === 'End') go(list[list.length - 1]);
      else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typeahead: jump to the next item starting with the typed letter.
        const k = e.key.toLocaleLowerCase();
        const order = [...list.slice(i + 1), ...list.slice(0, i + 1)];
        const hit = order.find((el) => (el.textContent ?? '').trim().toLocaleLowerCase().startsWith(k));
        if (hit) go(hit);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, mounted, close, place]);

  return (
    <>
      {trigger({
        ref: btn,
        'aria-haspopup': role,
        'aria-expanded': open,
        'aria-controls': mounted ? id : undefined,
        onClick: () => !disabled && setOpen((o) => !o),
        onKeyDown: (e) => {
          if (!open && !disabled && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}
      {mounted && typeof document !== 'undefined'
        ? createPortal(
            <div ref={menu} id={id} role={role} aria-label={label} className="hm-dropdown scroll-thin" data-state={open ? 'open' : 'closed'} style={pos}>
              <CloseCtx.Provider value={() => close(true)}>{children}</CloseCtx.Provider>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** A dropdown entry. Pass `selected` (true/false) inside a listbox; leave it out for plain actions. */
export function DropdownItem({
  onSelect,
  selected,
  disabled,
  icon,
  children,
}: {
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const close = useContext(CloseCtx);
  return (
    <button
      type="button"
      tabIndex={-1}
      role={selected === undefined ? 'menuitem' : 'option'}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      className="hm-link"
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        close();
      }}
    >
      {icon ? <span className="hm-icon">{icon}</span> : null}
      <span className="hm-label bidi">{children}</span>
      {selected ? <Check className="hm-check h-4 w-4" strokeWidth={2.5} aria-hidden="true" /> : null}
    </button>
  );
}

function trapTab(e: KeyboardEvent, scope: HTMLElement) {
  const list = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]') && el.offsetParent !== null);
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  const inside = scope.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    e.stopPropagation();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    e.stopPropagation();
    first.focus();
  }
}
