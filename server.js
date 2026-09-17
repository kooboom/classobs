const express = require('express');
const crypto = require('crypto');
const path = require('path');
const store = require('./store');

const PORT = process.env.PORT || 3003; // 3002는 class-quiz가 쓴다
const BASE = '/classobs';

const LIMITS = {
    title: 100,
    videoUrl: 500,
};

function clip(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

async function submittedCount(code) {
    const list = await store.readJson(store.submissionsFile(code), []);
    return list.filter((s) => s.status === 'submitted').length;
}

// ---------- API ----------

const api = express.Router();
api.use(express.json({ limit: '100kb' }));

api.get('/health', (req, res) => {
    res.json({ ok: true });
});

api.post('/sessions', async (req, res, next) => {
    try {
        const title = clip(req.body?.title, LIMITS.title);
        const videoUrl = clip(req.body?.videoUrl, LIMITS.videoUrl);
        if (!title) return res.status(400).json({ error: '제목을 입력하세요.' });
        if (!/^https?:\/\//i.test(videoUrl)) {
            return res.status(400).json({ error: '유튜브 주소를 입력하세요.' });
        }

        let code;
        await store.update(store.SESSIONS_FILE, [], (sessions) => {
            const used = new Set(sessions.map((s) => s.code));
            if (used.size >= 10000) throw new Error('세션 코드가 모두 사용되었습니다.');
            do {
                code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
            } while (used.has(code));
            sessions.push({ code, title, videoUrl, createdAt: new Date().toISOString() });
            return sessions;
        });

        res.status(201).json({ code });
    } catch (err) {
        next(err);
    }
});

api.get('/sessions', async (req, res, next) => {
    try {
        const sessions = await store.readJson(store.SESSIONS_FILE, []);
        const recent = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const withCount = await Promise.all(
            recent.map(async (s) => ({ ...s, count: await submittedCount(s.code) }))
        );
        res.json(withCount);
    } catch (err) {
        next(err);
    }
});

api.get('/sessions/:code', async (req, res, next) => {
    try {
        const { code } = req.params;
        if (!store.isValidCode(code)) {
            return res.status(400).json({ error: '세션 코드는 숫자 4자리입니다.' });
        }
        const sessions = await store.readJson(store.SESSIONS_FILE, []);
        const session = sessions.find((s) => s.code === code);
        if (!session) return res.status(404).json({ error: '없는 세션 코드입니다.' });
        res.json({ ...session, count: await submittedCount(code) });
    } catch (err) {
        next(err);
    }
});

api.use((req, res) => {
    res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    }
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
});

// ---------- 앱 ----------

const app = express();
const router = express.Router();

router.use('/api', api);
router.use(express.static(path.join(__dirname, 'public')));

app.get(BASE, (req, res) => res.redirect(301, `${BASE}/`));
app.use(BASE, router);

app.listen(PORT, '127.0.0.1', () => {
    console.log(`classobs listening on http://127.0.0.1:${PORT}${BASE}/`);
});
