import { Check, Loader2, RotateCcw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

// src/components/app/home/OnlineProviderLoginModal.tsx

// 可选的登录方式选择（两步式）。provider 不声明就不传，弹窗完全维持原本的单步外观。
// 所有文案都由调用方翻译好再传进来，与 title / statusText 的既有做法一致。
type LoginMethodsProps = {
    title: string;
    hint: string;
    pendingText: string;
    currentText: string;
    options: Array<{ id: string; label: string; iconUrl: string }>;
    selectedId: string | null;
    onSelect: (id: string) => void;
};

// 手机号短信验证码登录表单（可选能力）。provider 声明 supportsPhoneCaptchaLogin 后，
// 调用方传入本组 props，弹窗顶部出现「扫码登录 / 手机号登录」切换；否则完全不渲染。
type PhoneLoginProps = {
    qrTabLabel: string;
    phoneTabLabel: string;
    desc: string;
    phoneLabel: string;
    captchaLabel: string;
    sendLabel: string;
    sendCountdownLabel: string; // 含 {seconds} 占位符的倒计时文案
    loginLabel: string;
    loggingInLabel: string;
    phone: string;
    captcha: string;
    sending: boolean;
    submitting: boolean;
    countdown: number;
    errorText: string | null;
    onPhoneChange: (value: string) => void;
    onCaptchaChange: (value: string) => void;
    onSend: () => void;
    onSubmit: () => void;
};

// Cookie 登录（可选能力）。netease 声明 loginByCookie 后传入；
// 用户粘贴网易云登录 cookie 直接校验，不受验证码登录 IP 风控限制。
type CookieLoginProps = {
    qrTabLabel: string;
    cookieTabLabel: string;
    desc: string;
    cookieLabel: string;
    cookiePlaceholder: string;
    loginLabel: string;
    loggingInLabel: string;
    cookie: string;
    submitting: boolean;
    errorText: string | null;
    onCookieChange: (value: string) => void;
    onSubmit: () => void;
};

type OnlineProviderLoginModalProps = {
    title: string;
    note: string;
    qrCodeImg: string;
    statusText: string;
    state: 'idle' | 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
    retryLabel: string;
    closeLabel: string;
    loginMethods?: LoginMethodsProps;
    phoneLogin?: PhoneLoginProps;
    cookieLogin?: CookieLoginProps;
    onRetry: () => void;
    onClose: () => void;
};

const inputClass = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors';

const OnlineProviderLoginModal = ({
    title,
    note,
    qrCodeImg,
    statusText,
    state,
    retryLabel,
    closeLabel,
    loginMethods,
    phoneLogin,
    cookieLogin,
    onRetry,
    onClose,
}: OnlineProviderLoginModalProps) => {
    const [mode, setMode] = useState<'qr' | 'phone' | 'cookie'>('qr');
    // 步骤一：还没选登录方式，二维码区显示占位框，且不会向后端发出任何请求。
    const awaitingMethod = Boolean(loginMethods) && loginMethods?.selectedId == null;
    const canRetry = (state === 'expired' || state === 'error') && !awaitingMethod;
    const phoneMode = phoneLogin != null && mode === 'phone';
    const cookieMode = cookieLogin != null && mode === 'cookie';
    const showTabs = phoneLogin != null || cookieLogin != null;
    const countdownText = phoneLogin
        ? phoneLogin.sendCountdownLabel.replace('{seconds}', String(phoneLogin.countdown))
        : '';
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 12 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                className="bg-zinc-900/90 border border-white/10 p-8 rounded-3xl max-w-sm w-full text-center relative shadow-2xl"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="absolute top-4 right-4 opacity-40 hover:opacity-100 rounded-full bg-white/5 p-1 transition-colors cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <X size={16} />
                </button>
                <h3 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                {showTabs && (
                    <div className="mb-5 inline-flex rounded-full bg-white/5 border border-white/10 p-1 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setMode('qr')}
                            className={`px-4 py-1.5 rounded-full transition-colors cursor-pointer ${mode === 'qr' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                        >
                            {phoneLogin?.qrTabLabel ?? cookieLogin?.qrTabLabel ?? ''}
                        </button>
                        {phoneLogin && (
                            <button
                                type="button"
                                onClick={() => setMode('phone')}
                                className={`px-4 py-1.5 rounded-full transition-colors cursor-pointer ${mode === 'phone' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                            >
                                {phoneLogin.phoneTabLabel}
                            </button>
                        )}
                        {cookieLogin && (
                            <button
                                type="button"
                                onClick={() => setMode('cookie')}
                                className={`px-4 py-1.5 rounded-full transition-colors cursor-pointer ${mode === 'cookie' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
                            >
                                {cookieLogin.cookieTabLabel}
                            </button>
                        )}
                    </div>
                )}
                {!phoneMode && loginMethods && (
                    <div className="mb-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-45 mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {loginMethods.title}
                        </p>
                        <p className="text-[11px] leading-snug whitespace-pre-line opacity-55 mb-3" style={{ color: 'var(--text-secondary)' }}>
                            {loginMethods.hint}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            {loginMethods.options.map(option => {
                                const selected = loginMethods.selectedId === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => loginMethods.onSelect(option.id)}
                                        className={`relative flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-semibold transition-colors cursor-pointer ${selected
                                            ? 'border-green-500 bg-green-500/10 text-white'
                                            : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}
                                    >
                                        {selected && (
                                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white">
                                                <Check size={11} strokeWidth={3} />
                                            </span>
                                        )}
                                        <img src={option.iconUrl} alt="" aria-hidden="true" className="w-6 h-6 object-contain" />
                                        <span>{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                {phoneMode && phoneLogin ? (
                    <div className="space-y-3 text-left">
                        <p className="text-[11px] leading-snug opacity-55 text-center" style={{ color: 'var(--text-secondary)' }}>
                            {phoneLogin.desc}
                        </p>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-45 mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                {phoneLogin.phoneLabel}
                            </label>
                            <input
                                type="tel"
                                inputMode="numeric"
                                autoComplete="tel"
                                maxLength={11}
                                value={phoneLogin.phone}
                                onChange={event => phoneLogin.onPhoneChange(event.target.value.replace(/\D/g, ''))}
                                className={inputClass}
                                placeholder="13800138000"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-45 mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                {phoneLogin.captchaLabel}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={phoneLogin.captcha}
                                    onChange={event => phoneLogin.onCaptchaChange(event.target.value.replace(/\D/g, ''))}
                                    className={inputClass}
                                />
                                <button
                                    type="button"
                                    onClick={phoneLogin.onSend}
                                    disabled={phoneLogin.sending || phoneLogin.countdown > 0}
                                    className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                    {phoneLogin.sending ? (
                                        <Loader2 className="animate-spin" size={13} />
                                    ) : phoneLogin.countdown > 0 ? (
                                        countdownText
                                    ) : (
                                        phoneLogin.sendLabel
                                    )}
                                </button>
                            </div>
                        </div>
                        {phoneLogin.errorText && (
                            <p className="text-xs text-red-400 leading-snug text-center">{phoneLogin.errorText}</p>
                        )}
                        <button
                            type="button"
                            onClick={phoneLogin.onSubmit}
                            disabled={phoneLogin.submitting}
                            className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {phoneLogin.submitting ? (
                                <>
                                    <Loader2 className="animate-spin" size={14} />
                                    {phoneLogin.loggingInLabel}
                                </>
                            ) : (
                                phoneLogin.loginLabel
                            )}
                        </button>
                    </div>
                ) : cookieMode && cookieLogin ? (
                    <div className="space-y-3 text-left">
                        <p className="text-[11px] leading-snug opacity-55 text-center" style={{ color: 'var(--text-secondary)' }}>
                            {cookieLogin.desc}
                        </p>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-45 mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                {cookieLogin.cookieLabel}
                            </label>
                            <textarea
                                value={cookieLogin.cookie}
                                onChange={event => cookieLogin.onCookieChange(event.target.value)}
                                rows={4}
                                spellCheck={false}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors resize-none leading-relaxed"
                                placeholder={cookieLogin.cookiePlaceholder}
                            />
                        </div>
                        {cookieLogin.errorText && (
                            <p className="text-xs text-red-400 leading-snug text-center">{cookieLogin.errorText}</p>
                        )}
                        <button
                            type="button"
                            onClick={cookieLogin.onSubmit}
                            disabled={cookieLogin.submitting}
                            className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {cookieLogin.submitting ? (
                                <>
                                    <Loader2 className="animate-spin" size={14} />
                                    {cookieLogin.loggingInLabel}
                                </>
                            ) : (
                                cookieLogin.loginLabel
                            )}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="relative inline-block bg-white p-2 rounded-xl mb-4 shadow-inner">
                            {awaitingMethod ? (
                                <div className="w-40 h-40 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 text-center text-[11px] font-medium leading-snug text-gray-400">
                                    {loginMethods?.pendingText}
                                </div>
                            ) : qrCodeImg ? (
                                <img src={qrCodeImg} alt="QR Code" className="w-40 h-40" />
                            ) : (
                                <div className="w-40 h-40 flex items-center justify-center bg-gray-100 rounded-lg">
                                    <Loader2 className="animate-spin text-gray-400" size={24} />
                                </div>
                            )}
                        </div>
                        {loginMethods && !awaitingMethod && (
                            <p className="text-[11px] font-medium opacity-45" style={{ color: 'var(--text-secondary)' }}>
                                {loginMethods.currentText}
                            </p>
                        )}
                        {/* 步骤一不显示状态文案：关窗重开时 hook 里还留着上一轮的状态，照原样显示会是过期信息。 */}
                        <p className={`text-xs font-medium mt-2 ${state === 'confirmed' ? 'text-green-400' : 'opacity-60'}`} style={{ color: state === 'confirmed' ? undefined : 'var(--text-secondary)' }}>
                            {awaitingMethod ? '' : statusText}
                        </p>
                        {canRetry && (
                            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold transition-colors">
                                <RotateCcw size={13} />
                                {retryLabel}
                            </button>
                        )}
                    </>
                )}
                <p className="text-[10px] opacity-30 mt-6" style={{ color: 'var(--text-secondary)' }}>{note}</p>
            </motion.div>
        </motion.div>
    );
};

export default OnlineProviderLoginModal;
