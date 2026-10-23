import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Phone } from 'lucide-react';
import { toAppError } from '@pg/api-client';
import { useBackend } from '@pg/api-client/react';
import { GENDER_POLICY_LABELS, todayISO, type JoinRequestInput } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Checkbox, Input, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Card, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { Logo } from '@/layout/brand';

const ID_PROOFS = ['Aadhaar', 'PAN card', 'Driving licence', 'Passport', 'Voter ID', 'College / company ID', 'Other'];
const ROOM_PREFS = ['Single', 'Double sharing', 'Triple sharing', 'Any'];

type Form = Required<{ [K in keyof JoinRequestInput]: string }>;
const empty: Form = {
  full_name: '', phone: '', email: '', gender: '', date_of_birth: '', occupation: '', organization: '',
  id_proof_type: '', id_proof_number: '', permanent_address: '', emergency_contact_name: '',
  emergency_contact_phone: '', emergency_contact_relation: '', preferred_move_in: '', room_preference: '', property_id: '', note: '',
};

/**
 * Public page behind the owner's QR code: someone coming to stay fills in
 * their details without an account. The owner reviews and approves it in the
 * dashboard (Residents → Join requests).
 */
export function JoinPage() {
  const { code = '' } = useParams();
  const { data } = useBackend();
  const info = useQuery({ queryKey: ['join-link', code], queryFn: () => data.joinLinkInfo(code), retry: false });
  const [f, setF] = useState<Form>(empty);
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: async () => {
      try {
        const input: JoinRequestInput = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as unknown as JoinRequestInput;
        return await data.submitJoinRequest(code, input);
      } catch (e) {
        throw toAppError(e);
      }
    },
  });

  const needsProperty = !!info.data && !info.data.property && info.data.properties.length > 1;
  const missing = !f.full_name.trim() || f.phone.replace(/\D/g, '').length < 10 || (needsProperty && !f.property_id) || !agreed;

  return (
    <div className="min-h-dvh bg-gray-25">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">
        {info.isPending ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : info.isError ? (
          <Card className="p-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">This link is not active</h1>
            <p className="mt-2 text-[13px] text-gray-600">{toAppError(info.error).message}</p>
          </Card>
        ) : submit.isSuccess ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success-600" />
            <h1 className="mt-3 text-xl font-semibold text-gray-900">Request sent</h1>
            <p className="mt-2 text-[14px] text-gray-600">
              {info.data.business_name} has your details. They will call you on <b>{f.phone}</b> to confirm your room and rent.
            </p>
            {info.data.contact_phone && (
              <a href={`tel:${info.data.contact_phone}`} className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-accent-700">
                <Phone className="size-4" /> Call {info.data.business_name}
              </a>
            )}
          </Card>
        ) : (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!missing) submit.mutate();
            }}
          >
            <div>
              <p className="text-[13px] text-gray-500">Joining</p>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{info.data.property?.name ?? info.data.business_name}</h1>
              {(info.data.property?.locality || info.data.property?.city || info.data.city) && (
                <p className="mt-1 flex items-center gap-1 text-[13px] text-gray-500">
                  <MapPin className="size-3.5" />
                  {[info.data.property?.locality, info.data.property?.city ?? info.data.city].filter(Boolean).join(', ')}
                </p>
              )}
              <p className="mt-3 text-[14px] text-gray-600">Fill in your details. The PG will check them and contact you to confirm your bed and rent.</p>
            </div>

            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-[14px] font-semibold text-gray-900">About you</h2>
              {needsProperty && (
                <Field label="Which property?" htmlFor="j-prop" required error={touched && !f.property_id ? 'Choose a property' : undefined}>
                  <Select id="j-prop" value={f.property_id} onChange={set('property_id')}>
                    <option value="">Choose…</option>
                    {info.data.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.locality ? `, ${p.locality}` : ''}
                        {p.gender_policy !== 'any' ? ` (${GENDER_POLICY_LABELS[p.gender_policy]})` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Full name" htmlFor="j-name" required error={touched && !f.full_name.trim() ? 'Enter your name' : undefined}>
                <Input id="j-name" value={f.full_name} onChange={set('full_name')} autoComplete="name" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone" htmlFor="j-phone" required error={touched && f.phone.replace(/\D/g, '').length < 10 ? 'Enter a 10-digit phone number' : undefined}>
                  <Input id="j-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="98450 00000" />
                </Field>
                <Field label="Email" htmlFor="j-email">
                  <Input id="j-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
                </Field>
              </div>
              <Field label="Gender" htmlFor="j-gender">
                <Segmented
                  label="Gender"
                  value={f.gender as '' | 'male' | 'female' | 'other'}
                  onChange={(v) => setF((s) => ({ ...s, gender: v }))}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date of birth" htmlFor="j-dob">
                  <Input id="j-dob" type="date" value={f.date_of_birth} onChange={set('date_of_birth')} max={todayISO()} />
                </Field>
                <Field label="Work / study" htmlFor="j-occ" hint="e.g. Software engineer, Student">
                  <Input id="j-occ" value={f.occupation} onChange={set('occupation')} />
                </Field>
              </div>
              <Field label="Company or college" htmlFor="j-org">
                <Input id="j-org" value={f.organization} onChange={set('organization')} />
              </Field>
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-[14px] font-semibold text-gray-900">Your stay</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="When do you want to move in?" htmlFor="j-move">
                  <Input id="j-move" type="date" value={f.preferred_move_in} onChange={set('preferred_move_in')} min={todayISO()} />
                </Field>
                <Field label="Room you prefer" htmlFor="j-room">
                  <Select id="j-room" value={f.room_preference} onChange={set('room_preference')}>
                    <option value="">No preference</option>
                    {ROOM_PREFS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Anything the PG should know?" htmlFor="j-note">
                <Textarea id="j-note" rows={2} value={f.note} onChange={set('note')} maxLength={500} placeholder="e.g. Food preference, arriving late night" />
              </Field>
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-[14px] font-semibold text-gray-900">ID and emergency contact</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ID proof" htmlFor="j-idt">
                  <Select id="j-idt" value={f.id_proof_type} onChange={set('id_proof_type')}>
                    <option value="">Choose…</option>
                    {ID_PROOFS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="ID number" htmlFor="j-idn" hint="You will show the original at the PG.">
                  <Input id="j-idn" value={f.id_proof_number} onChange={set('id_proof_number')} maxLength={40} />
                </Field>
              </div>
              <Field label="Home address" htmlFor="j-addr">
                <Textarea id="j-addr" rows={2} value={f.permanent_address} onChange={set('permanent_address')} maxLength={500} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Emergency contact" htmlFor="j-ecn">
                  <Input id="j-ecn" value={f.emergency_contact_name} onChange={set('emergency_contact_name')} placeholder="Name" />
                </Field>
                <Field label="Their phone" htmlFor="j-ecp">
                  <Input id="j-ecp" type="tel" inputMode="tel" value={f.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
                </Field>
                <Field label="Relation" htmlFor="j-ecr">
                  <Input id="j-ecr" value={f.emergency_contact_relation} onChange={set('emergency_contact_relation')} placeholder="e.g. Father" />
                </Field>
              </div>
            </Card>

            <label className="flex items-start gap-3 text-[13px] text-gray-600">
              <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} className="mt-0.5" />
              <span>
                I agree to share these details with {info.data.business_name} for my stay.
                {touched && !agreed && <span className="block text-danger-600">Please tick this to continue.</span>}
              </span>
            </label>
            <InlineError error={submit.error} />
            <Button type="submit" className="w-full" size="lg" loading={submit.isPending}>
              Send request
            </Button>
            <p className="text-center text-xs text-gray-400">Nothing is booked until {info.data.business_name} confirms with you.</p>
          </form>
        )}
      </main>
    </div>
  );
}
