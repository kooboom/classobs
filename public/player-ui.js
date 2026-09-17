// 영상 아래 조작 줄 — 채점 화면과 비교 화면이 같이 쓴다. video.js 다음에 불러온다.
// 필요한 요소 id: player-mount, video-msg, back10, mute, clock
//
// hooks.onEnabled(bool)  — 영상을 쓸 수 있게 되거나(true) 오류로 못 쓰게 될 때(false)
// hooks.onState()        — 재생·정지 등 상태가 바뀔 때 (영상 클릭으로 포커스가 iframe 에 간 뒤)
// hooks.afterControl()   — 10초 뒤로·음소거 버튼을 누른 뒤

function bindPlayerUI(hooks = {}) {
    const $id = (id) => document.getElementById(id);
    const ui = { mount: $id('player-mount'), msg: $id('video-msg'), back: $id('back10'), mute: $id('mute'), clock: $id('clock') };
    let started = false;

    function message(text, isError) {
        ui.msg.textContent = text || '';
        ui.msg.classList.toggle('error', Boolean(isError));
        ui.msg.hidden = !text;
    }

    function setEnabled(enabled) {
        ui.back.disabled = !enabled;
        ui.mute.disabled = !enabled;
        hooks.onEnabled?.(enabled);
    }

    function paintMute() {
        const muted = Video.isMuted();
        ui.mute.textContent = muted ? '🔇 소리 켜기' : '🔊 소리 끄기';
        ui.mute.setAttribute('aria-pressed', String(muted));
    }

    Video.on((type, detail) => {
        if (type === 'ready') {
            message('');
            setEnabled(true);
            paintMute();
        } else if (type === 'error') {
            message(detail.message, true);
            setEnabled(false);
            ui.clock.textContent = '--:--';
        } else if (type === 'state') {
            setTimeout(() => hooks.onState?.(), 0);
        }
    });

    ui.back.addEventListener('click', () => { Video.back(10); hooks.afterControl?.(); });
    ui.mute.addEventListener('click', () => { Video.toggleMute(); paintMute(); hooks.afterControl?.(); });

    setInterval(() => {
        if (!Video.ready) return;
        const now = Video.format(Video.currentTime());
        const total = Video.duration();
        ui.clock.innerHTML = total ? `${now} <small>/ ${Video.format(total)}</small>` : now;
    }, 500);

    return {
        start(url) {
            if (started || !url) return;
            started = true;
            Video.init(ui.mount, url);
        },
        message,
    };
}
