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
            ? sessions.map((s) => `
                <tr>
                    <td class="code-cell">${esc(s.code)}</td>
                    <td>${esc(s.title)}</td>
                    <td class="muted">${dateText(s.createdAt)}</td>
                    <td>${s.count}명</td>
                    <td class="links"><a href="compare.html?code=${esc(s.code)}">비교 화면</a> · <a href="./?code=${esc(s.code)}">학생 입장</a></td>
                </tr>`).join('')
            : '<tr><td colspan="5" class="empty">아직 만든 세션이 없습니다.</td></tr>';
    } catch {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">목록을 불러오지 못했습니다. 서버 연결을 확인하세요.</td></tr>';
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

loadList();
