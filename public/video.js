// 유튜브 영상 — YouTube IFrame API
// - 기본 음소거: 학생마다 재생 위치가 달라 소리가 겹치면 강의실이 시끄러워진다
// - 임베드가 막힌 영상은 검은 화면만 뜨므로 onError 로 감지해 안내한다
// - 채점 화면과 비교 화면(타임스탬프 클릭 → 이동)이 같이 쓴다

const Video = (() => {
    let player = null;
    let ready = false;
    let muted = true; // player.isMuted() 는 mute() 직후 한동안 옛 값을 돌려준다
    const listeners = [];

    // watch?v= · youtu.be/ · /embed/ · /shorts/ · /live/ 모두 받는다
    function parseYouTube(url) {
        let u;
        try {
            u = new URL(String(url).trim());
        } catch {
            return null;
        }
        const host = u.hostname.replace(/^(www|m|music)\./, '');
        let id = null;
        if (host === 'youtu.be') {
            id = u.pathname.slice(1).split('/')[0];
        } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/) || [])[1];
        }
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
        return { id, start: parseStart(u.searchParams.get('t') || u.searchParams.get('start')) };
    }

    // t=221 · t=3m41s · t=1h2m3s
    function parseStart(t) {
        if (!t) return 0;
        if (/^\d+$/.test(t)) return Number(t);
        const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
        return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
    }

    // 221.7 → "03:41", 3725 → "1:02:05"
    function format(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    const ERRORS = {
        101: '이 영상은 임베드가 막혀 있습니다. 프로젝터 화면을 보세요.',
        150: '이 영상은 임베드가 막혀 있습니다. 프로젝터 화면을 보세요.',
        100: '영상을 찾을 수 없습니다(삭제되었거나 비공개). 프로젝터 화면을 보세요.',
        2: '영상 주소가 올바르지 않습니다. 프로젝터 화면을 보세요.',
        5: '이 브라우저에서 영상을 재생할 수 없습니다. 프로젝터 화면을 보세요.',
    };

    function loadApi() {
        if (window.YT?.Player) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                prev?.();
                resolve();
            };
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.onerror = reject;
            document.head.append(script);
        });
    }

    function emit(type, detail) {
        for (const fn of listeners) fn(type, detail);
    }

    // mount: 플레이어가 들어갈 요소. 이벤트는 on(fn) 으로 받는다: 'ready' | 'error' | 'state'
    async function init(mount, url) {
        if (player) return;
        const parsed = parseYouTube(url);
        if (!parsed) {
            emit('error', { message: '세션의 유튜브 주소를 해석할 수 없습니다. 프로젝터 화면을 보세요.' });
            return;
        }

        // API 스크립트가 막히거나(학내망·오프라인) 응답이 없으면 검은 화면으로 남지 않게 안내한다
        const timeout = setTimeout(() => {
            if (!ready) emit('error', { message: '영상을 불러오지 못했습니다. 네트워크를 확인하거나 프로젝터 화면을 보세요.' });
        }, 12000);

        try {
            await loadApi();
        } catch {
            clearTimeout(timeout);
            emit('error', { message: '유튜브에 연결할 수 없습니다. 프로젝터 화면을 보세요.' });
            return;
        }

        const target = document.createElement('div');
        mount.replaceChildren(target);
        player = new YT.Player(target, {
            width: '100%',
            height: '100%',
            videoId: parsed.id,
            playerVars: {
                start: parsed.start,
                playsinline: 1,
                rel: 0,
                disablekb: 1, // 유튜브 단축키에서 숫자키는 영상 위치 이동이다. 채점 숫자키와 겹치지 않게 끈다
                origin: location.origin,
            },
            events: {
                onReady() {
                    ready = true;
                    clearTimeout(timeout);
                    player.mute();
                    muted = true;
                    emit('ready');
                },
                onError(e) {
                    // 임베드가 막힌 영상도 onReady 는 먼저 온다. 오류 뒤에는 쓸 수 없는 플레이어로 본다
                    ready = false;
                    clearTimeout(timeout);
                    emit('error', { code: e.data, message: ERRORS[e.data] || `영상 오류(${e.data}). 프로젝터 화면을 보세요.` });
                },
                onStateChange(e) {
                    emit('state', { state: e.data });
                },
            },
        });
    }

    return {
        parseYouTube,
        format,
        init,
        on(fn) { listeners.push(fn); },
        get ready() { return ready; },
        currentTime() { return ready ? player.getCurrentTime() : null; },
        duration() { return ready ? player.getDuration() : null; },
        seek(seconds) {
            if (!ready) return;
            player.seekTo(Math.max(0, seconds), true);
        },
        play() {
            if (ready) player.playVideo();
        },
        back(seconds = 10) {
            if (!ready) return;
            player.seekTo(Math.max(0, player.getCurrentTime() - seconds), true);
        },
        isMuted() { return muted; },
        toggleMute() {
            if (!ready) return muted;
            if (muted) player.unMute();
            else player.mute();
            muted = !muted;
            return muted;
        },
    };
})();
