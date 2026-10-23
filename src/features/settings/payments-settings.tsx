import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, QrCode, ShieldCheck, Zap } from 'lucide-react';
import { useBackend, usePaymentGateway, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { formatDateTime } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, Switch } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, CardBody, CardHeader, Skeleton } from '@pg/ui-web/ui/surfaces';
import { ConfirmDialog, Field, InlineError } from '@pg/ui-web/common';
import { UPI_ID, UpiQr, upiPayUrl } from '@/components/upi-qr';
import { useCurrentWorkspace } from '@/app/workspace';

/**
 * Settings → Online payments. Two ways for residents to pay:
 *  - UPI QR (manual): money goes straight to the owner's UPI ID; the owner records it.
 *  - Razorpay (automatic): the owner's own Razorpay account; payments are recorded by themselves.
 */
export function OnlinePaymentsSettings() {
  return (
    <div className="space-y-6">
      <RazorpayCard />
      <UpiQrCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// UPI QR (manual)
// ---------------------------------------------------------------------------
function UpiQrCard() {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const ws = useWorkspace(tenantId);
  const saved = ws.data?.settings.upi_id ?? '';
  const [upi, setUpi] = useState(saved);
  useEffect(() => setUpi(saved), [saved]);
  const name = ws.data?.tenant.name ?? 'Your PG';
  const valid = UPI_ID.test(upi.trim());
  const save = useTenantMutation(tenantId, () => data.updateSettings(tenantId, { upi_id: upi.trim() || null }));

  const download = async () => {
    const url = await QRCode.toDataURL(upiPayUrl({ upiId: saved, payeeName: name }), { width: 1024, margin: 2, color: { dark: '#14213D', light: '#FFFFFF' } });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, '-')}-UPI-QR.png`;
    a.click();
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <QrCode className="size-4 text-gray-500" /> UPI QR code <Badge>Manual</Badge>
          </span>
        }
        description="Residents scan and pay straight to your UPI ID. UPI does not tell PG Sathi when money arrives, so you record these payments yourself."
      />
      <CardBody>
        {!ws.data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-4">
              <Field label="Your UPI ID" htmlFor="pay-upi" hint="e.g. sunrisepg@okhdfcbank. Shown on bills and in the resident app." error={upi.trim() && !valid ? 'That does not look like a UPI ID (name@bank).' : undefined}>
                <Input id="pay-upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@bank" autoComplete="off" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={upi.trim() === saved || (upi.trim() !== '' && !valid)}
                  loading={save.isPending}
                  onClick={() => save.mutate(undefined, { onSuccess: () => toast.success(upi.trim() ? 'UPI ID saved' : 'UPI ID removed') })}
                >
                  Save UPI ID
                </Button>
                {saved && (
                  <Button variant="secondary" onClick={() => void download()}>
                    <Download /> Download QR
                  </Button>
                )}
              </div>
              <ul className="space-y-1 text-[13px] text-gray-600">
                <li>• Printed bills show a QR with the exact amount.</li>
                <li>• The resident app opens their UPI app with the amount filled in.</li>
                <li>• Print the QR and put it at the front desk for walk-in payments.</li>
              </ul>
              <InlineError error={save.error} />
            </div>
            {saved && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-25 p-4">
                <UpiQr value={upiPayUrl({ upiId: saved, payeeName: name })} size={176} label={`UPI QR code for ${name}`} />
                <p className="text-center text-xs text-gray-500">
                  {name}
                  <br />
                  <span className="font-medium text-gray-700">{saved}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Razorpay (automatic)
// ---------------------------------------------------------------------------
function RazorpayCard() {
  const { tenantId } = useCurrentWorkspace();
  const { data, onlinePayments, mode } = useBackend();
  const gateway = usePaymentGateway(tenantId);
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const toggle = useTenantMutation(tenantId, (on: boolean) => data.setPaymentGatewayEnabled(tenantId, on));
  const remove = useTenantMutation(tenantId, () => data.removePaymentGateway(tenantId));
  const g = gateway.data;
  const service = onlinePayments?.available ? onlinePayments : null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Zap className="size-4 text-accent-600" /> Razorpay <Badge tone="accent">Automatic</Badge>
          </span>
        }
        description="Residents pay by UPI, card or netbanking from the app. Money goes to your own Razorpay account, and the payment is recorded against the bill automatically."
        action={
          g ? (
            <div className="flex items-center gap-2">
              <Badge tone={g.mode === 'live' ? 'success' : 'warning'} dot>
                {g.mode === 'live' ? 'Live' : 'Test mode'}
              </Badge>
              <Badge tone={g.is_enabled ? 'success' : undefined}>{g.is_enabled ? 'On' : 'Off'}</Badge>
            </div>
          ) : undefined
        }
      />
      <CardBody>
        {gateway.isPending ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : !service ? (
          <p className="rounded-lg border border-gray-200 bg-gray-25 p-4 text-[13px] text-gray-600">
            {mode === 'supabase'
              ? 'Online payments need the PG Sathi payments service. Set VITE_RESIDENT_API_URL for this app (see README).'
              : 'Online payments are switched off in demo mode, because nothing here talks to a real payment provider.'}
          </p>
        ) : g && !editing ? (
          <div className="space-y-6">
            <dl className="grid gap-4 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Key ID</dt>
                <dd className="mt-0.5 font-mono text-gray-900">{g.key_id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Keys checked with Razorpay</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-gray-900">
                  <ShieldCheck className="size-4 text-success-600" /> {formatDateTime(g.verified_at)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Accept online payments</dt>
                <dd className="mt-1">
                  <Switch
                    checked={g.is_enabled}
                    disabled={toggle.isPending}
                    aria-label="Accept online payments"
                    onCheckedChange={(on) => toggle.mutate(on, { onSuccess: () => toast.success(on ? 'Residents can pay online again' : 'Online payments paused') })}
                  />
                </dd>
              </div>
            </dl>
            {g.mode === 'test' && (
              <p className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-[13px] text-warning-700">
                Test mode: residents see Razorpay’s test checkout and no real money moves. When you are ready, generate <b>Live</b> keys in Razorpay and click <b>Update keys</b>.
              </p>
            )}
            <WebhookSetup webhookUrl={service.webhookUrl(tenantId)} hasSecret={g.has_webhook_secret} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Update keys
              </Button>
              <Button variant="ghost" className="text-danger-600" onClick={() => setDisconnecting(true)}>
                Disconnect Razorpay
              </Button>
            </div>
            <InlineError error={toggle.error} />
          </div>
        ) : (
          <ConnectForm connected={!!g} onDone={() => setEditing(false)} />
        )}
      </CardBody>
      <ConfirmDialog
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title="Disconnect Razorpay?"
        description="Residents will no longer see “Pay online”. Your keys are deleted from PG Sathi. Payments already received stay recorded."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => remove.mutateAsync().then(() => toast.success('Razorpay disconnected'))}
      />
    </Card>
  );
}

function ConnectForm({ connected, onDone }: { connected: boolean; onDone: () => void }) {
  const { tenantId } = useCurrentWorkspace();
  const { onlinePayments } = useBackend();
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const connect = useTenantMutation(tenantId, () =>
    onlinePayments!.connect({ tenantId, keyId: keyId.trim(), keySecret: keySecret.trim(), webhookSecret: webhookSecret.trim() || null }),
  );
  const keyOk = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId.trim());

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          connect.mutate(undefined, {
            onSuccess: (r) => {
              toast.success(r.mode === 'live' ? 'Razorpay connected. Residents can now pay online.' : 'Razorpay connected in test mode.');
              onDone();
            },
          });
        }}
      >
        <Field label="Key ID" htmlFor="rzp-key" required hint="Starts with rzp_test_ or rzp_live_" error={keyId.trim() && !keyOk ? 'Should start with rzp_test_ or rzp_live_' : undefined}>
          <Input id="rzp-key" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_XXXXXXXXXXXXXX" autoComplete="off" spellCheck={false} className="font-mono" />
        </Field>
        <Field label="Key Secret" htmlFor="rzp-secret" required hint="Shown once by Razorpay when you generate the key. Stored securely; PG Sathi never shows it again.">
          <Input id="rzp-secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="new-password" spellCheck={false} className="font-mono" />
        </Field>
        <Field label="Webhook secret" htmlFor="rzp-wh" hint={connected ? 'Leave blank to keep the one already saved.' : 'Optional, but recommended. See step 4.'}>
          <Input id="rzp-wh" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="new-password" spellCheck={false} className="font-mono" />
        </Field>
        <InlineError error={connect.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={connect.isPending} disabled={!keyOk || keySecret.trim().length < 8}>
            <ShieldCheck /> {connected ? 'Check and save keys' : 'Connect Razorpay'}
          </Button>
          {connected && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500">We check the keys with Razorpay before saving. Your Key Secret is never shown in the app or sent to residents.</p>
      </form>
      <ol className="space-y-3 rounded-xl border border-gray-200 bg-gray-25 p-4 text-[13px] text-gray-700">
        <li>
          <b>1.</b> Sign up at{' '}
          <a href="https://dashboard.razorpay.com/signup" target="_blank" rel="noreferrer" className="font-medium text-accent-700 hover:underline">
            razorpay.com <ExternalLink className="inline size-3" />
          </a>{' '}
          and complete business verification (KYC) so payments reach your bank.
        </li>
        <li>
          <b>2.</b> In Razorpay go to <b>Account &amp; Settings → API Keys</b> and click <b>Generate Key</b>. Start in <b>Test mode</b> to try it safely.
        </li>
        <li>
          <b>3.</b> Paste the Key ID and Key Secret here and click Connect.
        </li>
        <li>
          <b>4.</b> After connecting, add the webhook shown here so payments are recorded even if a resident closes the app mid-payment.
        </li>
      </ol>
    </div>
  );
}

function WebhookSetup({ webhookUrl, hasSecret }: { webhookUrl: string; hasSecret: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-gray-900">Webhook (recommended)</h4>
        <Badge tone={hasSecret ? 'success' : 'warning'} dot>
          {hasSecret ? 'Secret saved' : 'Not set up'}
        </Badge>
      </div>
      <p className="mt-1 text-[13px] text-gray-600">
        Lets Razorpay tell PG Sathi about a payment even if the resident’s phone loses connection. In Razorpay go to <b>Account &amp; Settings → Webhooks → Add New Webhook</b>:
      </p>
      <ol className="mt-3 space-y-2 text-[13px] text-gray-700">
        <li className="flex flex-wrap items-center gap-2">
          <span>Webhook URL:</span>
          <code className="max-w-full truncate rounded bg-gray-50 px-2 py-1 font-mono text-xs ring-1 ring-gray-200">{webhookUrl}</code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(webhookUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </li>
        <li>Secret: make up a password, type it in Razorpay and in “Webhook secret” here (Update keys).</li>
        <li>
          Active events: <b>payment.captured</b> and <b>order.paid</b>.
        </li>
      </ol>
    </div>
  );
}
