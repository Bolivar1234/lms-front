'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enrollUser, enrollFree, subscribeFree } from '@/app/[locale]/(public)/checkout/actions';
import { StripePaymentForm } from '@/components/public/stripe-payment-form';
import { createPaymentRequest } from '@/app/actions/payment-requests';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTranslations } from 'next-intl';
import { SALES_BLOCKED_CODE, SALES_BLOCKED_MESSAGE } from '@/lib/billing/sales-block-error';
import {
    IconLoader2,
    IconCreditCard,
    IconBuildingBank,
    IconCheck,
    IconLock,
    IconCalendar,
    IconAlertTriangle,
    IconCopy,
} from '@tabler/icons-react';

interface CheckoutFormProps {
    courseId?: string;
    planId?: string;
    title: string;
    description?: string | null;
    price: number | string;
    formattedPrice?: string | null;
    productId?: number;
    durationDays?: number;
    durationHours?: number;
    features?: string | null;
    userName?: string;
    userEmail?: string;
    paymentProvider?: string | null;
    /** The price shown already includes the platform fee passed on to the buyer (#927). */
    feeIncluded?: boolean;
}

export function CheckoutForm({
    courseId,
    planId,
    title,
    description,
    price,
    formattedPrice,
    productId,
    durationDays,
    durationHours,
    features,
    userName,
    userEmail,
    paymentProvider,
    feeIncluded = false,
}: CheckoutFormProps) {
    const [isPending, startTransition] = useTransition();
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'offline'>('card');
    const [offlineData, setOfflineData] = useState({
        name: userName || '',
        email: userEmail || '',
        phone: '',
        message: ''
    });
    const router = useRouter();
    const t = useTranslations('checkout');
    const tFees = useTranslations('platformFees');

    // Provider-agnostic checkout: hosted rails redirect; Binance personal
    // returns transfer instructions. Other providers use the inline flow.
    const isRedirectProvider =
        paymentProvider === 'lemonsqueezy' ||
        paymentProvider === 'paypal' ||
        paymentProvider === 'binance';
    // Binance Pay (personal): the buyer manually transfers USDT to the school's
    // Pay ID with a note code, then we poll a verify endpoint. No redirect, no
    // QR-request URL — the checkout returns transfer instructions to display.
    const isInstructionsProvider = paymentProvider === 'binance_personal';
    // Binance-personal transfer instructions + QR of the Pay ID string, plus a
    // flag set when a poll reports a colliding payment awaiting admin review.
    const [instructions, setInstructions] = useState<{
        payId: string;
        amount: number;
        currency: string;
        code: string;
    } | null>(null);
    const [instructionsQr, setInstructionsQr] = useState<string | null>(null);
    const [instructionsAmbiguous, setInstructionsAmbiguous] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // One verify round, shared by the interval and the "I've paid" button.
    const verifyNowRef = useRef<(() => Promise<boolean>) | null>(null);
    const [checkingNow, setCheckingNow] = useState(false);
    const [checkedNotFound, setCheckedNotFound] = useState(false);

    // Clean up the payment poll on unmount.
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const isFree = typeof price === 'number' ? price === 0 : price === t('free')
    const showOfflineTab = !paymentProvider || paymentProvider === 'manual';
    const displayPrice = formattedPrice || (typeof price === 'number' ? `$${price}` : price);

    // Parse features into a list. Plans store features as a JSON array string
    // (e.g. '["Unlimited course access","Certificate"]'); other sources may use
    // plain newline/comma-separated text. Try JSON first, fall back to splitting.
    const featureList: string[] = (() => {
        if (!features) return [];
        const trimmed = features.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(f => String(f).trim()).filter(Boolean);
                }
            } catch {
                /* not valid JSON — fall through to plain-text split */
            }
        }
        return trimmed.split(/[\n,]+/).map(f => f.trim()).filter(Boolean);
    })();

    const checkoutDone = (transactionId: number) => {
        toast.success(t('toasts.paymentSuccess'));
        router.push(`/checkout/success?transactionId=${transactionId}`);
    };

    // "I've paid": skip the poll tick and check Binance right now.
    const checkPaymentNow = async () => {
        if (!verifyNowRef.current || checkingNow) return;
        setCheckingNow(true);
        setCheckedNotFound(false);
        const confirmed = await verifyNowRef.current();
        setCheckingNow(false);
        if (!confirmed) setCheckedNotFound(true);
    };

    const copyText = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t('toasts.copied'));
        } catch {
            toast.error(t('toasts.copyFailed'));
        }
    };

    // Poll the personal Binance verifier until the transfer is confirmed.
    const startVerifyPoll = (
        txId: number,
        opts?: { endpoint?: string; interval?: number },
    ) => {
        const endpoint = opts?.endpoint ?? '/api/payments/binance-personal/verify';
        const interval = opts?.interval ?? 10000;
        if (pollRef.current) clearInterval(pollRef.current);
        const verifyOnce = async (): Promise<boolean> => {
            try {
                const vr = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactionId: txId }),
                });
                const vd = await vr.json();
                // Binance-personal: a colliding payment needs school review; surface
                // it but keep polling (admin resolution flips the tx → successful).
                if (vd.ambiguous) setInstructionsAmbiguous(true);
                if (vd.confirmed) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    checkoutDone(txId);
                    return true;
                }
            } catch {
                /* transient poll error — keep polling */
            }
            return false;
        };
        verifyNowRef.current = verifyOnce;
        pollRef.current = setInterval(verifyOnce, interval);
    };

    // Create the pending transaction + provider checkout session. Returns the
    // parsed response so callers can branch on `kind` (redirect / qr).
    const createCheckoutSession = async () => {
        const res = await fetch('/api/payments/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId: planId ? parseInt(planId) : undefined,
                productId,
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            // Platform fee sales block (#929): neutral, translated copy.
            const checkoutError = data.code === SALES_BLOCKED_CODE
                ? tFees('salesBlocked')
                : data.code === 'CHECKOUT_TERMS_CHANGED'
                    ? t('payment.pendingTermsChanged')
                    : data.code === 'PAYMENT_REVIEW'
                        ? t('payment.pendingReview')
                        : data.code === 'PAYMENT_PROVIDER_UNAVAILABLE'
                            ? t('payment.pendingUnavailable')
                            : data.code === 'CHECKOUT_IN_FLIGHT'
                                ? t('payment.pendingInFlight')
                                : data.error || 'Checkout failed';
            throw new Error(checkoutError);
        }
        return data as {
            kind: string;
            url: string | null;
            transactionId: number;
            instructions?: { payId: string; amount: number; currency: string; code: string };
        };
    };

    // Real provider checkout (hosted redirect or Binance instructions). Returns true
    // if it handled the flow, false to fall back to the inline/mock path.
    const startProviderCheckout = async (): Promise<boolean> => {
        if (!isRedirectProvider && !isInstructionsProvider) return false;

        const data = await createCheckoutSession();

        if (data.kind === 'success' && data.transactionId) {
            checkoutDone(data.transactionId);
            return true;
        }

        if (data.kind === 'redirect' && data.url) {
            // Lemon Squeezy hosted checkout — leave the app.
            window.location.href = data.url;
            return true;
        }

        if (data.kind === 'instructions' && data.instructions) {
            // Binance Pay (personal) — show the school's Pay ID + note code, render
            // a QR of the Pay ID, and poll the verify endpoint every 10s (Binance
            // API weight limits a tighter cadence) until the transfer is matched.
            const dataUrl = await QRCode.toDataURL(data.instructions.payId, { width: 240, margin: 1 });
            setInstructions(data.instructions);
            setInstructionsQr(dataUrl);
            startVerifyPoll(data.transactionId, {
                endpoint: '/api/payments/binance-personal/verify',
                interval: 10000,
            });
            return true;
        }

        throw new Error('Unsupported checkout response');
    };

    const handleEnroll = () => {
        startTransition(async () => {
            try {
                if (isFree) {
                    // Free plan → activate a zero-price subscription; free course →
                    // grant a free entitlement. Both are one-click, no payment.
                    if (planId) {
                        await subscribeFree(planId);
                        toast.success(t('toasts.success'));
                        router.push('/dashboard/student/browse?checkout=success');
                    } else {
                        await enrollFree(courseId);
                        toast.success(t('toasts.success'));
                        router.push(`/dashboard/student/courses/${courseId}`);
                    }
                    return;
                }

                if (paymentMethod === 'card') {
                    // Hosted rails go through the real provider checkout;
                    // everything else uses the existing inline (mock) enrollment.
                    if (isRedirectProvider || isInstructionsProvider) {
                        const handled = await startProviderCheckout();
                        if (handled) return; // redirect leaves the page / QR or instructions keep loading
                    }
                    const result = await enrollUser(courseId, planId, 'mock_test');
                    toast.success(t('toasts.paymentSuccess'));
                    router.push(`/checkout/success?transactionId=${result.transaction_id}`);
                } else {
                    // Offline payment — works for both products and plans
                    if (productId) {
                        const { error } = await createPaymentRequest({
                            productId,
                            contactName: offlineData.name,
                            contactEmail: offlineData.email,
                            contactPhone: offlineData.phone,
                            message: offlineData.message
                        });
                        if (error) throw new Error(error);
                        toast.success(t('toasts.requestSent'));
                        router.push('/dashboard/student/payments');
                    } else if (planId) {
                        const { error } = await createPaymentRequest({
                            planId: parseInt(planId),
                            contactName: offlineData.name,
                            contactEmail: offlineData.email,
                            contactPhone: offlineData.phone,
                            message: offlineData.message
                        });
                        if (error) throw new Error(error);
                        toast.success(t('toasts.requestSent'));
                        router.push('/dashboard/student/payments');
                    } else {
                        throw new Error("No product or plan to process");
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // Server actions / payment requests refuse a blocked school with
                // the English SALES_BLOCKED_MESSAGE; show the translated copy (#929).
                toast.error(message === SALES_BLOCKED_MESSAGE
                    ? tFees('salesBlocked')
                    : t('toasts.error', { message }));
            }
        });
    };

    // ─── Order summary block (shared between free and paid) ───
    const orderSummary = (
        <div className="border-b border-border px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{t('item')}</p>
                    <p className="mt-0.5 font-semibold">{title}</p>
                    {description && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {description}
                        </p>
                    )}
                    {durationDays && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <IconCalendar className="h-3.5 w-3.5" />
                            {t('duration', { days: durationDays })}
                        </p>
                    )}
                    {durationHours && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <IconCalendar className="h-3.5 w-3.5" />
                            {t('durationHours', { hours: durationHours })}
                        </p>
                    )}
                </div>
                <div className="shrink-0 text-right">
                    <span className="text-2xl font-extrabold tabular-nums tracking-tight">
                        {isFree ? t('free') : displayPrice}
                    </span>
                    {feeIncluded && !isFree && (
                        <p className="mt-1 text-xs text-muted-foreground" data-testid="checkout-fee-included">
                            {t('feeIncluded')}
                        </p>
                    )}
                </div>
            </div>

            {/* Features list */}
            {featureList.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t('included')}</p>
                    <ul className="space-y-1.5">
                        {featureList.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                                <IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                {feature}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );

    // ─── Free enrollment ───
    if (isFree) {
        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-4 sm:px-8">
                    <Button
                        className="w-full"
                        onClick={handleEnroll}
                        disabled={isPending}
                    >
                        {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isPending ? t('enrollment.enrolling') : t('enrollment.button')}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Provider checkout (hosted redirect / Binance-personal instructions) ───
    if (isRedirectProvider || isInstructionsProvider) {
        const showActions = !instructions;

        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-6 sm:px-8">
                    {instructions ? (
                        <div className="flex flex-col items-center gap-4 text-center">
                            <p className="text-sm font-medium">{t('payment.binancePersonalTitle')}</p>
                            {instructionsQr && (
                                /* The QR keeps an explicit white plate + quiet zone on every
                                   theme — its modules are black and inverted or tinted quiet
                                   zones fail on a meaningful share of phone scanners. Content
                                   colour, not chrome: do not tokenise it. */
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={instructionsQr}
                                    alt="Binance Pay ID QR"
                                    width={240}
                                    height={240}
                                    className="rounded-lg border border-border bg-white p-2 box-content"
                                />
                            )}
                            <div className="w-full space-y-3 text-left">
                                {/* School Pay ID */}
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">{t('payment.binancePersonalPayId')}</p>
                                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                                        <span className="truncate font-mono text-sm">{instructions.payId}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0"
                                            aria-label={t('payment.binancePersonalCopyPayId')}
                                            onClick={() => copyText(instructions.payId)}
                                        >
                                            <IconCopy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                {/* Exact amount */}
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                                    <span className="text-xs font-medium text-muted-foreground">{t('payment.binancePersonalAmount')}</span>
                                    <span className="font-semibold tabular-nums">
                                        {instructions.amount} {instructions.currency}
                                    </span>
                                </div>
                                {/* Note code — prominent + copyable */}
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">{t('payment.binancePersonalCode')}</p>
                                    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5">
                                        <span className="truncate font-mono text-base font-bold tracking-wide text-foreground">{instructions.code}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0"
                                            aria-label={t('payment.binancePersonalCopyCode')}
                                            onClick={() => copyText(instructions.code)}
                                        >
                                            <IconCopy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-muted-foreground">{t('payment.binancePersonalNote')}</p>
                                </div>
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                {t('payment.binancePersonalWaiting')}
                            </p>
                            <Button type="button" variant="outline" className="w-full" onClick={checkPaymentNow} disabled={checkingNow}>
                                {checkingNow && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {checkingNow ? t('payment.binancePersonalChecking') : t('payment.binancePersonalPaid')}
                            </Button>
                            {checkedNotFound && !checkingNow && (
                                <p className="text-xs text-muted-foreground" role="status">
                                    {t('payment.binancePersonalNotFoundYet')}
                                </p>
                            )}
                            {instructionsAmbiguous && (
                                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
                                    <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    {t('payment.binancePersonalReview')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                {isInstructionsProvider
                                    ? t('payment.binancePersonalInstructions')
                                    : t('payment.redirectInstructions')}
                            </p>
                        </div>
                    )}
                </div>

                {showActions && (
                    <div className="border-t border-border px-6 py-4 sm:px-8">
                        <Button className="w-full" onClick={handleEnroll} disabled={isPending}>
                            {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isPending
                                ? t('payment.processing')
                                : isInstructionsProvider
                                  ? t('payment.binancePersonalContinue')
                                  : t('payment.button')}
                        </Button>
                        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <IconLock className="h-3 w-3" />
                            {t('secureCheckout')}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // ─── Paid checkout ───
    // Stripe uses a real PaymentElement (webhook grants enrollment). The mock
    // "Pay & Enroll (Test)" button is a dev-only sandbox escape hatch — never
    // shown in production, and never for redirect/QR/manual providers (those
    // return earlier or use the offline tab).
    const isStripe = paymentProvider === 'stripe';
    const allowSandbox = process.env.NODE_ENV !== 'production' && paymentProvider !== 'manual';

    // Card payment panel: real Stripe form, an unavailable notice, or (in dev)
    // just the sandbox button below it.
    const cardPanel = (
        <div className="space-y-4">
            {isStripe ? (
                <StripePaymentForm
                    productId={productId}
                    planId={planId}
                    price={price}
                    hasManualFallback={showOfflineTab}
                />
            ) : !allowSandbox ? (
                <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    {t('payment.cardUnavailable')}
                </p>
            ) : null}

            {allowSandbox && (
                <div className="space-y-2">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleEnroll}
                        disabled={isPending}
                    >
                        {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isPending ? t('payment.processing') : t('payment.sandboxButton')}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                        {t('payment.sandboxHint')}
                    </p>
                </div>
            )}
        </div>
    );

    const offlinePanel = (
        <div className="space-y-4">
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {t('payment.offlineInstructions')}
            </p>
            <div className="space-y-1.5">
                <Label htmlFor="offlineName" className="text-xs font-medium">{t('payment.contactName')}</Label>
                <Input
                    id="offlineName"
                    placeholder="Your Name"
                    value={offlineData.name}
                    onChange={e => setOfflineData({ ...offlineData, name: e.target.value })}
                    disabled={isPending}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="offlineEmail" className="text-xs font-medium">{t('payment.contactEmail')}</Label>
                <Input
                    id="offlineEmail"
                    type="email"
                    placeholder="email@example.com"
                    value={offlineData.email}
                    onChange={e => setOfflineData({ ...offlineData, email: e.target.value })}
                    disabled={isPending}
                    readOnly={!!userEmail}
                    className={userEmail ? 'bg-muted' : ''}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="offlinePhone" className="text-xs font-medium">{t('payment.contactPhone')}</Label>
                <Input
                    id="offlinePhone"
                    placeholder="+1 234 567 8900"
                    value={offlineData.phone}
                    onChange={e => setOfflineData({ ...offlineData, phone: e.target.value })}
                    disabled={isPending}
                />
            </div>
            <Button
                className="w-full"
                onClick={handleEnroll}
                disabled={isPending}
            >
                {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t('payment.processing') : t('payment.requestButton')}
            </Button>
        </div>
    );

    return (
        <div className="rounded-xl border border-border bg-card">
            {orderSummary}

            {/* Payment methods */}
            <div className="px-6 py-6 sm:px-8">
                {showOfflineTab ? (
                    <Tabs defaultValue="card" onValueChange={(v) => v && setPaymentMethod(v as 'card' | 'offline')}>
                        <TabsList className="w-full">
                            <TabsTrigger value="card" className="flex-1 gap-1.5">
                                <IconCreditCard className="h-3.5 w-3.5" />
                                {t('payment.card')}
                            </TabsTrigger>
                            <TabsTrigger value="offline" className="flex-1 gap-1.5">
                                <IconBuildingBank className="h-3.5 w-3.5" />
                                {t('payment.offline')}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="card" className="mt-5">
                            {cardPanel}
                        </TabsContent>

                        <TabsContent value="offline" className="mt-5">
                            {offlinePanel}
                        </TabsContent>
                    </Tabs>
                ) : (
                    cardPanel
                )}
            </div>

            <div className="border-t border-border px-6 py-4 sm:px-8">
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <IconLock className="h-3 w-3" />
                    {t('secureCheckout')}
                </p>
            </div>
        </div>
    );
}
