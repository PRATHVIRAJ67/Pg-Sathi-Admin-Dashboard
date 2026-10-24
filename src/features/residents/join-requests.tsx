import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Copy, Download, MessageCircle, Phone, Power, QrCode, RefreshCw, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { useBackend, useJoinLinks, useJoinRequests, useProperties, useTenantMutation } from '@pg/api-client/react';
import { formatDate, formatDateTime, type JoinLink, type JoinRequest, type JoinRequestStatus } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, Textarea } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Dialog, DialogContent, Segmented } from '@pg/ui-web/ui/overlays';
import { ConfirmDialog, EmptyState, ErrorState, Field, InlineError, PageHeader } from '@pg/ui-web/common';
import { UpiQr as QrImage } from '@/components/upi-qr';
import { PropertySelect } from '@/components/pickers';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';

export const joinUrl = (code: string) => `${window.location.origin}/join/${code}`;

/** "ad902c3b8d2b40" → "AD90 2C3B 8D2B 40": easy to read out and type (the app ignores spaces and case). */
export const formatJoinCode = (code: string) => code.toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

// ---------------------------------------------------------------------------
// Join QR (owner creates and prints it)
// ---------------------------------------------------------------------------
export function JoinQrDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tenantId, propertyId: selected } = useCurrentWorkspace();
  const { data } = useBackend();
  const properties = useProperties(tenantId);
  const links = useJoinLinks(tenantId);
  const [propertyId, setPropertyId] = useState<string | null>(selected);
  const multi = (properties.data?.length ?? 0) > 1;
  const target = multi ? propertyId : (properties.data?.[0]?.id ?? null);
  const link = links.data?.find((l) => l.property_id === target);
  const create = useTenantMutation(tenantId, () => data.createJoinLink(tenantId, target));
  const toggle = useTenantMutation(tenantId, (l: JoinLink) => data.setJoinLinkActive(l.id, !l.is_active));
  const regenerate = useTenantMutation(tenantId, (l: JoinLink) => data.regenerateJoinLink(l.id));
  const [confirmNew, setConfirmNew] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (open) setPropertyId(selected);
  }, [open, selected]);

  const label = link?.property_name ?? (multi ? 'All properties' : (properties.data?.[0]?.name ?? 'your PG'));
  const url = link ? joinUrl(link.code) : '';

  const download = async () => {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 4, color: { dark: '#14213D', light: '#FFFFFF' } });
    const a = document.createElement('a');
    a.href = png;
    a.download = `Join-${label.replace(/[^\w-]+/g, '-')}-QR.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Join QR code"
        description="Print this at the front desk or share the link. New people scan it, fill in their details, and you approve them here, with no typing on your side."
      >
        <div className="space-y-5">
          {multi && (
            <Field label="QR for" htmlFor="jq-prop" className="sm:w-72" hint="One QR for everything, or one per property.">
              <PropertySelect id="jq-prop" tenantId={tenantId} value={propertyId} onChange={setPropertyId} allLabel="All properties (they choose)" />
            </Field>
          )}
          {links.isPending ? (
            <Skeleton className="h-56 rounded-xl" />
          ) : !link ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-25 p-6 text-center">
              <QrCode className="mx-auto size-8 text-gray-400" />
              <p className="mt-2 text-[13px] text-gray-600">No join QR for {label} yet.</p>
              <Button className="mt-4" loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => toast.success('Join QR created') })}>
                <QrCode /> Create join QR
              </Button>
              <InlineError error={create.error} />
            </div>
          ) : (
            <div className="flex flex-col gap-6 sm:flex-row">
              <div className={link.is_active ? '' : 'opacity-40'}>
                <QrImage value={url} size={200} label={`Join QR code for ${label}`} />
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={link.is_active ? 'success' : undefined} dot>
                    {link.is_active ? 'Accepting requests' : 'Turned off'}
                  </Badge>
                  <span className="text-xs text-gray-500">{link.requests} requests so far</span>
                </div>
                <div className="rounded-xl border border-accent-200 bg-accent-50 p-3.5">
                  <p className="text-xs font-medium text-accent-800">Join code</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-[22px] font-bold tracking-[0.06em] text-navy-900" aria-label="Join code">
                      {formatJoinCode(link.code)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void navigator.clipboard.writeText(link.code).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); })}
                    >
                      {codeCopied ? <Check /> : <Copy />} {codeCopied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600">Can’t scan? In the PG Sathi app: Join a PG → enter this code.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input readOnly value={url} className="font-mono text-xs" aria-label="Join link" onFocus={(e) => e.target.select()} />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Copy link"
                    onClick={() => void navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void download()}>
                    <Download /> Download QR
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Join ${label} on PG Sathi: open the PG Sathi app, tap “Join a PG” and enter code ${formatJoinCode(link.code)} (or open ${url})`)}`} target="_blank" rel="noreferrer">
                      <MessageCircle /> Share on WhatsApp
                    </a>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  <Button variant="ghost" size="sm" loading={toggle.isPending} onClick={() => toggle.mutate(link, { onSuccess: () => toast.success(link.is_active ? 'Join QR turned off' : 'Join QR turned on') })}>
                    <Power /> {link.is_active ? 'Turn off' : 'Turn on'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmNew(true)}>
                    <RefreshCw /> New QR (old one stops working)
                  </Button>
                </div>
                <InlineError error={toggle.error ?? regenerate.error} />
              </div>
            </div>
          )}
        </div>
        {link && (
          <ConfirmDialog
            open={confirmNew}
            onOpenChange={setConfirmNew}
            title="Make a new join QR?"
            description="The old QR and link stop working straight away. Print and share the new one."
            confirmLabel="Make new QR"
            onConfirm={() => regenerate.mutateAsync(link).then(() => toast.success('New join QR ready'))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Banner on the Residents page
// ---------------------------------------------------------------------------
export function JoinRequestsBanner() {
  const { tenantId, can } = useCurrentWorkspace();
  const pending = useJoinRequests(tenantId, 'pending', { enabled: can('residents.write') });
  const n = pending.data?.length ?? 0;
  if (!n) return null;
  const names = pending.data!.slice(0, 2).map((r) => r.full_name.split(' ')[0]);
  return (
    <Link
      to="/app/residents/requests"
      className="mb-4 flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-[13px] text-accent-800 transition-colors hover:bg-accent-100"
    >
      <span className="grid size-8 place-items-center rounded-full bg-accent-600 text-white">
        <UserPlus className="size-4" />
      </span>
      <span className="flex-1">
        <b>
          {n} new {n === 1 ? 'person wants' : 'people want'} to join
        </b>{' '}
        · {names.join(', ')}
        {n > 2 ? ` and ${n - 2} more` : ''}
      </span>
      <span className="font-medium">Review →</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Join requests page
// ---------------------------------------------------------------------------
export function JoinRequestsPage() {
  const { tenantId } = useCurrentWorkspace();
  const [status, setStatus] = useState<JoinRequestStatus>('pending');
  const [qrOpen, setQrOpen] = useState(false);
  const requests = useJoinRequests(tenantId, status);
  const pendingCount = useJoinRequests(tenantId, 'pending').data?.length;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/residents" className="inline-flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="size-3.5" /> Residents
          </Link>
        }
        title="Join requests"
        description="People who scanned your join QR. Approve to add them as a resident, then assign a bed and rent."
        actions={
          <Button variant="secondary" onClick={() => setQrOpen(true)}>
            <QrCode /> Join QR
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'New', count: pendingCount },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]}
        />
      </div>
      {requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : requests.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : requests.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={status === 'pending' ? 'No new requests' : status === 'approved' ? 'Nobody approved yet' : 'No rejected requests'}
            description={status === 'pending' ? 'Share your join QR. When someone fills it in, they show up here and in the bell at the top.' : undefined}
            action={status === 'pending' ? <Button variant="secondary" onClick={() => setQrOpen(true)}><QrCode /> Show join QR</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {requests.data.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
      <JoinQrDialog open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

function RequestCard({ request: r }: { request: JoinRequest }) {
  const navigate = useNavigate();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const rows: [string, string | null][] = [
    ['Phone', r.phone],
    ['Email', r.email],
    ['Gender', r.gender ? r.gender[0]!.toUpperCase() + r.gender.slice(1) : null],
    ['Date of birth', r.date_of_birth ? formatDate(r.date_of_birth) : null],
    ['Work / study', [r.occupation, r.organization].filter(Boolean).join(' · ') || null],
    ['ID proof', [r.id_proof_type, r.id_proof_number].filter(Boolean).join(' · ') || null],
    ['Home address', r.permanent_address],
    ['Emergency contact', [r.emergency_contact_name, r.emergency_contact_relation, r.emergency_contact_phone].filter(Boolean).join(' · ') || null],
  ];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-gray-900">{r.full_name}</h3>
          <p className="text-xs text-gray-500">
            {r.property_name ?? 'Any property'} · sent {formatDateTime(r.created_at)}
          </p>
        </div>
        {r.status === 'approved' ? (
          <Badge tone="success">Approved</Badge>
        ) : r.status === 'rejected' ? (
          <Badge tone="danger">Rejected</Badge>
        ) : (
          <Badge tone="accent" dot>
            New
          </Badge>
        )}
      </div>
      <div className="flex-1 space-y-3 px-5 py-4">
        {(r.preferred_move_in || r.room_preference) && (
          <div className="flex flex-wrap gap-2">
            {r.preferred_move_in && <Badge tone="info">Move in {formatDate(r.preferred_move_in)}</Badge>}
            {r.room_preference && <Badge tone="info">{r.room_preference}</Badge>}
          </div>
        )}
        {r.from_app && r.status === 'pending' && (
          <p className="rounded-md bg-success-50 px-3 py-2 text-[13px] text-success-700">Sent from the PG Sathi app. Approving also gives them app access with their own login.</p>
        )}
        {r.existing_resident && (
          <p className="rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">
            Same phone as current resident{' '}
            <Link to={`/app/residents/${r.existing_resident.id}`} className="font-medium underline">
              {r.existing_resident.full_name}
            </Link>
            .
          </p>
        )}
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-gray-900">{v}</dd>
              </div>
            ))}
        </dl>
        {r.note && <p className="rounded-md bg-gray-25 px-3 py-2 text-[13px] text-gray-700 ring-1 ring-gray-100">“{r.note}”</p>}
        {r.reject_reason && <p className="text-[13px] text-gray-500">Reason: {r.reject_reason}</p>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-gray-100 px-5 py-3">
        {r.status === 'pending' ? (
          <>
            <Button onClick={() => setApproving(true)}>
              <UserCheck /> Approve
            </Button>
            <Button variant="secondary" asChild>
              <a href={`tel:${r.phone}`}>
                <Phone /> Call
              </a>
            </Button>
            <Button variant="ghost" className="ml-auto text-danger-600" onClick={() => setRejecting(true)}>
              <X /> Reject
            </Button>
          </>
        ) : r.resident_id ? (
          <Button variant="secondary" onClick={() => navigate(`/app/residents/${r.resident_id}`)}>
            Open resident
          </Button>
        ) : null}
      </div>
      <ApproveDialog open={approving} onOpenChange={setApproving} request={r} />
      <RejectDialog open={rejecting} onOpenChange={setRejecting} request={r} />
    </Card>
  );
}

/** Quick check of the key details, then approve and go straight to assigning a bed and rent. */
function ApproveDialog({ open, onOpenChange, request }: { open: boolean; onOpenChange: (o: boolean) => void; request: JoinRequest }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const openDialog = useDialogs((s) => s.open);
  const [name, setName] = useState(request.full_name);
  const [phone, setPhone] = useState(request.phone);
  useEffect(() => {
    if (open) {
      setName(request.full_name);
      setPhone(request.phone);
    }
  }, [open, request]);
  const approve = useTenantMutation(tenantId, () =>
    data.approveJoinRequest(request.id, {
      ...(name.trim() !== request.full_name ? { full_name: name.trim() } : {}),
      ...(phone.trim() !== request.phone ? { phone: phone.trim() } : {}),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={`Approve ${request.full_name}?`}
        description={`They are added as a resident with the details they filled in${request.from_app ? ', and their PG Sathi app login gets access straight away' : ''}. Next you choose their bed, rent and deposit.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve
                  .mutateAsync()
                  .then((residentId) => {
                    toast.success(`${name.trim()} added as a resident`);
                    onOpenChange(false);
                    openDialog({ kind: 'assign-bed', residentId });
                  })
                  .catch(() => undefined)
              }
            >
              <UserCheck /> Approve and assign bed
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="ap-name">
            <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="ap-phone">
            <Input id="ap-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          {request.room_preference && <p className="text-[13px] text-gray-600">Wants: {request.room_preference}{request.preferred_move_in ? `, from ${formatDate(request.preferred_move_in)}` : ''}</p>}
          <InlineError error={approve.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onOpenChange, request }: { open: boolean; onOpenChange: (o: boolean) => void; request: JoinRequest }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [reason, setReason] = useState('');
  const reject = useTenantMutation(tenantId, () => data.rejectJoinRequest(request.id, reason.trim() || null));
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reject ${request.full_name}?`}
      description="They are not added. The request moves to Rejected."
      confirmLabel="Reject"
      destructive
      onConfirm={() => reject.mutateAsync().then(() => toast.success('Request rejected'))}
    >
      <Field label="Reason (only you see this)" htmlFor="rj-reason">
        <Textarea id="rj-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No beds available" />
      </Field>
    </ConfirmDialog>
  );
}
