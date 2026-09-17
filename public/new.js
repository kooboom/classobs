// 세션 만들기 — 비밀번호 없음. 실수로 하나 더 만들어도 피해가 없다.

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const studentUrl = () => `${location.origin}${location.pathname.replace(/new\/?$/, '')}`;

function dateText(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function loadList() {
    const tbody = $('list');
    try {
        const res = await fetch('api/sessions');
        if (!res.ok) throw new Error(res.status);
        const sessions = await res.json();
        tbody.innerHTML = sessions.length
            ? sessions.map((s) => {
                const demo = s.demoCount || 0;
                // count 는 가상 학생을 포함한 제출 수 — 목록에는 실제 학생만 세고 가상은 따로 표시한다
                const real = Math.max(0, s.count - demo);
                return `
                <tr>
                    <td class="code-cell">${esc(s.code)}</td>
                    <td>${esc(s.title)}</td>
                    <td class="muted">${dateText(s.createdAt)}</td>
                    <td class="count-cell">${real}명${demo ? ` <span class="demo-badge" title="가상 학생이 들어 있습니다">가상 ${demo}명</span>` : ''}</td>
                    <td class="links"><a href="compare.html?code=${esc(s.code)}">비교 화면</a> · <a href="./?code=${esc(s.code)}">학생 입장</a></td>
                    <td class="demo-cell">
                        <button type="button" class="small-btn" data-demo-add="${esc(s.code)}">${demo ? '가상 다시 만들기' : '가상 5명 넣기'}</button>
                        ${demo ? `<button type="button" class="small-btn" data-demo-clear="${esc(s.code)}">가상 지우기</button>` : ''}
                    </td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="6" class="empty">아직 만든 세션이 없습니다.</td></tr>';
    } catch {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">목록을 불러오지 못했습니다. 서버 연결을 확인하세요.</td></tr>';
    }
}

$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('title').value.trim();
    const videoUrl = $('url').value.trim();
    const msg = $('form-msg');
    msg.textContent = '';

    if (!title) {
        msg.textContent = '제목을 입력하세요.';
        return $('title').focus();
    }
    // 서버는 http 주소면 받지만, 영상이 실제로 뜨려면 유튜브 영상 주소여야 한다
    if (!Video.parseYouTube(videoUrl)) {
        msg.textContent = '유튜브 영상 주소가 아닙니다. 영상 페이지의 주소를 그대로 붙여 넣으세요.';
        return $('url').focus();
    }

    $('create').disabled = true;
    try {
        const res = await fetch('api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, videoUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);

        $('result-code').textContent = data.code;
        $('result-title').textContent = title;
        $('result-url').textContent = studentUrl();
        $('result-compare').href = `compare.html?code=${data.code}`;
        $('result').hidden = false;
        $('form').reset();
        loadList();
    } catch (err) {
        msg.textContent = `만들지 못했습니다: ${err.message}`;
    } finally {
        $('create').disabled = false;
    }
});

// 데모: 리허설·시연용 가상 학생. 비교 화면에서는 학생이 실수로 누를 수 있어 이 화면으로 옮겼다.
// 다시 만들면 기존 가상 학생을 새 5명으로 바꾸고, 지우기는 가상 학생만 지운다.
$('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-demo-add], [data-demo-clear]');
    if (!btn) return;
    const adding = btn.hasAttribute('data-demo-add');
    const code = adding ? btn.dataset.demoAdd : btn.dataset.demoClear;
    const msg = $('list-msg');
    for (const b of $('list').querySelectorAll('button')) b.disabled = true;
    msg.className = 'list-msg';
    msg.textContent = `${code}: 처리 중…`;
    try {
        const res = await fetch(`api/sessions/${code}/demo`, { method: adding ? 'POST' : 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);
        msg.textContent = adding
            ? `${code}: 가상 학생 ${data.created.length}명을 넣었습니다. 비교 화면에서 확인하세요.`
            : `${code}: 가상 학생 ${data.removed}명을 지웠습니다.`;
    } catch (err) {
        msg.className = 'list-msg bad';
        msg.textContent = `${code}: 실패 — ${err.message}`;
    }
    await loadList();
});

loadList();
