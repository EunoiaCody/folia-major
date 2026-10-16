import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neteaseApi } from '@/services/netease';
import { neteaseProvider } from '@/services/onlineMusic/neteaseProvider';
import type { UnifiedSong } from '@/types';
import { OnlineProviderError } from '@/types/onlineMusic';
import { parseLyricsAsync } from '@/utils/lyrics/workerClient';

// test/unit/onlineMusic/neteaseProvider.test.ts

vi.mock('@/services/netease', () => ({
    isSongMarkedUnavailable: (candidate: UnifiedSong) => candidate.privilege?.st === -200,
    getNeteaseRemoteApiBase: () => null,
    neteaseApi: {
        normalizeSongResult: vi.fn((raw: unknown) => raw),
        getSongUrl: vi.fn(),
        getLyric: vi.fn(),
        getUnavailableSongReplacement: vi.fn(),
        cloudSearch: vi.fn(),
        getAlbum: vi.fn(),
        getArtistDetail: vi.fn(),
        getArtistAlbums: vi.fn(),
        getPersonalizedPlaylists: vi.fn(),
        getLikedSongs: vi.fn(),
        getUserPlaylists: vi.fn(),
        checkQr: vi.fn(),
        sendLoginCaptcha: vi.fn(),
        verifyLoginCaptcha: vi.fn(),
        loginByPhoneCaptcha: vi.fn(),
        loginByCookie: vi.fn(),
        getMatchedUrl: vi.fn(),
        getQrKey: vi.fn(),
        createQr: vi.fn(),
        scrobbleV1: vi.fn(),
    },
}));

vi.mock('@/utils/lyrics/workerClient', () => ({
    parseLyricsAsync: vi.fn(),
}));

const song: UnifiedSong = {
    id: 42,
    name: 'Song',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '42' },
};

describe('neteaseProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    it('maps semantic high quality to the NetEase exhigh value', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({ data: [{ url: 'http://music.test/song.mp3' }] } as any);
        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).resolves.toMatchObject({
            url: 'https://music.test/song.mp3',
            quality: 'high',
        });
        expect(neteaseApi.getSongUrl).toHaveBeenCalledWith(42, 'exhigh');
    });

    it('maps NetEase track gain from the URL response and keeps negative dB values', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({
            data: [{ url: 'https://music.test/song.flac', gain: -7.25 }],
        } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'lossless')).resolves.toMatchObject({
            replayGain: { trackGain: -7.25 },
        });
    });

    it('does not create ReplayGain metadata when NetEase omits gain', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({
            data: [{ url: 'https://music.test/song.mp3' }],
        } as any);

        const source = await neteaseProvider.playback!.getAudioSource(song, 'high');

        expect(source?.replayGain).toBeUndefined();
    });

    it('exposes NetEase romanization alongside the parsed lyric result', async () => {
        vi.mocked(parseLyricsAsync).mockResolvedValue({
            lines: [{
                words: [],
                fullText: '君のことが好き',
                startTime: 1,
                endTime: 2,
                translation: '我喜欢你',
                romanization: 'Kimi no koto ga suki',
            }],
        });
        vi.mocked(neteaseApi.getLyric).mockResolvedValue({
            lrc: { lyric: '[00:01.00]君のことが好き' },
            tlyric: { lyric: '[00:01.00]我喜欢你' },
            romalrc: { lyric: '[00:01.00]Kimi no koto ga suki' },
        } as any);

        await expect(neteaseProvider.lyrics!.getLyrics(song)).resolves.toMatchObject({
            romanizationText: '[00:01.00]Kimi no koto ga suki',
            lyrics: {
                lines: [{
                    translation: '我喜欢你',
                    romanization: 'Kimi no koto ga suki',
                }],
            },
        });
    });

    it('normalizes search results and paging metadata', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({
            result: { songs: [{ ...song, sourceRef: undefined }], songCount: 2 },
        } as any);
        const page = await neteaseProvider.search!.searchSongs('song', 1, 0);
        expect(page.items[0].sourceRef).toEqual({ kind: 'online', providerId: 'netease', mediaId: '42' });
        expect(page).toMatchObject({ total: 2, hasMore: true, nextOffset: 1 });
    });

    it('normalizes album collection metadata into provider fields', async () => {
        vi.mocked(neteaseApi.getArtistAlbums).mockResolvedValue({
            hotAlbums: [{
                id: 7,
                name: 'Album',
                picUrl: 'https://example.test/album.jpg',
                artist: { id: 9, name: 'Artist' },
                alias: ['Alias'],
                publishTime: 1704067200000,
                company: 'Publisher',
            }],
            more: false,
        } as any);

        const page = await neteaseProvider.catalog!.getArtistAlbums!(9, 10, 0);
        expect(page.items[0]).toMatchObject({
            id: 7,
            coverUrl: 'https://example.test/album.jpg',
            artists: [{ id: 9, name: 'Artist' }],
            aliases: ['Alias'],
            publishedAt: 1704067200000,
            publisher: 'Publisher',
        });
    });

    it('normalizes artist and full album biographies into the unified description field', async () => {
        vi.mocked(neteaseApi.getArtistDetail).mockResolvedValue({
            data: {
                artist: {
                    id: 9,
                    name: 'Artist',
                    briefDesc: 'Artist biography',
                    musicSize: 12,
                    albumSize: 3,
                },
            },
        } as any);
        vi.mocked(neteaseApi.getAlbum).mockResolvedValue({
            album: {
                id: 7,
                name: 'Album',
                picUrl: 'https://example.test/album.jpg',
                briefDesc: 'Album biography',
                artist: { id: 9, name: 'Artist' },
                size: 10,
            },
            songs: [],
        } as any);

        await expect(neteaseProvider.catalog!.getArtistDetail!(9)).resolves.toMatchObject({
            description: 'Artist biography',
        });
        await expect(neteaseProvider.catalog!.getAlbumDetail!(7)).resolves.toMatchObject({
            description: 'Album biography',
            artists: [{ id: 9, name: 'Artist' }],
        });
    });

    it('maps personalized playlist copywriter into the unified description field', async () => {
        vi.mocked(neteaseApi.getPersonalizedPlaylists).mockResolvedValue({
            result: [{
                id: 7,
                name: 'Recommended Playlist',
                picUrl: 'https://example.test/playlist.jpg',
                copywriter: '猜你喜欢的歌单',
            }],
        } as any);

        const collections = await neteaseProvider.recommendations!.getRecommendedCollections!(10);
        expect(collections[0]).toMatchObject({
            name: 'Recommended Playlist',
            description: '猜你喜欢的歌单',
        });
    });

    it('rejects with a network OmniError when the song URL request never reached the API', async () => {
        const tagged = Object.assign(
            new Error('NetEase API request /song/url/v1 failed: fetch failed', { cause: new TypeError('fetch failed') }),
            { networkFailure: true },
        );
        vi.mocked(neteaseApi.getSongUrl).mockRejectedValue(tagged);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            name: 'OnlineProviderError',
            code: 'network',
            providerId: 'netease',
            message: 'NetEase API request /song/url/v1 failed: fetch failed',
            cause: tagged,
            details: { stage: 'song-url' },
        });
    });

    it('rejects a non-JSON 5xx body as service-unavailable with the HTTP status', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockRejectedValue(
            Object.assign(new Error('NetEase API /song/url/v1 returned HTTP 503 without a JSON body: (empty)'), { httpStatus: 503 }),
        );

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            code: 'service-unavailable',
            httpStatus: 503,
        });
    });

    it.each([
        [{ code: 200, data: [{ url: null, code: -110, fee: 1 }] }, 'membership-required'],
        [{ code: 200, data: [{ url: null, code: -110, fee: 4 }] }, 'purchase-required'],
        [{ code: 200, data: [{ url: 'http://music.test/clip.mp3', freeTrialInfo: { start: 0, end: 30 } }] }, 'preview-only'],
        [{ code: 200, data: [{ url: null, code: 404 }] }, 'not-playable'],
        [{ code: 502, msg: 'read ECONNRESET' }, 'network'],
        [{ code: 301, msg: '需要登录' }, 'auth-required'],
        [{ code: 200, data: [] }, 'invalid-response'],
    ])('rejects an unplayable song URL response %j as %s instead of returning null', async (response, code) => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue(response as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            code,
            providerId: 'netease',
        });
        // 只请求一次：不做客户端音质回退。
        expect(neteaseApi.getSongUrl).toHaveBeenCalledTimes(1);
    });

    it('decides availability from the privilege itself, not from isSongMarkedUnavailable', () => {
        // L10 的 mock 只认 st === -200；新逻辑对 -300 给 unknown，对有可播档位的 -200 也给 unknown。
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -300 } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -200, pl: 320000 } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -200, cs: true } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({
            ...song,
            privilege: { st: -200 },
            noCopyrightRcmd: { typeDesc: '其它版本可播' },
        })).toEqual({ state: 'unavailable', reason: 'taken-down', label: '其它版本可播' });
        expect(neteaseProvider.playback!.getAvailability!(song)).toEqual({ state: 'playable' });
    });

    it('wraps a failed replacement lookup into an OmniError', async () => {
        const unavailableSong = { ...song, privilege: { st: -200 } };
        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockRejectedValueOnce(
            Object.assign(new Error('NetEase API request /song/copyright/rcmd failed: fetch failed'), { networkFailure: true }),
        );
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).rejects.toMatchObject({
            name: 'OnlineProviderError',
            code: 'network',
            providerId: 'netease',
            details: { stage: 'replacement' },
        });

        const omniError = new OnlineProviderError('timeout', 'NetEase upstream request failed', 'netease');
        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockRejectedValueOnce(omniError);
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).rejects.toBe(omniError);
    });

    it('owns unavailable status and replacement normalization inside the provider', async () => {
        const unavailableSong = { ...song, privilege: { st: -200 } };
        expect(neteaseProvider.playback!.getAvailability!(unavailableSong)).toMatchObject({
            state: 'unavailable',
        });

        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockResolvedValue({
            replacementSong: { ...song, id: 43 },
            replacementSongId: 43,
            typeDesc: '版权替代版本',
        } as any);
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).resolves.toMatchObject({
            label: '版权替代版本',
            song: { id: 43, sourceRef: { providerId: 'netease', mediaId: '43' } },
        });
    });

    it.each([
        [801, 'waiting'],
        [802, 'scanned'],
        [803, 'confirmed'],
        [800, 'expired'],
    ])('maps QR code %s to %s', async (code, state) => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toMatchObject({ state });
    });

    it('falls back to the unblock source when the standard grant is missing and unlock is allowed', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any)
            .mockResolvedValueOnce({ data: [{ url: 'http://m701.music.126.net/unblocked.flac' }] } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).resolves.toMatchObject({
            url: 'https://m701.music.126.net/unblocked.flac',
            quality: 'high',
            unlocked: { from: 'netease-unblock' },
        });
        expect(neteaseApi.getSongUrl).toHaveBeenNthCalledWith(1, 42, 'exhigh');
        expect(neteaseApi.getSongUrl).toHaveBeenNthCalledWith(2, 42, 'exhigh', { unblock: true });
    });

    it('treats a trial-only grant (freeTrialInfo) as not fully playable and unlocks it', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: 'https://music.test/trial.mp3', freeTrialInfo: { start: 0, end: 45 } }] } as any)
            .mockResolvedValueOnce({ data: [{ url: 'https://music.test/full.flac' }] } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).resolves.toMatchObject({
            url: 'https://music.test/full.flac',
            unlocked: { from: 'netease-unblock' },
        });
    });

    it('unlocks a grant whose URL carries the trial path marker even without freeTrialInfo', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: 'http://m702.music.126.net/2026/x/jd-musicrep-ts/e27f/37bd/trial.mp3' }] } as any)
            .mockResolvedValueOnce({ data: [{ url: 'https://music.test/full.flac' }] } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).resolves.toMatchObject({
            url: 'https://music.test/full.flac',
            unlocked: { from: 'netease-unblock' },
        });
        expect(neteaseApi.getSongUrl).toHaveBeenNthCalledWith(2, 42, 'exhigh', { unblock: true });
    });

    it('refuses a trial-only grant as preview-only when unlock is not allowed', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({
            data: [{ url: 'https://music.test/trial.mp3', freeTrialInfo: { start: 0, end: 45 } }],
        } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({ code: 'preview-only' });
        expect(neteaseApi.getSongUrl).toHaveBeenCalledTimes(1);
        expect(neteaseApi.getSongUrl).toHaveBeenCalledWith(42, 'exhigh');
    });

    it('throws the classified provider error when the unblock attempt also fails', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).rejects.toMatchObject({ code: 'not-playable' });
        expect(neteaseApi.getSongUrl).toHaveBeenCalledTimes(2);
    });

    it('keeps the standard error semantics when the backend does not implement unblock', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any)
            .mockRejectedValueOnce(new Error('backend unblock unsupported'));

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).rejects.toMatchObject({ code: 'not-playable' });
    });

    it('falls back to the /song/url/match endpoint when unblock=true yields nothing', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any);
        vi.mocked(neteaseApi.getMatchedUrl).mockResolvedValue({
            code: 200,
            data: 'http://bd-er.kuwo.cn/trackmedia/xxx.mp3',
        } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).resolves.toMatchObject({
            url: 'https://bd-er.kuwo.cn/trackmedia/xxx.mp3',
            unlocked: { from: 'netease-unblock' },
        });
        expect(neteaseApi.getSongUrl).toHaveBeenNthCalledWith(2, 42, 'exhigh', { unblock: true });
        expect(neteaseApi.getMatchedUrl).toHaveBeenCalledWith(42);
    });

    it('throws the classified provider error when both unblock channels fail', async () => {
        vi.mocked(neteaseApi.getSongUrl)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any)
            .mockResolvedValueOnce({ data: [{ url: null }] } as any);
        vi.mocked(neteaseApi.getMatchedUrl).mockResolvedValue({ code: 500, data: [] } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high', { allowUnlock: true })).rejects.toMatchObject({ code: 'not-playable' });
        expect(neteaseApi.getMatchedUrl).toHaveBeenCalledTimes(1);
    });

    it('normalizes captcha send success', async () => {
        vi.mocked(neteaseApi.sendLoginCaptcha).mockResolvedValue({ code: 200 } as any);

        await expect(neteaseProvider.auth!.sendLoginCaptcha!('13800138000')).resolves.toEqual({ ok: true, error: undefined });
        expect(neteaseApi.sendLoginCaptcha).toHaveBeenCalledWith('13800138000');
    });

    it('normalizes captcha send failure and surfaces the server message', async () => {
        vi.mocked(neteaseApi.sendLoginCaptcha).mockResolvedValue({ code: 503, message: '操作频繁' } as any);

        await expect(neteaseProvider.auth!.sendLoginCaptcha!('13800138000')).resolves.toEqual({ ok: false, error: '操作频繁' });
    });

    it('logs in with phone + captcha after verifying the code and returns the normalized user', async () => {
        vi.mocked(neteaseApi.verifyLoginCaptcha).mockResolvedValue({ code: 200 } as any);
        vi.mocked(neteaseApi.loginByPhoneCaptcha).mockResolvedValue({
            code: 200,
            cookie: 'MUSIC_U=abc; __csrf=123',
            profile: { userId: 99, nickname: '歌者', avatarUrl: 'http://p1.music.126.net/avatar.jpg', vipType: 11 },
        } as any);

        await expect(neteaseProvider.auth!.loginByPhoneCaptcha!('13800138000', '123456')).resolves.toMatchObject({
            id: 99,
            nickname: '歌者',
            vipType: 11,
        });
        expect(neteaseApi.verifyLoginCaptcha).toHaveBeenCalledWith('13800138000', '123456');
        expect(neteaseApi.loginByPhoneCaptcha).toHaveBeenCalledWith('13800138000', '123456');
    });

    it('throws with the server message when the captcha verification fails', async () => {
        vi.mocked(neteaseApi.verifyLoginCaptcha).mockResolvedValue({ code: 400, message: '验证码错误' } as any);

        await expect(neteaseProvider.auth!.loginByPhoneCaptcha!('13800138000', '000000')).rejects.toThrow('验证码错误');
        expect(neteaseApi.loginByPhoneCaptcha).not.toHaveBeenCalled();
    });

    it('throws with the server message when the login is rejected after a valid captcha', async () => {
        vi.mocked(neteaseApi.verifyLoginCaptcha).mockResolvedValue({ code: 200 } as any);
        vi.mocked(neteaseApi.loginByPhoneCaptcha).mockResolvedValue({ code: 403, message: '当前登录存在安全风险，请稍后再试' } as any);

        await expect(neteaseProvider.auth!.loginByPhoneCaptcha!('13800138000', '123456')).rejects.toThrow('当前登录存在安全风险，请稍后再试');
    });

    it('throws when the login response carries no profile', async () => {
        vi.mocked(neteaseApi.verifyLoginCaptcha).mockResolvedValue({ code: 200 } as any);
        vi.mocked(neteaseApi.loginByPhoneCaptcha).mockResolvedValue({ code: 200, cookie: '' } as any);

        await expect(neteaseProvider.auth!.loginByPhoneCaptcha!('13800138000', '123456')).rejects.toThrow();
    });

    it('logs in with a pasted cookie and returns the normalized user', async () => {
        vi.mocked(neteaseApi.loginByCookie).mockResolvedValue({
            data: { code: 200, profile: { userId: 77, nickname: 'CookieUser', avatarUrl: 'http://p1.music.126.net/a.jpg' } },
        } as any);

        await expect(neteaseProvider.auth!.loginByCookie!('MUSIC_U=abc; __csrf=1')).resolves.toMatchObject({
            id: 77,
            nickname: 'CookieUser',
        });
        expect(neteaseApi.loginByCookie).toHaveBeenCalledWith('MUSIC_U=abc; __csrf=1');
    });

    it('throws with the server message when the cookie is rejected', async () => {
        vi.mocked(neteaseApi.loginByCookie).mockResolvedValue({ data: { code: 301, message: '登录信息已过期' } } as any);

        await expect(neteaseProvider.auth!.loginByCookie!('MUSIC_U=expired')).rejects.toThrow('登录信息已过期');
    });

    it('throws an empty-message error so the UI shows its own generic text when the server gives none', async () => {
        vi.mocked(neteaseApi.loginByCookie).mockResolvedValue({ data: { code: 301, account: null, profile: null } } as any);

        await expect(neteaseProvider.auth!.loginByCookie!('MUSIC_U=bad')).rejects.toMatchObject({ message: '' });
    });

    it('rejects an empty cookie without calling the backend', async () => {
        await expect(neteaseProvider.auth!.loginByCookie!('   ')).rejects.toThrow();
        expect(neteaseApi.loginByCookie).not.toHaveBeenCalled();
    });

    it('keeps the backend code and message on an unmapped QR response', async () => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 8821, message: '需要行为验证码验证' } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
            state: 'error',
            message: 'code 8821: 需要行为验证码验证',
            detail: { code: 8821, message: '需要行为验证码验证' },
        });
    });

    it.each(['read ECONNRESET', 'socket hang up', 'Client network socket disconnected before secure TLS connection was established'])(
        'marks a QR poll the upstream reset (%s) as a transient connection-reset',
        async msg => {
            vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 502, msg } as any);
            await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
                state: 'error', message: `code 502: ${msg}`, reason: 'connection-reset', transient: true, detail: { code: 502, message: msg },
            });
        },
    );

    it('marks other network failures as transient and keeps their text as written', async () => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 502, msg: 'connect ECONNREFUSED 127.0.0.1:7890' } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
            state: 'error',
            message: 'code 502: connect ECONNREFUSED 127.0.0.1:7890',
            transient: true,
            detail: { code: 502, message: 'connect ECONNREFUSED 127.0.0.1:7890' },
        });
    });

    it('throws instead of handing out an empty QR key, carrying the backend response', async () => {
        vi.mocked(neteaseApi.getQrKey).mockResolvedValue({ code: 200, data: { unikey: 'k1' } } as any);
        await expect(neteaseProvider.auth!.getQrKey!()).resolves.toBe('k1');

        const reset = { code: 502, msg: 'read ECONNRESET' };
        vi.mocked(neteaseApi.getQrKey).mockResolvedValue(reset as any);
        await expect(neteaseProvider.auth!.getQrKey!()).rejects.toMatchObject({
            code: 'invalid-response',
            message: 'NetEase QR key request failed: code 502: read ECONNRESET',
            qrLoginReason: 'connection-reset',
            transient: true,
            cause: reset,
        });

        vi.mocked(neteaseApi.getQrKey).mockResolvedValue({ code: 502, msg: 'connect ETIMEDOUT 59.111.181.35:443' } as any);
        const error = await neteaseProvider.auth!.getQrKey!().catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: 'invalid-response', message: 'NetEase QR key request failed: code 502: connect ETIMEDOUT 59.111.181.35:443' });
        expect(error).not.toHaveProperty('qrLoginReason');
    });

    it('fails instead of handing out an empty QR image', async () => {
        vi.mocked(neteaseApi.createQr).mockResolvedValue({ code: 200, data: { qrimg: 'data:image/png;base64,AAAA' } } as any);
        await expect(neteaseProvider.auth!.createQr!('k1')).resolves.toBe('data:image/png;base64,AAAA');

        vi.mocked(neteaseApi.createQr).mockResolvedValue({ code: 400, msg: 'key is required' } as any);
        await expect(neteaseProvider.auth!.createQr!('k1')).rejects.toMatchObject({
            code: 'invalid-response',
            message: 'NetEase QR image request failed: code 400: key is required',
        });
    });
});

// 网易云 `/user/playlist` 的「我喜欢的音乐」是 `specialType: 5`（数字）；首页特殊集合靠 isLiked 认它。
describe('neteaseProvider user playlists', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marks its own specialType 5 playlist as liked and leaves the rest alone', async () => {
        vi.mocked(neteaseApi.getUserPlaylists).mockResolvedValue({
            playlist: [
                { id: 11, name: 'amtx喜欢的音乐', specialType: 5, subscribed: false, creator: { userId: 7, nickname: 'amtx' } },
                { id: 12, name: '自建歌单', specialType: 0, subscribed: false, creator: { userId: 7, nickname: 'amtx' } },
                // 收藏来的别人的「喜欢的音乐」也是 5：不能当成自己的（移除会变成取消自己的喜欢）。
                { id: 13, name: '别人喜欢的音乐', specialType: 5, subscribed: true, creator: { userId: 8, nickname: 'other' } },
            ],
        } as any);

        const page = await neteaseProvider.library!.getUserPlaylists!(7, 30, 0);

        expect(neteaseApi.getUserPlaylists).toHaveBeenCalledWith(7, 30, 0);
        expect(page.items.map(item => [item.id, item.isLiked])).toEqual([[11, true], [12, undefined], [13, undefined]]);
        // 归一化结果进缓存后回灌（omni.normalizeCachedCollection）仍是「我喜欢的音乐」。
        expect(neteaseProvider.normalizeCollection!(page.items[0]).isLiked).toBe(true);
        expect(neteaseProvider.normalizeCollection!(page.items[1]).isLiked).toBeUndefined();
    });
});

describe('neteaseProvider liked song ids', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the ids of a successful response', async () => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue({ code: 200, ids: [1, 2, 3] } as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).resolves.toEqual([1, 2, 3]);
        expect(neteaseApi.getLikedSongs).toHaveBeenCalledWith(7);
    });

    it('keeps an empty list when the account really likes nothing', async () => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue({ code: 200, ids: [] } as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).resolves.toEqual([]);
    });

    // An error body must not read as "likes nothing": the caller would clear every heart.
    it.each([
        ['a server error', { code: 502 }, 'unavailable'],
        ['a missing ids list', { code: 200 }, 'unavailable'],
        ['no status code', { msg: 'busy' }, 'unavailable'],
        ['a signed-out session', { code: 301 }, 'auth-required'],
    ])('rejects %s instead of answering with no likes', async (_label, response, errorCode) => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue(response as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).rejects.toMatchObject({ code: errorCode });
    });
});

describe('neteaseProvider listening reports', () => {
    const reported: UnifiedSong = {
        ...song,
        name: '歌名',
        artists: [{ id: 7, name: '歌手 A' }, { id: 8, name: '歌手 B' }],
    };

    beforeEach(() => vi.clearAllMocks());

    it('sends the played seconds and never a source id', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 200 } as any);

        await neteaseProvider.playbackReports!.reportPlayback(reported, {
            playedSeconds: 45.6,
            totalSeconds: 240,
            quality: 'high',
        });

        const params = vi.mocked(neteaseApi.scrobbleV1).mock.calls[0][0];
        expect(params).toEqual({
            id: 42,
            time: 46,
            name: '歌名',
            artist: '歌手 A, 歌手 B',
            level: 'exhigh',
            bitrate: 320,
            total: 240,
        });
        expect(params).not.toHaveProperty('sourceid');
    });

    it.each([
        ['standard', 'standard', 128],
        ['high', 'exhigh', 320],
        ['lossless', 'lossless', 999],
        ['hires', 'hires', 1999],
    ] as const)('maps %s quality to level %s', async (quality, level, bitrate) => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 200 } as any);

        await neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45, quality });

        expect(vi.mocked(neteaseApi.scrobbleV1).mock.calls[0][0]).toMatchObject({ level, bitrate });
    });

    it('rejects a report the account was not signed in for', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 301 } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'auth-required' });
    });

    it('rejects a response that carries no status code at all', async () => {
        // A gateway error page, or an API build with no /scrobble/v1 route: valid JSON, no `code`.
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ message: 'Not Found' } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'unavailable' });
    });

    it('rejects any other non-success code', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 500 } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'unavailable' });
    });
});
