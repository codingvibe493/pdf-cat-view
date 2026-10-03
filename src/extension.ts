import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PdfEditorProvider.viewType,
      new PdfEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate() { }

type BrowserKind = 'edge' | 'chrome' | 'default';

function openInBrowser(filePath: string, browser: BrowserKind = 'edge') {
  const fallback = () => { vscode.env.openExternal(vscode.Uri.file(filePath)); };
  // Path contains shell/cmd special characters -> use default opener for safety
  if (browser === 'default' || /[&^%!"]/.test(filePath)) { fallback(); return; }

  const names: Record<'edge' | 'chrome', { win: string; mac: string; linux: string }> = {
    edge: { win: 'msedge', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
    chrome: { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' }
  };
  const n = names[browser];
  const platform = os.platform();
  let cmd: string;
  let args: string[];
  if (platform === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '', n.win, filePath]; }
  else if (platform === 'darwin') { cmd = 'open'; args = ['-a', n.mac, filePath]; }
  else { cmd = n.linux; args = [filePath]; }

  execFile(cmd, args, { windowsHide: true }, (error) => { if (error) { fallback(); } });
}

class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'pdf-view.preview';
  constructor(private readonly context: vscode.ExtensionContext) { }

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => { } };
  }

  async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const webview = webviewPanel.webview;
    const uri = document.uri;
    const fsPath = uri.fsPath;
    webview.options = { enableScripts: true };

    const send = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        // Send as base64 (Uint8Array may degrade into a plain object through postMessage)
        webview.postMessage({ type: 'load', name: path.basename(fsPath), data: Buffer.from(bytes).toString('base64') });
      } catch (e: any) {
        webview.postMessage({ type: 'error', text: 'Failed to read file: ' + (e?.message || e) });
      }
    };

    // Auto-reload when PDF file changes (debounce to avoid reading partially written file)
    let timer: NodeJS.Timeout | undefined;
    const debounced = () => { if (timer) { clearTimeout(timer); } timer = setTimeout(send, 250); };
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(fsPath), path.basename(fsPath))
    );
    watcher.onDidChange(debounced);
    watcher.onDidCreate(debounced);
    webviewPanel.onDidDispose(() => { if (timer) { clearTimeout(timer); } watcher.dispose(); });

    const toast = (text: string) => webview.postMessage({ type: 'toast', text });

    webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg?.command) {
          case 'ready':
          case 'reload':
            await send();
            break;
          case 'openBrowser': {
            const b: BrowserKind = ['edge', 'chrome', 'default'].includes(msg.browser) ? msg.browser : 'edge';
            openInBrowser(fsPath, b);
            break;
          }
          case 'external':
            await vscode.env.openExternal(uri);
            break;
          case 'reveal':
            await vscode.commands.executeCommand('revealFileInOS', uri);
            break;
          case 'copy':
            await vscode.env.clipboard.writeText(String(msg.text || '').slice(0, 2_000_000));
            toast('Text copied');
            break;
          case 'copyPath':
            await vscode.env.clipboard.writeText(fsPath);
            toast('File path copied');
            break;
          case 'saveCopy': {
            const target = await vscode.window.showSaveDialog({ defaultUri: uri, filters: { PDF: ['pdf'] } });
            if (target) {
              await vscode.workspace.fs.copy(uri, target, { overwrite: true });
              toast('Copy saved');
            }
            break;
          }
        }
      } catch (e: any) {
        toast('Failed: ' + (e?.message || e));
      }
    });

    const nonce = crypto.randomBytes(16).toString('hex');
    webview.html = this.getHtml(path.basename(fsPath), webview.cspSource, nonce);
  }

  private getHtml(fileName: string, cspSource: string, nonce: string): string {
    const safe = fileName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    // String.raw: backslash stays intact. Avoid backticks or dollar-brackets inside webview JS.
    return String.raw`<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: ${cspSource}; style-src 'unsafe-inline'; font-src data: blob: https://cdnjs.cloudflare.com; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com blob:; worker-src blob: https://cdnjs.cloudflare.com; connect-src https://cdnjs.cloudflare.com blob: data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safe}</title>
<script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>
:root{--bg:#d4d4d7;--bar:#f9f9fb;--bd:#cfcfd8;--fg:#15141a;--mut:#6b6b76;--hov:#e0e0e6;--act:#cfcfd8;--side:#e9e9ed;--menu:#fff;--field:#fff;--acc:#0060df;--hl:rgba(255,226,0,.55);--hls:rgba(255,140,0,.65)}
[data-theme=dark]{--bg:#2a2a2e;--bar:#38383d;--bd:#1c1b22;--fg:#fbfbfe;--mut:#a0a0ab;--hov:#4a4a50;--act:#5b5b66;--side:#2b2a33;--menu:#42414d;--field:#1c1b22;--acc:#6cb6ff;--hl:rgba(255,226,0,.4);--hls:rgba(255,140,0,.6)}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font:13px -apple-system,'Segoe UI',Roboto,sans-serif}
#app{display:flex;flex-direction:column;width:100%;height:100%;max-width:100%;overflow:hidden;position:relative}
.i{width:17px;height:17px;flex:none}
.sp{flex:1}
.vr{display:block;width:1px;height:20px;background:var(--bd);margin:0 4px;flex:none}
button,select,input,.tog{font:inherit;color:inherit}
button,.tog{background:none;border:0;border-radius:4px;padding:5px 8px;cursor:pointer;min-width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
button:hover:not(:disabled),.tog:hover{background:var(--hov)}
button:disabled{opacity:.4;cursor:default}
button.on,.tog:has(input:checked){background:var(--act)}
.tog input{display:none}
input[type=number],input[type=text],select{background:var(--field);border:1px solid var(--bd);border-radius:4px;height:28px;padding:0 8px;outline:none}
input:focus,select:focus,button:focus-visible{outline:2px solid var(--acc);outline-offset:-1px}
input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;border:0;padding:0;cursor:pointer;background:linear-gradient(to right,var(--acc) var(--p,0%),var(--bd) var(--p,0%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--acc);border:0}
input[type=range]:focus-visible{outline-offset:4px}

/* ----- Top Navbar ----- */
#bar,#find{display:flex;align-items:center;gap:3px;padding:4px 8px;background:var(--bar);border-bottom:1px solid var(--bd);flex:none;min-width:0;overflow:hidden}
#bar{height:42px}
#find{flex-wrap:wrap;gap:5px;padding:5px 8px}
#pg{width:48px;min-width:36px;text-align:center;-moz-appearance:textfield;flex-shrink:0}
#pgn{color:var(--mut);margin:0 4px 0 2px;white-space:nowrap;flex-shrink:0}
#zoom{width:135px;min-width:90px;flex-shrink:0}
#title{flex:1 1 auto;min-width:0;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;padding:0 8px}
#q{flex:1 1 160px;min-width:120px;max-width:280px}
#cnt{color:var(--mut);padding:0 6px;white-space:nowrap;flex-shrink:0;font-size:12px}

/* ----- Main Area ----- */
#main{flex:1;display:flex;min-height:0;min-width:0;position:relative;overflow:hidden}
#side{width:220px;max-width:80vw;flex:none;background:var(--side);border-right:1px solid var(--bd);display:flex;flex-direction:column;z-index:10}
#stabs{display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--bd)}
#thumbs,#outline,#marks{flex:1;overflow:auto;padding:10px}
#outline ul{list-style:none;margin:0;padding-left:14px}#outline>ul{padding:0}
#outline a,#marks a{display:block;padding:4px 6px;border-radius:3px;cursor:pointer}
#outline a:hover,#marks a:hover{background:var(--hov)}
#marks .row{display:flex;align-items:center;gap:4px}#marks .row a{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#marks .row.cur a{background:var(--act)}
.empty{color:var(--mut);line-height:1.5}
.thumb{display:block;margin:0 auto 12px;padding:6px;border-radius:4px;cursor:pointer;text-align:center}
.thumb canvas{display:block;margin:auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.thumb.cur{background:var(--act)}
.thumb span{color:var(--mut);font-size:11px}
#viewer{flex:1;overflow:auto;position:relative;min-width:0}
#viewer.snap{scroll-snap-type:both mandatory}
#viewer.snap .page{scroll-snap-align:center}
#pages{display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px;width:max-content;min-width:100%}
#pages.m-horizontal{flex-direction:row;min-height:100%}
#pages.m-wrapped{flex-flow:row wrap;justify-content:center;align-items:flex-start;width:100%}
.spread{display:flex;gap:6px;flex:none}
.page{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.45);flex:none}
.page canvas{display:block}
[data-invert="1"] .page canvas{filter:invert(.9) hue-rotate(180deg)}
.textLayer{position:absolute;inset:0;overflow:hidden;line-height:1}
.textLayer span{position:absolute;white-space:pre;color:transparent;cursor:text;transform-origin:0 0}
.textLayer span span{position:static}
.textLayer ::selection{background:rgba(0,110,255,.35)}
.hl{background:var(--hl);border-radius:2px}.hl.sel{background:var(--hls)}
#viewer.hand{cursor:grab}#viewer.hand .textLayer{pointer-events:none}#viewer.grabbing{cursor:grabbing}

/* ----- Loading / error messages ----- */
#msg{position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;color:var(--mut);pointer-events:none;background:var(--bg);z-index:5}
#msg.err{color:#d70022;padding:20px;text-align:center}
.spin{width:28px;height:28px;border:3px solid var(--bd);border-top-color:var(--acc);border-radius:50%;animation:sp 0.8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* ----- Menu, dialog, toast ----- */
#menu{position:absolute;top:2px;right:6px;z-index:20;background:var(--menu);border:1px solid var(--bd);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.35);padding:4px 0;min-width:250px;max-width:calc(100vw - 16px);max-height:calc(100% - 8px);overflow:auto}
#menu button{width:100%;justify-content:flex-start;border-radius:0;padding:6px 14px}
#menu button.on{background:var(--act)}
#menu hr{border:0;border-top:1px solid var(--bd);margin:4px 0}
#dlg{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:12px}
#dlg>div{background:var(--menu);border-radius:8px;padding:16px 20px;min-width:260px;max-width:92%;max-height:90%;overflow:auto}
#dlg h3{margin:0 0 12px;font-size:14px}
#dlg dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 12px}#dlg dt{color:var(--mut)}#dlg dd{margin:0;word-break:break-all}
#toast{position:absolute;left:50%;bottom:16px;transform:translate(-50%,20px);background:var(--fg);color:var(--bar);padding:7px 14px;border-radius:16px;opacity:0;pointer-events:none;transition:.2s;z-index:40;white-space:nowrap}
#toast.show{opacity:.95;transform:translate(-50%,0)}
#unfocus{position:absolute;top:8px;right:14px;z-index:25;background:var(--bar);border:1px solid var(--bd);box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:.35}
#unfocus:hover{opacity:1}

/* ----- Bottom status bar ----- */
#status{display:flex;align-items:center;justify-content:space-between;gap:8px;height:30px;padding:0 8px;background:var(--bar);border-top:1px solid var(--bd);flex:none;font-size:12px;color:var(--mut);min-width:0;overflow:hidden;white-space:nowrap}
#st-l{display:flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto;max-width:35%;overflow:hidden}
#st-file{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg);min-width:0}
#st-size{flex-shrink:0;color:var(--mut)}
#st-sel{display:flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0}
#st-m{display:flex;align-items:center;gap:8px;flex:1 1 auto;justify-content:center;min-width:0;max-width:380px}
#seek{flex:1 1 auto;min-width:50px;max-width:220px}
#st-pg{flex-shrink:0;text-align:right;color:var(--fg);white-space:nowrap}
#st-r{display:flex;align-items:center;gap:3px;flex:0 0 auto;justify-content:flex-end}
#zs{width:90px}
#zp{min-width:38px;text-align:right;color:var(--fg);font-variant-numeric:tabular-nums}
#status button{height:24px;min-width:24px;padding:2px 6px;flex-shrink:0}

html.focus #bar,html.focus #status,html.focus #find{display:none}
html:not(.focus) #unfocus{display:none}

/* ----- Responsive Breakpoints ----- */
@media(max-width:1000px){#title{display:none}}
@media(max-width:860px){#b-fw,#b-fp,#s-keys,#s-reload{display:none}#zoom{width:110px}}
@media(max-width:740px){#st-l{display:none}#b-rot,#b-mark{display:none}#s-spread,#s-focus,#st-r .vr{display:none}#zs{width:70px}}
@media(max-width:620px){#zs{display:none}#b-tool,#zoom{display:none}#seek{max-width:140px}}
@media(max-width:480px){
  #seek{display:none}
  #pgn{display:none}
  #bar,#status{padding:0 4px;gap:2px}
  #st-m{justify-content:flex-start}
  #side{position:absolute;top:0;bottom:0;left:0;width:230px;max-width:85vw;box-shadow:2px 0 12px rgba(0,0,0,.35)}
}
</style>
</head>
<body>
<div id="app">
 <!-- TOP NAVBAR -->
 <header id="bar">
  <button id="b-side" data-i="sidebar" title="Toggle sidebar (S)"></button>
  <button id="b-find" data-i="search" title="Find in document (Ctrl+F)"></button>
  <i class="vr"></i>
  <button id="b-prev" data-i="up" title="Previous page (P)"></button>
  <input id="pg" type="number" min="1" value="1" title="Go to page (Ctrl+G)"><span id="pgn">/ 0</span>
  <button id="b-next" data-i="down" title="Next page (N)"></button>
  <i class="vr"></i>
  <button id="b-zo" data-i="minus" title="Zoom out (Ctrl+-)"></button>
  <select id="zoom" title="Zoom">
   <option value="auto">Automatic Zoom</option><option value="actual">Actual Size</option><option value="fit">Fit Page</option><option value="width">Fit Width</option>
   <option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option><option value="4">400%</option>
  </select>
  <button id="b-zi" data-i="plus" title="Zoom in (Ctrl++)"></button>
  <button id="b-fw" data-i="fitw" title="Fit to width (W)"></button>
  <button id="b-fp" data-i="fitp" title="Fit single page"></button>
  <span id="title"></span>
  <button id="b-rot" data-i="rotate" title="Rotate clockwise (R)"></button>
  <button id="b-mark" data-i="mark" title="Bookmark page (B)"></button>
  <button id="b-tool" data-i="hand" title="Hand tool / Text selection (H)"></button>
  <i class="vr"></i>
  <button id="b-theme" title="Toggle theme"></button>
  <button id="b-more" data-i="menu" title="More options"></button>
 </header>
 <div id="find" hidden>
  <input id="q" type="text" placeholder="Find in document…" autocomplete="off">
  <button id="f-prev" data-i="up" title="Previous match (Shift+Enter)"></button><button id="f-next" data-i="down" title="Next match (Enter)"></button>
  <label class="tog"><input type="checkbox" id="c-all">Highlight All</label>
  <label class="tog"><input type="checkbox" id="c-case">Match Case</label>
  <label class="tog"><input type="checkbox" id="c-dia">Match Diacritics</label>
  <label class="tog"><input type="checkbox" id="c-word">Whole Words</label>
  <span id="cnt"></span>
 </div>

 <!-- MAIN AREA -->
 <div id="main">
  <aside id="side" hidden>
   <div id="stabs">
    <button id="t-thumb" data-i="grid" title="Thumbnails"></button>
    <button id="t-out" data-i="list" title="Table of Contents"></button>
    <button id="t-mark" data-i="mark" title="Bookmarks"></button>
   </div>
   <div id="thumbs"></div><div id="outline" hidden></div><div id="marks" hidden></div>
  </aside>
  <div id="viewer"><div id="pages"></div></div>
  <div id="msg"><div class="spin" id="spin"></div><span id="msgt">Loading PDF…</span></div>
  <button id="unfocus" data-i="close" title="Exit focus mode (Esc)"> Exit focus</button>
  <div id="menu" hidden>
   <button data-a="first" data-i="top"> First page</button>
   <button data-a="last" data-i="bottom"> Last page</button><hr>
   <button data-a="rcw" data-i="rotate"> Rotate clockwise</button>
   <button data-a="rccw" data-i="rotate"> Rotate counterclockwise</button><hr>
   <button data-a="tool-text" data-i="cursor"> Text selection tool</button>
   <button data-a="tool-hand" data-i="hand"> Hand tool</button><hr>
   <button data-a="sc-page" data-i="file"> Page-by-page scrolling</button>
   <button data-a="sc-vertical" data-i="scroll"> Vertical scrolling</button>
   <button data-a="sc-horizontal" data-i="fitw"> Horizontal scrolling</button>
   <button data-a="sc-wrapped" data-i="grid"> Wrapped scrolling</button><hr>
   <button data-a="sp-none" data-i="file"> No spread</button>
   <button data-a="sp-odd" data-i="book"> Odd spread</button>
   <button data-a="sp-even" data-i="book"> Even spread</button><hr>
   <button data-a="invert" data-i="auto"> Invert page colors</button>
   <button data-a="focus" data-i="eye"> Focus mode (F)</button>
   <button data-a="copypage" data-i="copy"> Copy page text</button>
   <button data-a="copypath" data-i="copy"> Copy file path</button>
   <button data-a="reveal" data-i="folder"> Reveal in File Explorer</button>
   <button data-a="save" data-i="download"> Save a copy…</button><hr>
   <button data-a="browser" data-i="external"> Open in Microsoft Edge</button>
   <button data-a="chrome" data-i="external"> Open in Google Chrome</button>
   <button data-a="external" data-i="external"> Open with default application</button><hr>
   <button data-a="props" data-i="info"> Document properties…</button>
   <button data-a="keys" data-i="kbd"> Keyboard shortcuts…</button>
  </div>
  <div id="dlg" hidden><div><h3 id="dlg-t"></h3><dl id="dlg-dl"></dl><button id="dlg-x" style="background:var(--act)">Close</button></div></div>
  <div id="toast"></div>
 </div>

 <!-- BOTTOM STATUS BAR -->
 <footer id="status">
  <div id="st-l">
   <span id="st-file"></span><span id="st-size"></span>
   <span id="st-sel" hidden><span id="st-seln"></span><button id="st-copy" data-i="copy" title="Copy selected text"></button></span>
  </div>
  <div id="st-m">
   <input id="seek" type="range" min="1" max="1" value="1" title="Seek page">
   <span id="st-pg">Page 0 of 0</span>
  </div>
  <div id="st-r">
   <button id="s-zo" data-i="minus" title="Zoom out"></button>
   <input id="zs" type="range" min="10" max="400" step="5" value="100" title="Zoom">
   <button id="s-zi" data-i="plus" title="Zoom in"></button>
   <span id="zp">100%</span>
   <i class="vr"></i>
   <button id="s-spread" data-i="book" title="Two-page view"></button>
   <button id="s-focus" data-i="eye" title="Focus mode (F)"></button>
   <button id="s-reload" data-i="refresh" title="Reload file"></button>
   <button id="s-keys" data-i="kbd" title="Keyboard shortcuts (?)"></button>
  </div>
 </footer>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
const post = (command, extra) => vscode.postMessage(Object.assign({command: command}, extra || {}));
const HAS = typeof pdfjsLib !== 'undefined';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const st = Object.assign({theme:'auto', invert:false, sidebar:false, scroll:'vertical', spread:'none', tool:'text', tab:'thumb', zoom:'auto', page:1, marks:[]}, vscode.getState() || {});
const save = () => vscode.setState(st);
let pdf = null, pages = [], scaleMode = st.zoom, scale = 1, rot = 0, cur = st.page || 1, fileName = '', fileSize = 0, selText = '';
const S = {matches: [], idx: -1, texts: null, reveal: false};

/* ---------- Icons ---------- */
const IC = {
  sidebar:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  up:'<path d="M6 15l6-6 6 6"/>', down:'<path d="M6 9l6 6 6-6"/>',
  minus:'<path d="M5 12h14"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  fitw:'<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  fitp:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  rotate:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  mark:'<path d="M6 4h12v17l-6-4-6 4z"/>',
  hand:'<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5v-5a1.5 1.5 0 0 1 3 0V11m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5-2.7L4 15.2a1.5 1.5 0 0 1 2.4-1.8L9 16"/>',
  cursor:'<path d="M9 4h6M9 20h6M12 4v16"/>',
  auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  grid:'<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download:'<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  kbd:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book:'<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  top:'<path d="M5 5h14M12 19V9M7 14l5-5 5 5"/>',
  bottom:'<path d="M5 19h14M12 5v10M7 10l5 5 5-5"/>',
  scroll:'<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'
};
const svg = n => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>';
function setIcon(el, n) { const o = el.querySelector('svg'); if (o) o.remove(); el.insertAdjacentHTML('afterbegin', svg(n)); }
document.querySelectorAll('[data-i]').forEach(el => setIcon(el, el.dataset.i));

/* ---------- UI Utils ---------- */
const setRange = (el, min, max) => el.style.setProperty('--p', ((el.value - min) / (max - min) * 100) + '%');
function showMsg(t, err) { $('msg').hidden = false; $('msg').classList.toggle('err', !!err); $('msgt').textContent = t; $('spin').hidden = !!err; }
let tt;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 2000); }
function openDlg(title, rows) {
  $('dlg-t').textContent = title; const dl = $('dlg-dl'); dl.innerHTML = '';
  rows.forEach(r => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = r[0]; dd.textContent = (r[1] === undefined || r[1] === null || r[1] === '') ? '-' : r[1]; dl.append(dt, dd); });
  $('dlg').hidden = false;
}
on('dlg-x', 'click', () => $('dlg').hidden = true);

/* ---------- Theme ---------- */
function applyTheme() {
  const cl = document.body.classList;
  const dark = st.theme === 'dark' || (st.theme === 'auto' && !cl.contains('vscode-light') && !cl.contains('vscode-high-contrast-light'));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.invert = st.invert ? '1' : '0';
  setIcon($('b-theme'), st.theme === 'auto' ? 'auto' : st.theme === 'dark' ? 'moon' : 'sun');
  $('b-theme').title = 'Theme: ' + st.theme + ' (click to switch)';
}
on('b-theme', 'click', () => { st.theme = {auto:'light', light:'dark', dark:'auto'}[st.theme]; save(); applyTheme(); });
new MutationObserver(applyTheme).observe(document.body, {attributes:true, attributeFilter:['class']});

/* ---------- Page model & layout ---------- */
const pageIO = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && render(e.target.__p)), {root: $('viewer'), rootMargin: '300px'});
const thumbIO = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && renderThumb(e.target.__p)), {root: $('thumbs'), rootMargin: '300px'});
const vpOf = (p, s) => p.page.getViewport({scale: s, rotation: (p.page.rotate + rot) % 360});

function computeScale() {
  if (typeof scaleMode === 'number') return scaleMode;
  if (!pages.length) return 1;
  const v = $('viewer'), per = st.spread === 'none' ? 1 : 2;
  const p = pages[Math.max(0, cur - 1)];
  if (!p) return 1;
  const vp = vpOf(p, 1);
  const availW = Math.max(v.clientWidth - 32, 100);
  const availH = Math.max(v.clientHeight - 24, 100);
  const fw = availW / per / vp.width;
  const fh = availH / vp.height;
  if (scaleMode === 'actual') return 1;
  if (scaleMode === 'width') return Math.max(0.1, fw);
  if (scaleMode === 'fit') return Math.max(0.1, Math.min(fw, fh));
  return Math.max(0.1, Math.min(fw, 1.25));
}

function layout() {
  const box = $('pages'); box.innerHTML = ''; box.className = 'm-' + st.scroll;
  $('viewer').classList.toggle('snap', st.scroll === 'page');
  let groups = [];
  if (st.spread === 'none') groups = pages.map(p => [p]);
  else {
    const off = st.spread === 'odd' ? 0 : 1;
    if (off && pages.length) groups.push([pages[0]]);
    for (let i = off; i < pages.length; i += 2) groups.push(pages.slice(i, i + 2));
  }
  groups.forEach(g => { const d = document.createElement('div'); d.className = 'spread'; g.forEach(p => d.appendChild(p.wrap)); box.appendChild(d); });
  resize(false); scrollToPage(cur); markMenu();
}

function resize(keep) {
  if (!pages.length) return;
  const v = $('viewer');
  const rx = v.scrollWidth ? v.scrollLeft / v.scrollWidth : 0, ry = v.scrollHeight ? v.scrollTop / v.scrollHeight : 0;
  scale = computeScale();
  pageIO.disconnect();
  pages.forEach(p => {
    const vp = vpOf(p, scale);
    p.wrap.style.width = vp.width + 'px'; p.wrap.style.height = vp.height + 'px';
    p.gen++; p.busy = false; p.rendered = false;
    if (p.task) { try { p.task.cancel(); } catch (e) {} }
    p.canvas.width = p.canvas.height = 0; p.tl.innerHTML = '';
    pageIO.observe(p.wrap);
  });
  zoomUI();
  if (keep !== false) { v.scrollLeft = rx * v.scrollWidth; v.scrollTop = ry * v.scrollHeight; }
}

async function render(p) {
  if (p.rendered || p.busy) return;
  p.busy = true; const gen = p.gen;
  const vp = vpOf(p, scale), dpr = window.devicePixelRatio || 1, c = p.canvas;
  c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
  c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
  try {
    p.task = p.page.render({canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null});
    await p.task.promise;
    if (gen !== p.gen) return;
    const tc = await p.page.getTextContent();
    if (gen !== p.gen) return;
    p.tl.innerHTML = ''; p.tl.style.setProperty('--scale-factor', vp.scale);
    p.divs = []; p.strs = []; p.dirty = new Set();
    await pdfjsLib.renderTextLayer({textContentSource: tc, container: p.tl, viewport: vp, textDivs: p.divs, textContentItemsStr: p.strs}).promise;
    if (gen !== p.gen) return;
    p.rendered = true; p.busy = false; paint(p);
  } catch (e) { if (gen === p.gen) p.busy = false; }
}

function scrollToPage(n) { const p = pages[n - 1]; if (p) p.wrap.scrollIntoView({block: 'start', inline: 'start'}); }
function setCur(n) {
  cur = n; st.page = n; save();
  $('pg').value = n; $('seek').value = n;
  $('seek').style.setProperty('--p', (pages.length > 1 ? (n - 1) / (pages.length - 1) * 100 : 100) + '%');
  $('st-pg').textContent = 'Page ' + n + ' of ' + pages.length;
  document.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('cur', i === n - 1));
  $('b-prev').disabled = n <= 1; $('b-next').disabled = n >= pages.length;
  const t = document.querySelectorAll('.thumb')[n - 1]; if (t && st.sidebar && st.tab === 'thumb') t.scrollIntoView({block: 'nearest'});
  markUI();
}
let ticking = false;
$('viewer').addEventListener('scroll', () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const vr = $('viewer').getBoundingClientRect(); let best = 0, bn = cur;
    for (const p of pages) {
      const r = p.wrap.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top)) * Math.max(0, Math.min(r.right, vr.right) - Math.max(r.left, vr.left));
      if (a > best) { best = a; bn = p.n; }
    }
    if (bn !== cur) setCur(bn);
  });
});

/* ---------- Document loading ---------- */
const initP = (async () => {
  if (!HAS) return;
  try { const b = await (await fetch(WORKER)).blob(); pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(b); }
  catch (e) { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; }
})();

function fmtSize(n) {
  if (!n) return '0 B';
  return n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB';
}

async function load(bytes, name) {
  if (!HAS) { showMsg('Failed to load pdf.js from CDN. Please check your internet connection and reload.', true); return; }
  await initP;
  const keep = cur, reload = !!pdf;
  let doc;
  try { doc = await pdfjsLib.getDocument({data: bytes}).promise; }
  catch (e) {
    const t = e && e.name === 'PasswordException' ? 'This PDF is password-protected (unsupported).' : 'Failed to load PDF: ' + (e && e.message ? e.message : e);
    if (!pdf) showMsg(t, true); else toast(t);
    return;
  }
  if (pdf) { try { pdf.destroy(); } catch (e) {} }
  pdf = doc; fileName = name; fileSize = bytes.length;
  const list = await Promise.all(Array.from({length: pdf.numPages}, (_, i) => pdf.getPage(i + 1)));
  pages = list.map((page, i) => {
    const wrap = document.createElement('div'); wrap.className = 'page';
    const canvas = document.createElement('canvas'), tl = document.createElement('div'); tl.className = 'textLayer';
    wrap.append(canvas, tl);
    const p = {n: i + 1, page, wrap, canvas, tl, gen: 0, rendered: false, busy: false, divs: [], strs: [], dirty: new Set()};
    wrap.__p = p; return p;
  });
  $('msg').hidden = true;
  $('title').textContent = name; $('st-file').textContent = name; $('st-file').title = name; $('st-size').textContent = fmtSize(fileSize);
  $('pg').max = pages.length; $('pgn').textContent = '/ ' + pages.length;
  $('seek').max = pages.length;
  S.texts = null; S.matches = []; S.idx = -1;
  buildThumbs(); buildOutline(); renderMarks();
  layout(); setCur(Math.min(Math.max(1, keep), pages.length)); scrollToPage(cur);
  if ($('q').value) doSearch();
  if (reload) toast('PDF reloaded');
}

/* ---------- Sidebar ---------- */
function buildThumbs() {
  const box = $('thumbs'); box.innerHTML = ''; thumbIO.disconnect();
  pages.forEach(p => {
    const t = document.createElement('div'); t.className = 'thumb'; t.__p = p;
    const c = document.createElement('canvas'), s = document.createElement('span'); s.textContent = p.n;
    const vp = vpOf(p, 140 / vpOf(p, 1).width); c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
    c.width = 1; c.height = 1; t.append(c, s); t.onclick = () => { scrollToPage(p.n); setCur(p.n); };
    p.thumb = t; box.appendChild(t); thumbIO.observe(t);
  });
}
async function renderThumb(p) {
  if (p.thumbDone) return; p.thumbDone = true;
  const t = p.thumb, c = t.firstChild, dpr = window.devicePixelRatio || 1, vp = vpOf(p, 140 / vpOf(p, 1).width);
  c.width = vp.width * dpr; c.height = vp.height * dpr; c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
  try { await p.page.render({canvasContext: c.getContext('2d'), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0]}).promise; } catch (e) {}
}
async function buildOutline() {
  const box = $('outline'); box.innerHTML = '';
  const o = await pdf.getOutline();
  if (!o || !o.length) { box.className = 'empty'; box.textContent = 'This document has no table of contents.'; return; }
  box.className = '';
  const mk = items => {
    const ul = document.createElement('ul');
    items.forEach(it => {
      const li = document.createElement('li'), a = document.createElement('a'); a.textContent = it.title;
      a.onclick = async () => { try { let d = it.dest; if (typeof d === 'string') d = await pdf.getDestination(d); scrollToPage((await pdf.getPageIndex(d[0])) + 1); } catch (e) {} };
      li.appendChild(a); if (it.items && it.items.length) li.appendChild(mk(it.items)); ul.appendChild(li);
    });
    return ul;
  };
  box.appendChild(mk(o));
}

/* ---------- Bookmarks ---------- */
function markUI() { $('b-mark').classList.toggle('on', (st.marks || []).includes(cur)); document.querySelectorAll('#marks .row').forEach(r => r.classList.toggle('cur', +r.dataset.n === cur)); }
function renderMarks() {
  const box = $('marks'); box.innerHTML = '';
  const m = (st.marks || []).slice().sort((a, b) => a - b);
  if (!m.length) { box.className = 'empty'; box.textContent = 'No bookmarks yet. Press B to bookmark the current page.'; return; }
  box.className = '';
  m.forEach(n => {
    const row = document.createElement('div'); row.className = 'row'; row.dataset.n = n;
    const a = document.createElement('a'); a.textContent = 'Page ' + n; a.onclick = () => { scrollToPage(n); setCur(n); };
    const x = document.createElement('button'); x.title = 'Remove bookmark'; setIcon(x, 'close'); x.onclick = () => { st.marks = st.marks.filter(v => v !== n); save(); renderMarks(); markUI(); };
    row.append(a, x); box.appendChild(row);
  });
  markUI();
}
function toggleMark() {
  const m = new Set(st.marks || []);
  if (m.has(cur)) { m.delete(cur); toast('Bookmark removed (page ' + cur + ')'); } else { m.add(cur); toast('Page ' + cur + ' bookmarked'); }
  st.marks = Array.from(m); save(); renderMarks();
}
on('b-mark', 'click', toggleMark);

function sideUI() {
  $('side').hidden = !st.sidebar; $('b-side').classList.toggle('on', st.sidebar);
  $('thumbs').hidden = st.tab !== 'thumb'; $('outline').hidden = st.tab !== 'out'; $('marks').hidden = st.tab !== 'mark';
  $('t-thumb').classList.toggle('on', st.tab === 'thumb'); $('t-out').classList.toggle('on', st.tab === 'out'); $('t-mark').classList.toggle('on', st.tab === 'mark');
}
const toggleSide = () => { st.sidebar = !st.sidebar; save(); sideUI(); if (typeof scaleMode !== 'number') resize(); };
on('b-side', 'click', toggleSide);
on('t-thumb', 'click', () => { st.tab = 'thumb'; save(); sideUI(); });
on('t-out', 'click', () => { st.tab = 'out'; save(); sideUI(); });
on('t-mark', 'click', () => { st.tab = 'mark'; save(); sideUI(); });

/* ---------- Navigation & zoom ---------- */
on('b-prev', 'click', () => scrollToPage(Math.max(1, cur - 1)));
on('b-next', 'click', () => scrollToPage(Math.min(pages.length, cur + 1)));
on('pg', 'change', () => { const n = Math.min(pages.length, Math.max(1, parseInt($('pg').value) || 1)); scrollToPage(n); setCur(n); });
on('pg', 'focus', () => $('pg').select());
on('seek', 'input', () => { const n = parseInt($('seek').value) || 1; scrollToPage(n); setCur(n); });
const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];
function zoomBy(dir) {
  const s = scale;
  scaleMode = dir > 0 ? (STEPS.find(x => x > s * 1.01) || 5) : ([...STEPS].reverse().find(x => x < s * 0.99) || 0.1);
  resize();
}
function zoomUI() {
  const sel = $('zoom'); const old = sel.querySelector('[data-custom]'); if (old) old.remove();
  const v = String(scaleMode);
  if (![...sel.options].some(o => o.value === v)) {
    const o = document.createElement('option'); o.value = v; o.dataset.custom = '1'; o.textContent = Math.round(scale * 100) + '%'; sel.appendChild(o);
  }
  sel.value = v;
  const pc = Math.round(scale * 100);
  $('zs').value = Math.min(400, Math.max(10, pc)); setRange($('zs'), 10, 400);
  $('zp').textContent = pc + '%';
  $('b-fw').classList.toggle('on', scaleMode === 'width'); $('b-fp').classList.toggle('on', scaleMode === 'fit');
  st.zoom = scaleMode; save();
}
on('b-zi', 'click', () => zoomBy(1)); on('b-zo', 'click', () => zoomBy(-1));
on('s-zi', 'click', () => zoomBy(1)); on('s-zo', 'click', () => zoomBy(-1));
on('b-fw', 'click', () => { scaleMode = 'width'; resize(); });
on('b-fp', 'click', () => { scaleMode = 'fit'; resize(); });
on('zoom', 'change', () => { const v = $('zoom').value; scaleMode = isNaN(v) ? v : parseFloat(v); resize(); });
let zt;
on('zs', 'input', () => {
  const v = parseInt($('zs').value); setRange($('zs'), 10, 400); $('zp').textContent = v + '%';
  clearTimeout(zt); zt = setTimeout(() => { scaleMode = v / 100; resize(); }, 60);
});
$('viewer').addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); } }, {passive: false});
let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => typeof scaleMode !== 'number' && resize(), 120); }).observe($('viewer'));

/* ---------- Tools: rotate, hand/select, spread, focus ---------- */
const rotate = d => { rot = (rot + d + 360) % 360; pages.forEach(p => p.thumbDone = false); buildThumbs(); resize(); };
function setTool(t) { st.tool = t; save(); markMenu(); }
function toggleFocus(force) {
  const h = document.documentElement; const f = force === undefined ? !h.classList.contains('focus') : force;
  h.classList.toggle('focus', f); if (f) toast('Focus mode — press Esc to exit');
}
const toggleSpread = () => { st.spread = st.spread === 'none' ? 'odd' : 'none'; save(); layout(); };
on('b-rot', 'click', () => rotate(90));
on('b-tool', 'click', () => setTool(st.tool === 'hand' ? 'text' : 'hand'));
on('s-spread', 'click', toggleSpread);
on('s-focus', 'click', () => toggleFocus());
on('unfocus', 'click', () => toggleFocus(false));
on('s-reload', 'click', () => { post('reload'); });
on('s-keys', 'click', () => showKeys());

function markMenu() {
  document.querySelectorAll('#menu button').forEach(b => {
    const a = b.dataset.a;
    b.classList.toggle('on', a === 'tool-' + st.tool || a === 'sc-' + st.scroll || a === 'sp-' + st.spread || (a === 'invert' && st.invert));
  });
  $('viewer').classList.toggle('hand', st.tool === 'hand');
  $('b-tool').classList.toggle('on', st.tool === 'hand');
  $('s-spread').classList.toggle('on', st.spread !== 'none');
}

/* ---------- Menu ---------- */
on('b-more', 'click', e => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; });
document.addEventListener('click', e => { if (!e.target.closest('#menu')) $('menu').hidden = true; });
async function copyPage() {
  const p = pages[cur - 1]; if (!p) return;
  const tc = await p.page.getTextContent();
  post('copy', {text: tc.items.map(i => (i.str || '') + (i.hasEOL ? '\n' : '')).join('')});
}
on('menu', 'click', e => {
  const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; $('menu').hidden = true;
  if (a === 'first') scrollToPage(1);
  else if (a === 'last') scrollToPage(pages.length);
  else if (a === 'rcw') rotate(90);
  else if (a === 'rccw') rotate(-90);
  else if (a.startsWith('tool-')) setTool(a.slice(5));
  else if (a.startsWith('sc-')) { st.scroll = a.slice(3); save(); layout(); }
  else if (a.startsWith('sp-')) { st.spread = a.slice(3); save(); layout(); }
  else if (a === 'invert') { st.invert = !st.invert; save(); applyTheme(); markMenu(); }
  else if (a === 'focus') toggleFocus(true);
  else if (a === 'copypage') copyPage();
  else if (a === 'copypath') post('copyPath');
  else if (a === 'reveal') post('reveal');
  else if (a === 'save') post('saveCopy');
  else if (a === 'browser') post('openBrowser', {browser: 'edge'});
  else if (a === 'chrome') post('openBrowser', {browser: 'chrome'});
  else if (a === 'external') post('external');
  else if (a === 'props') showProps();
  else if (a === 'keys') showKeys();
});

// Hand tool: drag to scroll
let drag = null;
$('viewer').addEventListener('mousedown', e => { if (st.tool !== 'hand') return; drag = {x: e.clientX, y: e.clientY, l: $('viewer').scrollLeft, t: $('viewer').scrollTop}; $('viewer').classList.add('grabbing'); e.preventDefault(); });
window.addEventListener('mousemove', e => { if (drag) { $('viewer').scrollLeft = drag.l - (e.clientX - drag.x); $('viewer').scrollTop = drag.t - (e.clientY - drag.y); } });
window.addEventListener('mouseup', () => { drag = null; $('viewer').classList.remove('grabbing'); });

/* ---------- Text selection (status bar) ---------- */
document.addEventListener('selectionchange', () => {
  const t = String(window.getSelection() || '').trim(); selText = t;
  const n = t ? t.split(/\s+/).length : 0;
  $('st-sel').hidden = !n; if (n) $('st-seln').textContent = n === 1 ? '1 word selected' : n + ' words selected';
});
on('st-copy', 'mousedown', e => e.preventDefault());
on('st-copy', 'click', () => { if (selText) post('copy', {text: selText}); });

/* ---------- Properties & shortcuts ---------- */
function fmtDate(s) { const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(s || ''); return m ? new Date(m[1], m[2] - 1, m[3], m[4] || 0, m[5] || 0, m[6] || 0).toLocaleString() : '-'; }
async function showProps() {
  if (!pdf) return;
  const m = await pdf.getMetadata(), i = m.info || {}, vp = pages[0].page.getViewport({scale: 1});
  openDlg('Document Properties', [['File name', fileName], ['File size', fmtSize(fileSize)], ['Title', i.Title], ['Author', i.Author], ['Subject', i.Subject], ['Keywords', i.Keywords],
    ['Created date', fmtDate(i.CreationDate)], ['Modified date', fmtDate(i.ModDate)], ['Creator', i.Creator], ['PDF producer', i.Producer],
    ['PDF version', i.PDFFormatVersion], ['Page count', pages.length], ['Page size', (vp.width * 25.4 / 72).toFixed(0) + ' × ' + (vp.height * 25.4 / 72).toFixed(0) + ' mm']]);
}
function showKeys() {
  openDlg('Keyboard Shortcuts', [['Ctrl+F', 'Search in document'], ['Ctrl+G', 'Go to page…'], ['N / J', 'Next page'], ['P / K', 'Previous page'], ['Home / End', 'First / last page'],
    ['Ctrl + / Ctrl -', 'Zoom in / out'], ['Ctrl 0', 'Automatic zoom'], ['W', 'Fit to width'], ['R', 'Rotate clockwise'], ['B', 'Bookmark page'],
    ['S', 'Toggle sidebar'], ['H / T', 'Hand / text selection tool'], ['F', 'Focus mode'], ['Esc', 'Close dialog / menu / search / focus'], ['?', 'Shortcuts list']]);
}

/* ---------- Search ---------- */
const isWord = ch => !!ch && (ch.toLowerCase() !== ch.toUpperCase() || /[0-9_]/.test(ch));
function norm(s) {
  let o = ''; const mc = $('c-case').checked, md = $('c-dia').checked;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (!mc) { const l = c.toLowerCase(); if (l.length === 1) c = l; }
    if (!md) c = c.normalize('NFD').charAt(0) || c;
    o += c;
  }
  return o;
}
async function ensureTexts() {
  if (S.texts) return; S.texts = [];
  for (const p of pages) { const tc = await p.page.getTextContent(); S.texts.push(tc.items.filter(i => i.str !== undefined).map(i => i.str)); }
}
async function doSearch() {
  const q = $('q').value; S.matches = []; S.idx = -1;
  if (q) {
    await ensureTexts();
    const nq = norm(q), ww = $('c-word').checked;
    S.texts.forEach((strs, pi) => {
      const nf = norm(strs.join('')); let from = 0, k;
      while ((k = nf.indexOf(nq, from)) >= 0) {
        from = k + 1;
        if (ww && (isWord(nf[k - 1]) || isWord(nf[k + nq.length]))) continue;
        S.matches.push({p: pi, s: k, e: k + nq.length}); from = k + nq.length;
      }
    });
    if (S.matches.length) { const i = S.matches.findIndex(m => m.p >= cur - 1); S.idx = i < 0 ? 0 : i; }
  }
  updateCount();
  if (S.idx >= 0) goMatch(S.idx); else pages.forEach(paint);
}
function updateCount() {
  const n = S.matches.length;
  $('cnt').textContent = !$('q').value ? '' : n ? (S.idx + 1) + ' of ' + n + ' matches' : 'No matches found';
}
function goMatch(i) {
  const n = S.matches.length; if (!n) return;
  S.idx = (i + n) % n; updateCount(); S.reveal = true;
  pages.forEach(paint);
  if (S.reveal) scrollToPage(S.matches[S.idx].p + 1);
}
function paint(p) {
  if (!p.rendered) return;
  p.dirty.forEach(j => { p.divs[j].textContent = p.strs[j]; }); p.dirty.clear();
  const cum = [0]; p.strs.forEach((s, j) => cum.push(cum[j] + s.length));
  const per = new Map(); let selEl = null;
  S.matches.forEach((m, i) => {
    if (m.p !== p.n - 1 || !($('c-all').checked || i === S.idx)) return;
    for (let j = 0; j < p.strs.length; j++) {
      if (cum[j] >= m.e) break; if (cum[j + 1] <= m.s) continue;
      if (!per.has(j)) per.set(j, []);
      per.get(j).push({a: Math.max(m.s, cum[j]) - cum[j], b: Math.min(m.e, cum[j + 1]) - cum[j], sel: i === S.idx});
    }
  });
  per.forEach((segs, j) => {
    const d = p.divs[j], s = p.strs[j]; let pos = 0; d.textContent = ''; p.dirty.add(j);
    segs.sort((x, y) => x.a - y.a).forEach(g => {
      if (g.a > pos) d.append(document.createTextNode(s.slice(pos, g.a)));
      const sp = document.createElement('span'); sp.className = 'hl' + (g.sel ? ' sel' : ''); sp.textContent = s.slice(g.a, g.b); d.append(sp);
      if (g.sel) selEl = sp; pos = g.b;
    });
    if (pos < s.length) d.append(document.createTextNode(s.slice(pos)));
  });
  if (selEl && S.reveal) { S.reveal = false; selEl.scrollIntoView({block: 'center', inline: 'center'}); }
}
function openFind() { toggleFocus(false); $('find').hidden = false; $('b-find').classList.add('on'); $('q').focus(); $('q').select(); }
function closeFind() { $('find').hidden = true; $('b-find').classList.remove('on'); const q = $('q').value; $('q').value = ''; doSearch(); $('q').value = q; }
on('b-find', 'click', () => $('find').hidden ? openFind() : closeFind());
on('q', 'input', () => { clearTimeout(S.t); S.t = setTimeout(doSearch, 150); });
on('q', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); S.matches.length ? goMatch(S.idx + (e.shiftKey ? -1 : 1)) : doSearch(); } });
on('f-next', 'click', () => goMatch(S.idx + 1)); on('f-prev', 'click', () => goMatch(S.idx - 1));
on('c-all', 'change', () => pages.forEach(paint));
['c-case', 'c-dia', 'c-word'].forEach(id => on(id, 'change', doSearch));

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', e => {
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
  else if (mod && k.toLowerCase() === 'g') { e.preventDefault(); toggleFocus(false); $('pg').focus(); }
  else if (mod && (k === '+' || k === '=')) { e.preventDefault(); zoomBy(1); }
  else if (mod && k === '-') { e.preventDefault(); zoomBy(-1); }
  else if (mod && k === '0') { e.preventDefault(); scaleMode = 'auto'; resize(); }
  else if (k === 'Escape') {
    if (!$('dlg').hidden) $('dlg').hidden = true;
    else if (!$('menu').hidden) $('menu').hidden = true;
    else if (!$('find').hidden) closeFind();
    else if (document.documentElement.classList.contains('focus')) toggleFocus(false);
  }
  else if (!mod && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    const l = k.toLowerCase();
    if (k === 'Home') scrollToPage(1); else if (k === 'End') scrollToPage(pages.length);
    else if (l === 'n' || l === 'j') scrollToPage(Math.min(pages.length, cur + 1));
    else if (l === 'p' || l === 'k') scrollToPage(Math.max(1, cur - 1));
    else if (l === 'b') toggleMark();
    else if (l === 'r') rotate(90);
    else if (l === 's') toggleSide();
    else if (l === 'h') setTool('hand');
    else if (l === 't') setTool('text');
    else if (l === 'w') { scaleMode = 'width'; resize(); }
    else if (l === 'f') toggleFocus();
    else if (k === '?') showKeys();
  }
});

/* ---------- Initialization ---------- */
window.addEventListener('message', e => {
  const d = e.data; if (!d) return;
  if (d.type === 'load') {
    const bin = atob(d.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    load(bytes, d.name);
  } else if (d.type === 'toast') toast(d.text);
  else if (d.type === 'error') { if (!pdf) showMsg(d.text, true); else toast(d.text); }
});
applyTheme(); sideUI(); markMenu();
if (!HAS) showMsg('Failed to load pdf.js from CDN. Please check your internet connection and reload.', true);
vscode.postMessage({command: 'ready'});
</script>
</body>
</html>`;
  }
}