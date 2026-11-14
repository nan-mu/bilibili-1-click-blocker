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
    window.document.cookie = 'bili_jct=' + 'testvalue';
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
    return { dom, blocked };
}

async function main() {
    const feed = loadPage('https://www.bilibili.com/', `<!DOCTYPE html><body>
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
    const feedDoc = feed.dom.window.document;
    const [feedA, feedB] = feedDoc.querySelectorAll('.bili-video-card');
    await waitFor(() => buttonInCard(feedA) && buttonInCard(feedB), 'feed cards did not own their block buttons');
    feedA.remove();
    assert.equal(buttonsUnder(feedDoc).filter((btn) => btn.dataset.uid === '111').length, 0);
    assert.equal(buttonInCard(feedB).dataset.uid, '222');
    const feedOwner = feedB.querySelector('a.bili-video-card__info--owner');
    feedOwner.setAttribute('href', '//space.bilibili.com/444');
    feedOwner.querySelector('span').textContent = 'UP-D';
    feedOwner.querySelector('span').setAttribute('title', 'UP-D');
    buttonInCard(feedB).click();
    await waitFor(() => feed.blocked.length > 0, 'feed click did not block anyone');
    assert.deepEqual(feed.blocked, ['444']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    feed.dom.window.close();

    const video = loadPage('https://www.bilibili.com/video/BV1test', `<!DOCTYPE html><body>
      <div class="right-container">
        <div class="video-page-card-small">
          <div class="card-box"><div class="info"><div class="upname">
            <a href="//space.bilibili.com/111"><span class="name">UP-A</span></a>
          </div></div></div>
        </div>
        <div class="video-page-card-small">
          <div class="card-box"><div class="info"><div class="upname">
            <a href="//space.bilibili.com/222"><span class="name">UP-B</span></a>
          </div></div></div>
        </div>
      </div>
    </body>`);
    const videoDoc = video.dom.window.document;
    const [videoA, videoB] = videoDoc.querySelectorAll('.video-page-card-small');
    await waitFor(() => buttonInCard(videoA) && buttonInCard(videoB), 'recommendation cards did not own their block buttons');
    videoA.remove();
    assert.equal(buttonsUnder(videoDoc).filter((btn) => btn.dataset.uid === '111').length, 0);
    const videoOwner = videoB.querySelector('a[href*="space.bilibili.com"]');
    videoOwner.setAttribute('href', '//space.bilibili.com/444');
    videoOwner.querySelector('.name').textContent = 'UP-D';
    buttonInCard(videoB).click();
    await waitFor(() => video.blocked.length > 0, 'recommendation click did not block anyone');
    assert.deepEqual(video.blocked, ['444']);

    const profile = loadPage('https://www.bilibili.com/video/BV1test', `<!DOCTYPE html><body>
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
    const profileDoc = profile.dom.window.document;
    await waitFor(() => buttonsUnder(profileDoc).some((btn) => btn.dataset.uid === '777'), 'profile button did not mount');
    const insideInfo = buttonsUnder(profileDoc.querySelector('.up-info-container'))
        .filter((btn) => btn.dataset.uid === '777');
    assert.equal(insideInfo.length, 0);

    console.log('card button behavior ok');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
