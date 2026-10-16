(() => {
  const key = '__plkaHoverV3';
  if (globalThis[key]) return;
  document.getElementById('reference-library-hover')?.remove();
  const host = document.createElement('div');
  host.id = 'reference-library-hover';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `button{all:initial;box-sizing:border-box;position:fixed;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:6px;background:#252831;color:#fff;border:1px solid #ffffffaa;border-radius:18px;padding:10px 13px;font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-shadow:0 3px 18px #0003;white-space:nowrap}button:hover{background:#3d4250}button:focus-visible{outline:3px solid #fff;outline-offset:2px}button[hidden]{display:none}button:disabled{opacity:.7}`;
  const button = document.createElement('button');
  button.textContent = '＋ 收藏到 Plka';
  button.setAttribute('aria-label', '收藏这张图片到 Plka');
  button.hidden = true;
  shadow.append(style, button);
  document.documentElement.append(host);
  let target = null, pointer = null, frame = 0, hideTimer = 0, opening = false;
  const containsPoint = (rect, x, y) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  function suitable(image, x, y) {
    if (!(image instanceof HTMLImageElement) || !image.isConnected) return false;
    const rect = image.getBoundingClientRect();
    return image.naturalWidth >= 120 && image.naturalHeight >= 100 && rect.width >= 90 && rect.height >= 80 && containsPoint(rect, x, y);
  }
  function imageAt(x, y) {
    const layers = document.elementsFromPoint(x, y).filter(n => n !== host);
    for (const node of layers) if (suitable(node, x, y)) return node;
    // Pinterest places links, gradients and action controls above the actual img.
    const visited = new Set();
    for (const node of layers.slice(0, 6)) {
      let parent = node;
      for (let depth = 0; parent && depth < 7; depth++, parent = parent.parentElement) {
        if (parent === document.body || parent === document.documentElement) break;
        if (visited.has(parent)) continue;
        visited.add(parent);
        const images = parent.querySelectorAll('img');
        if (images.length > 30) break;
        for (const image of images) if (suitable(image, x, y)) return image;
      }
    }
    return null;
  }
  function hideSoon() {
    if (hideTimer) return;
    hideTimer = setTimeout(() => { button.hidden = true; target = null; hideTimer = 0; }, 180);
  }
  function show(image) {
    clearTimeout(hideTimer); hideTimer = 0; target = image;
    const rect = image.getBoundingClientRect();
    button.style.left = Math.max(8, Math.min(innerWidth - 150, rect.left + 10)) + 'px';
    button.style.top = Math.max(8, Math.min(innerHeight - 46, rect.bottom - 45)) + 'px';
    button.hidden = false;
  }
  function refresh() {
    frame = 0;
    if (!pointer || opening) return;
    if (!button.hidden && containsPoint(button.getBoundingClientRect(), pointer.x, pointer.y)) { clearTimeout(hideTimer); hideTimer = 0; return; }
    const image = imageAt(pointer.x, pointer.y);
    if (image) show(image); else hideSoon();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(refresh); }
  function move(event) {
    if (event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    if (event.composedPath().includes(host)) { clearTimeout(hideTimer); hideTimer = 0; return; }
    schedule();
  }
  document.addEventListener('pointerover', move, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hideSoon(); }, true);
  document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement) schedule(); }, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  button.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hideTimer = 0; });
  button.addEventListener('pointerleave', schedule);
  button.onclick = async event => {
    if (!event.isTrusted || !target || opening) return;
    event.preventDefault(); event.stopPropagation();
    const image = target; opening = true; button.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'open-collector', item: {
        url: image.currentSrc || image.src, page_url: location.href, page_title: document.title,
        name: image.alt || document.title, width: image.naturalWidth, height: image.naturalHeight
      }});
      if (response?.error) throw new Error(response.error);
    } catch { button.textContent = '请重新加载扩展并刷新网页'; }
    finally { opening = false; button.disabled = false; }
  };
  globalThis[key] = true;
})();
