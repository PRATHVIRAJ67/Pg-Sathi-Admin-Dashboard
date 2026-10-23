import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Input } from '@pg/ui-web/ui/form-controls';
import { cn } from '@pg/ui-web/utils';

export const FLOOR_PRESETS = ['Ground', '1st floor', '2nd floor', '3rd floor', '4th floor', '5th floor'];

const WORD_FLOORS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

/** Sort key for a floor name: basement < ground < 1st < 2nd … < terrace, unknown names after numbered floors. */
export function floorRank(floor: string | null | undefined): number {
  const f = (floor ?? '').trim().toLowerCase();
  if (!f) return 10_000;
  if (/^(basement|lower ground|b\d?)\b/.test(f)) return -1;
  if (/^(ground|g|gf)\b/.test(f) || f === '0') return 0;
  if (/^(terrace|roof|top)/.test(f)) return 5_000;
  const n = f.match(/\d+/);
  if (n) return Number(n[0]);
  const word = Object.keys(WORD_FLOORS).find((w) => f.startsWith(w));
  return word ? WORD_FLOORS[word]! : 1_000;
}

/** True when two floor names mean the same level ("2nd floor" and "Second"). */
export function sameFloor(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = floorRank(a);
  return ra < 1_000 ? ra === floorRank(b) : (a ?? '').trim() === (b ?? '').trim();
}

/** Heading for a floor group: "Ground" → "Ground floor", "2nd floor" stays as is. */
export function floorTitle(floor: string | null | undefined): string {
  const f = (floor ?? '').trim();
  if (!f) return 'No floor set';
  return /floor$/i.test(f) || /^(basement|terrace|roof)/i.test(f) ? f : `${f} floor`;
}

/** Short label for chips: "2nd floor" → "2nd". */
function chipLabel(floor: string): string {
  return floor.replace(/\s*floor$/i, '');
}

/**
 * One-tap floor choice: preset chips plus any floors this property already
 * uses, and "Other" for a custom name (e.g. "Terrace", "Block B – 1st").
 */
export function FloorPicker({ value, onChange, known = [], id }: { value: string; onChange: (floor: string) => void; known?: string[]; id?: string }) {
  // A floor the property already uses ("First") replaces the preset for the same level ("1st floor").
  const used = known.filter(Boolean);
  const options = [...new Set([...FLOOR_PRESETS.filter((p) => !used.some((k) => floorRank(k) === floorRank(p))), ...used])].sort(
    (a, b) => floorRank(a) - floorRank(b),
  );
  const isCustom = value !== '' && !options.includes(value);
  const [custom, setCustom] = useState(isCustom);

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Floor" id={id} className="flex flex-wrap gap-1.5">
        {options.map((f) => {
          const active = value === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setCustom(false);
                onChange(active ? '' : f);
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors',
                active ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900',
              )}
            >
              {active && <Check className="size-3.5" />}
              {chipLabel(f)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-[13px] font-medium transition-colors',
            custom || isCustom ? 'border-accent-500 text-accent-700' : 'border-gray-300 text-gray-500 hover:text-gray-900',
          )}
        >
          <Plus className="size-3.5" /> Other
        </button>
      </div>
      {(custom || isCustom) && (
        <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Terrace or Block B" aria-label="Custom floor name" maxLength={40} />
      )}
    </div>
  );
}
