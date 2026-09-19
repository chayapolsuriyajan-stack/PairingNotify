'use client';

/** Segmented control (tabs within a screen, round picker, WIN/DRAW/LOSS). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  scroll = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div className={`ef-seg${scroll ? ' ef-seg--scroll' : ''}`} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`ef-seg__item${option.value === value ? ' ef-seg__item--on' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
