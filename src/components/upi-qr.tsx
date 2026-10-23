import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@pg/ui-web/utils';

/**
 * Standard UPI payment link (NPCI). Any UPI app (GPay, PhonePe, Paytm, BHIM)
 * scanning the QR opens with the PG's UPI ID, and the amount when given.
 * Paise maths only, so the amount is never rounded wrongly.
 */
export function upiPayUrl({ upiId, payeeName, amountPaise, note }: { upiId: string; payeeName: string; amountPaise?: number | null; note?: string | null }) {
  const params: [string, string][] = [['pa', upiId.trim()], ['pn', payeeName]];
  if (amountPaise && amountPaise > 0) params.push(['am', `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, '0')}`]);
  params.push(['cu', 'INR']);
  if (note) params.push(['tn', note.slice(0, 60)]);
  // encodeURIComponent (not URLSearchParams): some UPI apps show "+" literally for spaces.
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** Looks like a UPI ID: name@bank. */
export const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/** QR code that any UPI app can scan. Rendered as inline SVG so it prints sharply. */
export function UpiQr({ value, size = 168, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14213D', light: '#FFFFFF' } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200 [&>svg]:block [&>svg]:size-full', className)}
      style={{ width: size, height: size }}
      // The SVG is generated locally by the qrcode library from our own string.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
