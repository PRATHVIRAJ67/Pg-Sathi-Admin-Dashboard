import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useBackend, useProperties, useRooms, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { formatINR, paiseToRupeesInput, rupeesToPaise, type RentMode, type Room } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Switch, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { PropertySelect } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { FloorPicker } from './floors';
import { AddRoomsModeSwitch, RoomRangeBuilder, type AddRoomsMode, type RangeRoom } from './room-range';

/** Floor names already used in a property, so the picker offers them as chips. */
function useKnownFloors(propertyId: string | null) {
  const { tenantId } = useCurrentWorkspace();
  const rooms = useRooms(tenantId, propertyId);
  return [...new Set((rooms.data ?? []).map((r) => r.floor).filter(Boolean) as string[])];
}

export function AddRoomsDialog({
  open,
  onOpenChange,
  propertyId: preset,
  floor: presetFloor,
  mode: presetMode = 'bulk',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId?: string;
  floor?: string;
  mode?: AddRoomsMode;
}) {
  const { tenantId, propertyId: selected } = useCurrentWorkspace();
  const { data } = useBackend();
  const workspace = useWorkspace(tenantId);
  const [chosen, setPropertyId] = useState<string | null>(preset ?? selected);
  const [mode, setMode] = useState<AddRoomsMode>(presetMode);
  // With "All properties" selected the dropdown shows the first property, so use that one.
  const properties = useProperties(tenantId);
  const propertyId = chosen ?? properties.data?.[0]?.id ?? null;
  const rooms = useRooms(tenantId, propertyId);
  const knownFloors = useKnownFloors(propertyId);

  useEffect(() => {
    if (open) {
      setPropertyId(preset ?? selected);
      setMode(presetMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useTenantMutation(tenantId, (list: RangeRoom[]) => {
    if (!propertyId) throw Object.assign(new Error('Choose a property'), { hint: 'validation', message: 'Choose a property' });
    return data.createRooms(propertyId, list);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={mode === 'single' ? 'Add a room' : 'Add rooms in bulk'}
        description={
          mode === 'single'
            ? 'One room with its beds and rent. Beds are labelled A, B, C… automatically.'
            : 'Add a whole floor at once: type the first and last room number, the beds in each room and one rent for all of them. Beds are labelled A, B, C… automatically.'
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Property" htmlFor="ar-prop" className="w-full sm:w-72">
              <PropertySelect id="ar-prop" tenantId={tenantId} value={propertyId} onChange={setPropertyId} allowAll={false} />
            </Field>
            <AddRoomsModeSwitch value={mode} onChange={setMode} />
          </div>
          {/* Remount per open/property so the form starts clean with the right floor. */}
          <RoomRangeBuilder
            key={`${open}-${propertyId}-${presetFloor ?? ''}-${mode}`}
            single={mode === 'single'}
            idPrefix="ar"
            knownFloors={knownFloors}
            existingNames={(rooms.data ?? []).map((r) => r.name)}
            defaultFloor={presetFloor ?? ''}
            defaultRentMode={workspace.data?.settings.default_rent_mode ?? 'per_bed'}
            busy={mutation.isPending}
            submitLabel={(n) => (n > 1 ? `Add ${n} rooms` : 'Add room')}
            onSubmit={(list) =>
              mutation.mutateAsync(list).then(() => {
                const beds = list.reduce((s, r) => s + r.bed_count, 0);
                toast.success(list.length === 1 ? `Room ${list[0]!.name} added with ${beds} ${beds === 1 ? 'bed' : 'beds'}` : `${list.length} rooms added (${list[0]!.name} to ${list.at(-1)!.name}), ${beds} beds`);
                onOpenChange(false);
              })
            }
          />
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditRoomDialog({ open, onOpenChange, room }: { open: boolean; onOpenChange: (o: boolean) => void; room: Room }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [state, setState] = useState({ name: '', floor: '', category: '', rent_mode: 'per_bed' as RentMode, rent: '', deposit: '', notes: '', is_active: true });
  useEffect(() => {
    if (open)
      setState({
        name: room.name,
        floor: room.floor ?? '',
        category: room.category ?? '',
        rent_mode: room.rent_mode,
        rent: paiseToRupeesInput(room.rent_paise),
        deposit: room.deposit_paise ? paiseToRupeesInput(room.deposit_paise) : '',
        notes: room.notes ?? '',
        is_active: room.is_active,
      });
  }, [open, room]);
  const knownFloors = useKnownFloors(room.property_id);
  const mutation = useTenantMutation(tenantId, () => {
    const rent = rupeesToPaise(state.rent);
    if (rent === null || rent < 0) throw Object.assign(new Error('Enter a valid rent'), { hint: 'validation', message: 'Enter a valid rent' });
    return data.updateRoom(room.id, {
      name: state.name.trim(),
      floor: state.floor || null,
      category: state.category || null,
      rent_mode: state.rent_mode,
      rent_paise: rent,
      deposit_paise: rupeesToPaise(state.deposit) ?? 0,
      notes: state.notes || null,
      is_active: state.is_active,
    });
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Edit room ${room.name}`}
        description="Changing the rent here only affects new assignments. Existing residents keep their agreed rent."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {/* mutateAsync: a floor change remounts the room card, which drops mutate()'s callbacks. */}
            <Button loading={mutation.isPending} onClick={() => mutation.mutateAsync().then(() => { toast.success('Room updated'); onOpenChange(false); }).catch(() => undefined)}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Floor" htmlFor="er-floor" className="sm:col-span-2">
            <FloorPicker id="er-floor" value={state.floor} known={knownFloors} onChange={(floor) => setState({ ...state, floor })} />
          </Field>
          <Field label="Room name" htmlFor="er-name">
            <Input id="er-name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="er-cat">
            <Input id="er-cat" value={state.category} onChange={(e) => setState({ ...state, category: e.target.value })} />
          </Field>
          <Field label="Rent charged" htmlFor="er-mode">
            <Select id="er-mode" value={state.rent_mode} onChange={(e) => setState({ ...state, rent_mode: e.target.value as RentMode })}>
              <option value="per_bed">Per bed</option>
              <option value="per_room">Per room</option>
            </Select>
          </Field>
          <Field label="Monthly rent" htmlFor="er-rent" hint={state.rent_mode === 'per_room' ? `Split across ${room.beds.length} beds: ${formatINR(Math.round((rupeesToPaise(state.rent) ?? 0) / Math.max(room.beds.length, 1)))} each` : undefined}>
            <MoneyInput id="er-rent" value={state.rent} onChange={(e) => setState({ ...state, rent: e.target.value })} />
          </Field>
          <Field label="Security deposit" htmlFor="er-dep">
            <MoneyInput id="er-dep" value={state.deposit} onChange={(e) => setState({ ...state, deposit: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="er-notes" className="sm:col-span-2">
            <Textarea id="er-notes" rows={2} value={state.notes} onChange={(e) => setState({ ...state, notes: e.target.value })} />
          </Field>
          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={state.is_active} onCheckedChange={(v) => setState({ ...state, is_active: v })} />
            <span className="text-[13px] text-gray-700">Room is active (inactive rooms are hidden from bed assignment)</span>
          </label>
          <div className="sm:col-span-2">
            <InlineError error={mutation.error} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
