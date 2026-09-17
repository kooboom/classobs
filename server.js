const express = require('express');
const crypto = require('crypto');
const path = require('path');
const store = require('./store');
const { DIMENSIONS } = require('./public/dimensions');

const PORT = process.env.PORT || 3003; // 3002는 class-quiz가 쓴다
const BASE = '/classobs';

const LIMITS = {
    title: 100,
    videoUrl: 500,
    name: 20,
    evidence: 200,
    memo: 500,
    comment: 500,
};

const STATUSES = ['draft', 'submitted'];

function clip(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

// 이름은 upsert 키다. 앞뒤·중복 공백 차이로 새 사람이 생기지 않게 정규화한다
function normalizeName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
}

// 알려진 차원만 받고, 점수는 1~7 정수(원점수) 아니면 버린다
function cleanScores(input) {
    const scores = {};
    for (const dim of DIMENSIONS) {
        const entry = input?.[dim.key];
        if (!entry || typeof entry !== 'object') continue;
        const s = Number.isInteger(entry.s) && entry.s >= 1 && entry.s <= 7 ? entry.s : null;
        const ev = clip(entry.ev, LIMITS.evidence);
        if (s !== null || ev) scores[dim.key] = { s, ev };
    }
    return scores;
}

async function findSession(code) {
    const sessions = await store.readJson(store.SESSIONS_FILE, []);
    return sessions.find((s) => s.code === code);
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
        const session = await findSession(code);
        if (!session) return res.status(404).json({ error: '없는 세션 코드입니다.' });
        res.json({ ...session, count: await submittedCount(code) });
    } catch (err) {
        next(err);
    }
});

api.post('/sessions/:code/submissions', async (req, res, next) => {
    try {
        const { code } = req.params;
        if (!store.isValidCode(code)) {
            return res.status(400).json({ error: '세션 코드는 숫자 4자리입니다.' });
        }
        if (!(await findSession(code))) {
            return res.status(404).json({ error: '없는 세션 코드입니다.' });
        }

        const body = req.body || {};
        const name = normalizeName(body.name);
        if (!name) return res.status(400).json({ error: '이름을 입력하세요.' });
        if (!STATUSES.includes(body.status)) {
            return res.status(400).json({ error: 'status는 draft 또는 submitted입니다.' });
        }

        const scores = cleanScores(body.scores);
        if (body.status === 'submitted') {
            const missing = DIMENSIONS.filter((d) => !scores[d.key]?.s).map((d) => d.key);
            if (missing.length) {
                return res.status(400).json({ error: `점수가 비어 있습니다: ${missing.join(', ')}`, missing });
            }
        }

        let saved;
        await store.update(store.submissionsFile(code), [], (list) => {
            const i = list.findIndex((s) => s.name === name);
            // 한 번 제출한 사람의 이후 자동 임시저장이 '제출'을 '임시'로 되돌리지 않게 한다
            const status = i >= 0 && list[i].status === 'submitted' ? 'submitted' : body.status;
            saved = {
                name,
                status,
                scores,
                memo: clip(body.memo, LIMITS.memo),
                comment: clip(body.comment, LIMITS.comment),
                updatedAt: new Date().toISOString(),
            };
            if (i >= 0) list[i] = saved;
            else list.push(saved);
            return list;
        });

        res.json(saved);
    } catch (err) {
        next(err);
    }
});

api.get('/sessions/:code/submissions', async (req, res, next) => {
    try {
        const { code } = req.params;
        if (!store.isValidCode(code)) {
            return res.status(400).json({ error: '세션 코드는 숫자 4자리입니다.' });
        }
        if (!(await findSession(code))) {
            return res.status(404).json({ error: '없는 세션 코드입니다.' });
        }
        res.json(await store.readJson(store.submissionsFile(code), []));
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
