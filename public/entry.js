// 입장 화면: 세션 코드 + 이름

const codeInput = document.getElementById('code');
const nameInput = document.getElementById('name');
const check = document.getElementById('check');
const go = document.getElementById('go');

let session = null;
let lookupSeq = 0;

nameInput.value = LS.get(KEYS.name) || '';

function updateButton() {
    go.disabled = !(session && normalizeName(nameInput.value));
}

function showCheck(text, kind) {
    check.textContent = text;
    check.className = `check ${kind || ''}`;
}

async function lookup(code) {
    const seq = ++lookupSeq;
    showCheck('확인 중…');
    try {
        const res = await fetch(`api/sessions/${code}`);
        if (seq !== lookupSeq) return;
        if (res.status === 404) return showCheck('없는 세션 코드입니다. 칠판의 숫자를 다시 확인하세요.', 'bad');
        if (!res.ok) throw new Error(res.status);
        session = await res.json();
        LS.set(KEYS.session(code), session);
        showCheck(`✓ ${session.title}`, 'ok');
    } catch {
        if (seq !== lookupSeq) return;
        showCheck('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.', 'bad');
    } finally {
        if (seq === lookupSeq) updateButton();
    }
}

codeInput.addEventListener('input', () => {
    const code = codeInput.value.replace(/\D/g, '').slice(0, 4);
    codeInput.value = code;
    session = null;
    lookupSeq++;
    updateButton();
    if (code.length === 4) {
        lookup(code);
    } else {
        showCheck('');
    }
});

nameInput.addEventListener('input', updateButton);

document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = normalizeName(nameInput.value);
    if (!session || !name) return;
    LS.set(KEYS.name, name);
    location.href = `score.html?code=${session.code}&name=${encodeURIComponent(name)}`;
});

// ?code=1234 로 들어오면 미리 채운다
const preset = new URLSearchParams(location.search).get('code');
if (preset && /^[0-9]{4}$/.test(preset)) {
    codeInput.value = preset;
    lookup(preset);
    if (!nameInput.value) nameInput.focus();
} else {
    codeInput.focus();
}
