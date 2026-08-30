import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnlineProviderId } from '../types/onlineMusic';
import { omni } from '../services/onlineMusic/omni';

// src/hooks/useOnlineProviderCookieLogin.ts
// Cookie 登录状态机：用户从其他客户端/浏览器粘贴网易云登录 cookie，
// 经 omni.loginByCookie 校验并写入 provider session；成功后复用 onConfirmed。

type UseOnlineProviderCookieLoginOptions = {
    providerId: OnlineProviderId;
    onConfirmed: (providerId: OnlineProviderId) => void | Promise<void>;
    t: (key: string) => string;
};

export const useOnlineProviderCookieLogin = ({
    providerId,
    onConfirmed,
    t,
}: UseOnlineProviderCookieLoginOptions) => {
    const [cookie, setCookie] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const onConfirmedRef = useRef(onConfirmed);

    useEffect(() => {
        onConfirmedRef.current = onConfirmed;
    }, [onConfirmed]);

    const reset = useCallback(() => {
        setCookie('');
        setSubmitting(false);
        setError(null);
        setSuccess(false);
    }, []);

    const submit = useCallback(async () => {
        if (submitting) return;
        if (!cookie.trim()) {
            setError(t('home.cookieEmpty'));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await omni.loginByCookie(providerId, cookie.trim());
            setSuccess(true);
            await onConfirmedRef.current(providerId);
        } catch (err) {
            console.warn('[CookieLogin] submit:error', {
                providerId,
                name: err instanceof Error ? err.name : 'Error',
                message: err instanceof Error ? err.message : String(err),
            });
            // 服务端拒绝（cookie 无效/过期/风控）时透传其 message。
            setError(err instanceof Error && err.message && err.message !== 'Error'
                ? err.message
                : t('home.cookieLoginFailed'));
        } finally {
            setSubmitting(false);
        }
    }, [submitting, cookie, providerId, t]);

    return {
        cookie,
        setCookie,
        submitting,
        error,
        success,
        submit,
        reset,
    };
};
