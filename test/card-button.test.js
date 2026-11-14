const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '..', 'script.user.js'), 'utf8');

function installStubs(window, blocked) {
    window.GM_getValue = (_key, fallback) => fallback;
    window.GM_setValue = () => {};
    window.GM_addStyle = (css) => {
        const style = window.document.createElement('style');
        style.textContent = css;
        window.document.documentElement.appendChild(style);
    };
    window.GM_registerMenuCommand = () => 1;
    window.GM_unregisterMenuCommand = () => {};
    window.fetch = async (url, opts) => {
        const href = String(url);
        if (href.includes('/x/relation/modify')) {
            blocked.push(opts.body.get('fid'));
            return { ok: true, json: async () => ({ code: 0, message: 'ok' }) };
        }
        return {
            ok: true,
            json: async () => ({ code: 0, data: { attribute: 0, total: 0 } }),
        };
    };
    window.document.cookie = 'bili_jct=csrf-token-for-test';
    const box = () => ({
        x: 10, y: 20, top: 20, left: 10, right: 90, bottom: 40, width: 80, height: 20,
        toJSON() { return this; },
    });
    window.HTMLElement.prototype.getClientRects = function () { return [box()]; };
    window.HTMLElement.prototype.getBoundingClientRect = function () { return box(); };
    window.Range.prototype.getBoundingClientRect = function () { return box(); };
    window.Range.prototype.getClientRects = function () { return [box()]; };
}

function buttonsUnder(root) {
    const found = [];
    const visit = (node) => {
        if (!node || !node.querySelectorAll) return;
        found.push(...node.querySelectorAll('.bilibili-blacklist-btn'));
        for (const el of node.querySelectorAll('*')) {
            if (el.shadowRoot) visit(el.shadowRoot);
        }
    };
    visit(root);
    return found.filter((btn) => btn.isConnected);
}

function buttonInCard(card) {
    return buttonsUnder(card)[0] || null;
}

async function waitFor(predicate, label) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(label);
}

function loadPage(url, html) {
    const blocked = [];
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on('jsdomError', (err) => errors.push(String(err)));
    const dom = new JSDOM(html, {
        url,
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
            installStubs(window, blocked);
        },
    });
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = script;
    dom.window.document.body.appendChild(scriptEl);
    return {
        dom,
        blocked,
        errors,
        close() {
            dom.window.close();
        },
    };
}

test('a feed card owns its block button and removal takes that button with it', async () => {
    const page = loadPage('https://www.bilibili.com/', `<!DOCTYPE html><body>
      <div id="app"><div class="feed-list">
        <div class="bili-video-card" data-up-id="111" style="position:relative">
          <a class="bili-video-card__info--owner" href="//space.bilibili.com/111">
            <span class="bili-video-card__info--author" title="UP-A">UP-A</span>
          </a>
        </div>
        <div class="bili-video-card" data-up-id="222" style="position:relative">
          <a class="bili-video-card__info--owner" href="//space.bilibili.com/222">
            <span class="bili-video-card__info--author" title="UP-B">UP-B</span>
          </a>
        </div>
      </div></div>
    </body>`);
    try {
        const doc = page.dom.window.document;
        const [cardA, cardB] = doc.querySelectorAll('.bili-video-card');
        await waitFor(() => buttonInCard(cardA) && buttonInCard(cardB), 'feed cards did not own their block buttons');

        cardA.remove();
        const stale = buttonsUnder(doc).filter((btn) => btn.dataset.uid === '111');
        assert.equal(stale.length, 0, 'removed card left a block button behind');
        assert.equal(buttonInCard(cardB).dataset.uid, '222');

        const owner = cardB.querySelector('a.bili-video-card__info--owner');
        owner.setAttribute('href', '//space.bilibili.com/444');
        owner.querySelector('span').textContent = 'UP-D';
        owner.querySelector('span').setAttribute('title', 'UP-D');
        buttonInCard(cardB).click();
        await waitFor(() => page.blocked.length > 0, 'click did not block anyone');
        assert.deepEqual(page.blocked, ['444']);
    } finally {
        page.close();
    }
});

test('a recommendation card owns its block button and removal takes that button with it', async () => {
    const page = loadPage('https://www.bilibili.com/video/BV1test', `<!DOCTYPE html><body>
      <div class="right-container">
        <div class="video-page-card-small" data-up-id="111">
          <div class="card-box"><div class="info"><div class="upname">
            <a href="//space.bilibili.com/111"><span class="name">UP-A</span></a>
          </div></div></div>
        </div>
        <div class="video-page-card-small" data-up-id="222">
          <div class="card-box"><div class="info"><div class="upname">
            <a href="//space.bilibili.com/222"><span class="name">UP-B</span></a>
          </div></div></div>
        </div>
      </div>
    </body>`);
    try {
        const doc = page.dom.window.document;
        const [cardA, cardB] = doc.querySelectorAll('.video-page-card-small');
        await waitFor(() => buttonInCard(cardA) && buttonInCard(cardB), 'recommendation cards did not own their block buttons');
        cardA.remove();
        const stale = buttonsUnder(doc).filter((btn) => btn.dataset.uid === '111');
        assert.equal(stale.length, 0, 'removed recommendation card left a block button behind');
        const owner = cardB.querySelector('a[href*="space.bilibili.com"]');
        owner.setAttribute('href', '//space.bilibili.com/444');
        owner.querySelector('.name').textContent = 'UP-D';
        buttonInCard(cardB).click();
        await waitFor(() => page.blocked.length > 0, 'click did not block anyone');
        assert.deepEqual(page.blocked, ['444']);
    } finally {
        page.close();
    }
});

test('video profile block button stays outside the player info tree', async () => {
    const page = loadPage('https://www.bilibili.com/video/BV1test', `<!DOCTYPE html><body>
      <div class="right-container">
        <div class="up-info-container">
          <div class="up-info__detail">
            <div class="up-detail-top">
              <a class="up-name" href="//space.bilibili.com/777">UP-P</a>
              <a class="send-msg" href="#">发消息</a>
            </div>
          </div>
        </div>
      </div>
    </body>`);
    try {
        const doc = page.dom.window.document;
        await waitFor(() => buttonsUnder(doc).some((btn) => btn.dataset.uid === '777'), 'profile button did not mount');
        const insideInfo = buttonsUnder(doc.querySelector('.up-info-container'))
            .filter((btn) => btn.dataset.uid === '777');
        assert.equal(insideInfo.length, 0);
    } finally {
        page.close();
    }
});
