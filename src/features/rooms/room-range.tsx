import { useMemo, useState } from 'react';
import { BedDouble, DoorOpen, Layers, Minus, Plus } from 'lucide-react';
import { formatINR, rupeesToPaise, type Paise, type RentMode } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput } from '@pg/ui-web/ui/form-controls';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Field } from '@pg/ui-web/common';
import { cn } from '@pg/ui-web/utils';
import { FLOOR_PRESETS, FloorPicker, floorRank } from './floors';

export const MAX_RANGE = 100;
const MAX_BEDS = 30;

/** One room the range builder will create. */
export interface RangeRoom {
  name: string;
  floor: string | null;
  category: string | null;
  bed_count: number;
  rent_mode: RentMode;
  rent_paise: Paise;
  deposit_paise: Paise;
}

/** "Single", "Double sharing" … — used as the room type unless the owner types one. */
export function sharingLabel(beds: number): string {
  return ['', 'Single', 'Double sharing', 'Triple sharing', 'Four sharing', 'Five sharing', 'Six sharing'][beds] ?? `${beds} sharing`;
}

/**
 * Expands "101" → "110" (or "A-1" → "A-12", "G01" → "G10") into room names.
 * The "to" box may be just the number. Zero padding of "from" is kept.
 */
export function expandRange(from: string, to: string): { names: string[]; error: string | null } {
  const f = from.trim();
  const t = to.trim();
  if (!f) return { names: [], error: null };
  const fm = f.match(/^(.*?)(\d+)$/);
  if (!fm) return { names: [], error: 'Room numbers must end in a number, e.g. 101 or A-1.' };
  const prefix = fm[1]!;
  const start = Number(fm[2]);
  if (!t) return { names: [f], error: null };
  const tm = t.match(/^(.*?)(\d+)$/);
  if (!tm) return { names: [], error: '“To” must be a room number, e.g. 110.' };
  if (tm[1] && tm[1] !== prefix) return { names: [], error: `Both numbers need the same start (“${prefix || '—'}”).` };
  const end = Number(tm[2]);
  if (end < start) return { names: [], error: '“To” must be the same as or after “From”.' };
  const count = end - start + 1;
  if (count > MAX_RANGE) return { names: [], error: `That is ${count} rooms. Add at most ${MAX_RANGE} at a time.` };
  const width = fm[2]!.length;
  return { names: Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(width, '0')}`), error: null };
}

/** 101–110 on Ground → 201–210 on 1st floor. Null when the numbering doesn't follow floors. */
function nextFloorRange(from: string, to: string, floor: string, known: string[]): { from: string; to: string; floor: string } | null {
  const f = from.trim();
  const t = to.trim() || f;
  if (!/^\d{3,4}$/.test(f) || !/^\d{3,4}$/.test(t)) return null;
  const rank = floorRank(floor);
  if (rank < 0 || rank >= FLOOR_PRESETS.length - 1) return null;
  const nextFloor = known.find((k) => floorRank(k) === rank + 1) ?? FLOOR_PRESETS[rank + 1]!;
  const nf = String(Number(f) + 100);
  return { from: nf, to: t === f ? '' : String(Number(t) + 100), floor: nextFloor };
}

export type AddRoomsMode = 'single' | 'bulk';

/** The "One room / Many rooms (bulk)" switch shown above the room form. */
export function AddRoomsModeSwitch({ value, onChange }: { value: AddRoomsMode; onChange: (mode: AddRoomsMode) => void }) {
  return (
    <Segmented
      label="How many rooms"
      value={value}
      onChange={onChange}
      options={[
        { value: 'single', label: <><DoorOpen className="size-4" aria-hidden /> One room</> },
        { value: 'bulk', label: <><Layers className="size-4" aria-hidden /> Many rooms (bulk)</> },
      ]}
    />
  );
}

/** 101 → 102, A-09 → A-10; anything without a trailing number → ''. */
function nextRoomNumber(name: string): string {
  const m = name.trim().match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2]!.length, '0')}` : '';
}

/**
 * "Rooms 101 to 110 on the 1st floor, 2 beds each, ₹8,000 per bed" in one form,
 * with a live preview of exactly what will be created.
 */
export function RoomRangeBuilder({
  idPrefix,
  knownFloors = [],
  existingNames = [],
  defaultFloor = '',
  rentMode: controlledMode,
  onRentModeChange,
  defaultRentMode = 'per_bed',
  showDeposit = true,
  single = false,
  suggestNext = false,
  submitLabel,
  busy,
  onSubmit,
}: {
  /** One room: a single "Room number" box (any name, e.g. "Penthouse") instead of From/To. */
  single?: boolean;
  /** After adding, prefill what comes next: the next floor's range (101–110 → 201–210, Ground → 1st), or the next room number. */
  suggestNext?: boolean;
  idPrefix: string;
  knownFloors?: string[];
  /** Room names that already exist (or are already queued), checked case-insensitively. */
  existingNames?: string[];
  defaultFloor?: string;
  /** Pass to control rent mode from outside (onboarding has one setting for every room). */
  rentMode?: RentMode;
  onRentModeChange?: (mode: RentMode) => void;
  defaultRentMode?: RentMode;
  showDeposit?: boolean;
  submitLabel: (count: number) => string;
  busy?: boolean;
  /** Return false (or a rejected promise) to keep the form filled in. */
  onSubmit: (rooms: RangeRoom[]) => unknown;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [floor, setFloor] = useState(defaultFloor);
  const [beds, setBeds] = useState(2);
  const [category, setCategory] = useState('');
  const [ownMode, setOwnMode] = useState<RentMode>(defaultRentMode);
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [touched, setTouched] = useState(false);

  const rentMode = controlledMode ?? ownMode;
  const setRentMode = onRentModeChange ?? setOwnMode;
  const { names, error: rangeError } = useMemo(
    () => (single ? { names: from.trim() ? [from.trim()] : [], error: from.trim().length > 40 ? 'Keep the room name under 40 characters.' : null } : expandRange(from, to)),
    [single, from, to],
  );
  const taken = useMemo(() => new Set(existingNames.map((n) => n.trim().toLowerCase())), [existingNames]);
  const clashes = names.filter((n) => taken.has(n.toLowerCase()));
  const rentPaise = rent.trim() ? rupeesToPaise(rent) : null;
  const depositPaise = deposit.trim() ? rupeesToPaise(deposit) : 0;

  const problem =
    rangeError ??
    (names.length === 0 ? (single ? 'Enter the room number.' : 'Enter the first room number.') : null) ??
    (clashes.length ? `${clashes.length === 1 ? `Room ${clashes[0]} already exists` : `Rooms ${clashes.slice(0, 4).join(', ')}${clashes.length > 4 ? '…' : ''} already exist`}. Change the range.` : null) ??
    (rentPaise === null || rentPaise <= 0 ? 'Enter the monthly rent.' : null) ??
    (depositPaise === null ? 'Enter a valid deposit, or leave it blank.' : null);

  const totalBeds = names.length * beds;
  const monthlyFull = rentPaise ? (rentMode === 'per_bed' ? rentPaise * totalBeds : rentPaise * names.length) : 0;

  const submit = async () => {
    setTouched(true);
    if (problem || rentPaise === null) return;
    const rooms: RangeRoom[] = names.map((name) => ({
      name,
      floor: floor.trim() || null,
      category: category.trim() || sharingLabel(beds),
      bed_count: beds,
      rent_mode: rentMode,
      rent_paise: rentPaise,
      deposit_paise: depositPaise ?? 0,
    }));
    try {
      if ((await onSubmit(rooms)) === false) return;
    } catch {
      return;
    }
    // Ready for the next floor: keep rent and beds. With suggestNext, 101–110 on Ground
    // becomes 201–210 on the 1st floor, so a whole building is a few clicks.
    if (single) {
      setFrom(suggestNext ? nextRoomNumber(from) : '');
    } else {
      const next = suggestNext ? nextFloorRange(from, to, floor, knownFloors) : null;
      setFrom(next?.from ?? '');
      setTo(next?.to ?? '');
      if (next) setFloor(next.floor);
    }
    setTouched(false);
  };

  return (
    <div className="space-y-5">
      {single ? (
        <Field label="Room number" htmlFor={`${idPrefix}-from`} hint="e.g. 101, G-2 or Penthouse" className="sm:w-1/2">
          <Input id={`${idPrefix}-from`} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="101" autoComplete="off" className="tabular text-base" />
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="From room" htmlFor={`${idPrefix}-from`} hint="e.g. 101">
            <Input id={`${idPrefix}-from`} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="101" autoComplete="off" className="tabular text-base" />
          </Field>
          <span className="hidden pb-8 text-sm text-gray-400 sm:block">to</span>
          <Field label="To room" htmlFor={`${idPrefix}-to`} hint="Leave blank for just one room">
            <Input id={`${idPrefix}-to`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="110" autoComplete="off" className="tabular text-base" />
          </Field>
        </div>
      )}

      <Field label="Floor" htmlFor={`${idPrefix}-floor`}>
        <FloorPicker id={`${idPrefix}-floor`} value={floor} onChange={setFloor} known={knownFloors} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={single ? 'Beds in this room' : 'Beds in each room'} htmlFor={`${idPrefix}-beds`}>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="One bed fewer" disabled={beds <= 1} onClick={() => setBeds((b) => Math.max(1, b - 1))}>
                <Minus />
              </Button>
              <input
                id={`${idPrefix}-beds`}
                inputMode="numeric"
                value={beds}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ''));
                  if (n >= 1 && n <= MAX_BEDS) setBeds(n);
                }}
                className="tabular w-10 bg-transparent text-center text-[15px] font-semibold text-gray-900 outline-none"
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="One bed more" disabled={beds >= MAX_BEDS} onClick={() => setBeds((b) => Math.min(MAX_BEDS, b + 1))}>
                <Plus />
              </Button>
            </div>
            <span className="text-[13px] text-gray-500">{sharingLabel(beds)}</span>
          </div>
        </Field>
        <Field label="Room type" htmlFor={`${idPrefix}-cat`} hint="Optional">
          <Input id={`${idPrefix}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={`${sharingLabel(beds)}${beds > 1 ? ' AC' : ''}`} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={rentMode === 'per_bed' ? 'Rent per bed (each month)' : 'Rent per room (each month)'} htmlFor={`${idPrefix}-rent`} required>
          <MoneyInput id={`${idPrefix}-rent`} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="8,000" className="text-base" />
        </Field>
        {showDeposit && (
          <Field label="Security deposit" htmlFor={`${idPrefix}-dep`} hint="Optional, per resident">
            <MoneyInput id={`${idPrefix}-dep`} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
        )}
        <div className={cn('sm:col-span-2', !showDeposit && 'sm:col-span-1 sm:self-end sm:pb-1')}>
          <Segmented
            label="Rent is charged"
            value={rentMode}
            onChange={setRentMode}
            options={[
              { value: 'per_bed', label: 'Per bed (sharing)' },
              { value: 'per_room', label: 'Per room (whole room)' },
            ]}
          />
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-xl border border-gray-200 bg-gray-25 p-4">
        {names.length > 0 && !rangeError ? (
          <>
            <p className="text-[13px] font-medium text-gray-900">
              {names.length} {names.length === 1 ? 'room' : 'rooms'} · {totalBeds} {totalBeds === 1 ? 'bed' : 'beds'}
              {floor && <span className="font-normal text-gray-500"> · {floor}</span>}
              {monthlyFull > 0 && <span className="font-normal text-gray-500"> · {formatINR(monthlyFull)}/month when full</span>}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {names.slice(0, 40).map((n) => (
                <span
                  key={n}
                  className={cn(
                    'tabular inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                    taken.has(n.toLowerCase()) ? 'border-warning-100 bg-warning-50 text-warning-700' : 'border-gray-200 bg-white text-gray-700',
                  )}
                >
                  <BedDouble className="size-3 text-gray-400" aria-hidden />
                  {n}
                  <span className="text-gray-400">×{beds}</span>
                </span>
              ))}
              {names.length > 40 && <span className="px-1 py-1 text-xs text-gray-500">+{names.length - 40} more</span>}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-gray-500">
            {single ? 'Type the room number. You’ll see the room here before it is saved.' : 'Type the first and last room number. You’ll see every room here before anything is saved.'}
          </p>
        )}
        {(touched || rangeError || clashes.length > 0) && problem && <p className="mt-3 text-[13px] text-danger-600">{problem}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void submit()} loading={busy}>
          <Plus /> {submitLabel(names.length && !rangeError ? names.length : 0)}
        </Button>
      </div>
    </div>
  );
}
