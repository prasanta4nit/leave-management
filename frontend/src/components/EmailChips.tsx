import clsx from 'clsx';
import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { EmployeeBrief } from '../lib/types';
import { Avatar } from './ui';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Email "chips" input with colleague suggestions. Type a name or address, then Enter / comma / Tab
 * to add; paste a list; Backspace on an empty field removes the last chip.
 */
export default function EmailChips({ value, onChange, people, exclude = [], max = 10, placeholder, id }: {
  value: string[];
  onChange: (emails: string[]) => void;
  people: EmployeeBrief[];
  exclude?: string[]; // e.g. the applicant, who is emailed anyway
  max?: number;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byEmail = useMemo(() => new Map(people.map((p) => [p.email.toLowerCase(), p])), [people]);
  const domains = useMemo(() => new Set(people.map((p) => p.email.split('@')[1]?.toLowerCase()).filter(Boolean)), [people]);
  const blocked = useMemo(() => new Set([...value, ...exclude].map((e) => e.toLowerCase())), [value, exclude]);

  const term = text.trim().toLowerCase();
  const suggestions = term
    ? people
        .filter((p) => !blocked.has(p.email.toLowerCase()) && (p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)))
        .slice(0, 6)
    : [];

  const add = (raw: string[]): boolean => {
    const next = [...value];
    for (const r of raw) {
      const email = r.trim().replace(/^<|>$/g, '').toLowerCase();
      if (!email) continue;
      if (!EMAIL_RE.test(email)) {
        setError(`"${r.trim()}" isn't a valid email address`);
        return false;
      }
      if (domains.size && !domains.has(email.split('@')[1])) {
        setError(`Only company addresses can be copied (${[...domains].map((d) => '@' + d).join(', ')})`);
        return false;
      }
      if (blocked.has(email) || next.includes(email)) continue;
      if (next.length >= max) {
        setError(`You can copy up to ${max} people`);
        break;
      }
      next.push(email);
    }
    onChange(next);
    setText('');
    setActive(0);
    setError(null);
    return true;
  };

  const commit = () => {
    if (suggestions[active]) return add([suggestions[active].email]);
    if (term) return add([text]);
    return true;
  };

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={clsx(
          'flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 shadow-card transition',
          focused ? 'border-brand-500 ring-4 ring-brand-500/10' : 'border-slate-200 hover:border-slate-300',
          error && 'border-rose-300',
        )}
      >
        {value.map((email) => {
          const p = byEmail.get(email);
          return (
            <span key={email} title={email} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 py-0.5 pl-1 pr-1.5 text-xs font-medium text-slate-700">
              {p ? <Avatar person={p} size="xs" /> : null}
              <span className="truncate">{p ? p.full_name : email}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v !== email));
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label={`Remove ${email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          ref={inputRef}
          value={text}
          disabled={value.length >= max}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (term && EMAIL_RE.test(term)) add([text]); // keep a fully typed address
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (/[,;\s]/.test(pasted.trim())) {
              e.preventDefault();
              add(pasted.split(/[,;\s]+/));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && term)) {
              if (term || e.key === 'Enter') e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === 'Escape') {
              setText('');
            }
          }}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          aria-autocomplete="list"
          autoComplete="off"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 animate-fade-up overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-pop" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  add([p.email]);
                }}
                onMouseEnter={() => setActive(i)}
                className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm', i === active && 'bg-slate-100')}
              >
                <Avatar person={p} size="xs" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-900">{p.full_name}</span>
                  <span className="text-slate-500"> · {p.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
