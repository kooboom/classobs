// 채점 화면
// - 점수는 원점수로 입력·저장한다. 역산은 scoring.js 의 영역 평균에서만.
// - 입력이 멈추고 2초 뒤 서버에 draft 저장, localStorage 에는 즉시 복사.
// - 키보드: 차원마다 점수 묶음이 Tab 한 칸. 1~7 점수, ←→ 한 칸씩, ↓↑ 다음·이전 차원,
//   T 현재 재생 위치를 근거 앞에 넣고 근거 칸으로.

const params = new URLSearchParams(location.search);
const CODE = params.get('code') || '';
const NAME = normalizeName(params.get('name') || LS.get(KEYS.name) || '');

if (!/^[0-9]{4}$/.test(CODE) || !NAME) {
    location.replace(`./${/^[0-9]{4}$/.test(CODE) ? `?code=${CODE}` : ''}`);
    throw new Error('code/name missing');
}

const DRAFT_KEY = KEYS.draft(CODE, NAME);
const SAVE_DELAY = 2000;
const RETRY_EVERY = 5000;

const $ = (id) => document.getElementById(id);
const el = {
    title: $('title'), who: $('who'), savestate: $('savestate'),
    dims: $('dims'), memo: $('memo'), comment: $('comment'),
    notice: $('notice'), averages: $('averages'), progress: $('progress'), submit: $('submit'),
};

// ---------- 상태 ----------

const local = LS.get(DRAFT_KEY);
const state = {
    scores: local?.scores || {},   // { PC: { s: 5, ev: '...' } }
    memo: local?.memo || '',
    comment: local?.comment || '',
    submitted: Boolean(local?.submitted),
};
let touched = false; // 이 화면에서 무언가 입력했는가 (서버 기록으로 덮어쓰지 않기 위해)

function entry(key) {
    return state.scores[key] || (state.scores[key] = { s: null, ev: '' });
}

function payload(status) {
    const scores = {};
    for (const d of DIMENSIONS) {
        const e = state.scores[d.key];
        if (e && (e.s || e.ev)) scores[d.key] = { s: e.s || null, ev: e.ev || '' };
    }
    return { name: NAME, status, scores, memo: state.memo, comment: state.comment };
}

function saveLocal() {
    LS.set(DRAFT_KEY, { ...state, savedAt: new Date().toISOString() });
}

// ---------- 그리기 ----------

el.who.textContent = NAME;
const cachedSession = LS.get(KEYS.session(CODE));
setTitle(cachedSession?.title);

function setTitle(title) {
    el.title.textContent = title ? `${title}` : `세션 ${CODE}`;
    document.title = `${title || CODE} · CLASS 채점`;
}

const rows = {}; // key → { root, group, buttons[], evidence }

function renderDims() {
    const frag = document.createDocumentFragment();
    for (const domain of DOMAINS) {
        const head = document.createElement('div');
        head.className = 'dom';
        head.innerHTML = `<span>영역 ${domain.no} · ${domain.name}</span><em>${domain.question}</em>`;
        frag.append(head);

        for (const dim of DIMENSIONS.filter((d) => d.domain === domain.key)) {
            frag.append(renderDim(dim));
        }
    }
    el.dims.append(frag);
}

function renderDim(dim) {
    const root = document.createElement('section');
    root.className = `dim${dim.reverse ? ' rev' : ''}`;
    root.dataset.key = dim.key;

    const indId = `ind-${dim.key}`;
    root.innerHTML = `
        <div class="dim-row">
            <span class="abbr">${dim.key}</span>
            <div class="dim-name">
                <span>${dim.name}</span>
                <button type="button" class="toggle" tabindex="-1" aria-expanded="false" aria-controls="${indId}" title="하위 지표 보기">?</button>
            </div>
            <div class="score-cell">
                <div class="scores" role="radiogroup" tabindex="0" aria-label="${dim.key} ${dim.name} 점수${dim.reverse ? ' (원점수)' : ''}">
                    ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" role="radio" tabindex="-1" aria-checked="false" data-n="${n}">${n}</button>`).join('')}
                </div>
                ${dim.reverse ? '<small class="raw-note">원점수 — 부정성이 클수록 높은 점수</small>' : ''}
            </div>
            <div class="ev-cell">
                <input class="evidence" type="text" maxlength="200" placeholder="근거: ${dim.hint}" aria-label="${dim.key} 근거">
                <button type="button" class="stamp" tabindex="-1" disabled title="현재 재생 위치를 근거 앞에 넣기 (T)" aria-label="${dim.key} 근거에 재생 위치 넣기">⏱</button>
            </div>
        </div>
        <div class="indicators" id="${indId}" hidden>${dim.indicators.join(' · ')}</div>
    `;

    const row = {
        root,
        group: root.querySelector('.scores'),
        buttons: [...root.querySelectorAll('.scores button')],
        evidence: root.querySelector('.evidence'),
        stamp: root.querySelector('.stamp'),
    };
    rows[dim.key] = row;

    const toggle = root.querySelector('.toggle');
    const indicators = root.querySelector('.indicators');
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        indicators.hidden = !open;
    });

    row.group.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-n]');
        if (!btn) return;
        setScore(dim.key, Number(btn.dataset.n));
        row.group.focus(); // Safari 는 클릭한 버튼에 포커스를 주지 않는다
    });

    row.stamp.addEventListener('click', () => stamp(dim.key));

    row.group.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const current = state.scores[dim.key]?.s || 0;
        if (/^[1-7]$/.test(e.key)) {
            setScore(dim.key, Number(e.key));
        } else if (e.key === 'ArrowRight') {
            setScore(dim.key, Math.min(7, current + 1));
        } else if (e.key === 'ArrowLeft') {
            setScore(dim.key, Math.max(1, current - 1 || 1));
        } else if (e.key === 'ArrowDown') {
            moveTo(dim.key, +1);
        } else if (e.key === 'ArrowUp') {
            moveTo(dim.key, -1);
        } else if (e.code === 'KeyT' && !e.shiftKey) { // 한글 입력 상태에서도 e.code 는 KeyT
            stamp(dim.key);
        } else {
            return;
        }
        e.preventDefault();
    });

    row.evidence.addEventListener('input', () => {
        entry(dim.key).ev = row.evidence.value;
        changed();
    });
    row.evidence.addEventListener('keydown', (e) => {
        if (e.isComposing) return; // 한글 조합 중 Enter 는 무시
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            moveTo(dim.key, +1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveTo(dim.key, -1);
        }
    });

    return root;
}

function moveTo(key, step) {
    const i = DIMENSIONS.findIndex((d) => d.key === key) + step;
    if (i < 0) return;
    if (i >= DIMENSIONS.length) return el.memo.focus();
    const row = rows[DIMENSIONS[i].key];
    row.group.focus();
    row.root.scrollIntoView({ block: 'nearest' });
}

function setScore(key, n) {
    entry(key).s = n;
    rows[key].root.classList.remove('missing');
    paintScore(key);
    changed();
}

function paintScore(key) {
    const s = state.scores[key]?.s;
    for (const b of rows[key].buttons) {
        b.setAttribute('aria-checked', String(Number(b.dataset.n) === s));
    }
}

function paintAll() {
    for (const d of DIMENSIONS) {
        paintScore(d.key);
        rows[d.key].evidence.value = state.scores[d.key]?.ev || '';
    }
    el.memo.value = state.memo;
    el.comment.value = state.comment;
    paintBar();
}

function paintBar() {
    el.averages.innerHTML = domainAverages(state.scores).map((a) => {
        const domain = DOMAINS.find((d) => d.key === a.key);
        const value = a.avg === null ? '—' : a.avg.toFixed(2);
        const partial = a.n && a.n < a.total ? `<small>${a.n}/${a.total}</small>` : '';
        return `<div class="avg" title="${a.name} 평균${a.key === 'ES' ? ' — NC는 8 − 원점수로 계산' : ''}">`
            + `<span class="full">${a.name}</span><span class="short">${domain.short}</span>`
            + `<b>${value}</b>${partial}</div>`;
    }).join('');

    const done = DIMENSIONS.filter((d) => state.scores[d.key]?.s).length;
    el.progress.textContent = `${done}/${DIMENSIONS.length}`;
    el.submit.textContent = state.submitted ? '다시 제출' : '제출';
}

function notice(text, kind) {
    el.notice.textContent = text;
    el.notice.className = `notice${kind === 'error' ? ' error' : ''}`;
    el.notice.hidden = !text;
}

// ---------- 저장 ----------

let dirty = false;
let saveTimer = null;
let saving = null; // 진행 중인 저장 Promise

function changed() {
    touched = true;
    saveLocal();
    paintBar();
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY);
}

async function post(body) {
    const res = await fetch(`api/sessions/${CODE}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function timeText(date = new Date()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function flush() {
    if (!dirty || saving) return saving;
    dirty = false;
    saving = (async () => {
        try {
            await post(payload('draft'));
            el.savestate.textContent = `자동 저장됨 ${timeText()}`;
        } catch (err) {
            dirty = true;
            el.savestate.textContent = err.status
                ? `저장 실패: ${err.message}`
                : '서버 저장 대기 — 이 기기에 보관 중';
        } finally {
            saving = null;
        }
    })();
    return saving;
}

// 연결이 돌아오면 다시 올린다
setInterval(() => { if (dirty) flush(); }, RETRY_EVERY);
window.addEventListener('online', () => flush());

el.memo.addEventListener('input', () => { state.memo = el.memo.value; changed(); });
el.comment.addEventListener('input', () => { state.comment = el.comment.value; changed(); });

// 점수 묶음·입력칸 밖에 포커스가 있을 때 숫자키는 마지막으로 다룬 차원에 들어간다
let lastKey = DIMENSIONS[0].key;
document.addEventListener('focusin', (e) => {
    const root = e.target.closest?.('.dim');
    if (root) lastKey = root.dataset.key;
});
document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, .scores')) return;
    if (/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        rows[lastKey].group.focus();
        setScore(lastKey, Number(e.key));
    } else if (e.code === 'KeyT' && !e.shiftKey) {
        e.preventDefault();
        stamp(lastKey);
    }
});

// ---------- 영상 ----------

const player = {
    msg: $('video-msg'), back: $('back10'), mute: $('mute'), clock: $('clock'),
    mount: $('player-mount'), started: false,
};

function startVideo(url) {
    if (player.started || !url) return;
    player.started = true;
    Video.init(player.mount, url);
}

function videoMessage(text, isError) {
    player.msg.textContent = text || '';
    player.msg.classList.toggle('error', Boolean(isError));
    player.msg.hidden = !text;
}

function setVideoControls(enabled) {
    player.back.disabled = !enabled;
    player.mute.disabled = !enabled;
    for (const row of Object.values(rows)) row.stamp.disabled = !enabled;
}

function paintMute() {
    const muted = Video.isMuted();
    player.mute.textContent = muted ? '🔇 소리 켜기' : '🔊 소리 끄기';
    player.mute.setAttribute('aria-pressed', String(muted));
}

// 영상 조작 뒤에는 채점 중이던 차원으로 포커스를 돌려 숫자키가 바로 먹게 한다
function refocusScoring() {
    const active = document.activeElement;
    if (!active || active === document.body || active.tagName === 'IFRAME' || active.closest?.('.video-bar')) {
        rows[lastKey].group.focus({ preventScroll: true });
    }
}

Video.on((type, detail) => {
    if (type === 'ready') {
        videoMessage('');
        setVideoControls(true);
        paintMute();
    } else if (type === 'error') {
        videoMessage(detail.message, true);
        setVideoControls(false);
        player.clock.textContent = '--:--';
    } else if (type === 'state') {
        // 영상을 클릭해 재생·정지하면 포커스가 iframe 으로 넘어간다
        setTimeout(refocusScoring, 0);
    }
});

player.back.addEventListener('click', () => { Video.back(10); refocusScoring(); });
player.mute.addEventListener('click', () => { Video.toggleMute(); paintMute(); refocusScoring(); });

setInterval(() => {
    if (!Video.ready) return;
    const now = Video.format(Video.currentTime());
    const total = Video.duration();
    player.clock.innerHTML = total ? `${now} <small>/ ${Video.format(total)}</small>` : now;
}, 500);

// 근거 앞에 "[03:41] " 을 넣고 커서를 그 뒤에 둔다. 타임스탬프만 있는 칸이면 새 위치로 바꾼다
function stamp(key) {
    const t = Video.currentTime();
    if (t === null) return;
    const input = rows[key].evidence;
    const tag = `[${Video.format(t)}] `;
    const rest = /^\[[\d:]+\]\s*$/.test(input.value) ? '' : input.value;
    input.value = (tag + rest).slice(0, 200);
    entry(key).ev = input.value;
    changed();
    input.focus();
    input.setSelectionRange(tag.length, tag.length);
}

// ---------- 제출 ----------

el.submit.addEventListener('click', async () => {
    // 빈 점수·빈 근거는 경고만 하고 막지 않는다.
    // 한 차원에서 막힌 학생이 토론에서 아예 빠지는 것이 더 나쁘다.
    const missing = DIMENSIONS.filter((d) => !state.scores[d.key]?.s);
    const noEvidence = DIMENSIONS.filter((d) => state.scores[d.key]?.s && !state.scores[d.key]?.ev?.trim());
    for (const d of DIMENSIONS) rows[d.key].root.classList.toggle('missing', missing.includes(d));

    if (missing.length || noEvidence.length) {
        const lines = [];
        if (missing.length) {
            lines.push(`점수가 비어 있는 차원 ${missing.length}개: ${missing.map((d) => d.key).join(', ')}`,
                '→ 이 차원은 비교 화면에서 빠집니다.', '');
        }
        if (noEvidence.length) {
            lines.push(`근거가 비어 있는 차원 ${noEvidence.length}개: ${noEvidence.map((d) => d.key).join(', ')}`,
                '→ 근거 없이 점수만 모이면 "왜 그 점수인지" 토론할 수 없습니다.',
                '   어떤 장면을 보고 매겼는지 한 줄이라도 적는 것을 권합니다.', '');
        }
        lines.push('그래도 지금 제출할까요? (제출한 뒤에도 고쳐서 다시 낼 수 있습니다)');
        if (!confirm(lines.join('\n'))) {
            if (missing.length) {
                rows[missing[0].key].group.focus();
                rows[missing[0].key].root.scrollIntoView({ block: 'nearest' });
            } else {
                rows[noEvidence[0].key].evidence.focus();
            }
            return;
        }
    }

    el.submit.disabled = true;
    clearTimeout(saveTimer);
    try {
        await saving; // 진행 중인 임시저장이 제출 뒤에 도착하지 않게
        await post(payload('submitted'));
        dirty = false;
        state.submitted = true;
        saveLocal();
        paintBar();
        el.savestate.textContent = `제출됨 ${timeText()}`;
        notice('제출했습니다. 고친 뒤 다시 제출하면 덮어씁니다.');
    } catch (err) {
        dirty = true;
        notice(err.status
            ? `제출하지 못했습니다: ${err.message}`
            : '서버에 연결할 수 없어 제출하지 못했습니다. 입력한 내용은 이 기기에 보관되어 있습니다.', 'error');
    } finally {
        el.submit.disabled = false;
    }
});

// ---------- 시작 ----------

renderDims();
paintAll();

// 첫 번째 빈 차원에 포커스 — 바로 숫자키로 채점할 수 있게
const firstEmpty = DIMENSIONS.find((d) => !state.scores[d.key]?.s) || DIMENSIONS[0];
rows[firstEmpty.key].group.focus({ preventScroll: true });
lastKey = firstEmpty.key;

if (cachedSession?.videoUrl) startVideo(cachedSession.videoUrl);

(async function loadFromServer() {
    try {
        const res = await fetch(`api/sessions/${CODE}`);
        if (res.status === 404) {
            notice('없는 세션 코드입니다. 입장 화면에서 코드를 다시 확인하세요.', 'error');
            return;
        }
        if (res.ok) {
            const session = await res.json();
            LS.set(KEYS.session(CODE), session);
            setTitle(session.title);
            startVideo(session.videoUrl);
        }
    } catch {
        el.savestate.textContent = '서버 연결 안 됨 — 이 기기에 보관 중';
        if (!cachedSession) videoMessage('서버에 연결할 수 없어 영상 주소를 모릅니다. 프로젝터 화면을 보세요.', true);
    }

    // 이 기기에 임시 저장본이 없으면, 다른 기기에서 쓰던 기록을 서버에서 불러온다
    if (local) return;
    try {
        const res = await fetch(`api/sessions/${CODE}/submissions`);
        if (!res.ok) return;
        const mine = (await res.json()).find((s) => s.name === NAME);
        if (!mine || touched) return;
        state.scores = mine.scores || {};
        state.memo = mine.memo || '';
        state.comment = mine.comment || '';
        state.submitted = mine.status === 'submitted';
        saveLocal();
        paintAll();
        el.savestate.textContent = `저장된 기록 불러옴 ${timeText(new Date(mine.updatedAt))}`;
    } catch {
        // 서버가 없으면 빈 시트로 시작
    }
})();
