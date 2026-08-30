import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnlineProviderId } from '../types/onlineMusic';
import { omni } from '../services/onlineMusic/omni';

// src/hooks/useOnlineProviderPhoneLogin.ts
// 手机号短信验证码登录状态机，与 useOnlineProviderQrLogin 对称：同样经 omni 的
// provider-explicit 方法，登录成功后复用 onConfirmed 完成账号快照刷新。

const SEND_COUNTDOWN_SECONDS = 60;
/** 中国大陆手机号（11 位，1 开头）。 */
const CN_PHONE_PATTERN = /^1\d{10}$/;

type UseOnlineProviderPhoneLoginOptions = {
    providerId: OnlineProviderId;
    onConfirmed: (providerId: OnlineProviderId) => void | Promise<void>;
    t: (key: string) => string;
};

export const useOnlineProviderPhoneLogin = ({
    providerId,
    onConfirmed,
    t,
}: UseOnlineProviderPhoneLoginOptions) => {
    const [phone, setPhone] = useState('');
    const [captcha, setCaptcha] = useState('');
    const [sending, setSending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const onConfirmedRef = useRef(onConfirmed);
    const countdownTimerRef = useRef<number | null>(null);

    useEffect(() => {
        onConfirmedRef.current = onConfirmed;
    }, [onConfirmed]);

    // 发送成功后 60s 倒计时；到 0 自动停止，允许再次发送。
    useEffect(() => {
        if (countdown <= 0) {
            if (countdownTimerRef.current !== null) {
                window.clearTimeout(countdownTimerRef.current);
                countdownTimerRef.current = null;
            }
            return;
        }
        countdownTimerRef.current = window.setTimeout(() => {
            setCountdown(prev => prev - 1);
        }, 1000);
        return () => {
            if (countdownTimerRef.current !== null) {
                window.clearTimeout(countdownTimerRef.current);
                countdownTimerRef.current = null;
            }
        };
    }, [countdown]);

    const reset = useCallback(() => {
        setPhone('');
        setCaptcha('');
        setSending(false);
        setSubmitting(false);
        setCountdown(0);
        setError(null);
        setSuccess(false);
    }, []);

    const sendCaptcha = useCallback(async () => {
        if (sending || countdown > 0) return;
        if (!CN_PHONE_PATTERN.test(phone.trim())) {
            setError(t('home.phoneInvalid'));
            return;
        }
        setSending(true);
        setError(null);
        try {
            const result = await omni.sendLoginCaptcha(providerId, phone.trim());
            if (result.ok) {
                setCountdown(SEND_COUNTDOWN_SECONDS);
            } else {
                setError(result.error || t('home.captchaSendFailed'));
            }
        } catch (err) {
            console.warn('[PhoneLogin] sendCaptcha:error', {
                providerId,
                name: err instanceof Error ? err.name : 'Error',
                message: err instanceof Error ? err.message : String(err),
            });
            setError(t('home.captchaSendFailed'));
        } finally {
            setSending(false);
        }
    }, [sending, countdown, phone, providerId, t]);

    const submit = useCallback(async () => {
        if (submitting) return;
        if (!CN_PHONE_PATTERN.test(phone.trim())) {
            setError(t('home.phoneInvalid'));
            return;
        }
        if (!captcha.trim()) {
            setError(t('home.captchaInvalid'));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await omni.loginByPhoneCaptcha(providerId, phone.trim(), captcha.trim());
            setSuccess(true);
            await onConfirmedRef.current(providerId);
        } catch (err) {
            console.warn('[PhoneLogin] submit:error', {
                providerId,
                name: err instanceof Error ? err.name : 'Error',
                message: err instanceof Error ? err.message : String(err),
            });
            // 服务端拒绝（验证码错误/风控）时透传其 message，其余情况给通用文案。
            setError(err instanceof Error && err.message && err.message !== 'Error'
                ? err.message
                : t('home.phoneLoginFailed'));
        } finally {
            setSubmitting(false);
        }
    }, [submitting, phone, captcha, providerId, t]);

    return {
        phone,
        setPhone,
        captcha,
        setCaptcha,
        sending,
        submitting,
        countdown,
        error,
        success,
        sendCaptcha,
        submit,
        reset,
    };
};
