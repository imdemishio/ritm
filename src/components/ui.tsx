'use client';

import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import {
  Activity,
  BookOpen,
  Coffee,
  Droplet,
  Footprints,
  Heart,
  Leaf,
  Moon,
  Music,
  Flower2,
  Sun,
  Terminal,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Person } from '@/lib/domain';

export const habitIcons: Record<string, LucideIcon> = {
  water: Droplet,
  book: BookOpen,
  run: Footprints,
  meditate: Flower2,
  sleep: Moon,
  sun: Sun,
  leaf: Leaf,
  coffee: Coffee,
  heart: Heart,
  code: Terminal,
  music: Music,
  food: Utensils,
};
export const cssVars = (values: Record<`--${string}`, string | number>): CSSProperties =>
  values as CSSProperties;
export function HabitIcon({ name, size = 21 }: { name: string; size?: number }) {
  const Icon = habitIcons[name];
  return Icon ? (
    <Icon size={size} strokeWidth={1.85} aria-hidden="true" />
  ) : (
    <span className="emoji" style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Activity size={22} strokeWidth={2.5} />
      </span>
      <span>
        ритм<span className="brand-period">.</span>
      </span>
    </div>
  );
}
export function Avatar({
  person,
  size = 38,
}: {
  person: Pick<Person, 'name' | 'avatar'>;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.37 }}
      aria-hidden="true"
    >
      {person.avatar ? (
        <img alt="" src={person.avatar} />
      ) : (
        person.name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase()
      )}
    </span>
  );
}
export function Empty({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={23} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    element?.addEventListener('cancel', onCancel);
    element?.showModal();
    return () => {
      element?.removeEventListener('cancel', onCancel);
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={dialog}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <motion.div
        className="modal-inner"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть">
            <X size={19} />
          </button>
        </div>
        {children}
      </motion.div>
    </dialog>
  );
}
export function Toasts({
  message,
  close,
}: {
  message: { text: string; error?: boolean } | null;
  close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element?.showPopover) return;
    if (message && !element.matches(':popover-open')) element.showPopover();
    if (!message && element.matches(':popover-open')) element.hidePopover();
  }, [message]);
  return (
    <div className="toast-root" popover="manual" ref={root} aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.text}
            className={`toast${message.error ? ' toast-error' : ''}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span>{message.text}</span>
            <button type="button" onClick={close} aria-label="Скрыть сообщение">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
