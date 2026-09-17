// JSON 파일 저장소
// data/sessions.json            — 세션 메타 목록
// data/submissions/{code}.json  — 그 세션의 제출 배열
//
// 모든 쓰기는 하나의 큐로 직렬화한다. 5명이 동시에 내도 서로 덮어쓰지 않게 하려는 것이며,
// "읽기 → 수정 → 쓰기" 전체를 update() 안에서 한 덩어리로 실행해야 의미가 있다.

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.CLASSOBS_DATA_DIR || path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SUBMISSIONS_DIR = path.join(DATA_DIR, 'submissions');

const CODE_RE = /^[0-9]{4}$/;

function isValidCode(code) {
    return typeof code === 'string' && CODE_RE.test(code);
}

// 코드 검증을 통과한 값만 파일 경로에 쓴다 (경로 조작 차단)
function submissionsFile(code) {
    if (!isValidCode(code)) throw new Error('invalid session code');
    return path.join(SUBMISSIONS_DIR, `${code}.json`);
}

async function readJson(file, fallback) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        throw err;
    }
}

// 임시 파일에 쓴 뒤 rename — 쓰는 도중 프로세스가 죽어도 기존 파일이 반쯤 잘리지 않는다
async function writeJson(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
}

let queue = Promise.resolve();

// fn(current) → next 를 직렬로 실행하고 next 를 저장한다
function update(file, fallback, fn) {
    const run = queue.then(async () => {
        const current = await readJson(file, fallback);
        const next = await fn(current);
        await writeJson(file, next);
        return next;
    });
    // 한 작업이 실패해도 큐가 막히지 않게
    queue = run.catch(() => {});
    return run;
}

module.exports = {
    DATA_DIR,
    SESSIONS_FILE,
    isValidCode,
    submissionsFile,
    readJson,
    update,
};
