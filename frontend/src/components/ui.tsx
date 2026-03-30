import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export function PaperPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'paper-panel border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.84)] shadow-card backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  english,
  description,
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  english?: string;
  description: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={cn('space-y-4', align === 'center' && 'text-center')}>
      {eyebrow ? (
        <div className="tag-chip inline-flex items-center gap-3 rounded-full px-4 py-1.5 text-[11px] tracking-[0.32em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
          {eyebrow}
        </div>
      ) : null}
      <div className="space-y-2">
        <h1 className="font-display text-4xl text-[color:var(--ink-strong)] sm:text-5xl lg:text-6xl">{title}</h1>
        {english ? (
          <p className="nav-english text-[11px] text-[color:var(--ink-faint)] sm:text-xs">{english}</p>
        ) : null}
      </div>
      <p
        className={cn(
          'max-w-3xl text-base leading-8 text-[color:var(--ink-muted)] sm:text-[17px]',
          align === 'center' && 'mx-auto',
        )}
      >
        {description}
      </p>
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <PaperPanel className="grid gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1.42fr)_360px] lg:px-12 lg:py-12">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />
      <div className="space-y-4 border-t border-[color:var(--line-soft)] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        {aside}
      </div>
    </PaperPanel>
  );
}

export function LinkButton({
  to,
  children,
  variant = 'primary',
  className,
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const styles = {
    primary:
      'bg-[color:var(--ink-strong)] text-[color:var(--paper)] hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(74,55,33,0.12)]',
    secondary:
      'bg-[color:var(--accent)] text-white hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(136,58,44,0.18)]',
    ghost:
      'border border-[color:var(--line-strong)] text-[color:var(--ink-strong)] hover:bg-[rgba(95,70,44,0.06)]',
  };

  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-3 rounded-full px-6 py-3 text-sm tracking-[0.16em] transition duration-300',
        styles[variant],
        className,
      )}
    >
      {children}
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

export function ActionButton({
  children,
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const styles = {
    primary: 'bg-[color:var(--ink-strong)] text-[color:var(--paper)] hover:bg-[rgba(45,36,29,0.92)]',
    secondary: 'bg-[color:var(--accent)] text-white hover:bg-[rgba(154,76,57,0.92)]',
    ghost: 'border border-[color:var(--line-strong)] text-[color:var(--ink-strong)] hover:bg-[rgba(95,70,44,0.06)]',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm tracking-[0.14em] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.42)] px-4 py-3">
      <p className="nav-english text-[10px] text-[color:var(--ink-faint)]">{label}</p>
      <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{value}</p>
    </div>
  );
}

export function BlockingOverlay({
  open,
  title,
  description,
}: {
  open: boolean;
  title: string;
  description?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(29,23,18,0.45)] backdrop-blur-[2px]">
      <div className="mx-6 w-full max-w-sm rounded-3xl border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.96)] px-8 py-8 text-center shadow-[0_24px_64px_rgba(17,12,8,0.28)]">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-[3px] border-[rgba(154,76,57,0.2)] border-t-[color:var(--accent)]" />
        <h3 className="mt-5 font-display text-2xl text-[color:var(--ink-strong)]">{title}</h3>
        {description ? (
          <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SuccessOverlay({
  open,
  title,
  description,
  linkTo,
  linkLabel,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  linkTo?: string;
  linkLabel?: string;
  onClose?: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(29,23,18,0.2)]">
      <div className="mx-6 w-full max-w-sm rounded-3xl border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.98)] px-8 py-8 text-center shadow-[0_24px_64px_rgba(17,12,8,0.24)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-[rgba(72,146,104,0.28)] bg-[rgba(72,146,104,0.1)] text-[#2f8f60]">
          <Check className="h-8 w-8" />
        </div>
        <h3 className="mt-5 font-display text-2xl text-[color:var(--ink-strong)]">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{description}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {linkTo ? (
            <Link
              to={linkTo}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--line-strong)] px-4 py-2 text-xs tracking-[0.14em] text-[color:var(--ink-strong)] transition hover:bg-[rgba(95,70,44,0.06)]"
            >
              {linkLabel || '立即前往'}
            </Link>
          ) : null}

          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--ink-strong)] px-6 py-2.5 text-xs tracking-[0.14em] text-white transition hover:opacity-90 active:opacity-75"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
