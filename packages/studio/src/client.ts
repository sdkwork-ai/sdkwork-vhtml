/**
 * VHTML Studio — a dependency-free local preview/edit shell.
 * The page is intentionally self-contained: the server serves it inline.
 */

import { STUDIO_LOCALES } from './i18n.ts';

export const STUDIO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VHTML Studio</title>
<style>
:root{
  --bg:#070b12;--panel:#0d1420;--panel2:#111b2b;--line:#1e2c42;--line2:#2a3d59;
  --text:#e8eef9;--muted:#8ea3c2;--accent:#6ee7ff;--accent2:#8b7bff;
  --ok:#42e8a4;--warn:#ffc857;--err:#ff6b81;--clip-scene:#1b6f8a;--clip-video:#1d4f9c;
  --clip-image:#6a3d9e;--clip-audio:#1c7a57;--clip-caption:#8a5a1c;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 "Segoe UI",system-ui,-apple-system,"Noto Sans",sans-serif;display:flex;flex-direction:column;overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
body.embed header{display:none}
@media (max-width:1100px){
  .inspector{width:300px;flex:0 0 300px}
  .lane-label{width:124px;flex:0 0 124px}
  .lane-label small{font-size:10px}
  header{flex-wrap:wrap;row-gap:6px}
  .transport .hint{display:none}
}
body.insp-hidden .inspector{display:none !important}
body.insp-hidden main{grid-template-columns:minmax(0,1fr) 0px}
@media (max-width:880px){
  main{grid-template-columns:minmax(0,1fr) 0px}
  .inspector{position:fixed;right:0;top:0;bottom:0;width:min(340px,92vw);z-index:300;box-shadow:-12px 0 40px rgba(0,0,0,.5);transform:translateX(100%);transition:transform .22s ease}
  body.insp-open .inspector{transform:none}
  body.insp-open .insp-backdrop{display:block}
  .lane-label{width:104px;flex:0 0 104px;padding:4px 8px}
  .lane-label b{font-size:11px}
  header .brand span{display:none}
  .actions{gap:4px}
  .actions button{padding:5px 8px;font-size:11px}
}
.insp-backdrop{display:none;position:fixed;inset:0;background:rgba(4,8,16,.5);z-index:290}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:#243a5e;border-radius:6px;border:2px solid #0a111c}
::-webkit-scrollbar-track{background:transparent}
.export-modal-backdrop,.modal-backdrop{backdrop-filter:blur(3px)}
button{transition:.15s}
button:active:not(:disabled){transform:translateY(1px)}
@media (prefers-reduced-motion:reduce){button,.lane,.inspector{transition:none !important}}
#recover-banner{display:none;align-items:center;gap:10px;background:#3a2a10;border-bottom:1px solid #6b5426;color:#ffc46b;padding:8px 16px;font-size:13px}
#recover-banner.show{display:flex}
#recover-banner button{padding:4px 12px;font-size:12px}
#shortcuts-modal{display:none;position:fixed;inset:0;background:rgba(4,8,16,.72);z-index:220;align-items:center;justify-content:center}
#shortcuts-modal.open{display:flex}
#shortcuts-modal .sheet{background:#101a2e;border:1px solid #2a3f66;border-radius:14px;padding:22px 26px;width:min(560px,92vw);max-height:80vh;overflow:auto}
#shortcuts-modal h3{margin:0 0 12px;font-size:16px}
#shortcuts-modal table{width:100%;border-collapse:collapse;font-size:13px}
#shortcuts-modal td{padding:4px 8px;border-bottom:1px solid #1c2c4a;color:#b9c8e2}
#shortcuts-modal td:first-child{color:#6ee7ff;font-family:ui-monospace,monospace;white-space:nowrap}
button{background:#162236;border:1px solid var(--line2);border-radius:8px;padding:6px 11px;cursor:pointer;transition:.15s}
button:hover{background:#1d2d46;border-color:#3b567d}
button:disabled{opacity:.4;cursor:not-allowed}
button.primary{background:linear-gradient(135deg,#1b8fae,#5a5ae0);border-color:#4f8aa5;font-weight:600}
button.active{border-color:var(--accent);color:var(--accent);background:#102b3a}
button.danger{color:#ffb3bf;border-color:#5b2a38}
input,select,textarea{background:#0a111c;border:1px solid var(--line2);border-radius:7px;padding:6px 8px;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
textarea{resize:vertical;min-height:54px}
header{height:56px;flex:0 0 56px;display:flex;align-items:center;gap:16px;padding:0 16px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#0c1421,#0a1019)}
.brand{font-weight:800;letter-spacing:.08em;font-size:15px;color:var(--accent);white-space:nowrap}
.brand span{color:var(--muted);font-weight:500;letter-spacing:.18em;font-size:10px;margin-left:6px}
#title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36vw}
#status{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#status .err{color:var(--err)}#status .warn{color:var(--warn)}#status .ok{color:var(--ok)}
.actions{margin-left:auto;display:flex;gap:8px;align-items:center}
main{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:0}
.stage-panel{display:flex;flex-direction:column;min-width:0;min-height:0;background:radial-gradient(1200px 600px at 50% 0%,#101b2c 0%,#070b12 62%)}
.stage-shell{flex:1 1 auto;position:relative;overflow:hidden;min-height:0}
#stage{position:absolute;top:0;left:0;border:0;background:#000;transform-origin:top left;box-shadow:0 20px 60px rgba(0,0,0,.55)}
#stage-overlay{position:absolute;inset:0;pointer-events:none;z-index:6}
#selection-box{position:absolute;display:none;border:2px solid var(--accent);box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 18px rgba(110,231,255,.35);cursor:move;pointer-events:auto}
#selection-box .sel-label{position:absolute;left:8px;top:8px;background:var(--accent);color:#041018;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
#selection-box .handle{position:absolute;width:11px;height:11px;background:#041018;border:2px solid var(--accent);border-radius:3px;pointer-events:auto}
#selection-box .handle.br{right:5px;bottom:5px;cursor:nwse-resize}
#selection-box .handle.rotate{right:5px;top:5px;border-radius:50%;cursor:grab}
#element-box{position:absolute;display:none;border:2px dashed var(--warn);background:rgba(255,200,87,.06);box-shadow:0 0 0 1px rgba(0,0,0,.55),0 0 22px rgba(255,200,87,.25);pointer-events:none;z-index:7}
#element-hover{position:absolute;display:none;border:1px dashed rgba(255,200,87,.7);background:rgba(255,200,87,.035);pointer-events:none;z-index:6}
#element-hover span{position:absolute;right:4px;bottom:4px;background:rgba(255,200,87,.92);color:#1d1605;font-size:9px;padding:1px 5px;border-radius:4px;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#element-box .element-label{position:absolute;left:6px;top:6px;background:var(--warn);color:#1d1605;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;max-width:80%;overflow:hidden;text-overflow:ellipsis}
.element-tag{display:flex;align-items:center;gap:8px;font-family:ui-monospace,Consolas,monospace;font-weight:700;color:var(--warn)}
.element-scene{font-size:10px;color:var(--muted);word-break:break-all}
.element-note{font-size:10px;color:var(--muted);line-height:1.6;border-left:2px solid var(--line2);padding-left:8px}
.attr-row{display:grid;grid-template-columns:minmax(58px,.8fr) minmax(0,1.4fr) 24px;gap:5px;align-items:center}
.attr-row input{min-width:0;font-size:11px;padding:4px 6px}
.attr-row button{padding:0;height:24px;line-height:22px;border-radius:5px}
.attr-head{display:grid;grid-template-columns:minmax(58px,.8fr) minmax(0,1.4fr) 24px;gap:5px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.computed-grid{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 8px;font-size:10px;color:var(--muted)}
.computed-grid b{font-weight:500;color:#a9bdd8;white-space:nowrap}
.selection-hint{position:absolute;right:12px;bottom:60px;background:rgba(8,15,26,.82);border:1px solid var(--line2);color:var(--muted);font-size:10px;padding:3px 7px;border-radius:6px;pointer-events:none}
.snap-guide{position:absolute;top:28px;bottom:0;width:1px;background:var(--warn);z-index:7;pointer-events:none;display:none;box-shadow:0 0 8px rgba(255,200,87,.65)}
.transport{height:50px;flex:0 0 50px;display:flex;align-items:center;gap:12px;padding:0 16px;border-top:1px solid var(--line);background:#0b1220}
.transport .spacer{flex:1}
.timecode{font-variant-numeric:tabular-nums;font-weight:600;color:var(--accent);font-size:14px}
.badge{font-size:11px;color:var(--muted);border:1px solid var(--line2);border-radius:99px;padding:2px 8px}
.hint{font-size:11px;color:#667d9e}
.inspector{border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.inspector-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.inspector-head h2{margin:0;padding:0;border:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.tabs{display:flex;gap:4px;margin-left:auto}
.tabs button{padding:4px 8px;font-size:11px;border-radius:6px;background:transparent;border-color:transparent;color:var(--muted)}
.tabs button.active{background:#17263d;border-color:var(--line2);color:var(--text)}
.inspector-body{overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px}
.field{display:flex;flex-direction:column;gap:4px}
.field label{font-size:11px;color:var(--muted)}
.field .row{display:flex;gap:8px}
.field .row input{flex:1;min-width:0}
.field select{width:100%}
.clip-kind{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--accent)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.inspector-empty{color:var(--muted);line-height:1.7}
.inspector-actions{display:flex;flex-wrap:wrap;gap:6px}
.section-title{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:2px;border-top:1px solid #17243a;padding-top:10px}
.asset-toolbar{display:flex;gap:6px;align-items:center}
.asset-toolbar .grow{flex:1}
.asset-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.asset-card{border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#0a1220;cursor:grab;position:relative;min-width:0}
.asset-card:hover{border-color:#3a5b88}
.asset-card.selected{border-color:var(--accent);box-shadow:0 0 0 2px rgba(110,231,255,.15)}
.asset-thumb{height:66px;background:linear-gradient(135deg,#16243a,#0a1220);display:grid;place-items:center;color:var(--muted);font-size:24px;overflow:hidden}
.asset-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.asset-meta{padding:5px 6px;display:flex;flex-direction:column;gap:1px;min-width:0}
.asset-meta b{font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asset-meta small{font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asset-card .add{position:absolute;right:4px;top:4px;width:22px;height:22px;padding:0;line-height:20px;border-radius:6px;background:rgba(8,15,26,.82)}
.asset-card .add.swap{right:30px;background:rgba(110,231,255,.18);border-color:var(--accent);color:var(--accent)}
.replace-banner{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--accent);border-radius:8px;background:rgba(110,231,255,.08);font-size:11px;margin-bottom:8px}
.replace-banner span{flex:1}
.caption-import{width:100%;background:#0a1220;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px;font:10.5px/1.5 ui-monospace,Consolas,monospace;resize:vertical;margin-bottom:6px}
.lane{position:relative}
.lane-resize{position:absolute;left:0;right:0;bottom:-3px;height:6px;cursor:ns-resize;z-index:5}
.lane-resize:hover{background:rgba(110,231,255,.25)}
.asset-card .relink{position:absolute;left:4px;top:4px;width:22px;height:22px;padding:0;line-height:20px;border-radius:6px;background:rgba(90,30,30,.9);border-color:#7d3b48;color:#ffc0c9}
.asset-card.missing{outline:1px solid var(--err);outline-offset:-1px}
.caption-row{display:flex;align-items:center;gap:8px;padding:6px 7px;border:1px solid var(--line);border-radius:7px;background:#0a1220;cursor:pointer}
.caption-row:hover{border-color:#3a5b88}
.caption-row b{font-size:11px;color:var(--accent);font-variant-numeric:tabular-nums;white-space:nowrap}
.storyboard-toolbar{display:flex;align-items:center;gap:6px;padding:2px 0 6px}
.storyboard-toolbar .grow{flex:1}
.shot-card{border:1px solid var(--line);border-radius:9px;background:#0a1220;padding:8px;display:flex;flex-direction:column;gap:7px}
.shot-card.dragging{opacity:.45}
.shot-card.drop-target{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.shot-head{display:flex;align-items:flex-start;gap:8px}
.shot-index{width:22px;height:22px;border-radius:6px;background:#17263d;color:var(--accent);display:grid;place-items:center;font-size:10px;font-weight:700;flex:0 0 22px}
.shot-title{flex:1;min-width:0;background:transparent;border:0;color:var(--text);font-weight:600;font-size:12px;padding:2px 0}
.shot-title:focus{outline:1px solid var(--line2);border-radius:4px}
.shot-thumb{height:74px;border-radius:6px;background:linear-gradient(135deg,#16243a,#0a1220);overflow:hidden;display:grid;place-items:center;color:var(--muted);font-size:11px;position:relative}
.shot-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.shot-thumb .badge{position:absolute;left:5px;top:5px;background:rgba(4,10,18,.78);border:1px solid var(--line2);border-radius:4px;padding:1px 4px;font-size:8px;letter-spacing:.08em;text-transform:uppercase}
.shot-fields{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.shot-fields .wide{grid-column:1/-1}
.shot-fields label{display:flex;flex-direction:column;gap:2px;font-size:9px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
.shot-fields input,.shot-fields select,.shot-fields textarea{width:100%;padding:4px 5px;font-size:10px;border-radius:5px;border:1px solid var(--line);background:#08111e;color:var(--text)}
.shot-fields textarea{min-height:38px;resize:vertical;line-height:1.35}
.shot-actions{display:flex;gap:4px;flex-wrap:wrap}
.shot-actions button{padding:2px 5px;font-size:9px}
.caption-row span{font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.transition-row{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);padding:4px 0}
.transition-row b{color:var(--accent)}
.timeline-panel{flex:0 0 310px;display:flex;flex-direction:column;border-top:1px solid var(--line);background:var(--panel);min-height:0}
.timeline-toolbar{height:42px;flex:0 0 42px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--line);background:#0b1220}
.timeline-toolbar .sep{width:1px;height:20px;background:var(--line2);margin:0 4px}
.timeline-toolbar .spacer{flex:1}
.zoom{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px}
.zoom input{width:110px}
.timeline-scroll{flex:1 1 auto;overflow:auto;position:relative}
.timeline-inner{position:relative;min-width:100%;padding:0 0 12px}
.ruler{height:28px;position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#0c1523,#0a111c);border-bottom:1px solid var(--line);margin-left:160px;cursor:crosshair}
.ruler .tick{position:absolute;top:0;bottom:0;border-left:1px solid #22334c;padding-left:4px;font-size:10px;color:#7389a8;overflow:hidden;white-space:nowrap}
.lane{display:flex;border-bottom:1px solid #131e2e;min-height:44px}
.lane-label{width:160px;flex:0 0 160px;padding:6px 10px;position:sticky;left:0;z-index:4;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;gap:2px}
.lane-label b{font-size:12px;font-weight:600}
.lane-label small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.lane-track{position:relative;flex:1 1 auto;min-width:0;background:repeating-linear-gradient(90deg,#0a111c 0 39px,#0b1320 39px 40px)}
.lane-track.drop-target{outline:2px dashed var(--accent);outline-offset:-3px;background-color:#10243a}
.clip{position:absolute;top:5px;height:34px;border-radius:6px;border:1px solid rgba(255,255,255,.16);padding:3px 7px;overflow:hidden;cursor:grab;user-select:none;font-size:11px;line-height:1.2;box-shadow:0 2px 8px rgba(0,0,0,.35);color:#eaf4ff}
.clip.scene{background:linear-gradient(180deg,#1d7c97,#155a70)}
.clip.video{background:linear-gradient(180deg,#245dbb,#173f84)}
.clip.image{background:linear-gradient(180deg,#7b4cb3,#54307e)}
.clip.audio{background:linear-gradient(180deg,#21956a,#166148)}
.clip.caption{background:linear-gradient(180deg,#a06a24,#6d4716)}
.clip.selected{outline:2px solid var(--accent);outline-offset:1px;box-shadow:0 0 0 3px rgba(110,231,255,.18)}
.clip .label{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.clip.thumb{background-size:cover;background-position:center;text-shadow:0 1px 3px #000}
.clip.thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,10,18,.05),rgba(4,10,18,.48));pointer-events:none}
.clip.thumb .label,.clip.thumb .sub{position:relative;z-index:1}
.clip .filmstrip{position:absolute;inset:0;display:flex;pointer-events:none}
.clip .filmstrip>div{flex:1 1 0;min-width:0;background-size:cover;background-position:center}
.clip.thumb:has(.filmstrip){background-image:none}
.clip .filmstrip~.label,.clip .filmstrip~.sub{position:relative;z-index:1;text-shadow:0 1px 3px #000}
.clip .color-tag{position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:6px 0 0 6px;pointer-events:none;z-index:3}
.clip.drop-target{outline:2px solid var(--accent);outline-offset:-2px}
.lib-grid{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.lib-chip{border:1px solid var(--line);border-radius:8px;background:#0a1220;color:#eaf4ff;font-size:11px;padding:6px 10px;cursor:grab;user-select:none}
.lib-chip:hover{border-color:var(--accent);background:rgba(110,231,255,.08)}
.lib-chip:active{cursor:grabbing}
.clip .sub{font-size:9px;opacity:.72;white-space:nowrap;overflow:hidden;pointer-events:none}
.clip .handle{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.12);opacity:0;transition:.1s}
.clip:hover .handle{opacity:1}
.clip .handle.left{left:0;border-radius:6px 0 0 6px}
.clip .handle.right{right:0;border-radius:0 6px 6px 0}
.playhead{position:absolute;top:0;bottom:0;width:2px;background:var(--accent);z-index:8;pointer-events:none;box-shadow:0 0 10px rgba(110,231,255,.8)}
.playhead:before{content:"";position:absolute;top:0;left:-5px;border:6px solid transparent;border-top-color:var(--accent)}
.transition-mark{position:absolute;top:17px;width:12px;height:12px;transform:translateX(-50%) rotate(45deg);background:var(--warn);border:1px solid #3a2c08;z-index:6;cursor:pointer;box-shadow:0 0 8px rgba(255,200,87,.5)}
#empty-stage{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted)}
.toast{position:fixed;left:50%;bottom:340px;transform:translateX(-50%);background:#1a2740;border:1px solid #33507a;padding:9px 14px;border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:.2s;z-index:50;max-width:70vw}
.toast.show{opacity:1}
.toast.error{border-color:#6d2a3a;background:#2a1620;color:#ffbcc7}
.modal{position:fixed;inset:0;background:rgba(3,7,13,.72);backdrop-filter:blur(5px);display:none;place-items:center;z-index:60}
.modal.open{display:grid}
.modal-card{width:min(560px,92vw);background:#0d1624;border:1px solid var(--line2);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
.modal-head h3{margin:0;font-size:15px}
.modal-body{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.modal-body .full{grid-column:1/-1}
.modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--line)}
.progress{height:8px;border-radius:99px;background:#182740;overflow:hidden}
.progress>i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:.2s}
.result{font-size:12px;color:var(--muted);word-break:break-all}
.result a{color:var(--accent)}
.diag-panel{display:none;border-top:1px solid var(--line);max-height:150px;overflow:auto;padding:8px 14px;font-size:11px;background:#0a111c}
.diag-panel.open{display:block}
.diag{color:var(--muted);padding:2px 0;white-space:pre-wrap}
.diag.error{color:var(--err)}.diag.warning{color:var(--warn)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:#243752;border-radius:6px;border:2px solid var(--panel)}
::-webkit-scrollbar-track{background:transparent}
#ctx-menu{position:fixed;display:none;z-index:80;background:#101a2c;border:1px solid var(--line2);border-radius:9px;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:5px;min-width:200px;max-height:70vh;overflow:auto}
.ctx-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}
.ctx-item:hover{background:#1b2b45}
.ctx-item.disabled{opacity:.35;pointer-events:none}
.ctx-item .key{margin-left:auto;font-size:10px;color:var(--muted);padding-left:14px}
.ctx-sep{height:1px;background:var(--line2);margin:4px 6px}
.ctx-title{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:4px 10px 2px}
.marker-flag{position:absolute;top:0;width:11px;height:14px;margin-left:-5px;background:var(--accent2);clip-path:polygon(0 0,100% 0,100% 55%,50% 100%,0 55%);cursor:pointer;z-index:6}
.marker-flag.chapter{background:var(--ok)}
.marker-flag.comment{background:var(--warn)}
#range-band{position:absolute;top:0;bottom:0;background:rgba(110,231,255,.10);border-left:1px solid rgba(110,231,255,.5);border-right:1px solid rgba(110,231,255,.5);display:none;pointer-events:none;z-index:2}
#marquee{position:absolute;display:none;border:1px solid var(--accent);background:rgba(110,231,255,.12);z-index:9;pointer-events:none}
.clip.disabled{opacity:.45}
.clip .badge-chip{position:absolute;right:4px;top:3px;font-size:8px;background:rgba(4,10,18,.72);border:1px solid var(--line2);border-radius:4px;padding:0 4px;color:#ffd27d;z-index:2;pointer-events:none}
.clip .kf-diamond{position:absolute;bottom:2px;width:7px;height:7px;transform:translateX(-50%) rotate(45deg);background:#ffd27d;border:1px solid #6b4b0a;z-index:3;cursor:ew-resize}
.clip .fade-handle{position:absolute;top:0;width:9px;height:100%;cursor:ew-resize;z-index:4}
.clip .fade-handle.left{left:0}
.clip .fade-handle.right{right:0}
.clip .fade-shade{position:absolute;top:0;bottom:0;background:rgba(0,0,0,.45);pointer-events:none;z-index:1}
.clip .volume-line{position:absolute;left:4px;right:4px;height:0;border-top:2px solid rgba(255,255,255,.9);cursor:ns-resize;z-index:5}
.clip .volume-line:before{content:"";position:absolute;left:-3px;top:-4px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.6)}
.clip .volume-line.dragging{border-top-color:var(--accent)}
.clip svg.volume-env{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible}
.clip .volume-dot{position:absolute;width:9px;height:9px;border-radius:50%;background:#42e8a4;border:1px solid #0a3d2c;transform:translate(-50%,50%);cursor:move;z-index:6}
.clip .volume-dot:hover{background:#7df0c6}
.clip canvas.wave{position:absolute;left:0;right:0;top:16px;bottom:2px;width:100%;height:auto;pointer-events:none;opacity:.8;z-index:0}
.lane-tools{display:flex;gap:3px;margin-top:2px}
.lane-tools button{width:20px;height:18px;padding:0;font-size:9px;line-height:16px;border-radius:4px;background:#0d1626}
.lane-tools button.on{border-color:var(--warn);color:var(--warn)}
.lane-tools button.lockbtn.on{border-color:var(--err);color:var(--err)}
.lane.hidden-lane .lane-track{opacity:.25}
.lane.locked-lane .lane-track{background:repeating-linear-gradient(45deg,#0a111c 0 12px,#0d1524 12px 24px)}
#guides{position:absolute;inset:0;display:none;pointer-events:none;z-index:5}
#guides.on{display:block}
#guides .g{position:absolute;background:rgba(110,231,255,.26)}
#guides .g.v{top:0;bottom:0;width:1px}
#guides .g.h{left:0;right:0;height:1px}
#guides .safe{position:absolute;border:1px dashed rgba(255,200,87,.45)}
body.fullscreen-stage .timeline-panel{display:none}
body.fullscreen-stage main{grid-template-columns:minmax(0,1fr) 0px}
body.fullscreen-stage .inspector{display:none}
#time-input{width:112px;background:#0a111c;border:1px solid var(--accent);border-radius:6px;padding:2px 6px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600;display:none}
.kf-row{display:grid;grid-template-columns:64px 1fr 88px 22px;gap:5px;align-items:center;font-size:11px}
.kf-row input,.kf-row select{min-width:0;font-size:11px;padding:3px 5px}
.kf-row button{padding:0;height:22px;line-height:20px;border-radius:5px}
.param-row{display:grid;grid-template-columns:minmax(70px,.9fr) minmax(0,1.3fr) 24px;gap:5px;align-items:center}
.param-row input{min-width:0;font-size:11px;padding:4px 6px}
.param-row button{padding:0;height:24px;line-height:22px;border-radius:5px}
.btn-row{display:flex;flex-wrap:wrap;gap:5px}
.btn-row button{padding:3px 8px;font-size:11px}
.modal-body .checks{display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-start}
.modal-body .checks label{display:flex;gap:5px;align-items:center;font-size:12px;color:var(--muted)}
.ratio-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ratio-grid button{padding:8px 4px;font-size:11px;display:flex;flex-direction:column;gap:2px;align-items:center}
.ratio-grid button small{font-size:9px;color:var(--muted)}
.ratio-grid button.active{border-color:var(--accent);color:var(--accent);background:#102b3a}
.lane-label{cursor:grab}
.lane-label.dragging{opacity:.5;cursor:grabbing}
.lane.drop-above{box-shadow:inset 0 3px 0 var(--accent)}
.lane.drop-below{box-shadow:inset 0 -3px 0 var(--accent)}
.lane-grip{position:absolute;left:2px;top:50%;transform:translateY(-50%);color:#41597c;font-size:11px;letter-spacing:-1px;pointer-events:none}
#drag-tip{position:fixed;display:none;z-index:90;background:rgba(6,12,22,.92);border:1px solid var(--line2);color:var(--accent);font-size:11px;font-variant-numeric:tabular-nums;padding:3px 8px;border-radius:6px;pointer-events:none;white-space:nowrap}
#saved-badge{font-size:11px;color:var(--ok);white-space:nowrap}
.help-table{width:100%;border-collapse:collapse;font-size:12px}
.help-table td{padding:4px 8px;border-bottom:1px solid #16233a}
.help-table td:first-child{color:var(--accent);font-variant-numeric:tabular-nums;white-space:nowrap;width:40%}
.caption-style-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.caption-style-grid .full{grid-column:1/-1}
.mixer-row{display:grid;grid-template-columns:minmax(120px,1.2fr) 34px minmax(140px,1fr) minmax(120px,.9fr);gap:10px;align-items:center;border:1px solid var(--line);border-radius:9px;background:#0a1220;padding:8px 10px;margin-bottom:8px}
.mixer-row b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mixer-row small{display:block;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.mixer-row .lvl{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--muted);min-width:0}
.mixer-row .lvl input{flex:1;min-width:0;padding:2px}
.mixer-row .lvl output{width:44px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text)}
.mixer-row button{padding:3px 0;width:30px;font-size:10px}
.mixer-row button.on{border-color:var(--warn);color:var(--warn)}
.mixer-row button.lockbtn.on{border-color:var(--err);color:var(--err)}
.mixer-master{border-color:#23395c;background:#0c1523}
body.looping #loop{border-color:var(--ok);color:var(--ok);background:#102b24}
#shuttle-badge{color:var(--warn);border-color:#5d4a1e;background:#2a2210}
@media (max-width:1100px){main{grid-template-columns:minmax(0,1fr) 250px}}
</style>
</head>
<body>
<script>window.VHTML_I18N = ${JSON.stringify(STUDIO_LOCALES)};</script>
<header>
  <div class="brand">VHTML<span>STUDIO</span></div>
  <div id="title">Loading…</div>
  <div id="status">connecting</div>
  <div class="actions">
    <span id="saved-badge"></span>
    <button id="timeline-back" style="display:none" data-i18n="↩ 主时间线" data-i18n-title="Leave the compound clip — back to the main timeline">↩ 主时间线</button>
    <button id="reload" data-i18n="⟳ Reload" data-i18n-title="Reload from disk (external HTML/assets)">⟳ Reload</button>
    <button id="undo" data-i18n="↶ Undo" data-i18n-title="Undo (Ctrl+Z)">↶ Undo</button>
    <button id="redo" data-i18n="↷ Redo" data-i18n-title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
    <button id="canvas-settings" data-i18n="⚙ Canvas" data-i18n-title="Canvas & project settings">⚙ Canvas</button>
    <button id="help" data-i18n-title="Keyboard shortcuts (?)">⌨</button>
    <button id="lang" title="切换界面语言 / Switch UI language" style="min-width:44px"></button>
    <button id="insp-toggle" title="Toggle inspector panel">☰ Inspector</button>
    <button id="export" class="primary">Export</button>
  </div>
</header>
<div class="insp-backdrop" id="insp-backdrop"></div>
<div id="recover-banner">
  <span data-i18n="Checkpoint from a previous session found — restore it?">Checkpoint from a previous session found — restore it?</span>
  <button id="recover-restore" data-i18n="Restore">Restore</button>
  <button id="recover-discard" class="ghost" data-i18n="Discard">Discard</button>
</div>
<div id="shortcuts-modal">
  <div class="sheet">
    <h3 data-i18n="Keyboard shortcuts">Keyboard shortcuts</h3>
    <table>
      <tr><td>Space</td><td>Play / pause</td></tr>
      <tr><td>S</td><td>Split at playhead</td></tr>
      <tr><td>D</td><td>Duplicate selection</td></tr>
      <tr><td>Delete / Shift+Delete</td><td>Remove / ripple remove</td></tr>
      <tr><td>Ctrl+C / X / V</td><td>Copy / cut / paste clipboard</td></tr>
      <tr><td>I / O</td><td>Set in / out point</td></tr>
      <tr><td>M</td><td>Add marker</td></tr>
      <tr><td>J / L</td><td>Shuttle reverse / forward (repeat = faster, up to 8×)</td></tr>
      <tr><td>K</td><td>Stop shuttle / pause</td></tr>
      <tr><td>← / →</td><td>Step one frame</td></tr>
      <tr><td>Home / End</td><td>Jump to start / end</td></tr>
      <tr><td>Shift+, / Shift+.</td><td>Jump to previous / next marker</td></tr>
      <tr><td>E</td><td>Element pick mode</td></tr>
      <tr><td>F</td><td>Fullscreen stage</td></tr>
      <tr><td>T</td><td>Add transition</td></tr>
      <tr><td>C</td><td>Add caption at playhead</td></tr>
      <tr><td>Ctrl+= / Ctrl− / Ctrl+0</td><td>Zoom in / out / fit</td></tr>
      <tr><td>Ctrl+Z / Ctrl+Shift+Z</td><td>Undo / redo</td></tr>
      <tr><td>?</td><td>This help</td></tr>
    </table>
  </div>
</div>
<main>
  <section class="stage-panel">
    <div class="stage-shell" id="stage-shell">
      <div id="empty-stage">Loading stage…</div>
      <iframe id="stage" title="VHTML preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      <div id="stage-overlay">
        <div id="selection-box"><span class="sel-label"></span><div class="handle rotate" data-wysiwyg="rotate" title="Drag to rotate"></div><div class="handle br" data-wysiwyg="scale" title="Drag to scale"></div></div>
        <div id="element-box"><span class="element-label"></span></div>
        <div id="element-hover"><span></span></div>
        <div id="guides"></div>
        <div class="selection-hint">Drag to move · corner to scale · circle to rotate</div>
      </div>
    </div>
    <div class="transport">
      <button id="prev" title="Previous frame">◀</button>
      <button id="play" class="primary">▶ Play</button>
      <button id="next" title="Next frame">▶</button>
      <span class="timecode" id="time" title="Click to type a time (1:23.5, 00:01:02:12)">00:00.000</span>
      <input id="time-input" placeholder="1:23.5" />
      <span class="badge" id="framebadge">frame 0</span>
      <span class="badge" id="shuttle-badge" style="display:none"></span>
      <div class="spacer"></div>
      <button id="loop" title="Loop playback — In→Out range when set, else the whole timeline">🔁 Loop</button>
      <button id="guides-btn" title="Toggle composition guides (G)">⊞ Guides</button>
      <button id="fullscreen" title="Fullscreen preview (F)">⛶</button>
      <button id="snapshot" title="Render the current frame to renders/ as PNG">📷 Frame</button>
      <span class="hint" data-i18n="Space play · S split · Del remove · Shift+Del ripple · E element">Space play · S split · Del remove · Shift+Del ripple · E element</span>
    </div>
    <div class="diag-panel" id="diag"></div>
  </section>
  <aside class="inspector">
    <div class="inspector-head">
      <h2 data-i18n="Inspector">Inspector</h2>
      <div class="tabs" id="tabs">
        <button data-tab="props" class="active" data-i18n="Properties">Properties</button>
        <button data-tab="element" data-i18n="Element">Element</button>
        <button data-tab="assets" data-i18n="Assets">Assets</button>
        <button data-tab="effects" data-i18n="Effects">Effects</button>
        <button data-tab="captions" data-i18n="Captions">Captions</button>
        <button data-tab="storyboard" data-i18n="Storyboard">Storyboard</button>
      </div>
    </div>
    <div class="inspector-body" id="inspector"></div>
  </aside>
</main>
<section class="timeline-panel">
  <div class="timeline-toolbar">
    <button id="split" data-i18n="Split" data-i18n-title="Split at playhead (S)">Split</button>
    <button id="paste" title="Paste clipboard at playhead (Ctrl+V; mode follows Place selector)">Paste</button>
    <button id="duplicate" data-i18n="Duplicate" data-i18n-title="Duplicate selected clip">Duplicate</button>
    <button id="detach" data-i18n="Detach Audio" data-i18n-title="Detach audio of selected video clip">Detach Audio</button>
    <button id="delete" class="danger" data-i18n="Delete" data-i18n-title="Remove selected clip(s) (Del)">Delete</button>
    <button id="ripple" class="danger" data-i18n="Ripple" data-i18n-title="Ripple delete (Shift+Del)">Ripple</button>
    <select id="place-mode" title="Drag-drop placement mode: add | insert (push) | overwrite">
      <option value="add">Place: add</option>
      <option value="insert">Place: insert</option>
      <option value="overwrite">Place: overwrite</option>
    </select>
    <div class="sep"></div>
    <button id="transition" title="Add a transition where two clips overlap">Transition</button>
    <button id="add-caption" title="Add a caption cue at the playhead (C)">+ Caption</button>
    <button id="add-marker" title="Drop a marker at the playhead (M)">⚑ Marker</button>
    <select id="add-lane" title="Add a lane"><option value="">＋ Lane…</option><option value="video">Video lane</option><option value="overlay">Overlay lane</option><option value="audio">Audio lane</option><option value="caption">Caption lane</option></select>
    <div class="sep"></div>
    <button id="snap" class="active" title="Magnetic snapping (hold Shift to bypass)">Snap</button>
    <button id="mixer" title="Audio mixer — per-lane volume, pan, mute and solo">🎚 Mixer</button>
    <button id="element-mode" title="Pick any HTML element in the player (E)">⌖ Element</button>
    <button id="fit" title="Fit timeline (0)">Fit</button>
    <div class="spacer"></div>
    <div class="zoom"><span>Zoom</span><input id="zoom" type="range" min="0.5" max="12" step="0.1" value="1" /><span id="zoomlabel">1.0×</span></div>
  </div>
  <div class="timeline-scroll" id="timeline-scroll">
    <div class="timeline-inner" id="timeline-inner">
      <div class="ruler" id="ruler"></div>
      <div id="tracks"></div>
      <div id="range-band"></div>
      <div class="playhead" id="playhead"></div>
      <div class="snap-guide" id="snap-guide"></div>
      <div id="marquee"></div>
    </div>
  </div>
</section>
<input id="asset-file" type="file" multiple accept="image/*,video/*,audio/*,.svg,.woff,.woff2,.ttf,.otf" style="display:none" />
<div class="toast" id="toast"></div>
<div id="drag-tip"></div>
<div class="modal" id="settings-modal">
  <div class="modal-card">
    <div class="modal-head"><h3>Canvas & project settings</h3><button id="settings-close">✕</button></div>
    <div class="modal-body">
      <div class="field full"><label>Aspect ratio presets</label>
        <div class="ratio-grid" id="ratio-grid">
          <button data-w="1920" data-h="1080">16:9<small>1920 × 1080</small></button>
          <button data-w="1080" data-h="1920">9:16<small>1080 × 1920</small></button>
          <button data-w="1080" data-h="1080">1:1<small>1080 × 1080</small></button>
          <button data-w="1080" data-h="1350">4:5<small>1080 × 1350</small></button>
          <button data-w="1920" data-h="816">2.35:1<small>1920 × 816</small></button>
          <button data-w="3840" data-h="2160">4K 16:9<small>3840 × 2160</small></button>
        </div>
      </div>
      <div class="field"><label>Width</label><input id="set-width" type="number" min="16" /></div>
      <div class="field"><label>Height</label><input id="set-height" type="number" min="16" /></div>
      <div class="field"><label>Frame rate</label><select id="set-fps"><option value="24/1">24 fps</option><option value="24000/1001">23.976 fps (film)</option><option value="25/1">25 fps</option><option value="30000/1001">29.97 fps (NTSC)</option><option value="30/1">30 fps</option><option value="50/1">50 fps</option><option value="60000/1001">59.94 fps (NTSC)</option><option value="60/1">60 fps</option></select></div>
      <div class="field"><label>Background</label><input id="set-background" type="text" placeholder="#000000" /></div>
      <div class="field full element-note">Applies to the composition (composition.set): canvas size, frame rate and background. Clips and scenes keep their authored layout.</div>
    </div>
    <div class="modal-foot"><button id="settings-cancel">Cancel</button><button id="settings-save" class="primary">Apply</button></div>
  </div>
</div>
<div class="modal" id="help-modal">
  <div class="modal-card" style="width:min(680px,94vw)">
    <div class="modal-head"><h3>Keyboard shortcuts</h3><button id="help-close">✕</button></div>
    <div class="modal-body" style="display:block">
      <table class="help-table" id="help-table"></table>
    </div>
  </div>
</div>
<div id="ctx-menu"></div>
<div class="modal" id="export-modal">
  <div class="modal-card">
    <div class="modal-head"><h3>Export video</h3><button id="export-close">✕</button></div>
    <div class="modal-body">
      <div class="field full"><label data-i18n="Delivery preset">Delivery preset</label><select id="exp-delivery"><option value="">Custom (project settings)</option></select></div>
      <div class="field full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="exp-batch" /> Render ALL delivery presets (batch — one file per preset, overrides preset/dimensions above)</label></div>
      <div class="field"><label data-i18n="Format">Format</label><select id="exp-format"><option value="mp4">MP4 / H.264 + AAC</option><option value="webm">WebM / VP9 + Opus</option><option value="gif">GIF</option><option value="png-sequence">PNG sequence</option><option value="wav">WAV audio</option><option value="mp3">MP3 audio</option></select></div>
      <div class="field"><label>Quality (CRF)</label><input id="exp-crf" type="number" value="20" min="0" max="51" /></div>
      <div class="field"><label>Width</label><input id="exp-width" type="number" /></div>
      <div class="field"><label>Height</label><input id="exp-height" type="number" /></div>
      <div class="field"><label>Range start (s)</label><input id="exp-start" type="number" value="0" step="0.001" /></div>
      <div class="field"><label>Range duration (s)</label><input id="exp-duration" type="number" step="0.001" /></div>
      <div class="field"><label>Loudness (LUFS, empty = off)</label><input id="exp-loudness" type="number" step="0.5" placeholder="-14" /></div>
      <div class="field checks full">
        <label><input type="checkbox" id="exp-burn" /> Burn captions</label>
        <label><input type="checkbox" id="exp-vtt" /> WebVTT sidecar</label>
        <label><input type="checkbox" id="exp-report" /> Audit report (JSON)</label>
        <button id="generate" type="button" title="Materialise pending generation tasks into assets (cached)">⚙ Generate assets</button>
    <button id="proxy" title="Proxy preview media (360p H.264) for smooth scrubbing on heavy footage">Proxy</button>
        <button id="exp-inout" type="button">Use In/Out</button>
      </div>
      <div class="field full"><label data-i18n="Progress">Progress</label><div class="progress"><i id="exp-progress"></i></div><div class="result" id="exp-result"></div></div>
    </div>
    <div class="modal-foot"><button id="export-cancel">Close</button><button id="export-start" class="primary">Start export</button></div>
  </div>
</div>
<div class="modal" id="transition-modal">
  <div class="modal-card">
    <div class="modal-head"><h3>Transition</h3><button id="tr-close">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Type</label><select id="tr-type"><option value="crossfade">Crossfade</option><option value="fade">Fade to black</option><option value="dip">Dip to color</option><option value="wipe">Wipe</option><option value="slide">Slide</option><option value="zoom">Zoom</option><option value="blur">Blur</option></select></div>
      <div class="field"><label>Duration (s)</label><input id="tr-duration" type="number" value="0.4" step="0.05" min="0.04" /></div>
      <div class="field"><label>Direction (wipe/slide)</label><select id="tr-direction"><option value="left">Left</option><option value="right">Right</option><option value="up">Up</option><option value="down">Down</option></select></div>
      <div class="field"><label>Color (dip)</label><input id="tr-color" type="text" value="#000000" /></div>
      <div class="field full result" id="tr-info"></div>
    </div>
    <div class="modal-foot"><button id="tr-remove" class="danger">Remove</button><button id="tr-save" class="primary">Save</button></div>
  </div>
</div>
<div class="modal" id="mixer-modal">
  <div class="modal-card" style="width:min(640px,94vw)">
    <div class="modal-head"><h3 data-i18n="Audio mixer">Audio mixer</h3><button id="mixer-close">✕</button></div>
    <div class="modal-body" style="display:block;max-height:64vh;overflow:auto"><div id="mixer-rows"></div></div>
    <div class="modal-foot">
      <span class="hint" style="margin-right:auto" data-i18n="Volume/pan write to the lane — honored in preview and export">Volume/pan write to the lane — honored in preview and export</span>
      <button id="mixer-done" class="primary" data-i18n="Done">Done</button>
    </div>
  </div>
</div>
<script>
(function(){
  'use strict';
  var state = { model:null, selected:null, selection:[], time:0, playing:false, zoom:1, revision:0, frameReady:false, exportJob:null, dragging:null, tab:'props', assets:[], assetSummary:null, assetSelected:null, snapping:true, wysiwyg:null, pickElement:false, element:null, elementDraft:null, inPoint:null, outPoint:null, guides:false, presets:[], peaks:{}, posters:{}, ctxFor:null, trDraft:null, replaceArmed:null, autoScrollDir:0, autoScrollTimer:null, shuttle:0, shuttleTimer:null, loop:false, timelineStack:[], attributeClipboard:null, assetSearch:'', laneHeights:(function(){ try { return JSON.parse(localStorage.getItem('vhtml-lane-heights') || '{}') || {}; } catch (error) { return {}; } })() };
  var el = function(id){ return document.getElementById(id); };
  var stage = el('stage');
  var tracksEl = el('tracks');
  var ruler = el('ruler');
  var playhead = el('playhead');
  var selectionBox = el('selection-box');
  var elementBox = el('element-box');
  var elementHover = el('element-hover');
  var stageOverlay = el('stage-overlay');
  var toastTimer = null;
  var snapGuide = el('snap-guide');

  function api(path, options){
    return fetch(path, options).then(function(response){
      return response.json().then(function(body){
        if (!response.ok) { var error = new Error(body.message || body.error || ('HTTP ' + response.status)); error.body = body; throw error; }
        return body;
      });
    });
  }
  function toast(message, isError){
    var node = el('toast');
    node.textContent = message;
    node.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ node.className = 'toast'; }, 4000);
  }
  function fmtTime(seconds){
    if (!isFinite(seconds)) seconds = 0;
    var ms = Math.max(0, Math.round(seconds * 1000));
    var m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(r).padStart(3,'0');
  }
  function snap(seconds){
    if (!state.model) return seconds;
    var fps = state.model.fps;
    return Math.round(seconds * fps) / fps;
  }
  function clipById(id){
    if (!state.model) return null;
    for (var i=0;i<state.model.lanes.length;i++){
      var clips = state.model.lanes[i].clips;
      for (var j=0;j<clips.length;j++) if (clips[j].id === id) return { lane:state.model.lanes[i], clip:clips[j] };
    }
    return null;
  }
  function selectedClip(){ return state.selected ? clipById(state.selected) : null; }
  function selectionIds(){
    var ids = state.selection.slice();
    if (!ids.length && state.selected) ids = [state.selected];
    return ids.filter(function(id){ return Boolean(clipById(id)); });
  }
  function selectOnly(id){
    state.selected = id || null;
    state.selection = id ? [id] : [];
  }
  function toggleSelection(id, additive){
    if (!additive){ selectOnly(id); return; }
    var index = state.selection.indexOf(id);
    if (index >= 0) state.selection.splice(index, 1);
    else state.selection.push(id);
    if (index < 0) state.selected = id;
    else if (state.selected === id) state.selected = state.selection[state.selection.length - 1] || null;
  }
  function laneById(id){
    if (!state.model) return null;
    for (var i=0;i<state.model.lanes.length;i++) if (state.model.lanes[i].id === id) return state.model.lanes[i];
    return null;
  }
  function timelineMarkers(){ return (state.model && state.model.markers) || []; }
  function markersAt(seconds){
    var threshold = 12 / pps();
    var found = null;
    timelineMarkers().forEach(function(marker){
      if (Math.abs(marker.time - seconds) < Math.min(threshold, Math.abs(seconds - (found ? found.time : 1e9)))) found = marker;
    });
    return found;
  }

  function loadProject(){
    return api('/api/project').then(function(body){
      state.model = body.model;
      state.revision = body.revision;
      selectOnly(null);
      state.inPoint = null;
      state.outPoint = null;
      el('title').textContent = body.model.title;
      updateStatus(body.diagnostics);
      updateHistory(body);
      updateTimelineChrome();
      renderTimeline();
      renderInspector();
      loadStage();
      loadAssets();
      el('empty-stage').style.display = 'none';
    }).catch(function(error){ toast('Failed to load project: ' + error.message, true); });
  }

  function loadAssets(){
    return api('/api/assets').then(function(body){
      state.assets = body.assets || [];
      state.assetSummary = body.summary || null;
      if (state.assetSelected && !assetById(state.assetSelected)) state.assetSelected = null;
      if (state.tab === 'assets') renderInspector();
      if (state.model && !state.dragging) renderTimeline();
      var missing = body.summary ? body.summary.missing : 0;
      el('title').title = missing ? missing + ' referenced file(s) missing' : (body.root || '');
    }).catch(function(error){ toast('Assets failed to load: ' + error.message, true); });
  }

  function assetById(id){
    for (var i=0;i<state.assets.length;i++) if (state.assets[i].id === id) return state.assets[i];
    return null;
  }
  function replaceTypeCompatible(found, asset){
    if (!found || !asset || asset.exists === false) return false;
    var kind = found.clip.kind;
    if (kind === 'caption' || kind === 'data' || kind === 'scene' || kind === 'timeline') return false;
    if (kind === 'audio') return asset.kind === 'audio' || asset.kind === 'video';
    return asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'svg';
  }

  // Source media length of a clip's asset (seconds), when the probe knows it.
  // Rational values arrive as {num,den}; numbers pass through.
  function assetSourceDuration(clip){
    if (!clip || !clip.ref) return null;
    var asset = assetById(clip.ref) || assetById(clip.ref.replace(/^(asset|gen):/, ''));
    if (!asset || asset.duration === undefined || asset.duration === null) return null;
    var duration = asset.duration;
    if (typeof duration === 'object' && duration.num !== undefined) duration = duration.den ? duration.num / duration.den : 0;
    return Number(duration) || null;
  }

  function updateHistory(body){
    if (!body) return;
    if (typeof body.canUndo === 'boolean') el('undo').disabled = !body.canUndo;
    if (typeof body.canRedo === 'boolean') el('redo').disabled = !body.canRedo;
    var badge = el('saved-badge');
    if (badge && body.revision !== undefined) badge.textContent = 'Saved · r' + body.revision;
  }

  function updateStatus(diagnostics){
    var errors = diagnostics.filter(function(d){ return d.severity === 'error'; }).length;
    var warnings = diagnostics.filter(function(d){ return d.severity === 'warning'; }).length;
    var status = el('status');
    if (errors) status.innerHTML = '<span class="err">' + errors + ' error(s)</span> · ' + warnings + ' warning(s)';
    else if (warnings) status.innerHTML = '<span class="ok">valid</span> · <span class="warn">' + warnings + ' warning(s)</span>';
    else status.innerHTML = '<span class="ok">valid</span>';
    status.title = 'Click to show diagnostics';
    var panel = el('diag');
    panel.innerHTML = '';
    diagnostics.slice(0, 80).forEach(function(d){
      var line = document.createElement('div');
      line.className = 'diag ' + d.severity;
      line.textContent = d.severity.toUpperCase() + ' ' + d.code + (d.objectId ? ' [' + d.objectId + ']' : '') + ': ' + d.message;
      panel.appendChild(line);
    });
    status.onclick = function(){ panel.classList.toggle('open'); };
  }

  function pps(){
    if (!state.model) return 100;
    var available = Math.max(400, el('timeline-scroll').clientWidth - 180);
    return Math.max(6, (available / Math.max(0.2, state.model.duration)) * state.zoom);
  }

  function renderRuler(){
    ruler.innerHTML = '';
    var rate = pps();
    var duration = state.model.duration;
    ruler.style.width = Math.max(1, duration * rate) + 'px';
    var target = 90 / rate;
    var steps = [0.1,0.2,0.25,0.5,1,2,5,10,15,30,60,120,300];
    var step = steps[steps.length-1];
    for (var i=0;i<steps.length;i++){ if (steps[i] >= target) { step = steps[i]; break; } }
    for (var t=0;t<=duration+0.0001;t+=step){
      var tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = (t * rate) + 'px';
      tick.textContent = fmtTime(t).replace(/\\.000$/,'');
      ruler.appendChild(tick);
    }
    timelineMarkers().forEach(function(marker){
      var flag = document.createElement('div');
      flag.className = 'marker-flag ' + (marker.type || 'marker');
      flag.style.left = (marker.time * rate) + 'px';
      flag.title = (marker.name || 'Marker') + ' · ' + fmtTime(marker.time);
      flag.addEventListener('pointerdown', function(event){
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        pausePlayback();
        state.dragging = { type:'marker-retime', marker:marker, startX:event.clientX, originTime:marker.time, moved:false };
      });
      flag.oncontextmenu = function(event){ event.preventDefault(); event.stopPropagation(); openContextMenu(event, { type:'marker', marker:marker }); };
      flag.ondblclick = function(event){
        event.stopPropagation();
        var name = window.prompt('Marker name', marker.name || '');
        if (name === null) return;
        edit([{ op:'marker.remove', timelineId:state.model.id && markerTimelineId(), markerId:marker.id }, { op:'marker.add', timelineId:markerTimelineId(), marker:{ id:marker.id, time:marker.time, name:name, type:marker.type } }]).catch(function(){});
      };
      ruler.appendChild(flag);
    });
    renderRangeBand();
  }

  function markerTimelineId(){
    return state.model.timelineId || 'main';
  }

  function renderRangeBand(){
    var band = el('range-band');
    if (state.inPoint === null || state.outPoint === null || state.outPoint <= state.inPoint){
      band.style.display = 'none';
      return;
    }
    var rate = pps();
    band.style.display = 'block';
    band.style.left = (160 + state.inPoint * rate) + 'px';
    band.style.width = Math.max(2, (state.outPoint - state.inPoint) * rate) + 'px';
  }

  function renderTimeline(){
    if (!state.model) return;
    renderRuler();
    tracksEl.innerHTML = '';
    var rate = pps();
    var width = Math.max(1, state.model.duration * rate);
    var selectedIds = selectionIds();
    var sorted = state.model.lanes.slice().sort(function(a,b){ return a.order - b.order; });
    sorted.forEach(function(lane){
      var row = document.createElement('div');
      row.className = 'lane' + (lane.enabled === false ? ' hidden-lane' : '') + (lane.locked ? ' locked-lane' : '');
      var laneHeight = Number(state.laneHeights[lane.id]) || 0;
      if (laneHeight >= 30){
        row.style.height = laneHeight + 'px';
      }
      var resize = document.createElement('div');
      resize.className = 'lane-resize';
      resize.title = t('Drag to resize the lane');
      resize.addEventListener('pointerdown', function(event){
        event.stopPropagation();
        event.preventDefault();
        state.dragging = {
          type: 'lane-height',
          laneId: lane.id,
          node: row,
          startY: event.clientY,
          originHeight: row.getBoundingClientRect().height,
          moved: false
        };
      });
      row.appendChild(resize);
      var label = document.createElement('div');
      label.className = 'lane-label';
      label.innerHTML = '<b>' + escapeHtml(lane.name || lane.id) + '</b><small>' + lane.type + ' · ' + lane.clips.length + ' clip(s)</small>';
      var tools = document.createElement('div');
      tools.className = 'lane-tools';
      var muteBtn = document.createElement('button');
      muteBtn.textContent = 'M';
      muteBtn.title = 'Mute lane (mixer + export honor this)';
      muteBtn.className = lane.muted ? 'on' : '';
      muteBtn.onclick = function(event){ event.stopPropagation(); edit([{ op:'track.set', trackId:lane.id, props:{ muted:!lane.muted } }]).catch(function(){}); };
      if (lane.type === 'audio'){
        var soloBtn = document.createElement('button');
        soloBtn.textContent = 'S';
        soloBtn.title = 'Solo lane (other audio lanes go silent in preview + export)';
        soloBtn.className = lane.solo ? 'on' : '';
        soloBtn.onclick = function(event){ event.stopPropagation(); edit([{ op:'track.set', trackId:lane.id, props:{ solo:!lane.solo } }]).catch(function(){}); };
        tools.appendChild(soloBtn);
      }
      var hideBtn = document.createElement('button');
      hideBtn.textContent = '👁';
      hideBtn.title = 'Hide lane (excluded from preview and export)';
      hideBtn.className = lane.enabled === false ? 'on' : '';
      hideBtn.onclick = function(event){ event.stopPropagation(); edit([{ op:'track.set', trackId:lane.id, props:{ enabled:lane.enabled === false } }]).catch(function(){}); };
      var lockBtn = document.createElement('button');
      lockBtn.className = 'lockbtn' + (lane.locked ? ' on' : '');
      lockBtn.textContent = '🔒';
      lockBtn.title = 'Lock lane against edits';
      lockBtn.onclick = function(event){ event.stopPropagation(); edit([{ op:'track.set', trackId:lane.id, props:{ locked:!lane.locked } }]).catch(function(){}); };
      tools.appendChild(muteBtn); tools.appendChild(hideBtn); tools.appendChild(lockBtn);
      label.appendChild(tools);
      label.oncontextmenu = function(event){ event.preventDefault(); openContextMenu(event, { type:'lane', lane:lane }); };
      label.ondblclick = function(){
        var name = window.prompt('Lane name', lane.name || lane.id);
        if (name === null || !name.trim() || name === lane.name) return;
        edit([{ op:'track.set', trackId:lane.id, props:{ name:name.trim() } }]).catch(function(){});
      };
      var track = document.createElement('div');
      track.className = 'lane-track';
      track.style.width = width + 'px';
      track.dataset.laneId = lane.id;
      track.addEventListener('dragover', function(event){
        var types = event.dataTransfer.types || [];
        if (types.indexOf('application/x-vhtml-asset') === -1 && types.indexOf('application/x-vhtml-effect') === -1) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        track.classList.add('drop-target');
      });
      track.addEventListener('dragleave', function(){ track.classList.remove('drop-target'); });
      track.addEventListener('drop', function(event){
        event.preventDefault();
        track.classList.remove('drop-target');
        var effectPayload = event.dataTransfer.getData('application/x-vhtml-effect');
        if (effectPayload){
          if (lane.locked) return toast('Lane is locked', true);
          var payload;
          try { payload = JSON.parse(effectPayload); } catch (error) { return; }
          var dropTime = (event.clientX - track.getBoundingClientRect().left) / pps();
          if (payload.kind === 'transition'){
            // Find the pair of clips whose overlap window contains the drop.
            var best = null;
            var laneClips = lane.clips;
            for (var ai = 0; ai < laneClips.length && !best; ai++){
              for (var bi = 0; bi < laneClips.length; bi++){
                if (ai === bi) continue;
                var a = laneClips[ai];
                var b = laneClips[bi];
                if (a.start >= b.start) continue;
                var overlapStart = Math.max(a.start, b.start);
                var overlapEnd = Math.min(a.start + a.duration, b.start + b.duration);
                if (overlapEnd - overlapStart > 0.02 && dropTime >= overlapStart && dropTime <= overlapEnd){
                  best = { from: a, to: b, overlap: overlapEnd - overlapStart };
                  break;
                }
              }
            }
            if (!best) return toast(t('Drop a transition onto the overlap between two clips'), true);
            var transition = { fromClipId: best.from.id, toClipId: best.to.id, type: payload.type, duration: Number(Math.min(0.4, best.overlap).toFixed(4)) };
            if (payload.type === 'wipe' || payload.type === 'slide') transition.direction = 'left';
            if (payload.type === 'dip') transition.color = '#000000';
            edit([{ op:'transition.add', trackId: lane.id, transition: transition }])
              .then(function(){ toast(transitionLabel(payload.type) + t(' transition added')); })
              .catch(function(error){ toast(error.message || 'Transition rejected', true); });
            return;
          }
          // Effect chips dropped on the track land on the clip under the drop.
          var target = null;
          lane.clips.forEach(function(candidate){
            if (dropTime >= candidate.start && dropTime <= candidate.start + candidate.duration) target = candidate;
          });
          if (!target) return toast(t('Drop onto a clip'), true);
          if (payload.kind === 'effect'){
            if (isVisualClip(target)) addEffect(target, payload.type);
            else toast(t('Visual effects need a visual clip'), true);
          } else if (target.kind === 'video' || target.kind === 'audio'){
            if (payload.type === 'ducking') addDuckingToClip(target);
            else addAudioEffectToClip(target, payload.type);
          }
          return;
        }
        var assetId = event.dataTransfer.getData('application/x-vhtml-asset') || event.dataTransfer.getData('text/plain');
        if (!assetId) return;
        var rect = track.getBoundingClientRect();
        var at = magnetTime((event.clientX - rect.left) / pps(), null, event.shiftKey);
        showSnapGuide(null);
        addAssetToTimeline(assetId, lane.id, Math.max(0, at));
      });
      lane.clips.forEach(function(clip){
        var block = document.createElement('div');
        var isSelected = selectedIds.indexOf(clip.id) >= 0;
        block.className = 'clip ' + clip.kind + (isSelected ? ' selected' : '') + (clip.enabled === false ? ' disabled' : '');
        block.style.left = (clip.start * rate) + 'px';
        block.style.width = Math.max(4, clip.duration * rate) + 'px';
        if (laneHeight >= 30) block.style.height = Math.max(34, laneHeight - 10) + 'px';
        block.dataset.clipId = clip.id;
        block.title = clip.id + ' · ' + clip.kind + ' · ' + clip.start.toFixed(3) + 's + ' + clip.duration.toFixed(3) + 's' +
          (clip.speed !== 1 ? ' · ' + clip.speed.toFixed(2) + '×' : '') +
          (clip.reverse ? ' · reversed' : '') +
          (clip.hasTimeRemap ? ' · speed ramp' : '') +
          ' — double-click to rename';
        var asset = clip.ref ? (assetById(clip.ref) || assetById(clip.ref.replace(/^(asset|gen):/, ''))) : null;
        var filmstrip = null;
        if (asset && (asset.kind === 'image' || asset.kind === 'svg') && asset.url && asset.exists !== false){
          block.classList.add('thumb');
          block.style.backgroundImage = 'linear-gradient(180deg,rgba(8,15,26,.15),rgba(8,15,26,.55)), url("' + asset.url + '")';
        } else if (asset && asset.kind === 'video' && asset.exists !== false && clip.kind === 'video'){
          // Filmstrip: spread poster tiles across the clip's source window
          // (server-side poster cache makes repeated renders cheap).
          var clipWidthPx = Math.max(4, clip.duration * rate);
          var tiles = Math.max(1, Math.min(10, Math.round(clipWidthPx / 72)));
          var sourceSpan = clip.duration * (clip.speed || 1);
          filmstrip = document.createElement('div');
          filmstrip.className = 'filmstrip';
          for (var tileIndex = 0; tileIndex < tiles; tileIndex++){
            var tileTime = (clip.sourceIn || 0) + ((tileIndex + 0.5) / tiles) * sourceSpan;
            var tileKey = asset.id + '@' + tileTime.toFixed(1);
            if (!state.posters[tileKey]){
              state.posters[tileKey] = '/api/media/poster?asset=' + encodeURIComponent(asset.id) + '&t=' + tileTime.toFixed(1);
            }
            var tile = document.createElement('div');
            tile.style.backgroundImage = 'url("' + state.posters[tileKey] + '")';
            filmstrip.appendChild(tile);
          }
          block.classList.add('thumb');
        }
        var chips = [];
        if (clip.speed !== 1) chips.push(clip.speed.toFixed(2).replace(/\\.?0+$/,'') + '×');
        if (clip.reverse) chips.push('rev');
        if (clip.hasTimeRemap) chips.push('ramp');
        if (clip.muted) chips.push('muted');
        if (clip.freeze !== undefined && clip.freeze !== null) chips.push('freeze');
        if (clip.kind === 'timeline' && clip.nestedClips !== undefined) chips.push('▶ ' + clip.nestedClips);
        block.innerHTML = '<div class="label">' + escapeHtml(clip.label) + '</div><div class="sub">' + clip.kind + ' · ' + clip.duration.toFixed(2) + 's</div><div class="handle left" data-handle="left"></div><div class="handle right" data-handle="right"></div>';
        if (filmstrip) block.appendChild(filmstrip);
        if (clip.metadata && clip.metadata.clipColor){
          var tagStrip = document.createElement('div');
          tagStrip.className = 'color-tag';
          tagStrip.style.background = clip.metadata.clipColor;
          block.appendChild(tagStrip);
        }
        block.addEventListener('dragover', function(event){
          if (!event.dataTransfer || !event.dataTransfer.types || event.dataTransfer.types.indexOf('application/x-vhtml-effect') === -1) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          block.classList.add('drop-target');
        });
        block.addEventListener('dragleave', function(){ block.classList.remove('drop-target'); });
        block.addEventListener('drop', function(event){
          if (!event.dataTransfer || !event.dataTransfer.getData('application/x-vhtml-effect')) return;
          event.preventDefault();
          event.stopPropagation();
          block.classList.remove('drop-target');
          var payload;
          try { payload = JSON.parse(event.dataTransfer.getData('application/x-vhtml-effect')); } catch (error) { return; }
          if (lane.locked) return toast('Lane is locked', true);
          if (payload.kind === 'effect'){
            if (!isVisualClip(clip)) return toast(t('Visual effects need a visual clip'), true);
            addEffect(clip, payload.type);
          } else if (payload.kind === 'audio'){
            if (clip.kind !== 'video' && clip.kind !== 'audio') return toast(t('Audio effects need a video or audio clip'), true);
            if (payload.type === 'ducking') addDuckingToClip(clip);
            else addAudioEffectToClip(clip, payload.type);
          }
        });
        if (chips.length){
          var chip = document.createElement('div');
          chip.className = 'badge-chip';
          chip.textContent = chips.join(' ');
          block.appendChild(chip);
        }
        if (clip.kind === 'audio' || (clip.kind === 'video' && !clip.muted)){
          var wave = document.createElement('canvas');
          wave.className = 'wave';
          wave.dataset.peaksFor = asset ? asset.id : (clip.ref || '');
          wave.dataset.clipId = clip.id;
          block.appendChild(wave);
          // CapCut-style volume rubber band on any sounding clip (audio and
          // unmuted video alike); double-click adds envelope points.
          var volumeLine = document.createElement('div');
          volumeLine.className = 'volume-line';
          volumeLine.dataset.volumeFor = clip.id;
          var volumePct = Math.max(0, Math.min(2, clip.volume || 1)) / 2;
          volumeLine.style.bottom = (volumePct * 100).toFixed(1) + '%';
          volumeLine.title = 'Volume ' + Math.round((clip.volume || 1) * 100) + '% — drag vertically · double-click to add envelope points';
          block.appendChild(volumeLine);
          volumeLine.addEventListener('dblclick', function(event){
            event.preventDefault();
            event.stopPropagation();
            var rect = volumeLine.getBoundingClientRect();
            var at = (event.clientX - rect.left) / pps();
            if (at < 0 || at > clip.duration) return;
            addVolumeKeyframe(clip, at, envelopeValueAt(clip, at));
          });
          var volumeAnimation = (clip.animations || []).filter(function(candidate){
            return candidate.enabled && candidate.property === 'volume' && candidate.timeBase === 'clip';
          })[0];
          if (volumeAnimation){
            var env = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            env.setAttribute('class', 'volume-env');
            var envLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            envLine.setAttribute('fill', 'none');
            envLine.setAttribute('stroke', '#42e8a4');
            envLine.setAttribute('stroke-width', '2');
            env.appendChild(envLine);
            var pts = [];
            volumeAnimation.keyframes.forEach(function(keyframe){
              var value = Math.max(0, Math.min(2, Number(keyframe.value) || 0));
              pts.push(((keyframe.time / Math.max(0.001, clip.duration)) * 100).toFixed(2) + ',' + (100 - (value / 2) * 100).toFixed(2));
            });
            envLine.setAttribute('points', pts.join(' '));
            block.appendChild(env);
            volumeAnimation.keyframes.forEach(function(keyframe, index){
              var dot = document.createElement('div');
              dot.className = 'volume-dot';
              dot.dataset.animId = volumeAnimation.id;
              dot.dataset.kfIndex = String(index);
              var value = Math.max(0, Math.min(2, Number(keyframe.value) || 0));
              dot.style.left = ((keyframe.time / Math.max(0.001, clip.duration)) * 100).toFixed(2) + '%';
              dot.style.bottom = ((value / 2) * 100).toFixed(2) + '%';
              dot.title = 'Volume ' + Math.round(value * 100) + '% @ ' + keyframe.time.toFixed(2) + 's — drag · double-click to remove';
              dot.addEventListener('dblclick', function(event){
                event.preventDefault();
                event.stopPropagation();
                removeVolumeKeyframe(clip, volumeAnimation.id, index);
              });
              block.appendChild(dot);
            });
          }
        }
        if ((clip.fadeIn || 0) > 0.001){
          var shadeIn = document.createElement('div');
          shadeIn.className = 'fade-shade';
          shadeIn.style.left = '0';
          shadeIn.style.width = Math.min(clip.duration, clip.fadeIn) * rate + 'px';
          block.appendChild(shadeIn);
          var handleIn = document.createElement('div');
          handleIn.className = 'fade-handle left';
          handleIn.dataset.fade = 'in';
          handleIn.title = 'Drag to set fade in';
          block.appendChild(handleIn);
        }
        if ((clip.fadeOut || 0) > 0.001){
          var shadeOut = document.createElement('div');
          shadeOut.className = 'fade-shade';
          shadeOut.style.right = '0';
          shadeOut.style.width = Math.min(clip.duration, clip.fadeOut) * rate + 'px';
          block.appendChild(shadeOut);
          var handleOut = document.createElement('div');
          handleOut.className = 'fade-handle right';
          handleOut.dataset.fade = 'out';
          handleOut.title = 'Drag to set fade out';
          block.appendChild(handleOut);
        }
        (clip.animations || []).forEach(function(animation){
          if (!animation.enabled) return;
          animation.keyframes.forEach(function(keyframe, index){
            var absolute = animation.timeBase === 'project'
              ? animation.start + keyframe.time
              : clip.start + animation.start + keyframe.time;
            if (absolute < clip.start - 0.001 || absolute > clip.start + clip.duration + 0.001) return;
            var diamond = document.createElement('div');
            diamond.className = 'kf-diamond';
            diamond.style.left = ((absolute - clip.start) * rate) + 'px';
            diamond.dataset.animId = animation.id;
            diamond.dataset.kfIndex = String(index);
            diamond.title = animationLabel(animation.property || animation.property) + ' @ ' + fmtTime(absolute) + ' — drag to retime';
            block.appendChild(diamond);
          });
        });
        block.ondblclick = function(event){
          // CapCut-style inline rename: double-click the clip body. Compound
          // clips enter the nested editing view instead (rename via right-click
          // or the Properties tab).
          if (event.target.closest('.handle') || event.target.closest('.volume-line') || event.target.closest('.volume-dot') || event.target.closest('.kf-diamond')) return;
          if (clip.kind === 'timeline' && compoundRefOf(clip)){
            enterCompoundClip(clip);
            return;
          }
          var name = window.prompt('Clip name', clip.label || '');
          if (name === null || !name.trim() || name === clip.label) return;
          edit([{ op:'clip.set', clipId:clip.id, props:{ name:name.trim() } }]).catch(function(){});
        };
        block.oncontextmenu = function(event){ event.preventDefault(); event.stopPropagation(); if (selectionIds().indexOf(clip.id) < 0) selectOnly(clip.id); renderTimeline(); renderInspector(); openContextMenu(event, { type:'clip', clip:clip, lane:lane }); };
        track.appendChild(block);
      });
      (lane.transitions || []).forEach(function(transition){
        var from = lane.clips.filter(function(clip){ return clip.id === transition.from; })[0];
        var to = lane.clips.filter(function(clip){ return clip.id === transition.to; })[0];
        if (!from || !to) return;
        var center = (Math.max(from.start, to.start) + Math.min(from.start + from.duration, to.start + to.duration)) / 2;
        var mark = document.createElement('div');
        mark.className = 'transition-mark';
        mark.style.left = (center * rate) + 'px';
        mark.title = transition.type + ' · ' + transition.duration.toFixed(2) + 's';
        mark.addEventListener('pointerdown', function(event){ event.stopPropagation(); });
        mark.onclick = function(event){ event.stopPropagation(); selectOnly(from.id); renderTimeline(); renderInspector(); openTransitionDialog(lane, transition); };
        mark.oncontextmenu = function(event){ event.preventDefault(); event.stopPropagation(); openContextMenu(event, { type:'transition', lane:lane, transition:transition }); };
        track.appendChild(mark);
      });
      row.appendChild(label);
      row.appendChild(track);
      tracksEl.appendChild(row);
    });
    updatePlayhead();
    drawWaveforms();
  }

  function renderInspector(){
    var box = el('inspector');
    var tabs = el('tabs').querySelectorAll('button');
    for (var i=0;i<tabs.length;i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === state.tab);
    box.innerHTML = '';
    if (state.tab === 'assets'){ renderAssets(box); return; }
    if (state.tab === 'effects'){ renderEffectsLibrary(box); return; }
    if (state.tab === 'captions'){ renderCaptions(box); return; }
    if (state.tab === 'storyboard'){ renderStoryboard(box); return; }
    if (state.tab === 'element'){ renderElement(box); return; }
    renderProps(box);
  }

  function renderProps(box){
    var found = selectedClip();
    if (!found){
      box.innerHTML = '<div class="inspector-empty">Select a clip on the timeline to edit timing, transform, opacity, audio and captions.<br><br><b>The model is the source of truth.</b> Drag the selected clip directly on the stage for WYSIWYG transform editing; the same values are written to the VHTML project.<br><br>Right-click clips, lanes and the ruler for the full editing menu (split, duplicate, speed, freeze, markers…).</div>';
      return;
    }
    var clip = found.clip;
    var lane = found.lane;
    var visual = clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'svg' || clip.kind === 'scene';
    var head = document.createElement('div');
    head.className = 'clip-kind';
    head.innerHTML = '<span class="dot"></span>' + escapeHtml(clip.id) + ' <span class="badge">' + clip.kind + '</span> <span class="badge">' + escapeHtml(lane.name || lane.id) + '</span>';
    box.appendChild(head);
    box.appendChild(textField('Clip name', clip.label || '', false, function(value){
      var next = value.trim();
      if (!next || next === clip.label) return;
      edit([{ op:'clip.set', clipId:clip.id, props:{ name:next } }]).catch(function(){});
    }));
    box.appendChild(field(t('Start (s)'), 'number', clip.start, 0.001, function(value){ trimClip('start', parseFloat(value)); }));
    box.appendChild(field(t('Duration (s)'), 'number', clip.duration, 0.001, function(value){ trimClip('duration', parseFloat(value)); }));
    if (clip.kind === 'video' || clip.kind === 'audio' || clip.kind === 'scene'){
      var speedSection = document.createElement('div');
      speedSection.className = 'section-title';
      speedSection.textContent = t('Speed');
      box.appendChild(speedSection);
      var presets = document.createElement('div');
      presets.className = 'btn-row';
      [0.25, 0.5, 1, 2, 4].forEach(function(multiplier){
        var button = document.createElement('button');
        button.textContent = multiplier + '×';
        if (Math.abs(clip.speed - multiplier) < 0.001) button.className = 'active';
        button.onclick = function(){ edit([{ op:'clip.speed', clipId:clip.id, speed:multiplier }]).catch(function(){}); };
        presets.appendChild(button);
      });
      box.appendChild(presets);
      var reverseToggle = document.createElement('button');
      reverseToggle.textContent = clip.reverse ? '◀▶ ' + t('Reversed — click to restore forward') : '◀▶ ' + t('Reverse playback');
      reverseToggle.title = t('Play the clip backwards (CapCut-style reverse); disables any speed ramp');
      reverseToggle.className = clip.reverse ? 'active' : '';
      reverseToggle.style.marginTop = '4px';
      reverseToggle.onclick = function(){ toggleClipReverse([clip.id]); };
      box.appendChild(reverseToggle);
      box.appendChild(field(t('Custom speed'), 'number', clip.speed, 0.01, function(value){
        edit([{ op:'clip.speed', clipId:clip.id, speed:parseFloat(value) }]);
      }));
      var rampPresets = document.createElement('div');
      rampPresets.className = 'btn-row';
      [
        { label:'Ramp in', easing:'ease-in', power:0.5 },
        { label:'Ramp out', easing:'ease-out', power:2 },
        { label:'Smooth S', easing:'ease-in-out', power:1 }
      ].forEach(function(preset){
        var button = document.createElement('button');
        button.textContent = preset.label;
        button.title = t('Apply a keyframed speed ramp (') + preset.label + t(') over the whole clip');
        button.onclick = function(){
          var sourceStart = clip.sourceIn || 0;
          var sourceEnd = sourceStart + clip.duration * clip.speed;
          var half = sourceStart + (sourceEnd - sourceStart) * 0.5;
          var midEase = sourceStart + (sourceEnd - sourceStart) * (preset.power < 1 ? 0.25 : preset.power > 1 ? 0.75 : 0.5);
          var midAt = clip.duration * 0.5;
          edit([{ op:'clip.timeremap', clipId:clip.id, easing: preset.easing, keyframes: [
            { at: 0, source: sourceStart },
            { at: midAt, source: midEase, easing: preset.easing },
            { at: clip.duration, source: sourceEnd }
          ] }]).catch(function(){});
        };
        rampPresets.appendChild(button);
      });
      box.appendChild(rampPresets);
      var curveTitle = document.createElement('div');
      curveTitle.className = 'element-note';
      curveTitle.style.marginTop = '4px';
      curveTitle.textContent = t('Curve speed presets (曲线变速):');
      box.appendChild(curveTitle);
      renderSpeedCurvePresets(box, clip);
      if (clip.hasTimeRemap){
        var rampRow = document.createElement('div');
        rampRow.className = 'element-note';
        rampRow.textContent = t('This clip has a keyframed speed ramp. Changing the speed presets is disabled while the remap is active.');
        box.appendChild(rampRow);
        var clearRamp = document.createElement('button');
        clearRamp.textContent = t('Clear speed ramp');
        clearRamp.onclick = function(){ edit([{ op:'clip.timeremap.clear', clipId:clip.id }]).catch(function(){}); };
        box.appendChild(clearRamp);
        renderSpeedCurve(box, clip);
      }
    }
    if (visual){
      box.appendChild(field(t('Opacity'), 'number', clip.opacity, 0.05, function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ opacity:parseFloat(value) } }]); }));
      var section = document.createElement('div');
      section.className = 'section-title';
      section.textContent = t('Transform · drag on stage');
      box.appendChild(section);
      var xy = document.createElement('div');
      xy.className = 'field';
      xy.innerHTML = '<label>Position X / Y</label>';
      var xyRow = document.createElement('div');
      xyRow.className = 'row';
      xyRow.appendChild(numberInput(clip.transform.x, 1, function(value){ setTransform(clip, 'x', value); }));
      xyRow.appendChild(numberInput(clip.transform.y, 1, function(value){ setTransform(clip, 'y', value); }));
      xy.appendChild(xyRow);
      box.appendChild(xy);
      var sc = document.createElement('div');
      sc.className = 'field';
      sc.innerHTML = '<label>Scale X / Y</label>';
      var scRow = document.createElement('div');
      scRow.className = 'row';
      scRow.appendChild(numberInput(clip.transform.scaleX, 0.01, function(value){ setTransform(clip, 'scaleX', value); }));
      scRow.appendChild(numberInput(clip.transform.scaleY, 0.01, function(value){ setTransform(clip, 'scaleY', value); }));
      sc.appendChild(scRow);
      box.appendChild(sc);
      box.appendChild(field('Rotate (deg)', 'number', clip.transform.rotate, 0.5, function(value){ setTransform(clip, 'rotate', parseFloat(value)); }));
      var quickRow = document.createElement('div');
      quickRow.className = 'btn-row';
      [
        ['⇋ ' + t('Flip H'), function(){ flipSelected([clip.id], 'h'); }],
        ['⇅ ' + t('Flip V'), function(){ flipSelected([clip.id], 'v'); }],
        ['↻ 90°', function(){ rotateSelected([clip.id], 90); }],
        ['↺ 90°', function(){ rotateSelected([clip.id], -90); }],
      ].forEach(function(def){
        var button = document.createElement('button');
        button.textContent = def[0];
        button.title = t('Quick transform (mirror / rotate)');
        button.onclick = def[1];
        quickRow.appendChild(button);
      });
      box.appendChild(quickRow);
      box.appendChild(field(t('Z index'), 'number', clip.z, 1, function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ z:parseInt(value,10) || 0 } }]); }));
      box.appendChild(selectField('Fit', clip.fit, ['cover','contain','fill','none','scale-down'], function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ fit:value } }]); }));
      box.appendChild(selectField('Blend', clip.blend, ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','soft-light','hard-light','difference','exclusion','hue','saturation','color','luminosity'], function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ blend:value } }]); }));
      renderCropSection(box, clip);
      renderMaskSection(box, clip);
      renderCameraSection(box, clip);
    }
    if (clip.kind === 'audio' || clip.kind === 'video'){
      var audioSection = document.createElement('div');
      audioSection.className = 'section-title';
      audioSection.textContent = 'Audio';
      box.appendChild(audioSection);
      box.appendChild(field(t('Volume'), 'number', clip.volume, 0.05, function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ volume:parseFloat(value) } }]); }));
      box.appendChild(field(t('Pan'), 'number', clip.pan, 0.05, function(value){ edit([{ op:'clip.set', clipId:clip.id, props:{ pan:parseFloat(value) } }]); }));
      box.appendChild(field('Fade in (s)', 'number', clip.fadeIn || 0, 0.05, function(value){
        edit([{ op:'clip.set', clipId:clip.id, props:{ fadeIn:parseFloat(value) > 0 ? parseFloat(value) : null } }]);
      }));
      box.appendChild(field('Fade out (s)', 'number', clip.fadeOut || 0, 0.05, function(value){
        edit([{ op:'clip.set', clipId:clip.id, props:{ fadeOut:parseFloat(value) > 0 ? parseFloat(value) : null } }]);
      }));
      var muteRow = document.createElement('div');
      muteRow.className = 'checks';
      var muteCheck = document.createElement('label');
      var muteBox = document.createElement('input');
      muteBox.type = 'checkbox';
      muteBox.checked = Boolean(clip.muted);
      muteBox.onchange = function(){ edit([{ op:'clip.set', clipId:clip.id, props:{ muted:muteBox.checked } }]).catch(function(){}); };
      muteCheck.appendChild(muteBox);
      muteCheck.appendChild(document.createTextNode(' Mute audio'));
      muteRow.appendChild(muteCheck);
      box.appendChild(muteRow);
      if (clip.kind === 'video'){
        var detach = document.createElement('button');
        detach.textContent = 'Detach audio to its own lane';
        detach.onclick = function(){ edit([{ op:'clip.detachAudio', clipId:clip.id }]).then(function(){ toast(t('Audio detached')); }).catch(function(){}); };
        box.appendChild(detach);
      }
      renderAudioEffectsSection(box, clip);
    }
    if (clip.kind === 'caption'){
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML = '<label>Caption text</label>';
      var area = document.createElement('textarea');
      area.value = clip.text || '';
      area.addEventListener('change', function(){ edit([{ op:'clip.set', clipId:clip.id, props:{ text:area.value } }]); });
      wrap.appendChild(area);
      box.appendChild(wrap);
      box.appendChild(textField('Speaker (optional)', clip.speaker || '', false, function(value){
        edit([{ op:'clip.set', clipId:clip.id, props:{ speaker:value.trim() } }]).catch(function(){});
      }));
    }
    var enableRow = document.createElement('div');
    enableRow.className = 'checks';
    var enableCheck = document.createElement('label');
    var enableBox = document.createElement('input');
    enableBox.type = 'checkbox';
    enableBox.checked = clip.enabled !== false;
    enableBox.onchange = function(){ edit([{ op:'clip.set', clipId:clip.id, props:{ enabled:enableBox.checked } }]).catch(function(){}); };
    enableCheck.appendChild(enableBox);
    enableCheck.appendChild(document.createTextNode(' Clip enabled'));
    enableRow.appendChild(enableCheck);
    box.appendChild(enableRow);
    if (visual) renderKeyframeSection(box, clip);
    if (visual) renderEffectsSection(box, clip);
    var transitions = (lane.transitions || []).filter(function(t){ return t.from === clip.id || t.to === clip.id; });
    if (transitions.length){
      var tTitle = document.createElement('div');
      tTitle.className = 'section-title';
      tTitle.textContent = 'Transitions';
      box.appendChild(tTitle);
      transitions.forEach(function(t){
        var row = document.createElement('div');
        row.className = 'transition-row';
        row.innerHTML = '<b>' + escapeHtml(t.type) + '</b><span>' + t.duration.toFixed(2) + 's · ' + escapeHtml(t.from) + ' → ' + escapeHtml(t.to) + '</span>';
        var editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.title = 'Edit transition';
        editBtn.style.marginLeft = 'auto';
        editBtn.onclick = function(){ openTransitionDialog(lane, t); };
        var remove = document.createElement('button');
        remove.textContent = '✕';
        remove.className = 'danger';
        remove.onclick = function(){ edit([{ op:'transition.remove', transitionId:t.id }]); };
        row.appendChild(editBtn);
        row.appendChild(remove);
        box.appendChild(row);
      });
    }
    var actions = document.createElement('div');
    actions.className = 'inspector-actions';
    actions.innerHTML = '<button id="insp-split">Split</button><button id="insp-dup">Duplicate</button><button id="insp-delete" class="danger">Delete</button><button id="insp-ripple" class="danger">Ripple</button><button id="insp-transition">Transition</button>';
    box.appendChild(actions);
    el('insp-split').onclick = function(){ splitClipIds([clip.id]); };
    el('insp-dup').onclick = function(){ duplicateSelection([clip.id]); };
    el('insp-delete').onclick = function(){ deleteSelection([clip.id], false); };
    el('insp-ripple').onclick = function(){ deleteSelection([clip.id], true); };
    el('insp-transition').onclick = addTransition;
  }

  // ---------- volume envelope (volume keyframes on audio clips) ----------

  function volumeAnimationOf(clip){
    return (clip.animations || []).filter(function(candidate){
      return candidate.property === 'volume' && candidate.timeBase === 'clip';
    })[0] || null;
  }

  function envelopeValueAt(clip, at){
    var animation = volumeAnimationOf(clip);
    if (!animation || !animation.keyframes.length) return clip.volume || 1;
    var keyframes = animation.keyframes;
    if (at <= keyframes[0].time) return Number(keyframes[0].value) || 0;
    if (at >= keyframes[keyframes.length - 1].time) return Number(keyframes[keyframes.length - 1].value) || 0;
    for (var i = 0; i < keyframes.length - 1; i++){
      var a = keyframes[i];
      var b = keyframes[i + 1];
      if (at >= a.time && at <= b.time){
        var span = b.time - a.time;
        var ratio = span > 0.0001 ? (at - a.time) / span : 0;
        return (Number(a.value) || 0) + ((Number(b.value) || 0) - (Number(a.value) || 0)) * ratio;
      }
    }
    return clip.volume || 1;
  }

  function addVolumeKeyframe(clip, at, value){
    if (!isFinite(at)) return toast('Could not place a volume point here', true);
    at = Math.max(0, Math.min(clip.duration, at));
    value = Math.round(Math.max(0, Math.min(2, value)) * 100) / 100;
    var animation = volumeAnimationOf(clip);
    if (animation){
      var nextAnimations = clip.animations.map(function(candidate){
        if (candidate.id !== animation.id) return candidate;
        var copy = JSON.parse(JSON.stringify(candidate));
        copy.keyframes.push({ time: Number(at.toFixed(6)), value: value });
        copy.keyframes.sort(function(a, b){ return a.time - b.time; });
        return copy;
      });
      edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }])
        .then(function(){ toast('Volume point ' + Math.round(value * 100) + '% @ ' + at.toFixed(2) + 's'); })
        .catch(function(){});
      return;
    }
    var created = {
      id: 'vol-' + clip.id + '-' + Date.now().toString(36),
      property: 'volume',
      keyframes: [{ time: Number(at.toFixed(6)), value: value }],
      start: 0,
      duration: Number(clip.duration.toFixed(6)),
      timeBase: 'clip',
      easing: 'linear',
      iterations: 1,
      direction: 'normal',
      fill: 'both',
      compose: 'replace',
      enabled: true,
    };
    edit([{ op:'animation.add', animation:created, clipId:clip.id }])
      .then(function(){ toast(t('Volume envelope started — drag the green points')); })
      .catch(function(){});
  }

  function setVolumeKeyframe(clip, animId, index, time, value){
    var nextAnimations = clip.animations.map(function(candidate){
      if (candidate.id !== animId) return candidate;
      var copy = JSON.parse(JSON.stringify(candidate));
      if (!copy.keyframes[index]) return candidate;
      if (time !== null && time !== undefined) copy.keyframes[index].time = Math.max(0, Number(time.toFixed(6)));
      if (value !== null && value !== undefined) copy.keyframes[index].value = Math.round(Math.max(0, Math.min(2, value)) * 100) / 100;
      copy.keyframes.sort(function(a, b){ return a.time - b.time; });
      return copy;
    });
    return edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }]);
  }

  function removeVolumeKeyframe(clip, animId, index){
    var animation = volumeAnimationOf(clip);
    if (!animation) return;
    var remaining = animation.keyframes.length - 1;
    if (remaining <= 0){
      edit([{ op:'animation.remove', animationId:animId, clipId:clip.id }])
        .then(function(){ toast(t('Volume envelope removed')); }).catch(function(){});
      return;
    }
    var nextAnimations = clip.animations.map(function(candidate){
      if (candidate.id !== animId) return candidate;
      var copy = JSON.parse(JSON.stringify(candidate));
      copy.keyframes.splice(index, 1);
      return copy;
    });
    edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }]).catch(function(){});
  }

  // ---------- audio effects (ducking sidechain) ----------

  var DUCKING_DEFAULTS = { threshold: -24, reduction: 0.25, attack: 0.05, release: 0.4, hold: 0.15 };

  function commitAudioEffect(clip, effect){
    // audioEffects have no direct set channel: replace atomically per edit.
    var exists = (clip.audioEffects || []).some(function(candidate){ return candidate.id === effect.id; });
    var ops = [];
    if (exists) ops.push({ op:'effect.remove', clipId:clip.id, effectId:effect.id, audio:true });
    ops.push({ op:'effect.add', clipId:clip.id, effect:effect, audio:true });
    edit(ops).catch(function(){});
  }

  function renderAudioEffectsSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = t('Audio effects');
    box.appendChild(title);
    (clip.audioEffects || []).forEach(function(fx){
      var head = document.createElement('div');
      head.className = 'transition-row';
      head.innerHTML = '<b>' + escapeHtml(effectLabel(fx.type)) + '</b><small style="margin-left:6px;opacity:.6">' + escapeHtml(fx.type) + '</small>';
      var remove = document.createElement('button');
      remove.textContent = '✕';
      remove.className = 'danger';
      remove.style.marginLeft = 'auto';
      remove.onclick = function(){ edit([{ op:'effect.remove', clipId:clip.id, effectId:fx.id, audio:true }]).catch(function(){}); };
      head.appendChild(remove);
      box.appendChild(head);
      Object.keys(fx.params || {}).forEach(function(name){
        var row = document.createElement('div');
        row.className = 'param-row';
        var label = document.createElement('input');
        label.value = name;
        label.disabled = true;
        var value = document.createElement('input');
        value.value = String(fx.params[name]);
        var commit = function(){
          var next = JSON.parse(JSON.stringify(fx));
          var parsed = Number(value.value);
          next.params[name] = String(parsed) === value.value.trim() ? parsed : value.value;
          commitAudioEffect(clip, next);
        };
        value.addEventListener('change', commit);
        row.appendChild(label); row.appendChild(value); row.appendChild(document.createElement('span'));
        box.appendChild(row);
      });
    });
    var addWrap = document.createElement('div');
    addWrap.className = 'field';
    addWrap.innerHTML = '<label>Add audio effect</label>';
    var add = document.createElement('select');
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Choose…';
    add.appendChild(empty);
    Object.keys(AUDIO_EFFECT_CATALOG).forEach(function(type){
      var option = document.createElement('option');
      option.value = type;
      option.textContent = t(AUDIO_EFFECT_CATALOG[type].label) + ' (' + type + ')';
      add.appendChild(option);
    });
    var ducking = document.createElement('option');
    ducking.value = 'ducking';
    ducking.textContent = t('Ducking (sidechain)');
    add.appendChild(ducking);
    add.addEventListener('change', function(){
      if (!add.value) return;
      if (AUDIO_EFFECT_CATALOG[add.value]){
        addAudioEffectToClip(clip, add.value);
        add.value = '';
        return;
      }
      addDuckingToClip(clip);
      add.value = '';
    });
    addWrap.appendChild(add);
    box.appendChild(addWrap);
    if ((clip.audioEffects || []).some(function(fx){ return fx.type === 'ducking'; })){
      var note = document.createElement('div');
      note.className = 'element-note';
      note.textContent = 'Ducking lowers this clip while the sidechain lane is loud. Edit "sidechain-track" to point at another audio lane id.';
      box.appendChild(note);
    }
  }

  // ---------- speed curve (time remap) editor ----------

  function renderSpeedCurve(box, clip){
    var W = 260, H = 116, pad = 12;
    var duration = Math.max(0.001, clip.duration);
    var remap = (clip.timeRemap || []).slice();
    if (remap.length < 2) return;
    var maxSource = 1;
    remap.forEach(function(keyframe){ maxSource = Math.max(maxSource, keyframe.source); });
    maxSource = Math.ceil(maxSource * 10) / 10;

    function xOf(at){ return pad + (at / duration) * (W - 2 * pad); }
    function yOf(source){ return H - pad - (source / maxSource) * (H - 2 * pad); }
    function atOf(x){ return Math.max(0, Math.min(duration, ((x - pad) / (W - 2 * pad)) * duration)); }
    function sourceOf(y){ return Math.max(0, (H - pad - y) / (H - 2 * pad) * maxSource); }

    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Speed curve \u00b7 drag points \u00b7 click to add \u00b7 double-click to remove';
    box.appendChild(title);

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.background = '#08111e';
    svg.style.border = '1px solid var(--line2)';
    svg.style.borderRadius = '8px';
    svg.style.touchAction = 'none';
    svg.style.width = '100%';
    svg.style.maxWidth = W + 'px';

    var baseline = document.createElementNS(NS, 'line');
    baseline.setAttribute('x1', pad); baseline.setAttribute('x2', W - pad);
    baseline.setAttribute('y1', H - pad); baseline.setAttribute('y2', H - pad);
    baseline.setAttribute('stroke', '#22334c');
    svg.appendChild(baseline);

    var curve = document.createElementNS(NS, 'polyline');
    curve.setAttribute('fill', 'none');
    curve.setAttribute('stroke', 'var(--accent)');
    curve.setAttribute('stroke-width', '2');
    svg.appendChild(curve);

    var speedLabels = document.createElementNS(NS, 'g');
    svg.appendChild(speedLabels);

    var dots = document.createElementNS(NS, 'g');
    svg.appendChild(dots);

    function keyframesSorted(){
      remap.sort(function(a,b){ return a.at - b.at; });
      return remap;
    }
    function redraw(){
      keyframesSorted();
      curve.setAttribute('points', remap.map(function(keyframe){ return xOf(keyframe.at) + ',' + yOf(keyframe.source); }).join(' '));
      while (dots.firstChild) dots.removeChild(dots.firstChild);
      while (speedLabels.firstChild) speedLabels.removeChild(speedLabels.firstChild);
      remap.forEach(function(keyframe, index){
        var circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', xOf(keyframe.at));
        circle.setAttribute('cy', yOf(keyframe.source));
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', '#ffd27d');
        circle.setAttribute('stroke', '#6b4b0a');
        circle.style.cursor = 'move';
        attachDrag(circle, index);
        circle.addEventListener('dblclick', function(event){
          event.preventDefault();
          if (remap.length <= 2) return toast('A speed curve needs at least two points', true);
          remap.splice(index, 1);
          commit();
        });
        dots.appendChild(circle);
      });
      for (var i = 0; i < remap.length - 1; i++){
        var dt = remap[i + 1].at - remap[i].at;
        var speed = dt > 0.0001 ? (remap[i + 1].source - remap[i].source) / dt : 0;
        var label = document.createElementNS(NS, 'text');
        label.setAttribute('x', (xOf(remap[i].at) + xOf(remap[i + 1].at)) / 2);
        label.setAttribute('y', Math.max(10, (yOf(remap[i].source) + yOf(remap[i + 1].source)) / 2 - 6));
        label.setAttribute('fill', '#8ea3c2');
        label.setAttribute('font-size', '9');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = speed.toFixed(1) + 'x';
        speedLabels.appendChild(label);
      }
    }
    function commit(){
      edit([{
        op: 'clip.timeremap',
        clipId: clip.id,
        keyframes: remap.map(function(keyframe){
          return { at: Number(keyframe.at.toFixed(6)), source: Number(keyframe.source.toFixed(6)), easing: keyframe.easing };
        }),
        easing: clip.timeRemapEasing || 'linear',
      }]).then(function(){ toast(t('Speed curve updated')); }).catch(function(){});
    }
    function attachDrag(circle, index){
      circle.addEventListener('pointerdown', function(event){
        event.preventDefault();
        event.stopPropagation();
        circle.setPointerCapture(event.pointerId);
        var move = function(moveEvent){
          var rect = svg.getBoundingClientRect();
          var scale = W / rect.width;
          var x = (moveEvent.clientX - rect.left) * scale;
          var y = (moveEvent.clientY - rect.top) * scale;
          var minAt = index > 0 ? remap[index - 1].at + 0.01 : 0;
          var maxAt = index < remap.length - 1 ? remap[index + 1].at - 0.01 : duration;
          remap[index].at = Math.max(minAt, Math.min(maxAt, atOf(x)));
          remap[index].source = sourceOf(y);
          redraw();
        };
        var up = function(){
          circle.removeEventListener('pointermove', move);
          circle.removeEventListener('pointerup', up);
          commit();
        };
        circle.addEventListener('pointermove', move);
        circle.addEventListener('pointerup', up);
      });
    }
    svg.addEventListener('pointerdown', function(event){
      if (event.target !== svg) return;
      var rect = svg.getBoundingClientRect();
      var scale = W / rect.width;
      var at = atOf((event.clientX - rect.left) * scale);
      var source = sourceOf((event.clientY - rect.top) * scale);
      var insertAt = remap.length;
      for (var i = 0; i < remap.length; i++){
        if (remap[i].at > at){ insertAt = i; break; }
      }
      var prev = insertAt > 0 ? remap[insertAt - 1] : null;
      var next = insertAt < remap.length ? remap[insertAt] : null;
      // Keep the keyframe list strictly increasing: clamp into the neighbour
      // gap and refuse when the gap is too tight.
      var minAt = prev ? prev.at + 0.01 : 0;
      var maxAt = next ? next.at - 0.01 : duration;
      if (minAt > maxAt) return toast('Keyframes are too close together here', true);
      at = Math.max(minAt, Math.min(maxAt, at));
      var before = prev || next;
      var after = next || prev;
      var span = after.at - before.at;
      var ratio = span > 0.0001 ? (at - before.at) / span : 0;
      var point = { at: at, source: Math.max(0, before.source + (after.source - before.source) * ratio) };
      remap.splice(insertAt, 0, point);
      commit();
    });
    redraw();
    box.appendChild(svg);
    var hint = document.createElement('div');
    hint.className = 'element-note';
    hint.textContent = 'X = time inside the clip, Y = source position. Segment labels show average speed; drag points for ramps, click to add, double-click to remove.';
    box.appendChild(hint);
  }

  // ---------- crop ----------

  function renderCropSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Crop · % of frame (region reveal)';
    box.appendChild(title);
    var crop = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
    var grid = document.createElement('div');
    grid.className = 'caption-style-grid';
    var names = [['left', 'Left %'], ['right', 'Right %'], ['top', 'Top %'], ['bottom', 'Bottom %']];
    names.forEach(function(pair){
      var field = document.createElement('div');
      field.className = 'field';
      field.innerHTML = '<label>' + pair[1] + '</label>';
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '99';
      input.step = '0.5';
      input.value = String(Math.round((crop[pair[0]] || 0) * 10000) / 100);
      input.addEventListener('change', function(){
        var next = {
          left: Number(el('crop-left').value) / 100 || 0,
          right: Number(el('crop-right').value) / 100 || 0,
          top: Number(el('crop-top').value) / 100 || 0,
          bottom: Number(el('crop-bottom').value) / 100 || 0,
        };
        var empty = !next.left && !next.right && !next.top && !next.bottom;
        if (!empty && next.left + next.right >= 1) return toast('Left + right must stay below 100%', true);
        if (!empty && next.top + next.bottom >= 1) return toast('Top + bottom must stay below 100%', true);
        edit([{ op:'clip.set', clipId:clip.id, props:{ crop: empty ? null : next } }]).catch(function(){});
      });
      input.id = 'crop-' + pair[0];
      field.appendChild(input);
      grid.appendChild(field);
    });
    box.appendChild(grid);
    if (clip.crop){
      var clear = document.createElement('button');
      clear.textContent = 'Clear crop';
      clear.onclick = function(){ edit([{ op:'clip.set', clipId:clip.id, props:{ crop:null } }]).catch(function(){}); };
      box.appendChild(clear);
    }
  }

  // ---------- mask studio (CapCut-style shape masks) ----------

  var MASK_SHAPE_DEFS = [
    ['rect', 'Rectangle', '▭'],
    ['circle', 'Circle', '◯'],
    ['ellipse', 'Ellipse', '⬭'],
    ['triangle', 'Triangle', '△'],
    ['diamond', 'Diamond', '◇'],
    ['star', 'Star', '★'],
    ['heart', 'Heart', '♥'],
    ['linear', 'Linear wipe', '▤'],
    ['mirror', 'Mirror half', '◧'],
  ];
  function maskShapeLabel(shape){
    var found = MASK_SHAPE_DEFS.filter(function(def){ return def[0] === shape; })[0];
    return found ? t(found[1]) : shape;
  }
  function maskAspect(){
    return (state.model.width || 16) / (state.model.height || 9);
  }
  // Shapes are generated in screen units (x: % of width, y: % of height ×
  // aspect) so circles and stars stay round on any canvas, rotated around the
  // mask center, then mapped back to clip-path percent pairs. Linear/mirror
  // are Sutherland–Hodgman half-plane clips of the frame rectangle. The
  // result rides the spec mask effect "points" channel, so preview and
  // export share the exact same polygon.
  function computeMaskPoints(params){
    var aspect = maskAspect();
    var shape = params.shape;
    var size = Number(params.size); if (!isFinite(size)) size = 60;
    size = Math.max(4, Math.min(200, size));
    var cx = Number(params.cx); if (!isFinite(cx)) cx = 50;
    var cy = Number(params.cy); if (!isFinite(cy)) cy = 50;
    var angle = (Number(params.angle) || 0) * Math.PI / 180;
    var cos = Math.cos(angle), sin = Math.sin(angle);
    var cxs = cx, cys = cy * aspect;
    function rot(px, py){
      var ax = px - cxs, ay = py - cys;
      return [cxs + ax * cos - ay * sin, cys + ax * sin + ay * cos];
    }
    function abs(rel){ return rel.map(function(p){ return rot(cxs + p[0], cys + p[1]); }); }
    var pts = [];
    var i, t;
    if (shape === 'linear' || shape === 'mirror'){
      var a = shape === 'mirror' ? angle + Math.PI / 2 : angle;
      var nx = -Math.sin(a), ny = Math.cos(a);
      var frame = [[0, 0], [100, 0], [100, 100 * aspect], [0, 100 * aspect]];
      for (i = 0; i < frame.length; i++){
        var p = frame[i], q = frame[(i + 1) % frame.length];
        var dp = (p[0] - cxs) * nx + (p[1] - cys) * ny;
        var dq = (q[0] - cxs) * nx + (q[1] - cys) * ny;
        if (dp >= 0) pts.push(p);
        if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)){
          var k = dp / (dp - dq);
          pts.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
        }
      }
    } else {
      var r = size / 2;
      var hy = r * aspect;
      if (shape === 'rect'){
        pts = abs([[-r, -hy], [r, -hy], [r, hy], [-r, hy]]);
      } else if (shape === 'triangle'){
        pts = abs([[0, -hy], [r, hy], [-r, hy]]);
      } else if (shape === 'diamond'){
        pts = abs([[0, -hy], [r, 0], [0, hy], [-r, 0]]);
      } else if (shape === 'circle' || shape === 'ellipse'){
        pts = [];
        for (i = 0; i < 40; i++){
          t = (i / 40) * Math.PI * 2;
          pts.push(rot(cxs + r * Math.cos(t), cys + (shape === 'ellipse' ? hy : r) * Math.sin(t)));
        }
      } else if (shape === 'star'){
        pts = [];
        for (i = 0; i < 10; i++){
          t = (i / 10) * Math.PI * 2 - Math.PI / 2;
          var radius = i % 2 === 0 ? r : r * 0.4;
          pts.push(rot(cxs + radius * Math.cos(t), cys + radius * Math.sin(t)));
        }
      } else if (shape === 'heart'){
        pts = [];
        var unit = r / 17;
        for (i = 0; i < 40; i++){
          t = (i / 40) * Math.PI * 2;
          var hx = 16 * Math.pow(Math.sin(t), 3);
          var hyy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          pts.push(rot(cxs + hx * unit, cys - (hyy + 2.5) * unit));
        }
      }
    }
    return pts.map(function(p){ return [p[0], p[1] / aspect]; });
  }
  function maskPointsString(params){
    if (!params || !params.shape) return '';
    var pts = computeMaskPoints(params);
    if (pts.length < 3) return '';
    var pairs = pts.map(function(p){ return round3(p[0]) + '% ' + round3(p[1]) + '%'; }).join(', ');
    if (params.invert) pairs = 'evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, ' + pairs;
    return pairs;
  }
  function maskEffectsOf(clip){
    return (clip.effects || []).filter(function(fx){ return fx.type === 'mask'; });
  }
  function setMaskParams(clip, fx, patch){
    var next = JSON.parse(JSON.stringify(fx));
    Object.keys(patch).forEach(function(key){ next.params[key] = patch[key]; });
    var points = maskPointsString(next.params);
    if (!points) return toast(t('Mask region falls outside the frame — adjust size or center'), true);
    next.params.points = points;
    var nextEffects = clip.effects.map(function(candidate){ return candidate.id === fx.id ? next : candidate; });
    edit([{ op:'clip.set', clipId:clip.id, props:{ effects:nextEffects } }]).catch(function(){});
  }
  function addMaskToClip(clip, shape){
    var params = { shape: shape, size: 60, cx: 50, cy: 50, angle: 0, invert: false };
    params.points = maskPointsString(params);
    var existing = maskEffectsOf(clip)[0];
    if (existing){
      return setMaskParams(clip, existing, { shape: shape, size: 60, cx: 50, cy: 50, angle: 0, invert: false });
    }
    var effect = {
      id: 'fx-mask-' + Date.now().toString(36) + '-' + (++effectIdCounter).toString(36),
      type: 'mask',
      params: params,
      enabled: true,
    };
    edit([{ op:'effect.add', clipId:clip.id, effect:effect }])
      .then(function(){ toast(t('Mask added: ') + maskShapeLabel(shape)); })
      .catch(function(){});
  }
  function renderMaskSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = t('Mask · shape & region (蒙版)');
    box.appendChild(title);
    var presets = document.createElement('div');
    presets.className = 'btn-row';
    MASK_SHAPE_DEFS.forEach(function(def){
      var button = document.createElement('button');
      button.textContent = def[2] + ' ' + t(def[1]);
      button.title = t('Apply the ') + t(def[1]) + t(' mask (CapCut-style shape mask)');
      button.onclick = function(){ addMaskToClip(clip, def[0]); };
      presets.appendChild(button);
    });
    box.appendChild(presets);
    var masks = maskEffectsOf(clip);
    if (masks.length > 1){
      var multi = document.createElement('div');
      multi.className = 'element-note';
      multi.textContent = t('More than one mask effect — the runtime keeps a single clip-path channel, so the LAST one wins.');
      box.appendChild(multi);
    }
    masks.forEach(function(fx){
      var head = document.createElement('div');
      head.className = 'transition-row';
      head.innerHTML = '<b>' + escapeHtml(effectLabel(fx.type)) + '</b><small style="margin-left:6px;opacity:.6">' + escapeHtml(maskShapeLabel(fx.params && fx.params.shape)) + '</small>';
      var enable = document.createElement('button');
      enable.textContent = fx.enabled ? 'On' : 'Off';
      enable.style.marginLeft = 'auto';
      enable.onclick = function(){
        var nextEffects = clip.effects.map(function(candidate){
          return candidate.id === fx.id ? Object.assign({}, candidate, { enabled:!candidate.enabled }) : candidate;
        });
        edit([{ op:'clip.set', clipId:clip.id, props:{ effects:nextEffects } }]).catch(function(){});
      };
      var remove = document.createElement('button');
      remove.textContent = '✕';
      remove.className = 'danger';
      remove.title = t('Remove mask');
      remove.onclick = function(){ edit([{ op:'effect.remove', clipId:clip.id, effectId:fx.id }]).catch(function(){}); };
      head.appendChild(enable);
      head.appendChild(remove);
      box.appendChild(head);
      var p = fx.params || {};
      var geometric = Boolean(p.shape) && MASK_SHAPE_DEFS.some(function(def){ return def[0] === p.shape; });
      if (geometric){
        var grid = document.createElement('div');
        grid.className = 'caption-style-grid';
        [['size', 'Size %'], ['cx', 'Center X %'], ['cy', 'Center Y %'], ['angle', 'Angle °']].forEach(function(pair){
          var field = document.createElement('div');
          field.className = 'field';
          field.innerHTML = '<label>' + t(pair[1]) + '</label>';
          field.appendChild(numberInput(p[pair[0]], 1, function(value){
            var patch = {};
            patch[pair[0]] = parseFloat(value);
            setMaskParams(clip, fx, patch);
          }));
          grid.appendChild(field);
        });
        box.appendChild(grid);
        var featherRow = document.createElement('div');
        featherRow.className = 'field';
        var featherSupported = p.shape === 'circle' || ((p.shape === 'ellipse' || p.shape === 'rect') && !Number(p.angle));
        featherRow.innerHTML = '<label>' + t('Feather % (羽化)') + '</label>';
        var feather = numberInput(Math.round((Number(p.feather) || 0) * 100), 5, function(value){
          setMaskParams(clip, fx, { feather: Math.max(0, Math.min(95, parseFloat(value))) / 100 });
        });
        if (!featherSupported) feather.disabled = true;
        featherRow.appendChild(feather);
        box.appendChild(featherRow);
        if (!featherSupported && Number(p.feather) > 0){
          var featherNote = document.createElement('div');
          featherNote.className = 'element-note';
          featherNote.textContent = t('Feather renders on circle/ellipse/rect masks that are not rotated; this mask keeps a hard edge.');
          box.appendChild(featherNote);
        }
        var invertRow = document.createElement('label');
        invertRow.style.display = 'flex';
        invertRow.style.gap = '6px';
        invertRow.style.alignItems = 'center';
        var invert = document.createElement('input');
        invert.type = 'checkbox';
        invert.checked = Boolean(p.invert);
        invert.onchange = function(){ setMaskParams(clip, fx, { invert: invert.checked }); };
        invertRow.appendChild(invert);
        invertRow.appendChild(document.createTextNode(t('Invert mask (reveal outside)')));
        box.appendChild(invertRow);
      } else {
        var legacy = document.createElement('div');
        legacy.className = 'element-note';
        legacy.textContent = t('Legacy mask parameters — pick a shape above to convert it to the shape editor.');
        box.appendChild(legacy);
      }
    });
  }

  // ---------- camera moves (Ken Burns) ----------

  function addKenBurns(clip, kind){
    var busy = (clip.animations || []).filter(function(animation){
      return animation.enabled !== false && ['x', 'scaleX', 'scaleY'].indexOf(animation.property) >= 0;
    });
    if (busy.length) return toast(t('Clip already has transform keyframes — remove those tracks first'), true);
    var width = state.model.width || 1920;
    var zoom = 1.18;
    var margin = (zoom - 1) / 2;
    var duration = Number(clip.duration.toFixed(6));
    var stamp = Date.now().toString(36) + '-' + (++effectIdCounter).toString(36);
    function track(property, v0, v1){
      return {
        id: 'kb-' + kind + '-' + clip.id + '-' + property + '-' + stamp,
        property: property,
        keyframes: [{ time: 0, value: v0 }, { time: duration, value: v1 }],
        start: 0,
        duration: duration,
        timeBase: 'clip',
        easing: 'ease-in-out',
        iterations: 1,
        direction: 'normal',
        fill: 'both',
        compose: 'replace',
        enabled: true,
      };
    }
    var tracks = [];
    if (kind === 'zoom-in'){
      tracks.push(track('scaleX', 1, zoom), track('scaleY', 1, zoom));
    } else if (kind === 'zoom-out'){
      tracks.push(track('scaleX', zoom, 1), track('scaleY', zoom, 1));
    } else if (kind === 'pan-left'){
      // Camera travels left: content starts pushed right (right region in
      // view) and slides to expose the left region; the constant 1.18 zoom
      // guarantees the pan never reveals the frame edge.
      tracks.push(track('scaleX', zoom, zoom), track('scaleY', zoom, zoom), track('x', -width * margin, width * margin));
    } else {
      tracks.push(track('scaleX', zoom, zoom), track('scaleY', zoom, zoom), track('x', width * margin, -width * margin));
    }
    edit(tracks.map(function(animation){
      return { op:'animation.add', animation:animation, clipId:clip.id };
    })).then(function(){
      toast(t('Camera move applied: ') + t(kind === 'zoom-in' ? 'Zoom in' : kind === 'zoom-out' ? 'Zoom out' : kind === 'pan-left' ? 'Pan left' : 'Pan right'));
    }).catch(function(){});
  }
  function renderCameraSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = t('Camera move · Ken Burns (运镜)');
    box.appendChild(title);
    var row = document.createElement('div');
    row.className = 'btn-row';
    [
      ['zoom-in', 'Zoom in', '🔍＋'],
      ['zoom-out', 'Zoom out', '🔍－'],
      ['pan-left', 'Pan left', '⬅'],
      ['pan-right', 'Pan right', '➡'],
    ].forEach(function(def){
      var button = document.createElement('button');
      button.textContent = def[2] + ' ' + t(def[1]);
      button.title = t('One-click Ken Burns move across the whole clip');
      button.onclick = function(){ addKenBurns(clip, def[0]); };
      row.appendChild(button);
    });
    box.appendChild(row);
  }

  // ---------- animation presets (CapCut 入场/出场/循环) ----------

  // Entrance/exit/loop animation presets. Transform tracks ride compose
  // 'add' so they offset the clip's authored transform instead of replacing
  // it; opacity uses 'replace' with absolute endpoints (alpha must not stack).
  var ANIMATION_PRESETS = [
    { id:'fade-in', kind:'in', label:'Fade in (淡入)', easing:'ease-out', tracks:[
      { property:'opacity', compose:'replace', points:[[0, 0], [1, '@opacity']] },
    ] },
    { id:'slide-left-in', kind:'in', label:'Slide in from left (左侧滑入)', easing:'ease-out', tracks:[
      { property:'x', compose:'add', points:[[0, -160], [1, 0]] },
    ] },
    { id:'slide-right-in', kind:'in', label:'Slide in from right (右侧滑入)', easing:'ease-out', tracks:[
      { property:'x', compose:'add', points:[[0, 160], [1, 0]] },
    ] },
    { id:'slide-up-in', kind:'in', label:'Slide in from bottom (底部滑入)', easing:'ease-out', tracks:[
      { property:'y', compose:'add', points:[[0, 160], [1, 0]] },
    ] },
    { id:'slide-down-in', kind:'in', label:'Slide in from top (顶部滑入)', easing:'ease-out', tracks:[
      { property:'y', compose:'add', points:[[0, -160], [1, 0]] },
    ] },
    { id:'zoom-in-in', kind:'in', label:'Zoom in (放大进入)', easing:'ease-out', tracks:[
      { property:'scaleX', compose:'add', points:[[0, -0.35], [1, 0]] },
      { property:'scaleY', compose:'add', points:[[0, -0.35], [1, 0]] },
    ] },
    { id:'bounce-in', kind:'in', label:'Bounce in (弹跳进入)', easing:'ease-out', tracks:[
      { property:'scaleX', compose:'add', points:[[0, -0.45], [0.7, 0.1, 'ease-in-out'], [1, 0]] },
      { property:'scaleY', compose:'add', points:[[0, -0.45], [0.7, 0.1, 'ease-in-out'], [1, 0]] },
    ] },
    { id:'fade-out', kind:'out', label:'Fade out (淡出)', easing:'ease-in', tracks:[
      { property:'opacity', compose:'replace', points:[[0, '@opacity'], [1, 0]] },
    ] },
    { id:'slide-left-out', kind:'out', label:'Slide out left (左滑出)', easing:'ease-in', tracks:[
      { property:'x', compose:'add', points:[[0, 0], [1, -160]] },
    ] },
    { id:'slide-right-out', kind:'out', label:'Slide out right (右滑出)', easing:'ease-in', tracks:[
      { property:'x', compose:'add', points:[[0, 0], [1, 160]] },
    ] },
    { id:'slide-up-out', kind:'out', label:'Slide out top (上滑出)', easing:'ease-in', tracks:[
      { property:'y', compose:'add', points:[[0, 0], [1, -160]] },
    ] },
    { id:'slide-down-out', kind:'out', label:'Slide out bottom (下滑出)', easing:'ease-in', tracks:[
      { property:'y', compose:'add', points:[[0, 0], [1, 160]] },
    ] },
    { id:'zoom-out-out', kind:'out', label:'Zoom out (缩小退出)', easing:'ease-in', tracks:[
      { property:'scaleX', compose:'add', points:[[0, 0], [1, -0.35]] },
      { property:'scaleY', compose:'add', points:[[0, 0], [1, -0.35]] },
    ] },
    { id:'pulse', kind:'loop', label:'Pulse (脉冲)', easing:'ease-in-out', tracks:[
      { property:'scaleX', compose:'add', points:[[0, 0], [0.5, 0.05], [1, 0]] },
      { property:'scaleY', compose:'add', points:[[0, 0], [0.5, 0.05], [1, 0]] },
    ] },
    { id:'sway', kind:'loop', label:'Sway (摇摆)', easing:'ease-in-out', tracks:[
      { property:'rotate', compose:'add', points:[[0, -2], [0.5, 2], [1, -2]] },
    ] },
  ];
  function applyAnimationPreset(clip, preset){
    if (!isVisualClip(clip)) return toast(t('Animations need a visual clip'), true);
    if (clip.duration < 0.12) return toast(t('Clip is too short for an animation preset'), true);
    var edge = Math.min(0.45, clip.duration * 0.5);
    var duration = Number(clip.duration.toFixed(6));
    var stamp = Date.now().toString(36) + '-' + (++effectIdCounter).toString(36);
    var baseOpacity = Number(clip.opacity) || 1;
    function resolve(value){
      return value === '@opacity' ? baseOpacity : value;
    }
    var tracks = preset.tracks.map(function(spec){
      var span = preset.kind === 'loop' ? duration : edge;
      return {
        id: 'anim-' + preset.id + '-' + clip.id + '-' + spec.property + '-' + stamp,
        property: spec.property,
        keyframes: spec.points.map(function(point){
          var keyframe = { time: Number((point[0] * span).toFixed(6)), value: resolve(point[1]) };
          if (point[2]) keyframe.easing = point[2];
          return keyframe;
        }),
        start: Number((preset.kind === 'out' ? duration - edge : 0).toFixed(6)),
        duration: Number(span.toFixed(6)),
        timeBase: 'clip',
        easing: preset.easing,
        iterations: 1,
        direction: 'normal',
        fill: 'both',
        compose: spec.compose,
        enabled: true,
      };
    });
    var properties = tracks.map(function(track){ return track.property; });
    var replaced = (clip.animations || []).filter(function(animation){
      return animation.enabled !== false && properties.indexOf(animation.property) >= 0;
    }).length;
    var nextAnimations = (clip.animations || []).filter(function(animation){
      return properties.indexOf(animation.property) < 0;
    }).concat(tracks);
    edit([{ op:'clip.set', clipId:clip.id, props:{ animations: nextAnimations } }])
      .then(function(){
        toast(t('Animation applied: ') + t(preset.label) + (replaced ? t(' (replaced ') + replaced + t(' track(s))') : ''));
      })
      .catch(function(error){ toast(error.message || 'Animation rejected', true); });
  }
  function renderAnimationLibrary(box){
    var selected = selectedClip();
    var target = selected && isVisualClip(selected.clip) ? selected.clip : null;
    var hint = document.createElement('div');
    hint.className = 'element-note';
    hint.textContent = t('One-click entrance/exit/loop animations for the selected clip. Transform presets offset the authored transform; applying replaces existing tracks on the same property.');
    box.appendChild(hint);
    [
      ['in', t('Entrance (入场)')],
      ['out', t('Exit (出场)')],
      ['loop', t('Loop (循环)')],
    ].forEach(function(group){
      var title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = group[1];
      box.appendChild(title);
      var row = document.createElement('div');
      row.className = 'btn-row';
      ANIMATION_PRESETS.filter(function(preset){ return preset.kind === group[0]; }).forEach(function(preset){
        var button = document.createElement('button');
        button.textContent = t(preset.label);
        button.title = t('Apply to the selected clip');
        button.disabled = !target;
        button.onclick = function(){ applyAnimationPreset(target, preset); };
        row.appendChild(button);
      });
      box.appendChild(row);
    });
  }

  // ---------- layout presets (picture-in-picture / splits) ----------

  function layoutVisualTargets(ids){
    return ids.map(function(id){ return clipById(id); }).filter(function(entry){
      return entry && isVisualClip(entry.clip) && !entry.lane.locked;
    }).sort(function(a, b){
      return (a.clip.z - b.clip.z) || (a.clip.start - b.clip.start);
    });
  }
  function applyLayoutPreset(ids, preset){
    var targets = layoutVisualTargets(ids);
    if (!targets.length) return toast(t('Select visual clips to arrange'), true);
    var width = state.model.width || 1920;
    var height = state.model.height || 1080;
    var ops = [];
    function put(entry, x, y, scale){
      var transform = Object.assign({}, entry.clip.transform, { x:x, y:y, scaleX:scale, scaleY:scale });
      ops.push({ op:'clip.set', clipId:entry.clip.id, props:{ transform:transform } });
    }
    if (preset === 'full'){
      targets.forEach(function(entry){ put(entry, 0, 0, 1); });
    } else if (preset === 'pip'){
      var top = targets[targets.length - 1];
      put(top, Math.round(width * 0.28), Math.round(height * 0.28), 0.4);
    } else if (preset === 'split-lr' || preset === 'split-tb'){
      if (targets.length < 2) return toast(t('Split layouts need 2 visual clips'), true);
      if (preset === 'split-lr'){
        put(targets[0], -Math.round(width / 4), 0, 0.5);
        put(targets[1], Math.round(width / 4), 0, 0.5);
      } else {
        put(targets[0], 0, -Math.round(height / 4), 0.5);
        put(targets[1], 0, Math.round(height / 4), 0.5);
      }
    } else if (preset === 'thirds'){
      if (targets.length < 3) return toast(t('Three panels need 3 visual clips'), true);
      var third = Math.round(width / 3);
      [0, 1, 2].forEach(function(index){
        put(targets[index], (index - 1) * third, 0, 1 / 3);
      });
    } else if (preset === 'grid4'){
      if (targets.length < 4) return toast(t('Grid 2×2 needs 4 visual clips'), true);
      [
        [-Math.round(width / 4), -Math.round(height / 4)],
        [Math.round(width / 4), -Math.round(height / 4)],
        [-Math.round(width / 4), Math.round(height / 4)],
        [Math.round(width / 4), Math.round(height / 4)],
      ].forEach(function(position, index){
        put(targets[index], position[0], position[1], 0.5);
      });
    }
    if (!ops.length) return;
    edit(ops).then(function(){
      toast(t('Layout applied: ') + t(preset === 'full' ? 'Full frame (reset)' : preset === 'pip' ? 'Picture-in-picture · bottom-right' : preset === 'split-lr' ? 'Split left/right' : preset === 'split-tb' ? 'Split top/bottom' : preset === 'thirds' ? 'Three panels' : 'Grid 2×2'));
    }).catch(function(){});
  }

  // ---------- compound clip editing (CapCut-style enter/navigate) ----------

  function compoundRefOf(clip){
    if (!clip || clip.kind !== 'timeline' || !clip.ref) return null;
    return clip.ref.replace(/^timeline:/, '');
  }
  function selectEditingTimeline(timelineId, pushCurrent){
    var target = timelineId || state.model.mainTimelineId;
    if (!target || target === state.model.timelineId) return Promise.resolve();
    if (pushCurrent) state.timelineStack.push(state.model.timelineId);
    else state.timelineStack = state.timelineStack.filter(function(id){ return id !== target; });
    return api('/api/timeline/select', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ timelineId: target }),
    }).then(function(body){
      applyProjectResponse(body);
      selectOnly(null);
      seek(0, true);
      renderTimeline();
      updateTimelineChrome();
      toast(t('Editing timeline: ') + (body.model.timelineId === body.model.mainTimelineId ? t('Main timeline') : body.model.timelineId));
    }).catch(function(error){ toast(error.message || 'Timeline switch failed', true); });
  }
  function enterCompoundClip(clip){
    var ref = compoundRefOf(clip);
    if (!ref) return;
    selectEditingTimeline(ref, true);
  }
  function updateTimelineChrome(){
    var onMain = !state.model || !state.model.mainTimelineId || state.model.timelineId === state.model.mainTimelineId;
    var button = el('timeline-back');
    button.style.display = onMain ? 'none' : '';
    var title = el('title');
    if (!onMain) title.setAttribute('data-timeline-badge', state.model.timelineId);
    else title.removeAttribute('data-timeline-badge');
  }

  // ---------- copy/paste attributes (CapCut 粘贴属性) ----------

  var ATTRIBUTE_FIELDS = ['transform', 'opacity', 'blend', 'fit', 'crop', 'effects', 'audioEffects', 'volume', 'pan', 'fadeIn', 'fadeOut'];
  function copyAttributesOf(clip){
    var snapshot = {};
    ATTRIBUTE_FIELDS.forEach(function(fieldName){
      if (clip[fieldName] === undefined || clip[fieldName] === null) return;
      snapshot[fieldName] = JSON.parse(JSON.stringify(clip[fieldName]));
    });
    return snapshot;
  }
  function reIdEffects(list){
    return (list || []).map(function(effect, index){
      var copy = JSON.parse(JSON.stringify(effect));
      copy.id = effect.type + '-pasted-' + Date.now().toString(36) + '-' + (++effectIdCounter).toString(36) + '-' + index;
      return copy;
    });
  }
  function pasteAttributesTo(ids){
    var snapshot = state.attributeClipboard;
    if (!snapshot || !Object.keys(snapshot).length) return toast(t('Attribute clipboard is empty — copy attributes from a clip first'), true);
    var targets = ids.map(function(id){ return clipById(id); }).filter(function(entry){
      return entry && !entry.lane.locked;
    });
    if (!targets.length) return toast(t('Nothing to paste onto'), true);
    var ops = targets.map(function(entry){
      var props = {};
      var clip = entry.clip;
      ATTRIBUTE_FIELDS.forEach(function(fieldName){
        if (snapshot[fieldName] === undefined) return;
        var value = snapshot[fieldName];
        if (fieldName === 'effects' || fieldName === 'audioEffects'){
          // Only meaningful on compatible clips; visual/audio channels map by kind.
          if (fieldName === 'effects' && !isVisualClip(clip)) return;
          if (fieldName === 'audioEffects' && clip.kind !== 'video' && clip.kind !== 'audio') return;
          value = reIdEffects(value);
        }
        props[fieldName] = value;
      });
      return { op:'clip.set', clipId:clip.id, props:props };
    });
    return edit(ops).then(function(){
      toast(t('Attributes pasted to ') + targets.length + t(' clip(s)'));
    }).catch(function(){});
  }

  // ---------- curve speed presets (CapCut 曲线变速) ----------

  // Normalized source-time curves: [t 0..1 of clip, s 0..1 of source span].
  // Rendered into a clip.timeremap keyframe list with ease-in-out between
  // points, matching CapCut's 曲线变速 presets.
  var SPEED_CURVE_PRESETS = [
    { id:'montage', label:'Montage (蒙太奇)', curve:[[0,0],[0.18,0.08],[0.4,0.5],[0.62,0.58],[0.82,0.92],[1,1]] },
    { id:'hero', label:'Hero moment (英雄时刻)', curve:[[0,0],[0.65,0.22],[0.85,0.7],[1,1]] },
    { id:'bullet', label:'Bullet time (子弹时间)', curve:[[0,0],[0.3,0.42],[0.5,0.5],[0.7,0.58],[1,1]] },
    { id:'jumpcut', label:'Jump cut (跳接)', curve:[[0,0],[0.2,0.34],[0.28,0.36],[0.48,0.68],[0.56,0.7],[1,1]] },
    { id:'flashin', label:'Flash in (闪进)', curve:[[0,0],[0.55,0.2],[1,1]] },
  ];
  function applySpeedCurvePreset(clip, preset){
    var sourceStart = clip.sourceIn || 0;
    var sourceSpan = clip.duration * (clip.speed || 1);
    var keyframes = preset.curve.map(function(point, index){
      return {
        at: Number((point[0] * clip.duration).toFixed(6)),
        source: Number((sourceStart + point[1] * sourceSpan).toFixed(6)),
        easing: index === 0 ? undefined : 'ease-in-out',
      };
    });
    return edit([{ op:'clip.timeremap', clipId:clip.id, easing:'ease-in-out', keyframes:keyframes }])
      .then(function(){ toast(t('Speed curve applied: ') + t(preset.label)); })
      .catch(function(error){ toast(error.message || 'Speed curve rejected', true); });
  }
  function renderSpeedCurvePresets(box, clip){
    var row = document.createElement('div');
    row.className = 'btn-row';
    SPEED_CURVE_PRESETS.forEach(function(preset){
      var button = document.createElement('button');
      button.textContent = t(preset.label);
      button.title = t('Keyframed curve-speed preset (CapCut 曲线变速)');
      button.onclick = function(){ applySpeedCurvePreset(clip, preset); };
      row.appendChild(button);
    });
    box.appendChild(row);
  }

  // ---------- quick transform: flip & rotate ----------

  function flipSelected(ids, axis){
    var targets = ids.map(function(id){ return clipById(id); }).filter(function(entry){
      return entry && isVisualClip(entry.clip) && !entry.lane.locked;
    });
    if (!targets.length) return toast(t('Flip needs a visual clip'), true);
    var ops = targets.map(function(entry){
      var transform = Object.assign({}, entry.clip.transform);
      var key = axis === 'h' ? 'scaleX' : 'scaleY';
      transform[key] = -(Number(transform[key]) || 1) || -1;
      return { op:'clip.set', clipId:entry.clip.id, props:{ transform:transform } };
    });
    return edit(ops).then(function(){
      toast(t(axis === 'h' ? 'Flipped horizontally' : 'Flipped vertically'));
    }).catch(function(){});
  }
  function rotateSelected(ids, delta){
    var targets = ids.map(function(id){ return clipById(id); }).filter(function(entry){
      return entry && isVisualClip(entry.clip) && !entry.lane.locked;
    });
    if (!targets.length) return toast(t('Rotate needs a visual clip'), true);
    var ops = targets.map(function(entry){
      var transform = Object.assign({}, entry.clip.transform);
      var next = ((Number(transform.rotate) || 0) + delta + 540) % 360 - 180;
      transform.rotate = Math.round(next * 10) / 10;
      return { op:'clip.set', clipId:entry.clip.id, props:{ transform:transform } };
    });
    return edit(ops).then(function(){
      toast(t('Rotated ') + (delta > 0 ? '+90°' : '−90°'));
    }).catch(function(){});
  }

  // ---------- keyframes ----------

  var EMBED = new URLSearchParams(location.search).get('embed') === '1';
  var LANG = (function(){
    try {
      var stored = window.localStorage.getItem('vhtml-lang');
      if (stored === 'zh-CN' || stored === 'en') return stored;
    } catch (e) { /* storage may be blocked */ }
    return (navigator.language || 'en').toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en';
  })();
  function t(key){ var dict = (window.VHTML_I18N || {})[LANG]; return (dict && dict[key] !== undefined) ? dict[key] : key; }
  function applyStaticI18n(){
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++){
      var node = nodes[i];
      var key = node.getAttribute('data-i18n');
      if (key !== null && key !== '') node.textContent = t(key);
    }
    var titled = document.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titled.length; j++){
      var node2 = titled[j];
      var key2 = node2.getAttribute('data-i18n-title');
      if (key2) node2.title = t(key2);
    }
    document.documentElement.lang = LANG === 'zh-CN' ? 'zh-CN' : 'en';
  }
  var PROXY = (function(){
    try { return window.localStorage.getItem('vhtml-proxy') === '1'; } catch (e) { return false; }
  })();
  function proxyUrl(url){
    if (!PROXY || !url || url.indexOf('/api/') === 0) return url;
    var assetId = decodeURIComponent((url.match(/[?&]asset=([^&]+)/) || [])[1] || '');
    if (!assetId) return url;
    return '/api/media/proxy?asset=' + assetId;
  }
  function bridgePost(event, payload){
    try { parent.postMessage({ source: 'vhtml-studio', type: 'vhtml:event', event: event, payload: payload || null }, '*'); } catch (e) { /* parent may be gone */ }
  }

  var KEYFRAME_PROPERTIES = ['opacity', 'x', 'y', 'scaleX', 'scaleY', 'rotate'];
  var AUDIO_KEYFRAME_PROPERTIES = ['volume', 'pan'];
  // cubic-bezier values are first-class EasingName strings end-to-end
  // (core/animation.ts parses them), so custom curves need no model change.
  var EASING_PRESETS = [
    ['linear', 'Linear'],
    ['ease', 'Ease (standard)'],
    ['ease-in', 'Ease in'],
    ['ease-out', 'Ease out'],
    ['ease-in-out', 'Ease in-out'],
    ['cubic-bezier(.86,0,.07,1)', 'Sharp in-out'],
    ['cubic-bezier(.16,1,.3,1)', 'Soft decay'],
    ['cubic-bezier(.34,1.56,.64,1)', 'Overshoot'],
    ['cubic-bezier(.64,0,.78,0)', 'Anticipate'],
    ['steps(6)', 'Steps (6)'],
  ];
  var COLOR_TAGS = [
    { color: '#ff5c5c', label: 'Red tag' },
    { color: '#ffb020', label: 'Orange tag' },
    { color: '#42e8a4', label: 'Green tag' },
    { color: '#6ec1ff', label: 'Blue tag' },
    { color: '#c99cff', label: 'Purple tag' },
  ];
  // CapCut-style title presets: per-cue CSS declarations applied on top of the
  // caption lane's base style. The runtime applies them via style.setProperty.
  var TITLE_PRESETS = [
    {
      label: 'Main title',
      hint: 'Large centered headline at the upper third',
      text: '标题',
      duration: 3,
      style: { 'font-size': '92px', 'font-weight': '800', 'line-height': '1.1', 'color': '#ffffff', 'text-shadow': '0 6px 28px rgba(0,0,0,.65)', 'bottom': '58%' },
    },
    {
      label: 'Lower third',
      hint: 'Classic lower-third bar',
      text: '姓名 / 职务',
      duration: 3,
      style: { 'font-size': '34px', 'font-weight': '700', 'color': '#ffffff', 'background': 'rgba(6,12,24,.78)', 'padding': '10px 22px', 'border-left': '4px solid #6ee7ff', 'text-align': 'left', 'left': '6%', 'right': 'auto', 'bottom': '12%', 'border-radius': '4px' },
    },
    {
      label: 'Corner badge',
      hint: 'Small badge pinned to the top-right corner',
      text: 'LIVE',
      duration: 2,
      style: { 'font-size': '22px', 'font-weight': '800', 'letter-spacing': '.18em', 'color': '#0a1220', 'background': '#ff5c5c', 'padding': '6px 14px', 'left': 'auto', 'right': '5%', 'bottom': '88%', 'border-radius': '999px' },
    },
    {
      label: 'Highlight',
      hint: 'Large yellow emphasis line',
      text: '重点内容',
      duration: 2.5,
      style: { 'font-size': '64px', 'font-weight': '900', 'color': '#ffd54a', 'text-shadow': '0 3px 0 rgba(0,0,0,.45)', 'bottom': '20%' },
    },
  ];

  function keyframeValueFor(clip, property){
    if (property === 'opacity') return clip.opacity;
    if (property === 'volume') return clip.volume;
    if (property === 'pan') return clip.pan;
    return clip.transform[property];
  }

  function laneTypeOf(clip){
    var found = null;
    (state.model.lanes || []).forEach(function(lane){
      (lane.clips || []).forEach(function(candidate){
        if (candidate.id === clip.id) found = lane.type;
      });
    });
    return found;
  }

  function animationLabel(property){
    var labels = { opacity:'Opacity', x:'Position X', y:'Position Y', scaleX:'Scale X', scaleY:'Scale Y', rotate:'Rotation', volume:'Volume', pan:'Pan' };
    return labels[property] || property;
  }

  function renderKeyframeSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = t('Keyframes · added at the playhead');
    box.appendChild(title);
    var addRow = document.createElement('div');
    addRow.className = 'btn-row';
    var audible = clip.kind === 'audio' || clip.kind === 'video' || laneTypeOf(clip) === 'audio';
    KEYFRAME_PROPERTIES.concat(audible ? AUDIO_KEYFRAME_PROPERTIES : []).forEach(function(property){
      var has = (clip.animations || []).some(function(animation){ return animation.property === property; });
      if (has) return;
      var button = document.createElement('button');
      button.textContent = '+ ' + animationLabel(property);
      button.title = t('Start a ') + animationLabel(property) + t(' keyframe track at the playhead');
      button.onclick = function(){ addPropertyKeyframe(clip, property); };
      addRow.appendChild(button);
    });
    if (addRow.children.length) box.appendChild(addRow);
    (clip.animations || []).forEach(function(animation){
      var lane = document.createElement('div');
      lane.className = 'element-note';
      lane.style.marginTop = '4px';
      lane.textContent = animationLabel(animation.property) + ' · ' + animation.keyframes.length + ' keyframe(s) · ' + (animation.enabled ? 'active' : 'off');
      var removeAnim = document.createElement('button');
      removeAnim.textContent = t('Remove track');
      removeAnim.style.marginLeft = '8px';
      removeAnim.onclick = function(){ edit([{ op:'animation.remove', animationId:animation.id, clipId:clip.id }]).catch(function(){}); };
      lane.appendChild(removeAnim);
      box.appendChild(lane);
      animation.keyframes.forEach(function(keyframe, index){
        var row = document.createElement('div');
        row.className = 'kf-row';
        var at = document.createElement('input');
        at.type = 'number';
        at.step = '0.01';
        at.value = (animation.timeBase === 'project' ? animation.start + keyframe.time : clip.start + animation.start + keyframe.time).toFixed(3);
        at.title = t('Absolute time (s)');
        var value = document.createElement('input');
        value.type = 'number';
        value.step = 'any';
        value.value = String(keyframe.value);
        var easing = document.createElement('select');
        EASING_PRESETS.forEach(function(presetEasing){
          var option = document.createElement('option');
          option.value = presetEasing[0];
          option.textContent = t(presetEasing[1]);
          if ((keyframe.easing || animation.easing) === presetEasing[0]) option.selected = true;
          easing.appendChild(option);
        });
        var del = document.createElement('button');
        del.textContent = '✕';
        del.className = 'danger';
        del.title = t('Delete keyframe');
        var commit = function(){
          var nextAnimations = clip.animations.map(function(candidate){
            if (candidate.id !== animation.id) return candidate;
            var copy = JSON.parse(JSON.stringify(candidate));
            var nextTime = Math.max(0, parseFloat(at.value) - (copy.timeBase === 'project' ? copy.start : clip.start + copy.start));
            copy.keyframes[index] = {
              time: isFinite(nextTime) ? nextTime : 0,
              value: parseFloat(value.value),
              easing: easing.value === 'linear' ? undefined : easing.value,
            };
            copy.keyframes.sort(function(a,b){ return a.time - b.time; });
            return copy;
          });
          edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }]).catch(function(){});
        };
        at.addEventListener('change', commit);
        value.addEventListener('change', commit);
        easing.addEventListener('change', commit);
        del.onclick = function(){
          var nextAnimations = clip.animations.map(function(candidate){
            if (candidate.id !== animation.id) return candidate;
            var copy = JSON.parse(JSON.stringify(candidate));
            copy.keyframes.splice(index, 1);
            return copy;
          }).filter(function(candidate){ return candidate.keyframes.length > 0; });
          edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }]).catch(function(){});
        };
        row.appendChild(at); row.appendChild(value); row.appendChild(easing); row.appendChild(del);
        box.appendChild(row);
      });
    });
  }

  function addPropertyKeyframe(clip, property){
    var fps = state.model.fps;
    var at = snap(state.time);
    if (at < clip.start - 0.0001 || at > clip.start + clip.duration + 0.0001){
      return toast('Move the playhead inside the clip to place a keyframe', true);
    }
    var existing = (clip.animations || []).filter(function(animation){ return animation.property === property; })[0];
    var localTime = Number(((at - clip.start)).toFixed(6));
    var value = keyframeValueFor(clip, property);
    if (existing){
      var nextAnimations = clip.animations.map(function(animation){
        if (animation.id !== existing.id) return animation;
        var copy = JSON.parse(JSON.stringify(animation));
        copy.keyframes.push({ time: localTime, value: value });
        copy.keyframes.sort(function(a,b){ return a.time - b.time; });
        return copy;
      });
      return edit([{ op:'clip.set', clipId:clip.id, props:{ animations:nextAnimations } }])
        .then(function(){ toast(animationLabel(property) + ' keyframe at ' + fmtTime(at)); }).catch(function(){});
    }
    var animation = {
      id: 'kf-' + clip.id + '-' + property + '-' + Date.now().toString(36),
      property: property,
      keyframes: [
        { time: 0, value: value },
        { time: localTime, value: value },
      ],
      start: 0,
      duration: Number(clip.duration.toFixed(6)),
      timeBase: 'clip',
      easing: 'linear',
      iterations: 1,
      direction: 'normal',
      fill: 'both',
      compose: 'replace',
      enabled: true,
    };
    edit([{ op:'animation.add', animation:animation, clipId:clip.id }])
      .then(function(){ toast(animationLabel(property) + ' keyframes started at ' + fmtTime(at)); }).catch(function(){});
  }

  // ---------- effects ----------

  var EFFECT_CATALOG = {
    'blur': { params:{ amount:4 } },
    'brightness': { params:{ amount:1.1 } },
    'contrast': { params:{ amount:1.1 } },
    'saturate': { params:{ amount:1.2 } },
    'grayscale': { params:{ amount:100 } },
    'sepia': { params:{ amount:60 } },
    'invert': { params:{ amount:100 } },
    'hue-rotate': { params:{ angle:45 } },
    'drop-shadow': { params:{ x:0, y:8, blur:16, color:'rgba(0,0,0,0.55)' } },
    'glow': { params:{ blur:18, spread:24, color:'rgba(110,231,255,0.8)' } },
    'grain': { params:{ opacity:0.09, size:3 } },
    'vignette': { params:{ amount:0.45 } },
    'tint': { params:{ color:'#6ee7ff', opacity:0.22, blend:'multiply' } },
    'color-overlay': { params:{ color:'#6ee7ff', opacity:0.35, blend:'normal' } },
    'chroma-key': { params:{ color:'#00ff00', tolerance:0.25, spill:0.15 } },
    'rounded': { params:{ radius:'24px' } },
    'mask': { params:{ shape:'circle', size:60, cx:50, cy:50, angle:0, invert:false } },
    'filter': { params:{ value:'none' } },
    'css': { params:{ style:'' } },
  };
  var EFFECT_LABELS = {
    'blur': 'Blur',
    'brightness': 'Brightness',
    'contrast': 'Contrast',
    'saturate': 'Saturation',
    'grayscale': 'Grayscale',
    'sepia': 'Sepia',
    'invert': 'Invert',
    'hue-rotate': 'Hue rotate',
    'drop-shadow': 'Drop shadow',
    'glow': 'Glow',
    'grain': 'Grain',
    'vignette': 'Vignette',
    'tint': 'Tint',
    'color-overlay': 'Color overlay',
    'chroma-key': 'Chroma key (green screen)',
    'rounded': 'Rounded corners',
    'mask': 'Mask (蒙版)',
    'filter': 'Custom filter',
    'css': 'Custom CSS',
  };
  function effectLabel(type){
    if (EFFECT_LABELS[type]) return t(EFFECT_LABELS[type]);
    if (AUDIO_EFFECT_CATALOG[type]) return t(AUDIO_EFFECT_CATALOG[type].label);
    return type;
  }
  var AUDIO_EFFECT_CATALOG = {
    'gain': { params:{ gain:1.5 }, label:'Gain boost' },
    'highpass': { params:{ frequency:120 }, label:'High-pass (de-hum)' },
    'lowpass': { params:{ frequency:8000 }, label:'Low-pass (soften)' },
    'compressor': { params:{ threshold:0.125, ratio:4, attack:20, release:250 }, label:'Compressor' },
    'echo': { params:{ inGain:0.8, outGain:0.9, delay:120, decay:0.35 }, label:'Echo / reverb' },
    'pitch': { params:{ semitones:0 }, label:'Pitch shift (voice)' },
    'denoise': { params:{ strength:12, floor:-25 }, label:'Denoise (智能降噪)' },
    'normalize': { params:{ lufs:-16 }, label:'Loudness normalize (统一响度)' },
  };
  var TRANSITION_CATALOG = ['crossfade', 'fade', 'dip', 'wipe', 'slide', 'zoom', 'blur'];
  var TRANSITION_LABELS = {
    'crossfade': 'Crossfade',
    'fade': 'Fade to black',
    'dip': 'Dip to color',
    'wipe': 'Wipe',
    'slide': 'Slide',
    'zoom': 'Zoom',
    'blur': 'Blur transition',
  };
  function transitionLabel(type){
    return TRANSITION_LABELS[type] ? t(TRANSITION_LABELS[type]) : type;
  }
  function addAudioEffectToClip(clip, type){
    var preset = AUDIO_EFFECT_CATALOG[type];
    if (!preset) return;
    var effect = {
      id: 'fx-audio-' + type + '-' + Date.now().toString(36) + '-' + (++effectIdCounter).toString(36),
      type: type,
      params: JSON.parse(JSON.stringify(preset.params)),
      enabled: true,
    };
    edit([{ op:'effect.add', clipId:clip.id, effect:effect, audio:true }])
      .then(function(){ toast(t('Audio effect added: ') + effectLabel(type)); })
      .catch(function(){});
  }
  function addDuckingToClip(clip){
    var audioLanes = state.model.lanes.filter(function(lane){ return lane.type === 'audio'; });
    if (!audioLanes.length){
      toast('Ducking needs a sidechain audio lane', true);
      return;
    }
    var params = JSON.parse(JSON.stringify(DUCKING_DEFAULTS));
    params['sidechain-track'] = audioLanes[0].id;
    var effect = {
      id: 'fx-ducking-' + Date.now().toString(36) + '-' + (++effectIdCounter).toString(36),
      type: 'ducking',
      params: params,
      enabled: true,
    };
    edit([{ op:'effect.add', clipId:clip.id, effect:effect, audio:true }])
      .then(function(){ toast('Ducking added — sidechain ' + params['sidechain-track']); })
      .catch(function(){});
  }
  function applyEffectToSelection(type){
    // CapCut-style batch apply: with a multi-selection the effect lands on
    // every selected visual clip, not just the primary one.
    var targets = selectionIds().filter(function(id){
      var found = clipById(id);
      return found && isVisualClip(found.clip) && !found.lane.locked;
    });
    var primary = selectedClip();
    if (targets.length <= 1 && primary) targets = [primary.clip.id];
    targets.forEach(function(id){
      var entry = clipById(id);
      if (entry) addEffect(entry.clip, type);
    });
    if (targets.length > 1) toast(effectLabel(type) + t(' applied to ') + targets.length + t(' clip(s)'));
  }

  function renderEffectsSection(box, clip){
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = t('Effects');
    box.appendChild(title);
    (clip.effects || []).forEach(function(fx){
      if (fx.type === 'mask') return; // edited by the dedicated mask section
      var head = document.createElement('div');
      head.className = 'transition-row';
      head.innerHTML = '<b>' + escapeHtml(effectLabel(fx.type)) + '</b><small style="margin-left:6px;opacity:.6">' + escapeHtml(fx.type) + '</small>';
      var enable = document.createElement('button');
      enable.textContent = fx.enabled ? 'On' : 'Off';
      enable.style.marginLeft = 'auto';
      enable.onclick = function(){
        var nextEffects = clip.effects.map(function(candidate){
          return candidate.id === fx.id ? Object.assign({}, candidate, { enabled:!candidate.enabled }) : candidate;
        });
        edit([{ op:'clip.set', clipId:clip.id, props:{ effects:nextEffects } }]).catch(function(){});
      };
      var remove = document.createElement('button');
      remove.textContent = '✕';
      remove.className = 'danger';
      remove.onclick = function(){ edit([{ op:'effect.remove', clipId:clip.id, effectId:fx.id }]); };
      head.appendChild(enable);
      head.appendChild(remove);
      box.appendChild(head);
      var params = Object.keys(fx.params || {});
      params.forEach(function(name){
        var row = document.createElement('div');
        row.className = 'param-row';
        var label = document.createElement('input');
        label.value = name;
        label.disabled = true;
        var value = document.createElement('input');
        value.value = String(fx.params[name]);
        var del = document.createElement('button');
        del.textContent = '✕';
        del.className = 'danger';
        var commit = function(){
          var nextEffects = clip.effects.map(function(candidate){
            if (candidate.id !== fx.id) return candidate;
            var copy = Object.assign({}, candidate, { params: Object.assign({}, candidate.params) });
            var parsed = Number(value.value);
            copy.params[name] = String(parsed) === value.value.trim() ? parsed : value.value;
            return copy;
          });
          edit([{ op:'clip.set', clipId:clip.id, props:{ effects:nextEffects } }]).catch(function(){});
        };
        value.addEventListener('change', commit);
        del.onclick = function(){
          var nextEffects = clip.effects.map(function(candidate){
            if (candidate.id !== fx.id) return candidate;
            var copy = Object.assign({}, candidate, { params: Object.assign({}, candidate.params) });
            delete copy.params[name];
            return copy;
          });
          edit([{ op:'clip.set', clipId:clip.id, props:{ effects:nextEffects } }]).catch(function(){});
        };
        row.appendChild(label); row.appendChild(value); row.appendChild(del);
        box.appendChild(row);
      });
    });
    var addWrap = document.createElement('div');
    addWrap.className = 'field';
    addWrap.innerHTML = '<label>Add effect</label>';
    var add = document.createElement('select');
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Choose…';
    add.appendChild(empty);
    Object.keys(EFFECT_CATALOG).forEach(function(type){
      var option = document.createElement('option');
      option.value = type;
      option.textContent = effectLabel(type);
      add.appendChild(option);
    });
    add.addEventListener('change', function(){
      if (!add.value) return;
      applyEffectToSelection(add.value);
      add.value = '';
    });
    addWrap.appendChild(add);
    box.appendChild(addWrap);
  }

  function sceneById(sceneId){
    var scenes = (state.model && state.model.scenes) || [];
    for (var i=0;i<scenes.length;i++) if (scenes[i].id === sceneId) return scenes[i];
    return null;
  }

  function stageContentChildren(node){
    var out = [];
    if (!node) return out;
    for (var i=0;i<node.children.length;i++){
      var child = node.children[i];
      var tag = (child.tagName || '').toLowerCase();
      if (tag !== 'style' && tag !== 'script') out.push(child);
    }
    return out;
  }

  function elementContentPath(root, target){
    var path = [];
    var node = target;
    while (node && node !== root){
      var parent = node.parentElement;
      if (!parent) return null;
      var index = stageContentChildren(parent).indexOf(node);
      if (index < 0) return null;
      path.unshift(index);
      node = parent;
    }
    return node === root && path.length ? path : null;
  }

  function stageSceneRoot(sceneId){
    try {
      var doc = stage.contentDocument;
      if (!doc) return null;
      var roots = doc.querySelectorAll('.vhtml-scene-root');
      for (var i=0;i<roots.length;i++) if (roots[i].dataset.vhtmlScene === sceneId) return roots[i];
    } catch (error) {}
    return null;
  }

  function resolveStageElement(selection){
    if (!selection) return null;
    var root = stageSceneRoot(selection.sceneId);
    if (!root) return null;
    var node = root;
    for (var i=0;i<selection.path.length;i++){
      var children = stageContentChildren(node);
      node = children[selection.path[i]];
      if (!node) return null;
    }
    return node === root ? null : node;
  }

  function elementDisplay(selection){
    var name = '<' + selection.tag;
    if (selection.attrs && selection.attrs.id) name += '#' + selection.attrs.id;
    var cls = selection.attrs && selection.attrs['class'] ? selection.attrs['class'].trim().split(/\\s+/).filter(Boolean) : [];
    if (cls.length) name += '.' + cls.slice(0,2).join('.');
    return name + '>';
  }

  function elementComputed(target){
    var computed = {};
    try {
      var cs = stage.contentWindow.getComputedStyle(target);
      var names = ['color','backgroundColor','fontSize','fontWeight','textAlign','display','opacity','borderRadius'];
      names.forEach(function(name){ computed[name] = cs[name]; });
    } catch (error) {}
    return computed;
  }

  function snapshotStageElement(root, target, path, clipId){
    var attrs = {};
    for (var i=0;i<target.attributes.length;i++){
      var attr = target.attributes[i];
      if (attr.name !== 'style') attrs[attr.name] = attr.value;
    }
    var hasChildren = false;
    for (var j=0;j<target.children.length;j++){
      var tag = (target.children[j].tagName || '').toLowerCase();
      if (tag !== 'style' && tag !== 'script') hasChildren = true;
    }
    var scene = sceneById(root.dataset.vhtmlScene);
    return {
      sceneId: root.dataset.vhtmlScene,
      clipId: clipId || null,
      path: path,
      tag: (target.tagName || '').toLowerCase(),
      attrs: attrs,
      style: target.getAttribute('style') || '',
      text: hasChildren ? '' : (target.textContent || ''),
      html: target.innerHTML || '',
      hasChildren: hasChildren,
      computed: elementComputed(target),
      external: Boolean(scene && scene.src)
    };
  }

  function elementDraftFrom(snapshot){
    return {
      attrs: Object.keys(snapshot.attrs).map(function(name){ return { name:name, value:snapshot.attrs[name] }; }),
      style: snapshot.style || '',
      text: snapshot.text || '',
      html: snapshot.html || ''
    };
  }

  function draftAttr(draft, name){
    for (var i=0;i<draft.attrs.length;i++) if (draft.attrs[i].name === name) return draft.attrs[i].value;
    return '';
  }

  function setDraftAttr(draft, name, value){
    for (var i=0;i<draft.attrs.length;i++){
      if (draft.attrs[i].name === name){ draft.attrs[i].value = value; return; }
    }
    draft.attrs.push({ name:name, value:value });
  }

  function removeDraftAttr(draft, name){
    draft.attrs = draft.attrs.filter(function(attr){ return attr.name !== name; });
  }

  function textField(label, value, multiline, onChange){
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var heading = document.createElement('label');
    heading.textContent = label;
    wrap.appendChild(heading);
    var input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value == null ? '' : String(value);
    input.addEventListener('input', function(){ onChange(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function renderElement(box){
    if (!state.element || !state.elementDraft){
      var empty = document.createElement('div');
      empty.className = 'inspector-empty';
      empty.innerHTML = '<b>Edit any HTML node.</b><br>Turn on <b>⌖ Element</b> in the timeline toolbar (or press <b>E</b>), then click any element inside the player. Text, attributes, ID/class and inline CSS can be edited here without touching the timeline.<br><br>Element edits are written back to the Scene HTML and saved atomically.';
      box.appendChild(empty);
      var enable = document.createElement('button');
      enable.textContent = '⌖ Pick an element';
      enable.onclick = function(){ setPickMode(true); };
      box.appendChild(enable);
      return;
    }
    var element = state.element;
    var draft = state.elementDraft;
    var head = document.createElement('div');
    head.className = 'element-tag';
    head.innerHTML = '<span>' + escapeHtml(elementDisplay(element)) + '</span><span class="badge">' + (element.external ? 'external scene' : 'inline scene') + '</span>';
    box.appendChild(head);
    var scene = document.createElement('div');
    scene.className = 'element-scene';
    scene.textContent = element.sceneId + (element.clipId ? ' · ' + element.clipId : '') + ' · path ' + element.path.join('/');
    box.appendChild(scene);

    box.appendChild(textField('Element ID', draftAttr(draft, 'id'), false, function(value){
      setDraftAttr(draft, 'id', value.trim());
    }));
    box.appendChild(textField('Class names', draftAttr(draft, 'class'), false, function(value){
      setDraftAttr(draft, 'class', value.trim());
    }));

    if (element.hasChildren){
      var note = document.createElement('div');
      note.className = 'element-note';
      note.textContent = 'This node contains child elements. Edit its inner HTML below, or click a child node for leaf text. Inline CSS and attributes apply to this node.';
      box.appendChild(note);
      box.appendChild(textField('Inner HTML', draft.html, true, function(value){ draft.html = value; }));
    } else {
      box.appendChild(textField('Text content', draft.text, true, function(value){ draft.text = value; }));
    }

    var styleSection = document.createElement('div');
    styleSection.className = 'section-title';
    styleSection.textContent = 'Inline CSS';
    box.appendChild(styleSection);
    var styleArea = document.createElement('textarea');
    styleArea.placeholder = 'color: #fff; font-size: 48px;';
    styleArea.value = draft.style;
    styleArea.style.minHeight = '64px';
    styleArea.addEventListener('input', function(){ draft.style = styleArea.value; });
    box.appendChild(styleArea);

    var attrSection = document.createElement('div');
    attrSection.className = 'section-title';
    attrSection.textContent = 'Attributes';
    box.appendChild(attrSection);
    var attrHead = document.createElement('div');
    attrHead.className = 'attr-head';
    attrHead.innerHTML = '<span>Name</span><span>Value</span><span></span>';
    box.appendChild(attrHead);

    var extraAttrs = draft.attrs.filter(function(attr){
      return attr.name !== 'id' && attr.name !== 'class' && attr.name !== 'style';
    });
    extraAttrs.forEach(function(attr){
      var row = document.createElement('div');
      row.className = 'attr-row';
      var name = document.createElement('input');
      name.value = attr.name;
      name.placeholder = 'name';
      name.addEventListener('change', function(){
        var next = name.value.trim();
        if (!next) return;
        if (draft.attrs.filter(function(item){ return item !== attr && item.name === next; }).length) {
          toast('Attribute already exists: ' + next, true);
          name.value = attr.name;
          return;
        }
        attr.name = next;
      });
      var value = document.createElement('input');
      value.value = attr.value;
      value.placeholder = 'value';
      value.addEventListener('input', function(){ attr.value = value.value; });
      var remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = '✕';
      remove.title = 'Remove attribute';
      remove.onclick = function(){
        var index = draft.attrs.indexOf(attr);
        if (index >= 0) draft.attrs.splice(index, 1);
        renderInspector();
      };
      row.appendChild(name); row.appendChild(value); row.appendChild(remove);
      box.appendChild(row);
    });

    var addAttr = document.createElement('button');
    addAttr.textContent = '+ Attribute';
    addAttr.onclick = function(){
      draft.attrs.push({ name:'', value:'' });
      renderInspector();
    };
    box.appendChild(addAttr);

    var computedSection = document.createElement('div');
    computedSection.className = 'section-title';
    computedSection.textContent = 'Computed';
    box.appendChild(computedSection);
    var computed = document.createElement('div');
    computed.className = 'computed-grid';
    var labels = { color:'Color', backgroundColor:'Background', fontSize:'Font size', fontWeight:'Weight', textAlign:'Align', display:'Display', opacity:'Opacity', borderRadius:'Radius' };
    Object.keys(labels).forEach(function(key){
      if (!element.computed || !element.computed[key]) return;
      var label = document.createElement('b'); label.textContent = labels[key];
      var value = document.createElement('span'); value.textContent = element.computed[key];
      computed.appendChild(label); computed.appendChild(value);
    });
    box.appendChild(computed);

    var actions = document.createElement('div');
    actions.className = 'inspector-actions';
    var apply = document.createElement('button');
    apply.className = 'primary';
    apply.textContent = 'Apply changes';
    apply.onclick = function(){ applyElementChanges(apply); };
    var reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.onclick = function(){ state.elementDraft = elementDraftFrom(state.element); renderInspector(); };
    var pick = document.createElement('button');
    pick.textContent = '⌖ Pick another';
    pick.onclick = function(){ setPickMode(true); };
    actions.appendChild(apply); actions.appendChild(reset); actions.appendChild(pick);
    box.appendChild(actions);
    var hint = document.createElement('div');
    hint.className = 'element-note';
    hint.textContent = element.external
      ? 'This Scene is external: Apply writes the element patch to its HTML file, then reloads the project.'
      : 'Apply updates the Scene HTML through a validated, undoable edit operation.';
    box.appendChild(hint);
  }

  function applyElementChanges(button){
    var element = state.element;
    var draft = state.elementDraft;
    if (!element || !draft) return;
    var attrs = {};
    draft.attrs.forEach(function(attr){
      var name = String(attr.name || '').trim();
      if (!name || name === 'style') return;
      attrs[name] = String(attr.value == null ? '' : attr.value);
    });
    if (attrs.id === '') delete attrs.id;
    if (attrs.class === '') delete attrs.class;
    var patch = { attributes: attrs, style: draft.style };
    if (element.hasChildren) patch.innerHTML = draft.html;
    else patch.text = draft.text;
    if (button) { button.disabled = true; button.textContent = 'Applying…'; }
    api('/api/element', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sceneId: element.sceneId, path: element.path, patch: patch })
    }).then(function(body){
      element.attrs = attrs;
      element.style = draft.style;
      element.text = draft.text;
      element.html = draft.html;
      state.elementDraft = elementDraftFrom(element);
      applyProjectResponse(body);
      renderInspector();
      toast(body.external ? 'External Scene file updated' : 'Element updated');
      setTimeout(updateElementBox, 80);
    }).catch(function(error){
      toast(error.message, true);
    }).then(function(){
      if (button) { button.disabled = false; button.textContent = 'Apply changes'; }
    });
  }

  function setPickMode(enabled){
    state.pickElement = Boolean(enabled);
    var button = el('element-mode');
    if (button) button.classList.toggle('active', state.pickElement);
    if (state.pickElement){ state.tab = 'element'; renderInspector(); }
    applyPickCursor();
    updateSelectionBox();
    updateElementBox();
  }

  function applyPickCursor(){
    try {
      var doc = stage.contentDocument;
      if (!doc || !doc.head) return;
      var existing = doc.getElementById('vhtml-pick-cursor');
      if (!state.pickElement){
        if (existing) existing.remove();
        elementHover.style.display = 'none';
        return;
      }
      var rules = 'html,body,*{cursor:crosshair!important;}#vhtml-stage .vhtml-scene-root,#vhtml-stage .vhtml-scene-root *{pointer-events:auto!important;}';
      if (existing){
        if (existing.textContent !== rules) existing.textContent = rules;
        return;
      }
      var style = doc.createElement('style');
      style.id = 'vhtml-pick-cursor';
      style.textContent = rules;
      doc.head.appendChild(style);
    } catch (error) {}
  }

  function bindStageElementPicker(){
    try {
      var doc = stage.contentDocument;
      if (!doc) return;
      applyPickCursor();
      if (doc.__vhtmlElementPicker) return;
      doc.__vhtmlElementPicker = true;
      // Let double-click reach scene content outside pick mode (WYSIWYG drag
      // lives in the parent document, so this does not interfere with it).
      if (!doc.getElementById('vhtml-dbl-pick')){
        var dblStyle = doc.createElement('style');
        dblStyle.id = 'vhtml-dbl-pick';
        dblStyle.textContent = '.vhtml-scene-root,.vhtml-scene-root *{pointer-events:auto!important}';
        doc.head.appendChild(dblStyle);
      }
      var pickFromEvent = function(event){
        if (!event.target || event.target.nodeType !== 1) return false;
        var root = event.target.closest ? event.target.closest('.vhtml-scene-root') : null;
        if (!root || event.target === root) return false;
        var path = elementContentPath(root, event.target);
        if (!path) return false;
        var layer = root.closest('.vhtml-clip[data-clip-id]');
        state.wysiwyg = null;
        state.element = snapshotStageElement(root, event.target, path, layer ? layer.dataset.clipId : null);
        state.elementDraft = elementDraftFrom(state.element);
        state.selected = layer ? layer.dataset.clipId : state.selected;
        state.tab = 'element';
        renderTimeline();
        renderInspector();
        updateElementBox();
        updateElementHover(null);
        return true;
      };
      doc.addEventListener('click', function(event){
        if (!state.pickElement) return;
        event.preventDefault();
        event.stopPropagation();
        if (pickFromEvent(event)) return;
        toast('Pick a content element inside the Scene', true);
      }, true);
      // Double-click any text on the stage to edit it in place (CapCut-style).
      doc.addEventListener('dblclick', function(event){
        if (state.pickElement) return;
        if (!event.target || event.target.nodeType !== 1) return;
        if (event.target.closest('.vhtml-clip') && !event.target.closest('.vhtml-scene-root')) return;
        if (pickFromEvent(event)){
          event.preventDefault();
          event.stopPropagation();
          setPickMode(false);
          toast(t('Editing element — apply changes in the Element tab'));
        }
      }, true);
      doc.addEventListener('pointermove', function(event){
        if (!state.pickElement || !event.target || event.target.nodeType !== 1){ updateElementHover(null); return; }
        var root = event.target.closest ? event.target.closest('.vhtml-scene-root') : null;
        if (!root || event.target === root){ updateElementHover(null); return; }
        updateElementHover(event.target);
      }, true);
      doc.addEventListener('pointerleave', function(){ updateElementHover(null); }, true);
    } catch (error) {}
  }

  function updateElementBox(){
    if (!state.element || state.playing || !state.frameReady){
      elementBox.style.display = 'none';
      return;
    }
    var target = resolveStageElement(state.element);
    if (!target){
      elementBox.style.display = 'none';
      return;
    }
    var rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1){
      elementBox.style.display = 'none';
      return;
    }
    var iframeRect = stage.getBoundingClientRect();
    var shellRect = stageOverlay.getBoundingClientRect();
    var scale = iframeRect.width / state.model.width;
    var left = iframeRect.left - shellRect.left + rect.left * scale;
    var top = iframeRect.top - shellRect.top + rect.top * scale;
    var width = rect.width * scale;
    var height = rect.height * scale;
    if (left < 0){ width += left; left = 0; }
    if (top < 0){ height += top; top = 0; }
    if (left + width > shellRect.width) width = shellRect.width - left;
    if (top + height > shellRect.height) height = shellRect.height - top;
    elementBox.style.left = left + 'px';
    elementBox.style.top = top + 'px';
    elementBox.style.width = Math.max(4, width) + 'px';
    elementBox.style.height = Math.max(4, height) + 'px';
    elementBox.querySelector('.element-label').textContent = elementDisplay(state.element);
    elementBox.style.display = 'block';
  }

  function elementShortLabel(target){
    var name = '<' + (target.tagName || '').toLowerCase();
    if (target.id) name += '#' + target.id;
    if (target.classList && target.classList.length) name += '.' + Array.prototype.slice.call(target.classList, 0, 2).join('.');
    return name + '>';
  }

  function updateElementHover(target){    if (!state.pickElement || !target || state.playing || !state.frameReady){
      elementHover.style.display = 'none';
      return;
    }
    var shellRect = stageOverlay.getBoundingClientRect();
    var iframeRect = stage.getBoundingClientRect();
    var rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1){ elementHover.style.display = 'none'; return; }
    var scale = iframeRect.width / state.model.width;
    elementHover.style.left = (iframeRect.left - shellRect.left + rect.left * scale) + 'px';
    elementHover.style.top = (iframeRect.top - shellRect.top + rect.top * scale) + 'px';
    elementHover.style.width = (rect.width * scale) + 'px';
    elementHover.style.height = (rect.height * scale) + 'px';
    elementHover.querySelector('span').textContent = elementShortLabel(target);
    elementHover.style.display = 'block';
  }

  function clearElementSelection(){
    state.element = null;
    state.elementDraft = null;
    elementBox.style.display = 'none';
    elementHover.style.display = 'none';
  }

  function refreshElementComputed(){
    if (!state.element) return;
    var target = resolveStageElement(state.element);
    if (!target) return;
    state.element.computed = elementComputed(target);
    state.element.html = target.innerHTML || state.element.html;
    if (state.tab === 'element') renderInspector();
  }

  // ---------- effects / transitions library (CapCut-style palette) ----------

  function effectDragPayload(kind, type){
    return JSON.stringify({ kind: kind, type: type });
  }

  function makeLibraryChip(kind, type, label){
    var chip = document.createElement('div');
    chip.className = 'lib-chip';
    chip.draggable = true;
    chip.textContent = label;
    chip.title = t('Drag onto a clip on the timeline, or click to apply to the selection');
    chip.addEventListener('dragstart', function(event){
      event.dataTransfer.setData('application/x-vhtml-effect', effectDragPayload(kind, type));
      event.dataTransfer.setData('text/plain', type);
      event.dataTransfer.effectAllowed = 'copy';
    });
    chip.onclick = function(){
      if (kind === 'transition'){
        addTransition();
        return;
      }
      if (kind === 'audio'){
        var primary = selectedClip();
        if (!primary || (primary.clip.kind !== 'video' && primary.clip.kind !== 'audio')){
          return toast(t('Select a video or audio clip first'), true);
        }
        addAudioEffectToClip(primary.clip, type);
        return;
      }
      applyEffectToSelection(type);
    };
    return chip;
  }

  function renderEffectsLibrary(box){
    var hint = document.createElement('div');
    hint.className = 'element-note';
    hint.textContent = t('Drag a chip onto a timeline clip (effects) or onto the overlap between two clips (transitions). Click applies to the current selection.');
    box.appendChild(hint);

    var visualTitle = document.createElement('div');
    visualTitle.className = 'section-title';
    visualTitle.textContent = t('Visual effects');
    box.appendChild(visualTitle);
    var visualGrid = document.createElement('div');
    visualGrid.className = 'lib-grid';
    Object.keys(EFFECT_CATALOG).forEach(function(type){
      visualGrid.appendChild(makeLibraryChip('effect', type, effectLabel(type)));
    });
    box.appendChild(visualGrid);

    var audioTitle = document.createElement('div');
    audioTitle.className = 'section-title';
    audioTitle.textContent = t('Audio effects');
    box.appendChild(audioTitle);
    var audioGrid = document.createElement('div');
    audioGrid.className = 'lib-grid';
    Object.keys(AUDIO_EFFECT_CATALOG).forEach(function(type){
      audioGrid.appendChild(makeLibraryChip('audio', type, effectLabel(type)));
    });
    audioGrid.appendChild(makeLibraryChip('audio', 'ducking', t('Ducking (sidechain)')));
    box.appendChild(audioGrid);

    var transitionTitle = document.createElement('div');
    transitionTitle.className = 'section-title';
    transitionTitle.textContent = t('Transitions');
    box.appendChild(transitionTitle);
    var transitionGrid = document.createElement('div');
    transitionGrid.className = 'lib-grid';
    TRANSITION_CATALOG.forEach(function(type){
      transitionGrid.appendChild(makeLibraryChip('transition', type, transitionLabel(type)));
    });
    box.appendChild(transitionGrid);
    box.appendChild(htmlNode('<div class="hint">' + t('Transitions need two overlapping clips; the drop lands inside their overlap window with a 0.4s (clamped) duration.') + '</div>'));

    var animationTitle = document.createElement('div');
    animationTitle.className = 'section-title';
    animationTitle.textContent = t('Animation presets (动画预设)');
    box.appendChild(animationTitle);
    renderAnimationLibrary(box);
  }

  function renderAssets(box){
    var toolbar = document.createElement('div');
    toolbar.className = 'asset-toolbar';
    var summary = state.assetSummary || {assets:state.assets.length, missing:0, unusedAssets:0};
    toolbar.innerHTML = '<span class="hint">' + summary.assets + ' assets · ' + summary.missing + ' missing · ' + summary.unusedAssets + ' unused</span><span class="grow"></span>';
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('Search assets…');
    search.value = state.assetSearch || '';
    search.title = t('Filter the media pool by name or kind');
    search.style.maxWidth = '150px';
    search.addEventListener('input', function(){
      state.assetSearch = search.value;
      renderInspector();
    });
    toolbar.appendChild(search);
    var importBtn = document.createElement('button');
    importBtn.textContent = '＋ Import';
    importBtn.className = 'primary';
    importBtn.onclick = function(){ el('asset-file').click(); };
    toolbar.appendChild(importBtn);
    box.appendChild(toolbar);
    if (state.replaceArmed){
      var armed = clipById(state.replaceArmed);
      var banner = document.createElement('div');
      banner.className = 'replace-banner';
      if (!armed){
        state.replaceArmed = null;
      } else {
        banner.innerHTML = '<span>' + escapeHtml(t('Replacing source of ')) + '<b>' + escapeHtml(armed.clip.label || armed.clip.id) + '</b> — ' + escapeHtml(t('click ↔ on an asset below')) + '</span>';
        var cancel = document.createElement('button');
        cancel.textContent = '✕';
        cancel.className = 'danger';
        cancel.title = t('Cancel replace');
        cancel.onclick = function(){ state.replaceArmed = null; renderInspector(); };
        banner.appendChild(cancel);
        box.appendChild(banner);
      }
    }
    if (!state.assets.length){
      box.appendChild(htmlNode('<div class="inspector-empty">No assets yet. Import images, video, audio or fonts — they are copied into the project asset layout and registered in the VHTML model.</div>'));
      return;
    }
    var grid = document.createElement('div');
    grid.className = 'asset-grid';
    var needle = (state.assetSearch || '').trim().toLowerCase();
    var visibleCount = 0;
    state.assets.forEach(function(asset){
      if (needle && (asset.id + ' ' + asset.kind).toLowerCase().indexOf(needle) < 0) return;
      visibleCount++;
      var card = document.createElement('div');
      card.className = 'asset-card' + (state.assetSelected === asset.id ? ' selected' : '') + (asset.exists === false ? ' missing' : '');
      card.draggable = true;
      card.dataset.assetId = asset.id;
      card.title = asset.id + ' · ' + asset.kind + ' · ' + asset.src;
      if (asset.exists === false){
        var relink = document.createElement('button');
        relink.className = 'relink';
        relink.textContent = '↺';
        relink.title = 'Relink missing file';
        relink.onclick = function(event){ event.stopPropagation(); relinkAssetPrompt(asset); };
        card.appendChild(relink);
      }
      var thumb = document.createElement('div');
      thumb.className = 'asset-thumb';
      if ((asset.kind === 'image' || asset.kind === 'svg') && asset.url){
        var img = document.createElement('img');
        img.src = asset.url; img.alt = ''; img.loading = 'lazy';
        img.onerror = function(){ thumb.textContent = '?'; };
        thumb.appendChild(img);
      } else {
        thumb.textContent = asset.kind === 'audio' ? '♪' : asset.kind === 'video' ? '▶' : asset.kind === 'font' ? 'Aa' : '◈';
      }
      var meta = document.createElement('div');
      meta.className = 'asset-meta';
      meta.innerHTML = '<b>' + escapeHtml(asset.id) + '</b><small>' + asset.kind + (asset.duration ? ' · ' + Number(asset.duration.num / asset.duration.den).toFixed(2) + 's' : '') + (asset.exists === false ? ' · missing' : (asset.used ? '' : ' · unused')) + '</small>';
      var add = document.createElement('button');
      add.className = 'add';
      add.textContent = '+';
      add.title = 'Add to timeline at playhead';
      add.onclick = function(event){ event.stopPropagation(); addAssetToTimeline(asset.id); };
      card.appendChild(thumb); card.appendChild(meta); card.appendChild(add);
      if (state.replaceArmed && asset.exists !== false && replaceTypeCompatible(clipById(state.replaceArmed), asset)){
        var swap = document.createElement('button');
        swap.className = 'add swap';
        swap.textContent = '↔';
        swap.title = t('Replace the armed clip source with this asset (timing kept)');
        swap.onclick = function(event){
          event.stopPropagation();
          var target = clipById(state.replaceArmed);
          if (!target) return;
          edit([{ op:'clip.replace', clipId:target.clip.id, ref:asset.id, keepTiming:'in-out' }])
            .then(function(){
              toast(t('Source replaced — timing kept'));
              state.replaceArmed = null;
              renderInspector();
            })
            .catch(function(){});
        };
        card.appendChild(swap);
      }
      card.onclick = function(){ state.assetSelected = asset.id; renderInspector(); };
      card.addEventListener('dragstart', function(event){
        event.dataTransfer.setData('application/x-vhtml-asset', asset.id);
        event.dataTransfer.setData('text/plain', asset.id);
        event.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(card);
    });
    box.appendChild(grid);
    if (needle && !visibleCount){
      box.appendChild(htmlNode('<div class="inspector-empty">' + escapeHtml(t('No assets match the search.')) + '</div>'));
    }
    box.appendChild(htmlNode('<div class="hint">Drag an asset onto a compatible lane, or press + to add it at the playhead. Images and SVG default to 3s; video/audio use their probed duration.</div>'));
  }

  function shotField(label, value, onChange, options){
    options = options || {};
    var wrap = document.createElement('label');
    if (options.wide) wrap.className = 'wide';
    wrap.textContent = label;
    var control;
    if (options.textarea){
      control = document.createElement('textarea');
    } else if (options.select){
      control = document.createElement('select');
      options.select.forEach(function(option){
        var node = document.createElement('option');
        node.value = option.value; node.textContent = option.label;
        control.appendChild(node);
      });
      control.value = value || '';
    } else {
      control = document.createElement('input');
      control.type = options.number ? 'number' : 'text';
      if (options.number){ control.step = '0.1'; control.min = '0'; }
    }
    if (!options.select) control.value = value == null ? '' : String(value);
    control.addEventListener('change', function(){ onChange(control.value); });
    wrap.appendChild(control);
    return wrap;
  }

  function shotAssetUrl(shot){
    var assets = state.assets || [];
    var asset = shot.asset ? assets.filter(function(candidate){ return candidate.id === shot.asset; })[0] : null;
    if (!asset && shot.generation){
      asset = assets.filter(function(candidate){ return candidate.generatedBy === shot.generation; })[0];
    }
    return asset && asset.url ? asset.url : null;
  }

  function renderStoryboard(box){
    var shots = (state.model.storyboard || []).slice();
    var toolbar = document.createElement('div');
    toolbar.className = 'storyboard-toolbar';
    toolbar.innerHTML = '<span class="hint">' + shots.length + ' shots · drag to reorder</span><span class="grow"></span>';
    var add = document.createElement('button');
    add.className = 'primary';
    add.textContent = '＋ Shot';
    add.onclick = function(){
      var id = 'shot-' + Date.now().toString(36);
      edit([{ op:'storyboard.add', shot:{ id:id, title:'Shot ' + (shots.length + 1), duration:3, status:'idea', tags:[] } }])
        .catch(function(){});
    };
    toolbar.appendChild(add);
    if (shots.length){
      var applyBtn = document.createElement('button');
      applyBtn.textContent = '⤓ Apply to timeline';
      applyBtn.title = 'Materialise every shot onto the timeline in order (append, 0.25s gap)';
      applyBtn.onclick = function(){
        edit([{ op:'storyboard.apply', at:'append', gap:0.25 }])
          .then(function(){ toast(t('Storyboard applied to the timeline')); })
          .catch(function(error){ toast(error.message, true); });
      };
      toolbar.appendChild(applyBtn);
    }
    box.appendChild(toolbar);
    if (!shots.length){
      var empty = document.createElement('div');
      empty.className = 'inspector-empty';
      empty.innerHTML = 'No storyboard shots yet. Add shots to plan framing, camera, duration and generation links. The timeline stays authoritative for playback.';
      box.appendChild(empty);
      return;
    }
    var generationOptions = [{ value:'', label:'(none)' }].concat((state.model.generations || []).map(function(task){
      return { value:task.id, label:task.id + ' · ' + task.kind };
    }));
    var sceneOptions = [{ value:'', label:'(none)' }].concat((state.model.scenes || []).map(function(scene){
      return { value:scene.id, label:scene.id };
    }));
    var assetOptions = [{ value:'', label:'(none)' }].concat((state.assets || []).slice(0, 80).map(function(asset){
      return { value:asset.id, label:asset.id + ' · ' + asset.kind };
    }));
    var statusOptions = ['idea','boarded','generating','ready','approved'].map(function(status){ return { value:status, label:status }; });
    var dragged = null;

    shots.forEach(function(shot, index){
      var card = document.createElement('div');
      card.className = 'shot-card';
      card.draggable = true;
      card.addEventListener('dragstart', function(event){
        dragged = shot.id;
        card.classList.add('dragging');
        event.dataTransfer.setData('application/x-vhtml-shot', shot.id);
        event.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function(){ card.classList.remove('dragging'); });
      card.addEventListener('dragover', function(event){ event.preventDefault(); card.classList.add('drop-target'); });
      card.addEventListener('dragleave', function(){ card.classList.remove('drop-target'); });
      card.addEventListener('drop', function(event){
        event.preventDefault(); card.classList.remove('drop-target');
        var id = dragged || event.dataTransfer.getData('application/x-vhtml-shot');
        if (id && id !== shot.id) edit([{ op:'storyboard.move', shotId:id, to:index }]).catch(function(){});
        dragged = null;
      });

      var head = document.createElement('div');
      head.className = 'shot-head';
      var indexBadge = document.createElement('div');
      indexBadge.className = 'shot-index';
      indexBadge.textContent = String(index + 1);
      var title = document.createElement('input');
      title.className = 'shot-title';
      title.value = shot.title || 'Untitled shot';
      title.placeholder = 'Shot title';
      title.addEventListener('change', function(){ edit([{ op:'storyboard.set', shotId:shot.id, props:{ title:title.value } }]).catch(function(){}); });
      head.appendChild(indexBadge); head.appendChild(title);
      card.appendChild(head);

      var thumb = document.createElement('div');
      thumb.className = 'shot-thumb';
      var url = shotAssetUrl(shot);
      if (url){
        var img = document.createElement('img');
        img.src = url; img.alt = '';
        thumb.appendChild(img);
      } else {
        thumb.textContent = shot.scene ? 'SCENE ' + shot.scene : (shot.generation ? 'GEN ' + shot.generation : 'NO VISUAL');
      }
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = shot.status;
      thumb.appendChild(badge);
      card.appendChild(thumb);

      var fields = document.createElement('div');
      fields.className = 'shot-fields';
      fields.appendChild(shotField('Duration (s)', shot.duration || 3, function(value){
        var parsed = parseFloat(value);
        if (isFinite(parsed) && parsed > 0) edit([{ op:'storyboard.set', shotId:shot.id, props:{ duration:parsed } }]).catch(function(){});
      }, { number:true }));
      fields.appendChild(shotField('Status', shot.status, function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ status:value } }]).catch(function(){});
      }, { select:statusOptions }));
      fields.appendChild(shotField('Scene', shot.scene || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ scene:value } }]).catch(function(){});
      }, { select:sceneOptions }));
      fields.appendChild(shotField('Generation', shot.generation || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ generation:value } }]).catch(function(){});
      }, { select:generationOptions }));
      fields.appendChild(shotField('Asset', shot.asset || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ asset:value } }]).catch(function(){});
      }, { select:assetOptions }));
      fields.appendChild(shotField('Tags', (shot.tags || []).join(', '), function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ tags:value.split(',').map(function(tag){ return tag.trim(); }).filter(Boolean) } }]).catch(function(){});
      }));
      fields.appendChild(shotField('Direction JSON', shot.direction ? JSON.stringify(shot.direction) : '', function(value){
        var direction = null;
        if (value.trim()){
          try { direction = JSON.parse(value); }
          catch (error) { toast('Direction must be valid JSON', true); return; }
        }
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ direction:direction } }]).catch(function(){});
      }, { textarea:true, wide:true }));
      fields.appendChild(shotField('Description', shot.description || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ description:value } }]).catch(function(){});
      }, { textarea:true, wide:true }));
      fields.appendChild(shotField('Prompt', shot.prompt || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ prompt:value } }]).catch(function(){});
      }, { textarea:true, wide:true }));
      fields.appendChild(shotField('Notes', shot.notes || '', function(value){
        edit([{ op:'storyboard.set', shotId:shot.id, props:{ notes:value } }]).catch(function(){});
      }, { textarea:true, wide:true }));
      card.appendChild(fields);

      var actions = document.createElement('div');
      actions.className = 'shot-actions';
      var up = document.createElement('button'); up.textContent = '↑'; up.disabled = index === 0;
      up.onclick = function(){ if (index > 0) edit([{ op:'storyboard.move', shotId:shot.id, to:index - 1 }]).catch(function(){}); };
      var down = document.createElement('button'); down.textContent = '↓'; down.disabled = index === shots.length - 1;
      down.onclick = function(){ if (index < shots.length - 1) edit([{ op:'storyboard.move', shotId:shot.id, to:index + 1 }]).catch(function(){}); };
      var duplicate = document.createElement('button'); duplicate.textContent = 'Duplicate';
      duplicate.onclick = function(){
        var copy = Object.assign({}, shot);
        delete copy.source;
        var id = 'shot-' + Date.now().toString(36);
        copy.id = id; copy.title = (shot.title || 'Shot') + ' copy'; copy.order = index + 2;
        edit([{ op:'storyboard.add', shot:copy, at:index + 1 }]).catch(function(){});
      };
      var remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Delete';
      remove.onclick = function(){ edit([{ op:'storyboard.remove', shotId:shot.id }]).catch(function(){}); };
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(duplicate); actions.appendChild(remove);
      card.appendChild(actions);
      box.appendChild(card);
    });
  }

  function renderCaptions(box){
    var add = document.createElement('button');
    add.className = 'primary';
    add.textContent = '＋ Cue at playhead';
    add.onclick = addCaptionAtPlayhead;
    box.appendChild(add);

    var importTitle = document.createElement('div');
    importTitle.className = 'section-title';
    importTitle.textContent = t('Import captions (SRT / WebVTT)');
    box.appendChild(importTitle);
    var importArea = document.createElement('textarea');
    importArea.className = 'caption-import';
    importArea.placeholder = '1\\n00:00:01,000 --> 00:00:03,500\\nHello timeline\\n\\n2\\n00:00:04,000 --> 00:00:06,000\\nSecond cue';
    importArea.rows = 5;
    box.appendChild(importArea);
    var importBtn = document.createElement('button');
    importBtn.textContent = t('⤓ Import cues');
    importBtn.title = t('Parse SRT, WebVTT or cue JSON and add every cue to the caption lane at its original timestamps');
    importBtn.onclick = function(){
      var text = importArea.value;
      if (!text.trim()) return toast(t('Paste SRT / WebVTT text first'), true);
      importBtn.disabled = true;
      api('/api/captions/import', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ text:text }) })
        .then(function(body){
          if (!body.ok){
            toast(body.error || body.message || 'Import failed', true);
            return;
          }
          toast(t('Imported ') + body.added + t(' cue(s)'));
          importArea.value = '';
          return applyProjectResponse(body);
        })
        .catch(function(error){ toast(error.message, true); })
        .then(function(){ importBtn.disabled = false; });
    };
    box.appendChild(importBtn);
    box.appendChild(htmlNode('<div class="hint">' + t('Cues land on the caption lane at their original timestamps; a caption lane is created when missing.') + '</div>'));

    var titlesTitle = document.createElement('div');
    titlesTitle.className = 'section-title';
    titlesTitle.textContent = t('Title templates');
    box.appendChild(titlesTitle);
    var titleRow = document.createElement('div');
    titleRow.className = 'btn-row';
    TITLE_PRESETS.forEach(function(preset){
      var presetBtn = document.createElement('button');
      presetBtn.textContent = t(preset.label);
      presetBtn.title = t(preset.hint);
      presetBtn.onclick = function(){ addTitleFromPreset(preset); };
      titleRow.appendChild(presetBtn);
    });
    box.appendChild(titleRow);
    box.appendChild(htmlNode('<div class="hint">' + t('Titles are caption clips with per-cue styles; edit their text and timing in Properties after adding.') + '</div>'));

    var styleLane = captionLane();
    var styleTitle = document.createElement('div');
    styleTitle.className = 'section-title';
    styleTitle.textContent = 'Caption style';
    box.appendChild(styleTitle);
    if (!styleLane){
      box.appendChild(htmlNode('<div class="element-note">Add a caption lane (＋ Lane… → Caption lane) to style all cues on it. Per-cue styling overrides these defaults.</div>'));
    } else {
      var current = parseCaptionStyle(styleLane.captionStyle);
      var grid = document.createElement('div');
      grid.className = 'caption-style-grid';
      var sizeField = document.createElement('div');
      sizeField.className = 'field';
      sizeField.innerHTML = '<label>Font size (px)</label>';
      var size = document.createElement('input');
      size.id = 'cap-size';
      size.type = 'text';
      size.value = current.fontSize;
      sizeField.appendChild(size);
      var colorField = document.createElement('div');
      colorField.className = 'field';
      colorField.innerHTML = '<label>Text color</label>';
      var color = document.createElement('input');
      color.id = 'cap-color';
      color.type = 'text';
      color.value = current.color;
      colorField.appendChild(color);
      var bgField = document.createElement('div');
      bgField.className = 'field';
      bgField.innerHTML = '<label>Background (empty = none)</label>';
      var bg = document.createElement('input');
      bg.id = 'cap-bg';
      bg.type = 'text';
      bg.placeholder = 'rgba(0,0,0,.55)';
      bg.value = current.background;
      bgField.appendChild(bg);
      var posField = document.createElement('div');
      posField.className = 'field';
      posField.innerHTML = '<label>Bottom offset (px)</label>';
      var pos = document.createElement('input');
      pos.id = 'cap-pos';
      pos.type = 'text';
      pos.placeholder = '60';
      pos.value = current.position;
      posField.appendChild(pos);
      grid.appendChild(sizeField); grid.appendChild(colorField);
      grid.appendChild(bgField); grid.appendChild(posField);
      box.appendChild(grid);
      var saveStyle = document.createElement('button');
      saveStyle.className = 'primary';
      saveStyle.textContent = 'Save caption style';
      saveStyle.onclick = saveCaptionStyle;
      box.appendChild(saveStyle);
    }
    var cues = [];
    state.model.lanes.forEach(function(lane){
      lane.clips.forEach(function(clip){ if (clip.kind === 'caption') cues.push({ lane:lane, clip:clip }); });
    });
    cues.sort(function(a,b){ return a.clip.start - b.clip.start; });
    if (!cues.length){
      box.appendChild(htmlNode('<div class="inspector-empty">No caption cues yet. Add one at the playhead, then edit its text and timing here.</div>'));
      return;
    }
    cues.forEach(function(entry){
      var row = document.createElement('div');
      row.className = 'caption-row';
      row.innerHTML = '<b>' + fmtTime(entry.clip.start).slice(3) + '</b><span>' + escapeHtml(entry.clip.text || '(empty)') + '</span>';
      row.onclick = function(){ clearElementSelection(); state.selected = entry.clip.id; state.tab = 'props'; renderTimeline(); renderInspector(); updateSelectionBox(); };
      box.appendChild(row);
    });
  }

  function htmlNode(html){
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    return wrap.firstElementChild;
  }

  function numberInput(value, step, onChange){
    var input = document.createElement('input');
    input.type = 'number'; input.step = String(step); input.value = String(Number(value).toFixed(4));
    input.addEventListener('change', function(){ var parsed = parseFloat(input.value); if (isFinite(parsed)) onChange(parsed); });
    return input;
  }

  function selectField(label, value, options, onChange){
    var wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = '<label>' + label + '</label>';
    var select = document.createElement('select');
    options.forEach(function(option){
      var node = document.createElement('option');
      node.value = option; node.textContent = option; node.selected = option === value;
      select.appendChild(node);
    });
    select.addEventListener('change', function(){ onChange(select.value); });
    wrap.appendChild(select);
    return wrap;
  }

  function setTransform(clip, key, value){
    var transform = Object.assign({}, clip.transform);
    transform[key] = value;
    edit([{ op:'clip.set', clipId:clip.id, props:{ transform:transform } }]);
  }

  var effectIdCounter = 0;
  function addEffect(clip, type){
    var catalog = EFFECT_CATALOG[type];
    var effect = {
      id: 'fx-' + type + '-' + Date.now().toString(36) + '-' + (++effectIdCounter).toString(36),
      type: type,
      params: catalog ? JSON.parse(JSON.stringify(catalog.params)) : {},
      enabled: true
    };
    edit([{ op:'effect.add', clipId:clip.id, effect:effect }])
      .then(function(){ toast(effectLabel(type) + t(' effect added')); })
      .catch(function(){});
  }

  function field(label, type, value, step, onChange){
    var wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = '<label>' + label + '</label>';
    var input = document.createElement('input');
    input.type = type; input.step = String(step); input.value = String(Number(value).toFixed(4));
    input.addEventListener('change', function(){ onChange(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function updatePlayhead(){
    if (!state.model) return;
    var rate = pps();
    playhead.style.left = (160 + state.time * rate) + 'px';
    playhead.style.height = (28 + state.model.lanes.length * 45) + 'px';
    el('time').textContent = fmtTime(state.time);
    el('framebadge').textContent = 'frame ' + Math.round(state.time * state.model.fps);
  }

  function clipEdges(excludeId){
    var edges = [0, state.model.duration, state.time];
    state.model.lanes.forEach(function(lane){
      lane.clips.forEach(function(clip){
        if (clip.id === excludeId) return;
        edges.push(clip.start);
        edges.push(clip.start + clip.duration);
      });
    });
    return edges;
  }

  function magnetTime(seconds, excludeId, bypass){
    var frameTime = snap(seconds);
    if (!state.snapping || bypass) return frameTime;
    var threshold = 10 / pps();
    var best = null;
    var bestDelta = threshold;
    clipEdges(excludeId).forEach(function(edge){
      var delta = Math.abs(edge - seconds);
      if (delta < bestDelta){ bestDelta = delta; best = edge; }
    });
    if (best === null) { showSnapGuide(null); return frameTime; }
    showSnapGuide(best);
    return snap(best);
  }

  function magnetMove(start, duration, excludeId, bypass){
    var frameStart = snap(start);
    if (!state.snapping || bypass){ showSnapGuide(null); return { start:frameStart, edge:null }; }
    var threshold = 10 / pps();
    var bestStart = null, bestEnd = null, bestStartDelta = threshold, bestEndDelta = threshold;
    clipEdges(excludeId).forEach(function(edge){
      var ds = Math.abs(edge - start), de = Math.abs(edge - (start + duration));
      if (ds < bestStartDelta){ bestStartDelta = ds; bestStart = edge; }
      if (de < bestEndDelta){ bestEndDelta = de; bestEnd = edge; }
    });
    if (bestStart !== null && (bestEnd === null || bestStartDelta <= bestEndDelta)){
      showSnapGuide(bestStart);
      return { start:Math.max(0, snap(bestStart)), edge:bestStart };
    }
    if (bestEnd !== null){
      showSnapGuide(bestEnd);
      return { start:Math.max(0, snap(bestEnd - duration)), edge:bestEnd };
    }
    showSnapGuide(null);
    return { start:frameStart, edge:null };
  }

  function showSnapGuide(time){
    if (time === null || time === undefined){ snapGuide.style.display = 'none'; return; }
    snapGuide.style.left = (160 + time * pps()) + 'px';
    snapGuide.style.display = 'block';
  }

  // ---------- waveforms & posters ----------

  function loadPeaks(assetId, done){
    if (state.peaks[assetId]){ done(state.peaks[assetId]); return; }
    api('/api/media/peaks?asset=' + encodeURIComponent(assetId)).then(function(body){
      state.peaks[assetId] = body;
      done(body);
    }).catch(function(){
      state.peaks[assetId] = { buckets: [], durationSeconds: 0 };
      done(state.peaks[assetId]);
    });
  }

  function drawWaveforms(){
    var canvases = tracksEl.querySelectorAll('canvas.wave');
    for (var i=0;i<canvases.length;i++){
      (function(canvas){
        var assetId = canvas.dataset.peaksFor;
        var found = clipById(canvas.dataset.clipId);
        if (!assetId || !found) return;
        loadPeaks(assetId, function(peaks){ drawWaveCanvas(canvas, found.clip, peaks); });
      })(canvases[i]);
    }
  }

  function drawWaveCanvas(canvas, clip, peaks){
    var rate = pps();
    var width = Math.max(2, Math.round(clip.duration * rate));
    var height = Math.max(18, Math.min(72, (canvas.parentElement ? canvas.parentElement.offsetHeight - 16 : 18)));
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)){
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    var buckets = peaks && peaks.buckets;
    if (!buckets || !buckets.length) return;
    var total = (peaks.durationSeconds || buckets.length) || 1;
    var sourceStart = clip.sourceIn || 0;
    var speed = clip.speed || 1;
    ctx.fillStyle = 'rgba(232,246,255,.7)';
    for (var x = 0; x < width; x++){
      var sourceTime = sourceStart + (x / rate) * speed;
      var bucket = Math.floor(sourceTime / total * buckets.length);
      if (bucket < 0 || bucket >= buckets.length) continue;
      var h = Math.max(1, buckets[bucket] * (height - 2));
      ctx.fillRect(x, (height - h) / 2, 1, h);
    }
  }

  // ---------- context menu ----------

  function closeContextMenu(){ el('ctx-menu').style.display = 'none'; }

  function ctxItem(menu, label, key, onClick, disabled){
    var item = document.createElement('div');
    item.className = 'ctx-item' + (disabled ? ' disabled' : '');
    item.innerHTML = '<span>' + escapeHtml(label) + '</span>' + (key ? '<span class="key">' + escapeHtml(key) + '</span>' : '');
    if (!disabled && onClick) item.onclick = function(){ closeContextMenu(); onClick(); };
    menu.appendChild(item);
    return item;
  }
  function ctxSep(menu){ menu.appendChild(htmlNode('<div class="ctx-sep"></div>')); }
  function ctxTitle(menu, text){
    var title = document.createElement('div');
    title.className = 'ctx-title';
    title.textContent = text;
    menu.appendChild(title);
  }

  function timeFromClientX(clientX){
    var inner = el('timeline-inner').getBoundingClientRect();
    return Math.max(0, (clientX - inner.left - 160) / pps());
  }

  function openContextMenu(event, target){
    var menu = el('ctx-menu');
    menu.innerHTML = '';
    state.ctxFor = target;
    var ids = selectionIds();
    if (target.type === 'clip'){
      var clip = target.clip;
      var lane = target.lane;
      var selected = selectionIds().indexOf(clip.id) >= 0 ? ids : [clip.id];
      var locked = Boolean(lane && lane.locked);
      ctxTitle(menu, clip.label || clip.id);
      ctxItem(menu, t('Split at playhead'), 'S', function(){ splitClipIds(selected); }, locked);
      ctxItem(menu, t('Duplicate'), 'Ctrl+D', function(){ duplicateSelection(selected); }, locked);
      ctxSep(menu);
      ctxItem(menu, t('Copy'), 'Ctrl+C', function(){ copySelected(false); });
      ctxItem(menu, t('Cut'), 'Ctrl+X', function(){ copySelected(true); }, locked);
      ctxItem(menu, t('Paste at playhead'), 'Ctrl+V', function(){ pasteClipboard(); });
      ctxSep(menu);
      ctxItem(menu, t('Copy attributes'), '', function(){
        state.attributeClipboard = copyAttributesOf(clip);
        toast(t('Attributes copied — select clip(s) and paste'));
      }, selected.length !== 1);
      ctxItem(menu, t('Paste attributes'), '', function(){ pasteAttributesTo(selected); }, !state.attributeClipboard || locked);
      if (selected.length >= 2){
        ctxItem(menu, t('Link clips'), '', function(){
          edit([{ op:'clip.link', clipIds:selected }]).then(function(){ toast(t('Clips linked — they move together')); }).catch(function(){});
        }, locked);
      }
      if (linkedPartnerIds({ clip: clip, lane: lane }).length){
        ctxItem(menu, t('Unlink'), '', function(){
          edit([{ op:'clip.unlink', clipId:clip.id }]).then(function(){ toast(t('Clip unlinked')); }).catch(function(){});
        }, locked);
      }
      ctxSep(menu);
      ctxItem(menu, t('Speed 0.25×'), '', function(){ setClipSpeed(selected, 0.25); }, locked);
      ctxItem(menu, t('Speed 0.5×'), '', function(){ setClipSpeed(selected, 0.5); }, locked);
      ctxItem(menu, t('Speed 1×'), '', function(){ setClipSpeed(selected, 1); }, locked);
      ctxItem(menu, t('Speed 2×'), '', function(){ setClipSpeed(selected, 2); }, locked);
      ctxItem(menu, t('Speed 4×'), '', function(){ setClipSpeed(selected, 4); }, locked);
      if (clip.kind === 'video' || clip.kind === 'audio'){
        ctxSep(menu);
        ctxItem(menu, t('Speed ramp: slow–fast–slow'), '', function(){ applySpeedRamp(clip, 'slowfast'); }, selected.length !== 1);
        ctxItem(menu, t('Speed ramp: fast–slow–fast'), '', function(){ applySpeedRamp(clip, 'fastslow'); }, selected.length !== 1);
        if (clip.hasTimeRemap) ctxItem(menu, t('Clear speed ramp'), '', function(){ edit([{ op:'clip.timeremap.clear', clipId:clip.id }]).catch(function(){}); });
        ctxItem(menu, t('Freeze frame at playhead'), '', function(){ freezeAtPlayhead(clip); }, locked);
        ctxItem(menu, clip.reverse ? t('Restore forward playback') : t('Reverse clip (倒放)'), '', function(){ toggleClipReverse(selected); }, locked);
      }
      if (clip.kind === 'video' || clip.kind === 'scene'){
        ctxSep(menu);
        ctxTitle(menu, t('Speed curve (曲线变速)'));
        SPEED_CURVE_PRESETS.forEach(function(preset){
          ctxItem(menu, t(preset.label), '', function(){ applySpeedCurvePreset(clip, preset); }, locked || selected.length !== 1);
        });
      }
      if (clip.kind === 'video' || clip.kind === 'audio'){
        ctxSep(menu);
        ctxItem(menu, t('Slip source (Ctrl+drag)'), '', function(){
          toast(t('Hold Ctrl and drag the clip body to slip its source window'));
        }, clip.hasTimeRemap || Boolean(clip.freeze));
        if (clip.kind === 'video' || clip.kind === 'audio'){
          ctxItem(menu, t('Replace source from Assets…'), '', function(){
            state.replaceArmed = clip.id;
            state.tab = 'assets';
            renderInspector();
            toast(t('Pick an asset in the Assets tab to replace the source'));
          }, selected.length !== 1 || locked);
        }
        if (clip.kind === 'video'){
          ctxItem(menu, t('Detach audio'), '', function(){ edit([{ op:'clip.detachAudio', clipId:clip.id }]).then(function(){ toast(t('Audio detached to its own lane')); }).catch(function(){}); }, selected.length !== 1 || locked);
        }
      }
      ctxSep(menu);
      ctxItem(menu, clip.enabled === false ? 'Enable clip' : 'Disable clip', '', function(){ toggleClipEnabled(selected); }, locked);
      if (clip.kind === 'video' || clip.kind === 'audio'){
        ctxItem(menu, clip.muted ? 'Unmute clip' : 'Mute clip', '', function(){ toggleClipMuted(selected); }, locked);
      }
      if (selected.length === 1){
        ctxSep(menu);
        ctxTitle(menu, t('Color tag'));
        COLOR_TAGS.forEach(function(swatch){
          var item = ctxItem(menu, t(swatch.label), '', function(){
            var meta = Object.assign({}, clip.metadata || {}, { clipColor: swatch.color });
            edit([{ op:'clip.set', clipId:clip.id, props:{ metadata: meta } }]).catch(function(){});
          }, locked);
          item.style.borderLeft = '3px solid ' + swatch.color;
        });
        if (clip.metadata && clip.metadata.clipColor){
          ctxItem(menu, t('Clear color tag'), '', function(){
            var meta = Object.assign({}, clip.metadata || {});
            delete meta.clipColor;
            edit([{ op:'clip.set', clipId:clip.id, props:{ metadata: meta } }]).catch(function(){});
          }, locked);
        }
      }
      if (isVisualClip(clip)){
        ctxSep(menu);
        ctxTitle(menu, 'Layer');
        ctxItem(menu, t('Flip horizontally'), '', function(){ flipSelected(selected, 'h'); }, locked);
        ctxItem(menu, t('Flip vertically'), '', function(){ flipSelected(selected, 'v'); }, locked);
        ctxItem(menu, t('Rotate +90°'), '', function(){ rotateSelected(selected, 90); }, locked);
        ctxItem(menu, t('Rotate −90°'), '', function(){ rotateSelected(selected, -90); }, locked);
        ctxItem(menu, t('Reset transform'), '', function(){
          var ops = layoutVisualTargets(selected).map(function(entry){
            return { op:'clip.set', clipId:entry.clip.id, props:{ transform:{ x:0, y:0, scaleX:1, scaleY:1, rotate:0, anchorX:0.5, anchorY:0.5 } } };
          });
          if (ops.length) edit(ops).then(function(){ toast(t('Transform reset')); }).catch(function(){});
        }, locked);
        ctxItem(menu, t('Bring forward'), '', function(){ layerOp(selected, 'up'); }, locked);
        ctxItem(menu, t('Send backward'), '', function(){ layerOp(selected, 'down'); }, locked);
        ctxItem(menu, t('Bring to front'), '', function(){ layerOp(selected, 'top'); }, locked);
        ctxItem(menu, t('Send to back'), '', function(){ layerOp(selected, 'bottom'); }, locked);
        ctxItem(menu, maskEffectsOf(clip).length ? t('Edit mask — open Properties') : t('Add mask (circle)'), '', function(){
          if (maskEffectsOf(clip).length){
            state.tab = 'props';
            renderInspector();
          } else {
            addMaskToClip(clip, 'circle');
          }
        }, locked || selected.length !== 1);
        ctxSep(menu);
        ctxTitle(menu, t('Layout · 画面布局'));
        var layoutCount = layoutVisualTargets(selected).length;
        ctxItem(menu, t('Full frame (reset)'), '', function(){ applyLayoutPreset(selected, 'full'); }, locked);
        ctxItem(menu, t('Picture-in-picture · bottom-right'), '', function(){ applyLayoutPreset(selected, 'pip'); }, locked);
        ctxItem(menu, t('Split left/right') + ' (2)', '', function(){ applyLayoutPreset(selected, 'split-lr'); }, locked || layoutCount < 2);
        ctxItem(menu, t('Split top/bottom') + ' (2)', '', function(){ applyLayoutPreset(selected, 'split-tb'); }, locked || layoutCount < 2);
        ctxItem(menu, t('Three panels') + ' (3)', '', function(){ applyLayoutPreset(selected, 'thirds'); }, locked || layoutCount < 3);
        ctxItem(menu, t('Grid 2×2') + ' (4)', '', function(){ applyLayoutPreset(selected, 'grid4'); }, locked || layoutCount < 4);
        ctxSep(menu);
        ctxItem(menu, t('Align selection to playhead'), '', alignSelectionToPlayhead, locked);
      }
      if (clip.kind === 'timeline'){
        ctxSep(menu);
        ctxItem(menu, t('Enter compound clip (进入编辑)'), '', function(){ enterCompoundClip(clip); }, selected.length !== 1 || !compoundRefOf(clip));
        ctxItem(menu, t('Unnest compound clip'), '', function(){
          edit([{ op:'timeline.unnest', clipId:clip.id }]).then(function(){ toast(t('Compound clip flattened')); }).catch(function(){});
        }, selected.length !== 1 || locked);
      } else {
        ctxSep(menu);
        ctxItem(menu, t('Create compound clip (') + selected.length + ')', '', function(){
          edit([{ op:'timeline.nest', clipIds:selected }]).then(function(){ toast(t('Compound clip created')); }).catch(function(){});
        }, locked);
      }
      ctxSep(menu);
      ctxItem(menu, t('Ripple delete'), 'Shift+Del', function(){ deleteSelection(selected, true); }, locked);
      ctxItem(menu, t('Delete'), 'Del', function(){ deleteSelection(selected, false); }, locked);
    } else if (target.type === 'marker'){
      ctxTitle(menu, target.marker.name || 'Marker');
      ctxItem(menu, t('Rename marker'), '', function(){
        var name = window.prompt('Marker name', target.marker.name || '');
        if (name === null) return;
        edit([
          { op:'marker.remove', timelineId:markerTimelineId(), markerId:target.marker.id },
          { op:'marker.add', timelineId:markerTimelineId(), marker:{ id:target.marker.id, time:target.marker.time, name:name, type:target.marker.type } },
        ]).catch(function(){});
      });
      ctxItem(menu, t('Delete marker'), '', function(){
        edit([{ op:'marker.remove', timelineId:markerTimelineId(), markerId:target.marker.id }]).catch(function(){});
      });
    } else if (target.type === 'timeline'){
      var at = magnetTime(timeFromClientX(event.clientX), null, event.shiftKey);
      var marker = target.marker || markersAt(timeFromClientX(event.clientX));
      if (marker){
        ctxTitle(menu, marker.name || 'Marker');
        ctxItem(menu, t('Rename marker'), '', function(){
          var name = window.prompt('Marker name', marker.name || '');
          if (name === null) return;
          edit([
            { op:'marker.remove', timelineId:markerTimelineId(), markerId:marker.id },
            { op:'marker.add', timelineId:markerTimelineId(), marker:{ id:marker.id, time:marker.time, name:name, type:marker.type } },
          ]).catch(function(){});
        });
        ctxItem(menu, t('Delete marker'), '', function(){ edit([{ op:'marker.remove', timelineId:markerTimelineId(), markerId:marker.id }]).catch(function(){}); });
        ctxSep(menu);
      }
      ctxItem(menu, t('Add marker here'), 'M', function(){ addMarker(at); });
      ctxItem(menu, t('Split all lanes at playhead'), '', splitAllLanesAtPlayhead);
      ctxSep(menu);
      ctxItem(menu, t('Set In point here'), 'I', function(){ state.inPoint = at; renderRangeBand(); });
      ctxItem(menu, t('Set Out point here'), 'O', function(){ state.outPoint = at; renderRangeBand(); });
      ctxItem(menu, t('Clear In & Out'), '', function(){ state.inPoint = null; state.outPoint = null; renderRangeBand(); });
      if (state.inPoint !== null && state.outPoint !== null && state.outPoint > state.inPoint){
        ctxItem(menu, t('Ripple cut In→Out (all lanes)'), '', function(){
          var laneIds = state.model.lanes.filter(function(lane){ return !lane.locked; }).map(function(lane){ return lane.id; });
          edit([{ op:'timeline.rippleCut', trackIds:laneIds, start:state.inPoint, end:state.outPoint }])
            .then(function(){ toast(t('Range ripple-cut from every lane')); })
            .catch(function(error){ toast(error.message, true); });
        });
        ctxItem(menu, t('Lift In→Out (keep gaps)'), '', liftInOut);
      }
      ctxSep(menu);
      ctxItem(menu, t('Paste here'), 'Ctrl+V', function(){ pasteClipboard(at); });
    } else if (target.type === 'lane'){
      var lane2 = target.lane;
      ctxTitle(menu, lane2.name || lane2.id);
      ctxItem(menu, t('Select all clips on this lane'), '', function(){
        if (!lane2.clips.length) return toast(t('This lane has no clips'), true);
        state.selection = lane2.clips.map(function(clip){ return clip.id; });
        state.selected = state.selection[state.selection.length - 1];
        renderTimeline(); renderInspector();
        toast(t('Selected ') + state.selection.length + t(' clip(s)'));
      }, !lane2.clips.length);
      ctxItem(menu, t('Rename lane'), '', function(){
        var name = window.prompt('Lane name', lane2.name || lane2.id);
        if (name === null || !name.trim()) return;
        edit([{ op:'track.set', trackId:lane2.id, props:{ name:name.trim() } }]).catch(function(){});
      });
      ctxItem(menu, lane2.muted ? 'Unmute lane' : 'Mute lane', '', function(){ edit([{ op:'track.set', trackId:lane2.id, props:{ muted:!lane2.muted } }]).catch(function(){}); });
      ctxItem(menu, lane2.enabled === false ? 'Show lane' : 'Hide lane', '', function(){ edit([{ op:'track.set', trackId:lane2.id, props:{ enabled:lane2.enabled === false } }]).catch(function(){}); });
      ctxItem(menu, lane2.locked ? 'Unlock lane' : 'Lock lane', '', function(){ edit([{ op:'track.set', trackId:lane2.id, props:{ locked:!lane2.locked } }]).catch(function(){}); });
      if (lane2.type === 'audio'){
        ctxSep(menu);
        ctxItem(menu, t('Open in mixer…') + t(' (vol ') + (lane2.volume !== undefined ? lane2.volume : 1) + ')', '', function(){ openMixer(lane2.id); });
        ctxItem(menu, t('Lane pan — open mixer…'), '', function(){ openMixer(lane2.id); });
      }
      ctxSep(menu);
      ctxItem(menu, t('Add ') + lane2.type + ' lane above', '', function(){ addLane(lane2.type, lane2.order); });
      ctxItem(menu, t('Add ') + lane2.type + ' lane below', '', function(){ addLane(lane2.type, lane2.order + 1); });
      ctxSep(menu);
      ctxItem(menu, t('Delete lane'), '', function(){
        if (lane2.clips.length) return toast('Remove the clips on this lane first', true);
        edit([{ op:'track.remove', trackId:lane2.id }]).catch(function(){});
      });
    } else if (target.type === 'transition'){
      ctxTitle(menu, target.transition.type + ' · ' + target.transition.duration.toFixed(2) + 's');
      ctxItem(menu, t('Edit transition…'), '', function(){ openTransitionDialog(target.lane, target.transition); });
      ctxItem(menu, t('Delete transition'), '', function(){ edit([{ op:'transition.remove', transitionId:target.transition.id }]).catch(function(){}); });
    } else if (target.type === 'track-empty'){
      var lane3 = target.lane;
      var at3 = magnetTime(timeFromClientX(event.clientX), null, event.shiftKey);
      ctxItem(menu, t('Paste here'), 'Ctrl+V', function(){ pasteClipboard(at3); });
      ctxSep(menu);
      ctxItem(menu, t('Add marker here'), 'M', function(){ addMarker(at3); });
      ctxSep(menu);
      ctxTitle(menu, (lane3.name || lane3.id) + ' (empty)');
      ctxItem(menu, t('Delete lane'), '', function(){ edit([{ op:'track.remove', trackId:lane3.id }]).catch(function(){}); });
    }
    if (!menu.children.length) return;
    menu.style.display = 'block';
    var menuRect = menu.getBoundingClientRect();
    var x = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
    var y = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
    menu.style.left = Math.max(4, x) + 'px';
    menu.style.top = Math.max(4, y) + 'px';
  }

  // ---------- editing actions ----------

  function setClipSpeed(ids, speed){
    edit(ids.map(function(id){ return { op:'clip.speed', clipId:id, speed:speed }; })).catch(function(){});
  }

  // CapCut-style reverse: keeps speed and the source window, flips playback
  // direction (clip.speed's reverse flag; the runtime frame-seeks media).
  function toggleClipReverse(ids){
    var ops = [];
    ids.forEach(function(id){
      var found = clipById(id);
      if (!found) return;
      var clip = found.clip;
      if (clip.kind !== 'video' && clip.kind !== 'audio') return;
      if (found.lane.locked) return;
      ops.push({ op:'clip.speed', clipId:id, speed:clip.speed, reverse:!clip.reverse });
    });
    if (!ops.length) return toast(t('Reverse applies to video and audio clips'), true);
    edit(ops).then(function(){
      toast(ops.length > 1 ? ops.length + t(' clip(s) reversed') : t('Playback direction flipped'));
    }).catch(function(){});
  }

  function freezeAtPlayhead(clip){
    var at = snap(state.time);
    if (at < clip.start || at > clip.start + clip.duration) return toast('Move the playhead inside the clip first', true);
    edit([{ op:'clip.freeze', clipId:clip.id, sourceTime:at }]).then(function(){ toast(t('Clip frozen at the playhead')); }).catch(function(){});
  }

  function applySpeedRamp(clip, shape){
    var duration = clip.duration;
    var sourceEnd = clip.sourceIn + duration * clip.speed;
    var keyframes;
    if (shape === 'slowfast'){
      keyframes = [
        { at:0, source:clip.sourceIn },
        { at:duration / 2, source:clip.sourceIn + (sourceEnd - clip.sourceIn) * 0.18 },
        { at:duration, source:sourceEnd },
      ];
    } else {
      keyframes = [
        { at:0, source:clip.sourceIn },
        { at:duration / 2, source:clip.sourceIn + (sourceEnd - clip.sourceIn) * 0.82 },
        { at:duration, source:sourceEnd },
      ];
    }
    edit([{ op:'clip.timeremap', clipId:clip.id, keyframes:keyframes, easing:'ease-in-out' }])
      .then(function(){ toast(t('Speed ramp applied')); }).catch(function(){});
  }

  function toggleClipEnabled(ids){
    var ops = [];
    ids.forEach(function(id){
      var found = clipById(id);
      if (found) ops.push({ op:'clip.set', clipId:id, props:{ enabled:found.clip.enabled === false } });
    });
    if (ops.length) edit(ops).catch(function(){});
  }

  function toggleClipMuted(ids){
    var ops = [];
    ids.forEach(function(id){
      var found = clipById(id);
      if (found && (found.clip.kind === 'video' || found.clip.kind === 'audio')){
        ops.push({ op:'clip.set', clipId:id, props:{ muted:!found.clip.muted } });
      }
    });
    if (ops.length) edit(ops).catch(function(){});
  }

  function duplicateSelection(ids){
    var list = ids && ids.length ? ids : selectionIds();
    if (!list.length) return toast(t('Select a clip to duplicate'), true);
    edit(list.map(function(id){ return { op:'clip.duplicate', clipId:id }; }))
      .then(function(){ toast('Duplicated ' + list.length + ' clip(s)'); }).catch(function(){});
  }

  function deleteSelection(ids, ripple){
    var list = ids && ids.length ? ids : selectionIds();
    if (!list.length) return toast(t('Select a clip to remove'), true);
    var ops = list.map(function(id){ return { op: ripple && list.length === 1 ? 'clip.rippleDelete' : 'clip.remove', clipId:id }; });
    edit(ops).catch(function(){});
    selectOnly(null);
    renderInspector();
  }

  function splitClipIds(ids){
    var list = ids && ids.length ? ids : selectionIds();
    if (!list.length) return toast(t('Select a clip to split'), true);
    var at = snap(state.time);
    var ops = [];
    list.forEach(function(id){
      var found = clipById(id);
      if (!found) return;
      var clip = found.clip;
      var splitAt = at;
      if (splitAt <= clip.start + 0.0001 || splitAt >= clip.start + clip.duration - 0.0001){
        splitAt = snap(clip.start + clip.duration / 2);
      }
      ops.push({ op:'clip.split', clipId:id, at:splitAt });
    });
    if (ops.length) edit(ops).catch(function(){});
  }

  function addMarker(at){
    var time = at === undefined ? snap(state.time) : at;
    var id = 'marker-' + Date.now().toString(36);
    edit([{ op:'marker.add', timelineId:markerTimelineId(), marker:{ id:id, time:time, name:'Marker', type:'marker' } }])
      .then(function(){ toast('Marker at ' + fmtTime(time)); }).catch(function(){});
  }

  function addLane(type, atOrder){
    if (!state.model) return;
    var timelineId = markerTimelineId();
    var lanes = state.model.lanes.slice().sort(function(a,b){ return a.order - b.order; });
    var maxOrder = lanes.length ? lanes[lanes.length - 1].order : 0;
    var order = atOrder === undefined ? maxOrder + 1 : Math.max(1, atOrder);
    var ops = [];
    lanes.forEach(function(lane){
      if (lane.order >= order) ops.push({ op:'track.set', trackId:lane.id, props:{ order:lane.order + 1 } });
    });
    var count = lanes.filter(function(lane){ return lane.type === type; }).length + 1;
    var label = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + count;
    ops.push({ op:'track.add', timelineId:timelineId, track:{ id:nextClientId(type + '-lane'), type:type, name:label, order:order } });
    edit(ops).then(function(){ toast(label + ' added'); }).catch(function(){});
  }

  function nextClientId(base){
    var used = {};
    state.model.lanes.forEach(function(lane){
      used[lane.id] = true;
      lane.clips.forEach(function(clip){ used[clip.id] = true; });
    });
    (state.model.markers || []).forEach(function(marker){ used[marker.id] = true; });
    var id = base;
    var counter = 2;
    while (used[id]) id = base + '-' + (counter++);
    return id;
  }

  function setInPoint(){ state.inPoint = snap(state.time); renderRangeBand(); toast('In ' + fmtTime(state.inPoint)); }
  function setOutPoint(){ state.outPoint = snap(state.time); renderRangeBand(); toast('Out ' + fmtTime(state.outPoint)); }

  // ---------- drag tooltip ----------

  function showDragTip(text, clientX, clientY){
    var tip = el('drag-tip');
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.left = Math.min(window.innerWidth - 140, clientX + 14) + 'px';
    tip.style.top = Math.max(4, clientY - 30) + 'px';
  }
  function hideDragTip(){ el('drag-tip').style.display = 'none'; }

  // Auto-scroll the timeline when a drag approaches the viewport edges
  // (CapCut/Premiere behaviour): an interval pans the view while the pointer
  // stays in the edge zone; drag deltas keep working because previews are
  // anchored to content coordinates.
  function stopAutoScroll(){
    if (state.autoScrollTimer){ clearInterval(state.autoScrollTimer); state.autoScrollTimer = null; }
    state.autoScrollDir = 0;
  }
  function ensureAutoScroll(event){
    var scroll = el('timeline-scroll');
    var rect = scroll.getBoundingClientRect();
    var edge = 48;
    var dir = 0;
    if (event.clientX < rect.left + edge) dir = -1;
    else if (event.clientX > rect.right - edge) dir = 1;
    if (state.autoScrollDir !== dir){
      stopAutoScroll();
      state.autoScrollDir = dir;
      if (dir){
        state.autoScrollTimer = setInterval(function(){
          scroll.scrollLeft += dir * 14;
        }, 30);
      }
    }
  }

  // ---------- layer ordering ----------

  function layerOp(ids, action){
    var visual = ids.map(function(id){ var found = clipById(id); return found && isVisualClip(found.clip) ? found.clip : null; }).filter(Boolean);
    if (!visual.length) return;
    var zs = [];
    state.model.lanes.forEach(function(lane){ lane.clips.forEach(function(clip){ if (isVisualClip(clip)) zs.push(clip.z || 0); }); });
    var minZ = Math.min.apply(null, zs);
    var maxZ = Math.max.apply(null, zs);
    var ops = visual.map(function(clip){
      var z = clip.z || 0;
      var next = z;
      if (action === 'up') next = Math.min(maxZ, z + 1);
      else if (action === 'down') next = Math.max(minZ, z - 1);
      else if (action === 'top') next = maxZ + 1;
      else if (action === 'bottom') next = minZ - 1;
      return { op:'clip.set', clipId:clip.id, props:{ z:next } };
    }).filter(function(op, index){ return op.props.z !== visual[index].z; });
    if (!ops.length) return;
    edit(ops).catch(function(){});
  }

  // ---------- chronological clip navigation ----------

  function selectNeighbourClip(direction){
    if (!state.model) return;
    var entries = [];
    state.model.lanes.forEach(function(lane){
      if (lane.locked) return;
      lane.clips.forEach(function(clip){ entries.push({ clip:clip, lane:lane }); });
    });
    if (!entries.length) return;
    entries.sort(function(a,b){
      var d = a.clip.start - b.clip.start;
      return d !== 0 ? d : a.lane.order - b.lane.order;
    });
    var index = -1;
    if (state.selected){
      for (var i=0;i<entries.length;i++) if (entries[i].clip.id === state.selected){ index = i; break; }
    }
    var next = entries[Math.max(0, Math.min(entries.length - 1, index + direction))];
    if (!next) return;
    selectOnly(next.clip.id);
    renderTimeline(); renderInspector(); updateSelectionBox();
  }

  function nudgeSelection(direction){
    var ids = selectionIds();
    if (!ids.length) return;
    var frame = 1 / state.model.fps;
    var ops = [];
    ids.forEach(function(id){
      var found = clipById(id);
      if (!found || found.lane.locked) return;
      ops.push({ op:'clip.move', clipId:id, start:Math.max(0, Number((found.clip.start + direction * frame).toFixed(6))) });
    });
    if (ops.length) edit(ops).catch(function(){});
  }

  function splitAllLanesAtPlayhead(){
    var at = snap(state.time);
    var ops = [];
    state.model.lanes.forEach(function(lane){
      if (lane.locked) return;
      lane.clips.forEach(function(clip){
        if (at > clip.start + 0.0001 && at < clip.start + clip.duration - 0.0001){
          ops.push({ op:'clip.split', clipId:clip.id, at:at });
        }
      });
    });
    if (!ops.length) return toast('No clip crosses the playhead', true);
    edit(ops).then(function(){ toast('Split ' + ops.length + ' clip(s) at ' + fmtTime(at)); }).catch(function(){});
  }

  // Lift the In→Out range: remove it but keep the gaps (no ripple). Composed
  // from split + remove ops so the whole edit stays atomic.
  function liftInOut(){
    if (state.inPoint === null || state.outPoint === null || state.outPoint <= state.inPoint){
      return toast(t('Set In and Out points first'), true);
    }
    var inT = state.inPoint;
    var outT = state.outPoint;
    var eps = 0.0001;
    var ops = [];
    // Clips that anchor a transition are left untouched: splitting a
    // transition endpoint can leave from.start === to.start, which the
    // strict transition validation rejects. The lift keeps those gaps.
    var transitionAnchors = {};
    state.model.lanes.forEach(function(lane){
      (lane.transitions || []).forEach(function(transition){
        transitionAnchors[transition.from] = true;
        transitionAnchors[transition.to] = true;
      });
    });
    state.model.lanes.forEach(function(lane){
      if (lane.locked) return;
      lane.clips.forEach(function(clip){
        if (transitionAnchors[clip.id]) return;
        var s = clip.start;
        var e = clip.start + clip.duration;
        if (e <= inT + eps || s >= outT - eps) return;
        if (s < inT - eps && e > outT + eps){
          var middle = nextClientId('lift');
          var keep = nextClientId('lift');
          ops.push({ op:'clip.split', clipId:clip.id, at:inT, id:middle });
          ops.push({ op:'clip.split', clipId:middle, at:outT, id:keep });
          ops.push({ op:'clip.remove', clipId:middle });
        } else if (s < inT - eps){
          var tail = nextClientId('lift');
          ops.push({ op:'clip.split', clipId:clip.id, at:inT, id:tail });
          ops.push({ op:'clip.remove', clipId:tail });
        } else if (e > outT + eps){
          var keepRight = nextClientId('lift');
          ops.push({ op:'clip.split', clipId:clip.id, at:outT, id:keepRight });
          ops.push({ op:'clip.remove', clipId:clip.id });
        } else {
          ops.push({ op:'clip.remove', clipId:clip.id });
        }
      });
    });
    if (!ops.length) return toast(t('Nothing inside the In→Out range'), true);
    edit(ops).then(function(){ toast(t('Range lifted — gaps kept')); }).catch(function(error){ toast(error.message || 'Lift rejected', true); });
  }

  // ---------- title presets ----------

  function addTitleFromPreset(preset){
    // /api/caption builds a complete caption clip (lane created when missing);
    // the preset contributes text, timing and the per-cue style.
    api('/api/caption', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: preset.text,
        start: snap(state.time),
        duration: preset.duration,
        style: preset.style,
      }),
    })
      .then(function(body){
        if (!body.ok) return toast(body.message || body.error || 'Title rejected', true);
        return applyProjectResponse(body).then(function(){ toast(t('Title added — edit the text in Properties')); });
      })
      .catch(function(error){ toast(error.message || 'Title rejected', true); });
  }

  // ---------- audio mixer (per-lane volume / pan / mute / solo) ----------

  function panLabel(value){
    var n = Number(value) || 0;
    if (Math.abs(n) < 0.025) return 'C';
    return (n < 0 ? 'L' : 'R') + Math.round(Math.abs(n) * 100);
  }

  function openMixer(focusLaneId){
    if (!state.model) return;
    var rows = el('mixer-rows');
    rows.innerHTML = '';
    var lanes = state.model.lanes.slice().sort(function(a,b){ return a.order - b.order; });
    lanes.forEach(function(lane){
      var row = document.createElement('div');
      row.className = 'mixer-row' + (lane.type === 'audio' ? ' mixer-master' : '');
      if (lane.id === focusLaneId) row.style.borderColor = 'var(--accent)';
      var head = document.createElement('div');
      head.innerHTML = '<b>' + escapeHtml(lane.name || lane.id) + '</b><small>' + escapeHtml(lane.type) + ' · ' + lane.clips.length + '</small>';
      row.appendChild(head);
      var mBtn = document.createElement('button');
      mBtn.textContent = 'M';
      mBtn.title = 'Mute lane';
      mBtn.className = lane.muted ? 'on' : '';
      mBtn.onclick = function(){
        edit([{ op:'track.set', trackId:lane.id, props:{ muted:!lane.muted } }]).then(function(){ renderMixerRows(focusLaneId); }).catch(function(){});
      };
      row.appendChild(mBtn);
      if (lane.type === 'audio'){
        var sBtn = document.createElement('button');
        sBtn.textContent = 'S';
        sBtn.title = 'Solo lane';
        sBtn.className = lane.solo ? 'on' : '';
        sBtn.onclick = function(){
          edit([{ op:'track.set', trackId:lane.id, props:{ solo:!lane.solo } }]).then(function(){ renderMixerRows(focusLaneId); }).catch(function(){});
        };
        row.appendChild(sBtn);
      } else {
        var gap = document.createElement('span');
        row.appendChild(gap);
      }
      if (lane.type === 'audio'){
        var volume = lane.volume !== undefined ? lane.volume : 1;
        var volWrap = document.createElement('div');
        volWrap.className = 'lvl';
        volWrap.innerHTML = '<span>Vol</span>';
        var volInput = document.createElement('input');
        volInput.type = 'range';
        volInput.min = '0'; volInput.max = '2'; volInput.step = '0.01';
        volInput.value = String(volume);
        var volOut = document.createElement('output');
        volOut.textContent = Math.round(volume * 100) + '%';
        volInput.addEventListener('input', function(){ volOut.textContent = Math.round(Number(volInput.value) * 100) + '%'; });
        volInput.addEventListener('change', function(){
          edit([{ op:'track.set', trackId:lane.id, props:{ volume:Number(volInput.value) } }])
            .then(function(){ toast((lane.name || lane.id) + ' volume ' + Math.round(Number(volInput.value) * 100) + '%'); })
            .catch(function(){});
        });
        volWrap.appendChild(volInput); volWrap.appendChild(volOut);
        row.appendChild(volWrap);
        var pan = lane.pan !== undefined ? lane.pan : 0;
        var panWrap = document.createElement('div');
        panWrap.className = 'lvl';
        panWrap.innerHTML = '<span>Pan</span>';
        var panInput = document.createElement('input');
        panInput.type = 'range';
        panInput.min = '-1'; panInput.max = '1'; panInput.step = '0.05';
        panInput.value = String(pan);
        var panOut = document.createElement('output');
        panOut.textContent = panLabel(pan);
        panInput.addEventListener('input', function(){ panOut.textContent = panLabel(Number(panInput.value)); });
        panInput.addEventListener('change', function(){
          edit([{ op:'track.set', trackId:lane.id, props:{ pan:Number(panInput.value) } }])
            .then(function(){ toast((lane.name || lane.id) + ' pan ' + panLabel(Number(panInput.value))); })
            .catch(function(){});
        });
        panWrap.appendChild(panInput); panWrap.appendChild(panOut);
        row.appendChild(panWrap);
      } else {
        var note = document.createElement('div');
        note.className = 'hint';
        note.style.gridColumn = '3 / -1';
        note.textContent = lane.muted ? t('Muted — hidden from preview and export') : t('Mute/hide apply to visual lanes; volume lives on clips');
        row.appendChild(note);
      }
      rows.appendChild(row);
    });
    el('mixer-modal').classList.add('open');
  }

  function renderMixerRows(focusLaneId){
    if (!el('mixer-modal').classList.contains('open')) return;
    openMixer(focusLaneId);
  }

  function closeMixer(){ el('mixer-modal').classList.remove('open'); }

  // ---------- align selection to playhead ----------

  function alignSelectionToPlayhead(){
    var ids = selectionIds();
    if (!ids.length) return toast('Select clips to align first', true);
    var found = ids.map(clipById).filter(Boolean);
    if (!found.length) return;
    var minStart = Math.min.apply(null, found.map(function(entry){ return entry.clip.start; }));
    var target = snap(state.time);
    var ops = found.map(function(entry){
      return { op:'clip.move', clipId:entry.clip.id, start:Math.max(0, Number((target + (entry.clip.start - minStart)).toFixed(6))) };
    });
    edit(ops).then(function(){ toast('Aligned ' + ops.length + ' clip(s) to the playhead'); }).catch(function(){});
  }

  // ---------- canvas settings ----------

  function openSettings(){
    el('set-width').value = state.model.width;
    el('set-height').value = state.model.height;
    var fpsSelect = el('set-fps');
    fpsSelect.value = state.model.frameRate || String(Math.round(state.model.fps));
    if (fpsSelect.selectedIndex < 0){
      // Unknown rational: fall back to the nearest integer option.
      fpsSelect.value = String(Math.round(state.model.fps));
      if (fpsSelect.selectedIndex < 0) fpsSelect.value = '30/1';
    }
    el('set-background').value = state.model.background || '';
    var grid = el('ratio-grid');
    var buttons = grid.querySelectorAll('button');
    for (var i=0;i<buttons.length;i++){
      buttons[i].classList.toggle('active', Number(buttons[i].dataset.w) === state.model.width && Number(buttons[i].dataset.h) === state.model.height);
    }
    el('settings-modal').classList.add('open');
  }
  function saveSettings(){
    var width = Math.max(16, Math.round(Number(el('set-width').value) || state.model.width));
    var height = Math.max(16, Math.round(Number(el('set-height').value) || state.model.height));
    var frameRate = el('set-fps').value || (Math.round(state.model.fps) + '/1');
    var background = el('set-background').value.trim() || state.model.background;
    var operations = [{ op:'composition.set', composition:{ width:width, height:height, frameRate:frameRate, background:background } }];
    edit(operations).then(function(){
      el('settings-modal').classList.remove('open');
      resizeStage();
      var fpsLabel = el('set-fps').selectedOptions && el('set-fps').selectedOptions[0] ? el('set-fps').selectedOptions[0].textContent : frameRate;
      toast('Canvas ' + width + '×' + height + ' @ ' + fpsLabel);
    }).catch(function(){});
  }

  // ---------- keyboard help ----------

  var SHORTCUTS = [
    ['Space', 'Play / pause'],
    ['Shift+Space', 'Play from the In point'],
    ['← / →', 'Previous / next frame'],
    ['Shift+← / → · PgUp / PgDn', 'Jump 1 second'],
    ['J / L', 'Shuttle reverse / forward — repeat to go faster (up to 8×)'],
    ['K', 'Stop shuttle / pause'],
    ['Home / End', 'Jump to start / end'],
    ['I / O', 'Set In / Out point'],
    ['M', 'Drop a marker'],
    ['S', 'Split selected clip(s) at the playhead'],
    ['T', 'Open the transition dialog'],
    ['C', 'Add a caption at the playhead'],
    ['D / Ctrl+D', 'Duplicate selected clip(s)'],
    ['Ctrl+C / X / V', 'Copy / cut / paste (Place mode honored)'],
    ['Ctrl+A', 'Select all clips'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Delete / Backspace', 'Remove selected clip(s)'],
    ['Shift+Delete', 'Ripple delete'],
    ['G', 'Toggle composition guides'],
    ['F', 'Fullscreen preview'],
    ['E', 'Element picker'],
    ['+ / − / 0', 'Zoom in / out / fit (Ctrl+wheel zooms at cursor)'],
    ['Shift (drag)', 'Bypass snapping'],
    ['Esc', 'Close menu/dialog · clear selection'],
  ];
  function toggleHelp(force){
    var modal = el('help-modal');
    var open = force === undefined ? !modal.classList.contains('open') : force;
    if (open && !el('help-table').dataset.built){
      var table = el('help-table');
      SHORTCUTS.forEach(function(pair){
        var row = document.createElement('tr');
        var key = document.createElement('td');
        key.textContent = pair[0];
        var label = document.createElement('td');
        label.textContent = pair[1];
        row.appendChild(key);
        row.appendChild(label);
        table.appendChild(row);
      });
      table.dataset.built = '1';
    }
    modal.classList.toggle('open', open);
  }

  // ---------- caption style editor ----------

  function captionLane(){
    return state.model.lanes.filter(function(lane){ return lane.type === 'caption'; })[0] || null;
  }

  function parseCaptionStyle(css){
    var style = { fontSize:'48px', color:'#ffffff', background:'', position:'' };
    String(css || '').split(';').forEach(function(declaration){
      var index = declaration.indexOf(':');
      if (index <= 0) return;
      var name = declaration.slice(0, index).trim();
      var value = declaration.slice(index + 1).trim();
      if (name === 'font-size') style.fontSize = value;
      else if (name === 'color') style.color = value;
      else if (name === 'background' || name === 'background-color') style.background = value;
      else if (name === 'bottom') style.position = value;
    });
    return style;
  }

  function buildCaptionStyle(style){
    var declarations = ['font-size:' + (style.fontSize || '48px'), 'color:' + (style.color || '#ffffff')];
    if (style.background) declarations.push('background:' + style.background);
    if (style.position) declarations.push('bottom:' + style.position);
    return declarations.join(';');
  }

  function saveCaptionStyle(){
    var lane = captionLane();
    if (!lane) return toast('Add a caption lane first (＋ Lane… → Caption lane)', true);
    var style = {
      fontSize: el('cap-size').value.trim() || '48px',
      color: el('cap-color').value.trim() || '#ffffff',
      background: el('cap-bg').value.trim(),
      position: el('cap-pos').value.trim(),
    };
    edit([{ op:'track.set', trackId:lane.id, props:{ captionStyle:buildCaptionStyle(style) } }])
      .then(function(){ toast(t('Caption style saved')); }).catch(function(){});
  }

  function toggleGuides(){
    state.guides = !state.guides;
    buildGuides();
    el('guides').classList.toggle('on', state.guides);
    el('guides-btn').classList.toggle('active', state.guides);
  }

  function buildGuides(){
    var guides = el('guides');
    if (guides.dataset.built) return;
    guides.dataset.built = '1';
    var lines = [
      { cls:'g v', left:'33.333%' }, { cls:'g v', left:'66.667%' },
      { cls:'g h', top:'33.333%' }, { cls:'g h', top:'66.667%' },
      { cls:'g v', left:'50%' }, { cls:'g h', top:'50%' },
    ];
    lines.forEach(function(line){
      var node = document.createElement('div');
      node.className = line.cls;
      if (line.left) node.style.left = line.left;
      if (line.top) node.style.top = line.top;
      guides.appendChild(node);
    });
    // Safe areas: TikTok/Reels-style portrait UI insets over the current
    // aspect ratio, mirroring the delivery-profile safe-area documentation.
    [['9:16 inset', 0.12, 0.06, 0.12, 0.18], ['4:5 inset', 0.08, 0.06, 0.08, 0.12], ['universal', 0.05, 0.05, 0.05, 0.05]].forEach(function(area){
      var box = document.createElement('div');
      box.className = 'safe';
      box.style.left = (area[1] * 100) + '%';
      box.style.top = (area[2] * 100) + '%';
      box.style.right = (area[3] * 100) + '%';
      box.style.bottom = (area[4] * 100) + '%';
      box.title = area[0];
      guides.appendChild(box);
    });
  }

  function toggleFullscreen(){
    document.body.classList.toggle('fullscreen-stage');
    setTimeout(function(){ resizeStage(); renderTimeline(); }, 60);
  }

  function snapshotFrame(){
    var button = el('snapshot');
    button.disabled = true;
    api('/api/snapshot', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ time:snap(state.time) })
    }).then(function(body){
      var poll = function(){
        api('/api/job/' + encodeURIComponent(body.jobId)).then(function(job){
          if (job.status === 'succeeded'){
            button.disabled = false;
            toast('Frame saved: ' + job.file);
          } else if (job.status === 'failed'){
            button.disabled = false;
            toast(job.error, true);
          } else {
            setTimeout(poll, 400);
          }
        }).catch(function(error){ button.disabled = false; toast(error.message, true); });
      };
      poll();
    }).catch(function(error){ button.disabled = false; toast(error.message, true); });
  }

  function loopPlaybackGuard(){
    // Loop the In/Out range, or the whole timeline when Loop is on with no
    // range set (review mode).
    if (!state.playing || !state.loop) return;
    var hasRange = state.inPoint !== null && state.outPoint !== null && state.outPoint > state.inPoint;
    if (hasRange){
      if (state.time >= state.outPoint - 0.02) seek(state.inPoint, false);
      return;
    }
    if (state.time >= state.model.duration - 0.04) seek(0, false);
  }

  function zoomToSelection(){
    var ids = selectionIds();
    if (!ids.length) return toast('Select a clip to zoom to', true);
    var minStart = Infinity, maxEnd = -Infinity;
    ids.forEach(function(id){
      var found = clipById(id);
      if (!found) return;
      minStart = Math.min(minStart, found.clip.start);
      maxEnd = Math.max(maxEnd, found.clip.start + found.clip.duration);
    });
    if (!isFinite(minStart) || maxEnd <= minStart) return;
    var scroll = el('timeline-scroll');
    var targetZoom = Math.max(0.5, Math.min(12, (state.model.duration / (maxEnd - minStart))));
    state.zoom = targetZoom;
    el('zoom').value = String(targetZoom);
    el('zoomlabel').textContent = targetZoom.toFixed(1) + '×';
    renderTimeline();
    var rate = pps();
    scroll.scrollLeft = Math.max(0, minStart * rate - 60);
    toast(t('Zoomed to selection'));
  }

  function setZoom(value, anchorClientX){
    value = Math.max(0.5, Math.min(12, value));
    var scroll = el('timeline-scroll');
    var rect = scroll.getBoundingClientRect();
    var anchorX = anchorClientX === undefined ? rect.left + rect.width / 2 : anchorClientX;
    var oldRate = pps();
    var contentX = scroll.scrollLeft + (anchorX - rect.left);
    var timeAtAnchor = (contentX - 160) / oldRate;
    state.zoom = value;
    el('zoom').value = String(value);
    el('zoomlabel').textContent = value.toFixed(1) + '×';
    renderTimeline();
    var newRate = pps();
    scroll.scrollLeft = Math.max(0, timeAtAnchor * newRate + 160 - (anchorX - rect.left));
  }

  function parseTimeInput(text){
    text = String(text || '').trim();
    if (!text) return null;
    var smpte = /^(\\d+):(\\d+):(\\d+):(\\d+)$/.exec(text);
    if (smpte && state.model){
      return (Number(smpte[1]) * 3600 + Number(smpte[2]) * 60 + Number(smpte[3])) + Number(smpte[4]) / state.model.fps;
    }
    var clock = /^(?:(\\d+):)?(\\d+):(\\d+(?:\\.\\d+)?)$/.exec(text);
    if (clock) return (Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]));
    var plain = /^(\\d+(?:\\.\\d+)?)$/.exec(text);
    if (plain) return Number(plain[1]);
    return null;
  }

  function openTimeEdit(){
    var input = el('time-input');
    input.style.display = 'block';
    input.value = fmtTime(state.time);
    el('time').style.visibility = 'hidden';
    input.focus();
    input.select();
  }
  function closeTimeEdit(commit){
    var input = el('time-input');
    if (commit){
      var parsed = parseTimeInput(input.value);
      if (parsed !== null && isFinite(parsed)) seek(parsed, true);
      else toast('Could not read that time', true);
    }
    input.style.display = 'none';
    el('time').style.visibility = 'visible';
  }

  // ---------- transition dialog ----------

  function openTransitionDialog(lane, existing, pair){
    state.trDraft = {
      laneId: lane.id,
      transitionId: existing ? existing.id : null,
      from: existing ? existing.from : (pair ? pair.from : null),
      to: existing ? existing.to : (pair ? pair.to : null),
      overlap: pair ? pair.overlap : (existing ? existing.duration : 0.4),
    };
    el('tr-type').value = existing ? existing.type : 'crossfade';
    el('tr-duration').value = existing ? existing.duration.toFixed(2) : Math.min(0.4, state.trDraft.overlap).toFixed(2);
    el('tr-direction').value = 'left';
    el('tr-color').value = '#000000';
    el('tr-info').textContent = state.trDraft.from && state.trDraft.to
      ? state.trDraft.from + ' → ' + state.trDraft.to + (existing ? '' : ' · overlap ' + state.trDraft.overlap.toFixed(2) + 's')
      : '';
    el('transition-modal').classList.add('open');
  }

  function saveTransitionDialog(){
    var draft = state.trDraft;
    if (!draft) return;
    var fps = state.model.fps;
    var type = el('tr-type').value;
    var duration = Math.max(1 / fps, Number(el('tr-duration').value) || 0.4);
    if (!draft.transitionId && draft.overlap) duration = Math.min(duration, draft.overlap);
    var transition = {
      fromClipId: draft.from,
      toClipId: draft.to,
      type: type,
      duration: Number(duration.toFixed(4)),
    };
    if (type === 'wipe' || type === 'slide') transition.direction = el('tr-direction').value;
    if (type === 'dip') transition.color = el('tr-color').value || '#000000';
    var ops = [];
    if (draft.transitionId) ops.push({ op:'transition.remove', transitionId:draft.transitionId });
    ops.push({ op:'transition.add', trackId:draft.laneId, transition:transition });
    el('transition-modal').classList.remove('open');
    state.trDraft = null;
    edit(ops).then(function(){ toast(t('Transition saved')); }).catch(function(){});
  }

  function isVisualClip(clip){
    return clip && (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'svg' || clip.kind === 'scene');
  }

  function transformString(transform){
    return 'translate(' + round3(transform.x) + 'px, ' + round3(transform.y) + 'px) rotate(' + round3(transform.rotate) + 'deg) scale(' + round4(transform.scaleX) + ', ' + round4(transform.scaleY) + ')';
  }
  function round3(value){ return Math.round(Number(value || 0) * 1000) / 1000; }
  function round4(value){ return Math.round(Number(value || 0) * 1000000) / 1000000; }

  function stageLayer(clipId){
    try {
      var doc = stage.contentDocument;
      if (!doc) return null;
      var nodes = doc.querySelectorAll('.vhtml-clip');
      for (var i=0;i<nodes.length;i++) if (nodes[i].dataset.clipId === clipId) return nodes[i];
    } catch (error) {}
    return null;
  }

  function updateSelectionBox(){
    var found = selectedClip();
    if (state.pickElement || state.element || !found || !isVisualClip(found.clip) || state.playing || !state.frameReady){
      selectionBox.style.display = 'none';
      return;
    }
    var layer = stageLayer(found.clip.id);
    if (!layer || layer.style.display === 'none'){
      selectionBox.style.display = 'none';
      return;
    }
    var rect = layer.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1){
      selectionBox.style.display = 'none';
      return;
    }
    var iframeRect = stage.getBoundingClientRect();
    var shellRect = stageOverlay.getBoundingClientRect();
    var scale = iframeRect.width / state.model.width;
    var left = iframeRect.left - shellRect.left + rect.left * scale;
    var top = iframeRect.top - shellRect.top + rect.top * scale;
    var width = rect.width * scale;
    var height = rect.height * scale;
    // Keep the interactive box and its handles inside the stage shell even when
    // a rotated/scaled layer extends past the visible composition.
    if (left < 4){ width += left - 4; left = 4; }
    if (top < 4){ height += top - 4; top = 4; }
    if (left + width > shellRect.width - 4) width = shellRect.width - 4 - left;
    if (top + height > shellRect.height - 4) height = shellRect.height - 4 - top;
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = Math.max(12, width) + 'px';
    selectionBox.style.height = Math.max(12, height) + 'px';
    selectionBox.querySelector('.sel-label').textContent = found.clip.id + ' · ' + found.clip.kind;
    selectionBox.style.display = 'block';
  }

  function setupWysiwyg(){
    selectionBox.addEventListener('pointerdown', function(event){
      var found = selectedClip();
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      pausePlayback();
      var handle = event.target.dataset.wysiwyg || 'move';
      var box = selectionBox.getBoundingClientRect();
      var layer = stageLayer(found.clip.id);
      if (!layer) return;
      state.wysiwyg = {
        mode: handle,
        clip: found.clip,
        layer: layer,
        startX: event.clientX,
        startY: event.clientY,
        box: box,
        baseW: box.width,
        baseH: box.height,
        transform: Object.assign({}, found.clip.transform),
        original: Object.assign({}, found.clip.transform),
        centerX: box.left + box.width / 2,
        centerY: box.top + box.height / 2,
        startAngle: Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180 / Math.PI,
        moved: false
      };
      try { selectionBox.setPointerCapture(event.pointerId); } catch (error) {}
    });
    window.addEventListener('pointermove', function(event){
      if (!state.wysiwyg) return;
      var w = state.wysiwyg;
      var scale = stage.getBoundingClientRect().width / state.model.width;
      if (scale <= 0) return;
      var dx = event.clientX - w.startX;
      var dy = event.clientY - w.startY;
      if (Math.abs(dx) + Math.abs(dy) > 1) w.moved = true;
      if (w.mode === 'move'){
        w.transform.x = round3(w.transform.x + dx / scale);
        w.transform.y = round3(w.transform.y + dy / scale);
        w.startX = event.clientX; w.startY = event.clientY;
        showDragTip('x ' + round3(w.transform.x) + ' · y ' + round3(w.transform.y), event.clientX, event.clientY);
      } else if (w.mode === 'scale'){
        var factorX = Math.max(0.05, (w.baseW + dx) / Math.max(1, w.baseW));
        var factorY = Math.max(0.05, (w.baseH + dy) / Math.max(1, w.baseH));
        w.transform.scaleX = Math.max(0.02, round4(w.original.scaleX * factorX));
        w.transform.scaleY = Math.max(0.02, round4(w.original.scaleY * factorY));
        showDragTip(Math.round(w.transform.scaleX * 100) + '% × ' + Math.round(w.transform.scaleY * 100) + '%', event.clientX, event.clientY);
      } else if (w.mode === 'rotate'){
        var angle = Math.atan2(event.clientY - w.centerY, event.clientX - w.centerX) * 180 / Math.PI;
        var nextRotate = w.transform.rotate + angle - w.startAngle;
        w.startAngle = angle;
        // Snap to level/diagonal angles unless Shift bypasses.
        if (!event.shiftKey){
          var remain = nextRotate % 90;
          if (Math.abs(remain) < 4 || Math.abs(remain) > 86) nextRotate = Math.round(nextRotate / 90) * 90;
          else {
            var remain45 = nextRotate % 45;
            if (Math.abs(remain45) < 3) nextRotate = Math.round(nextRotate / 45) * 45;
          }
        }
        w.transform.rotate = round3(nextRotate);
        showDragTip(Math.round(w.transform.rotate) + '°', event.clientX, event.clientY);
      }
      w.layer.style.transform = transformString(w.transform);
      w.layer.style.transformOrigin = '50% 50%';
      requestAnimationFrame(updateSelectionBox);
    });
    window.addEventListener('pointerup', function(){
      if (!state.wysiwyg) return;
      var w = state.wysiwyg;
      state.wysiwyg = null;
      hideDragTip();
      if (!w.moved) return;
      var props = { x:w.transform.x, y:w.transform.y, scaleX:w.transform.scaleX, scaleY:w.transform.scaleY, rotate:w.transform.rotate };
      edit([{ op:'clip.set', clipId:w.clip.id, props:{ transform:props } }]).catch(function(){
        try { w.layer.style.transform = transformString(w.original); } catch (error) {}
        updateSelectionBox();
      });
    });
  }

  function loadStage(){
    state.frameReady = false;
    selectionBox.style.display = 'none';
    elementBox.style.display = 'none';
    elementHover.style.display = 'none';
    stage.src = '/__vhtml/stage.html?r=' + state.revision + '&t=' + Date.now();
    stage.onload = function(){
      var win = stage.contentWindow;
      if (!win || !win.__vhtml) { toast('Stage runtime failed to load', true); return; }
      bindStageElementPicker();
      Promise.resolve(win.__vhtml.ready).then(function(){
        state.frameReady = true;
        bindStageElementPicker();
        win.__vhtml.seek(state.time).then(function(){ setTimeout(function(){ updateSelectionBox(); updateElementBox(); refreshElementComputed(); }, 30); }).catch(function(){});
        startPolling();
      }).catch(function(error){ toast('Stage init failed: ' + error.message, true); });
    };
  }

  var autoScrollPlayback = true;
  function autoScrollTimeline(){
    // Page-flip: keep the playhead visible while playing (professional NLEs
    // never let the playhead leave the view).
    if (!autoScrollPlayback || !state.playing || !state.model) return;
    var scroll = el('timeline-scroll');
    var rate = pps();
    var playheadX = 160 + state.time * rate;
    var viewLeft = scroll.scrollLeft;
    var viewRight = viewLeft + scroll.clientWidth;
    if (playheadX > viewRight - 60){
      scroll.scrollLeft = Math.max(0, playheadX - 160 - 40);
    } else if (playheadX < viewLeft + 160){
      scroll.scrollLeft = Math.max(0, playheadX - 160 - 40);
    }
  }
  var pollTimer = null;
  function startPolling(){
    clearInterval(pollTimer);
    pollTimer = setInterval(function(){
      if (!state.frameReady) return;
      try {
        var info = stage.contentWindow.__vhtml.state();
        if (info && state.playing){
          state.time = Math.min(state.model.duration, info.time);
          updatePlayhead();
          autoScrollTimeline();
          loopPlaybackGuard();
        }
        if (info && !state.playing && Math.abs(info.time - state.time) > 0.05 && !state.dragging){
          state.time = info.time;
          updatePlayhead();
        }
        updateSelectionBox();
        updateElementBox();
      } catch (error) { /* iframe navigating */ }
    }, 120);
  }

  function seek(seconds, pause){
    state.time = Math.max(0, Math.min(state.model.duration, seconds));
    updatePlayhead();
    if (pause && state.playing) pausePlayback();
    if (!state.frameReady) return;
    var win = stage.contentWindow;
    if (win && win.__vhtml) win.__vhtml.seek(state.time).then(function(){ updateSelectionBox(); updateElementBox(); }).catch(function(){});
  }
  function seekNearestMarker(direction){
    var times = (state.model.markers || []).map(function(marker){ return marker.time; });
    if (!times.length) return toast(t('No markers on this timeline'), true);
    var target = direction > 0
      ? times.filter(function(time){ return time > state.time + 0.0001; }).sort(function(a, b){ return a - b; })[0]
      : times.filter(function(time){ return time < state.time - 0.0001; }).sort(function(a, b){ return b - a; })[0];
    if (target === undefined) return toast(t(direction > 0 ? 'No later marker' : 'No earlier marker'), true);
    seek(target, true);
  }

  function playPause(){
    if (!state.frameReady) return;
    var win = stage.contentWindow;
    if (!win || !win.__vhtml) return;
    stopShuttle();
    if (state.playing){ win.__vhtml.pause(); state.playing = false; el('play').textContent = '▶ Play'; setTimeout(function(){ updateSelectionBox(); updateElementBox(); }, 30); }
    else { state.playing = true; selectionBox.style.display = 'none'; elementBox.style.display = 'none'; elementHover.style.display = 'none'; el('play').textContent = '❚❚ Pause'; win.__vhtml.play(); }
  }
  function pausePlayback(){
    stopShuttle();
    state.playing = false;
    el('play').textContent = '▶ Play';
    try { stage.contentWindow.__vhtml.pause(); } catch (error) {}
    setTimeout(function(){ updateSelectionBox(); updateElementBox(); }, 40);
  }

  // ---------- J/K/L shuttle (studio-driven fast preview) ----------

  // The runtime's play() is 1× only, so shuttle rates render through
  // deterministic seek steps — exact frames, no audio drift, the same way
  // proxy scrubbing works. J doubles reverse speed, L doubles forward, K/Space
  // return to normal playback.
  function updateShuttleBadge(){
    var badge = el('shuttle-badge');
    if (!state.shuttle){ badge.style.display = 'none'; return; }
    badge.textContent = (state.shuttle < 0 ? '◀◀ ' : '▶▶ ') + Math.abs(state.shuttle) + '× shuttle';
    badge.style.display = 'inline-block';
  }
  function stopShuttle(){
    if (state.shuttleTimer){ clearInterval(state.shuttleTimer); state.shuttleTimer = null; }
    if (state.shuttle){ state.shuttle = 0; updateShuttleBadge(); }
  }
  function nudgeShuttle(direction){
    if (!state.frameReady || !state.model) return;
    if (state.playing) { try { stage.contentWindow.__vhtml.pause(); } catch (error) {} state.playing = false; el('play').textContent = '▶ Play'; }
    var next = direction > 0
      ? (state.shuttle > 0 ? Math.min(8, state.shuttle * 2) : 1)
      : (state.shuttle < 0 ? Math.max(-8, state.shuttle * 2) : -1);
    state.shuttle = next;
    updateShuttleBadge();
    if (state.shuttleTimer) clearInterval(state.shuttleTimer);
    state.shuttleTimer = setInterval(function(){
      if (!state.model) return stopShuttle();
      var nextTime = state.time + 0.16 * state.shuttle;
      if (nextTime <= 0 || nextTime >= state.model.duration){
        seek(Math.max(0, Math.min(state.model.duration, nextTime)), true);
        stopShuttle();
        return;
      }
      seek(nextTime, true);
    }, 160);
  }
  function step(direction){
    pausePlayback();
    var fps = state.model.fps;
    var frame = Math.round(state.time * fps) + direction;
    seek(Math.max(0, Math.min(state.model.duration, frame / fps)), true);
  }

  function edit(ops){
    pausePlayback();
    return api('/api/edit', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ operations: ops }) })
      .then(function(body){
        state.model = body.model;
        state.revision = body.revision;
        updateStatus(body.diagnostics);
        updateHistory(body);
        var found = state.selected ? clipById(state.selected) : null;
        if (!found) state.selected = null;
        renderTimeline();
        renderInspector();
        loadStage();
        loadAssets();
        toast('Saved · ' + (body.changed.join(', ') || 'updated'));
        if (EMBED) bridgePost('saved', { changed: body.changed });
        return body;
      })
      .catch(function(error){
        toast(error.message, true);
        if (error.body && error.body.diagnostics) updateStatus(error.body.diagnostics);
        throw error;
      });
  }

  function trimClip(which, value){
    var found = selectedClip();
    if (!found || !isFinite(value)) return;
    var clip = found.clip;
    if (which === 'start'){
      if (value < 0 || value >= clip.start + clip.duration) return toast('Start must be inside the clip', true);
      edit([{ op:'clip.trim', clipId:clip.id, start:snap(value) }]);
    } else {
      if (value <= 0) return toast('Duration must be positive', true);
      edit([{ op:'clip.trim', clipId:clip.id, duration:snap(value) }]);
    }
  }
  function splitSelected(){
    splitClipIds(selectionIds());
  }
  function linkedPartnerIds(found){
    var clip = found.clip;
    var partners = [];
    var linkId = clip.metadata && clip.metadata.linkId;
    var detachedFrom = clip.metadata && clip.metadata.detachedFrom;
    var detachedTo = clip.metadata && clip.metadata.audioDetachedTo;
    state.model.lanes.forEach(function(lane){
      lane.clips.forEach(function(candidate){
        if (candidate.id === clip.id) return;
        var candidateLink = candidate.metadata && candidate.metadata.linkId;
        if (linkId && candidateLink === linkId) partners.push(candidate.id);
        else if (detachedFrom && candidate.id === detachedFrom) partners.push(candidate.id);
        else if (detachedTo && candidate.id === detachedTo) partners.push(candidate.id);
      });
    });
    return partners;
  }
  function copySelected(cut){
    var ids = selectionIds();
    if (!ids.length) return toast(t('Select a clip to ' + (cut ? 'cut' : 'copy')), true);
    // Linked clips ride along (normative: clipboard keeps audio/video pairs together).
    var all = ids.slice();
    ids.forEach(function(id){
      var found = clipById(id);
      if (!found) return;
      linkedPartnerIds(found).forEach(function(partner){
        if (all.indexOf(partner) < 0) all.push(partner);
      });
    });
    edit([{ op: cut ? 'timeline.cut' : 'timeline.copy', clipIds: all }]).then(function(body){
      if (cut){ selectOnly(null); }
      renderTimeline(); renderInspector(); updateSelectionBox();
      toast((cut ? 'Cut ' : 'Copied ') + all.length + ' clip(s) to clipboard');
      return body;
    }).catch(function(){});
  }
  function pasteClipboard(at){
    if (!state.model) return;
    var modeValue = (document.getElementById('place-mode') || {}).value;
    var mode = modeValue === 'overwrite' ? 'overwrite' : modeValue === 'add' ? 'add' : 'insert';
    var target = at === undefined ? snap(state.time) : at;
    edit([{ op:'timeline.paste', at: target, mode: mode, idPrefix: 'paste' }]).then(function(body){
      renderTimeline(); renderInspector(); updateSelectionBox();
      toast('Pasted (' + mode + ') at ' + fmtTime(target));
      return body;
    }).catch(function(){});
  }
  function removeSelected(ripple){
    deleteSelection(selectionIds(), ripple);
  }

  function undo(){ api('/api/undo', { method:'POST' }).then(function(body){ if (!body.ok) return toast(t('Nothing to undo')); applyProjectResponse(body); }); }
  function redo(){ api('/api/redo', { method:'POST' }).then(function(body){ if (!body.ok) return toast(t('Nothing to redo')); applyProjectResponse(body); }); }
  var bridgeReadySent = false;
  function applyProjectResponse(body){
    state.model = body.model; state.revision = body.revision;
    updateStatus(body.diagnostics);
    if (EMBED && !bridgeReadySent){
      bridgeReadySent = true;
      bridgePost('ready', { id: state.model.id, duration: state.model.duration, lanes: (state.model.lanes || []).length, revision: state.revision });
    }
    if (EMBED) bridgePost('stateChanged', { revision: state.revision, duration: state.model.duration });
    updateHistory(body);
    updateTimelineChrome();
    var alive = function(id){ return body.model.lanes.some(function(lane){ return lane.clips.some(function(clip){ return clip.id === id; }); }); };
    state.selected = state.selected && alive(state.selected) ? state.selected : null;
    state.selection = state.selection.filter(alive);
    if (state.selected && state.selection.indexOf(state.selected) < 0) state.selection.push(state.selected);
    if (!state.selection.length && state.selected) state.selection = [state.selected];
    if (state.element && !body.model.scenes.some(function(scene){ return scene.id === state.element.sceneId; })){
      clearElementSelection();
      if (state.tab === 'element') state.tab = 'props';
    }
    renderTimeline(); renderInspector(); loadStage(); loadAssets();
  }

  function defaultLaneFor(asset){
    var lanes = state.model.lanes.slice().sort(function(a,b){ return a.order - b.order; });
    var selected = selectedClip();
    if (asset.kind === 'audio'){
      if (selected && selected.lane.type === 'audio') return selected.lane;
      for (var i=0;i<lanes.length;i++) if (lanes[i].type === 'audio') return lanes[i];
      return null;
    }
    if (selected && (selected.lane.type === 'video' || selected.lane.type === 'overlay')) return selected.lane;
    for (var j=0;j<lanes.length;j++) if (lanes[j].type === 'video' || lanes[j].type === 'overlay') return lanes[j];
    return null;
  }

  function addAssetToTimeline(assetId, laneId, start){
    var asset = assetById(assetId);
    if (!asset) return toast('Asset not found', true);
    var lane = laneId ? state.model.lanes.filter(function(candidate){ return candidate.id === laneId; })[0] : defaultLaneFor(asset);
    if (!lane) return toast(asset.kind === 'audio' ? 'Add an audio lane first' : 'Add a visual lane first', true);
    return api('/api/clip-from-asset', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ assetId:asset.id, trackId:lane.id, start:start === undefined ? snap(state.time) : start, mode:(document.getElementById('place-mode') || {}).value || 'add' })
    }).then(function(body){
      applyProjectResponse(body);
      state.selected = body.clip ? body.clip.id : state.selected;
      renderTimeline(); renderInspector(); updateSelectionBox();
      toast('Added ' + asset.id + ' to ' + (lane.name || lane.id));
      return body;
    }).catch(function(error){ toast(error.message, true); throw error; });
  }

  function addCaptionAtPlayhead(){
    var text = window.prompt('Caption text', '');
    if (text === null) return;
    text = text.trim();
    if (!text) return toast('Caption text is empty', true);
    api('/api/caption', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ text:text, start:snap(state.time), duration:2 })
    }).then(function(body){
      applyProjectResponse(body);
      state.selected = body.clip ? body.clip.id : state.selected;
      state.tab = 'props';
      renderTimeline(); renderInspector();
      toast(t('Caption added'));
    }).catch(function(error){ toast(error.message, true); });
  }

  function addTransition(){
    var found = selectedClip();
    if (!found) return toast('Select a clip first', true);
    var lane = found.lane;
    var clips = lane.clips.slice().sort(function(a,b){ return a.start - b.start; });
    var index = clips.findIndex(function(clip){ return clip.id === found.clip.id; });
    var from = null, to = null, overlap = 0;
    for (var i=0;i<clips.length;i++){
      for (var j=i+1;j<clips.length;j++){
        if (clips[i].id !== found.clip.id && clips[j].id !== found.clip.id) continue;
        var amount = Math.min(clips[i].start + clips[i].duration, clips[j].start + clips[j].duration) - Math.max(clips[i].start, clips[j].start);
        if (amount > 0.0001){ from = clips[i]; to = clips[j]; overlap = amount; break; }
      }
      if (from) break;
    }
    if (!from || !to) return toast('Move this clip so it overlaps a neighbour on the same lane, then add a transition', true);
    if (overlap < 1 / state.model.fps) return toast('Overlap is shorter than one frame', true);
    var exists = (lane.transitions || []).some(function(t){ return (t.from === from.id && t.to === to.id) || (t.from === to.id && t.to === from.id); });
    if (exists) return toast('A transition already exists for these clips', true);
    openTransitionDialog(lane, null, { from:from.id, to:to.id, overlap:overlap });
  }

  function uploadAssets(files){
    if (!files || !files.length) return;
    var list = Array.prototype.slice.call(files);
    var chain = Promise.resolve();
    var last = null;
    list.forEach(function(file, index){
      chain = chain.then(function(){
        toast('Importing ' + file.name + ' (' + (index+1) + '/' + list.length + ')…');
        return file.arrayBuffer().then(function(buffer){
          return api('/api/assets/upload', {
            method:'POST',
            headers:{'x-filename':encodeURIComponent(file.name)},
            body:buffer
          }).then(function(body){ last = body; });
        });
      });
    });
    chain.then(function(){
      if (last) applyProjectResponse(last);
      return loadAssets();
    }).then(function(){
      toast('Imported ' + list.length + ' file(s) into ' + (state.assetSummary ? 'assets/' : 'the project'));
      state.tab = 'assets';
      renderInspector();
    }).catch(function(error){ toast(error.message, true); });
  }

  function reloadProject(){
    pausePlayback();
    api('/api/reload', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' })
      .then(function(body){ clearElementSelection(); state.tab = 'props'; state.timelineStack = []; applyProjectResponse(body); toast(t('Reloaded external files from disk')); })
      .catch(function(error){ toast(error.message, true); });
  }

  function setupTabs(){
    var tabs = el('tabs').querySelectorAll('button');
    for (var i=0;i<tabs.length;i++){
      tabs[i].onclick = function(event){
        state.tab = event.target.dataset.tab;
        if (state.tab === 'assets') loadAssets();
        if (state.tab === 'element' && !state.element){ setPickMode(true); return; }
        if (state.tab !== 'element' && state.pickElement) setPickMode(false);
        renderInspector();
      };
    }
  }

  function relinkAssetPrompt(asset){
    var next = window.prompt('New path for ' + asset.id + ' (relative to project root)', asset.src);
    if (!next || next === asset.src) return;
    api('/api/assets/relink', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ assetId:asset.id, src:next })
    }).then(function(body){ applyProjectResponse(body); loadAssets(); toast('Relinked ' + asset.id); })
      .catch(function(error){ toast(error.message, true); });
  }

  function setupDrag(){
    var scroll = el('timeline-scroll');
    var marquee = el('marquee');
    function clearDrop(){
      var nodes = tracksEl.querySelectorAll('.lane-track.drop-target');
      for (var i=0;i<nodes.length;i++) nodes[i].classList.remove('drop-target');
    }
    function laneAt(x, y){
      var node = document.elementFromPoint(x, y);
      var track = node && node.closest ? node.closest('.lane-track') : null;
      return track ? track : null;
    }
    function beginMarquee(event){
      var inner = el('timeline-inner').getBoundingClientRect();
      state.dragging = {
        type:'marquee',
        startX:event.clientX,
        startY:event.clientY,
        originX:event.clientX - inner.left,
        originY:event.clientY - inner.top,
        moved:false,
      };
      marquee.style.display = 'block';
      marquee.style.left = state.dragging.originX + 'px';
      marquee.style.top = state.dragging.originY + 'px';
      marquee.style.width = '0px';
      marquee.style.height = '0px';
    }
    scroll.addEventListener('pointerdown', function(event){
      if (event.button !== 0) return;
      var clipNode = event.target.closest('.clip');
      var rulerHit = event.target === ruler || event.target.classList.contains('tick');
      if (rulerHit){
        pausePlayback();
        state.dragging = { type:'scrub' };
        seek(magnetTime((event.clientX - ruler.getBoundingClientRect().left) / pps(), null, event.shiftKey), true);
        return;
      }
      var diamondNode = event.target.closest ? event.target.closest('.kf-diamond') : null;
      if (diamondNode && clipNode){
        var kfFound = clipById(clipNode.dataset.clipId);
        if (!kfFound || kfFound.lane.locked) return;
        var kfClip = kfFound.clip;
        var kfAnim = (kfClip.animations || []).filter(function(candidate){ return candidate.id === diamondNode.dataset.animId; })[0];
        if (!kfAnim) return;
        var kfIndex = Number(diamondNode.dataset.kfIndex);
        var keyframe = kfAnim.keyframes[kfIndex];
        if (!keyframe) return;
        pausePlayback();
        selectOnly(kfClip.id);
        renderInspector();
        var originAbs = kfAnim.timeBase === 'project'
          ? kfAnim.start + keyframe.time
          : kfClip.start + kfAnim.start + keyframe.time;
        state.dragging = {
          type:'kf-diamond',
          clip:kfClip,
          animId:kfAnim.id,
          kfIndex:kfIndex,
          timeBase:kfAnim.timeBase,
          animStart:kfAnim.start,
          node:diamondNode,
          startX:event.clientX,
          originAbs:originAbs,
          originLeft:parseFloat(diamondNode.style.left) || 0,
          moved:false,
        };
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      var volumeDot = event.target.closest ? event.target.closest('.volume-dot') : null;
      if (volumeDot && clipNode){
        var dotFound = clipById(clipNode.dataset.clipId);
        if (!dotFound || dotFound.lane.locked) return;
        pausePlayback();
        selectOnly(dotFound.clip.id);
        renderInspector();
        state.dragging = {
          type:'volume-dot',
          clip:dotFound.clip,
          animId:volumeDot.dataset.animId,
          kfIndex:Number(volumeDot.dataset.kfIndex),
          node:volumeDot,
          startX:event.clientX,
          startY:event.clientY,
          origin:envelopeValueAt(dotFound.clip, 0),
          originValue:null,
          originTime:null,
          moved:false,
        };
        var dotAnim = volumeAnimationOf(dotFound.clip);
        if (dotAnim && dotAnim.keyframes[Number(volumeDot.dataset.kfIndex)]){
          state.dragging.originValue = Number(dotAnim.keyframes[Number(volumeDot.dataset.kfIndex)].value) || 0;
          state.dragging.originTime = dotAnim.keyframes[Number(volumeDot.dataset.kfIndex)].time;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      var volumeLineNode = event.target.closest ? event.target.closest('.volume-line') : null;
      if (volumeLineNode && clipNode){
        var volumeFound = clipById(clipNode.dataset.clipId);
        if (!volumeFound || volumeFound.lane.locked) return;
        pausePlayback();
        selectOnly(volumeFound.clip.id);
        renderTimeline(); renderInspector();
        state.dragging = {
          type:'volume',
          clip:volumeFound.clip,
          startY:event.clientY,
          original:volumeFound.clip.volume || 1,
          line:volumeLineNode,
          moved:false,
        };
        volumeLineNode.classList.add('dragging');
        event.preventDefault();
        return;
      }
      var fadeHandle = event.target.closest ? event.target.closest('.fade-handle') : null;
      if (fadeHandle && clipNode){
        var fadeFound = clipById(clipNode.dataset.clipId);
        if (!fadeFound || fadeFound.lane.locked) return;
        pausePlayback();
        selectOnly(fadeFound.clip.id);
        renderTimeline(); renderInspector();
        state.dragging = {
          type:'fade-' + (fadeHandle.dataset.fade === 'out' ? 'out' : 'in'),
          clip:fadeFound.clip,
          startX:event.clientX,
          original:fadeHandle.dataset.fade === 'out' ? (fadeFound.clip.fadeOut || 0) : (fadeFound.clip.fadeIn || 0),
          moved:false,
        };
        event.preventDefault();
        return;
      }
      if (!clipNode){
        var onMarker = event.target.closest && event.target.closest('.marker-flag');
        if (onMarker) return;
        if (!event.target.closest('.lane-label')){
          if (event.target.closest('.lane-track') && !event.shiftKey && !event.ctrlKey && !event.metaKey){
            beginMarquee(event);
          } else {
            selectOnly(null);
            clearElementSelection();
            renderTimeline(); renderInspector(); updateSelectionBox();
          }
        }
        return;
      }
      var found = clipById(clipNode.dataset.clipId);
      if (!found) return;
      if (found.lane.locked){ toast('Lane is locked', true); return; }
      if (state.pickElement) setPickMode(false);
      else clearElementSelection();
      var handle = event.target.dataset.handle;
      var slippable = (found.clip.kind === 'video' || found.clip.kind === 'audio') && !found.clip.freeze && !found.clip.hasTimeRemap;
      if ((event.ctrlKey || event.metaKey) && slippable && !handle){
        // Ctrl+drag = slip the source window (Premiere-style). The ctrl-click
        // selection toggle is deferred to pointerup when nothing moved.
        state.dragging = {
          type: 'slip',
          clip: found.clip,
          lane: found.lane,
          startX: event.clientX,
          originalSourceIn: Number(found.clip.sourceIn || 0),
          moved: false
        };
        event.preventDefault();
        try { clipNode.setPointerCapture(event.pointerId); } catch (error) {}
        return;
      }
      // Dragging the shared edge between two adjacent clips rolls the edit
      // point (both clips trim together, no gap) — the standard NLE gesture.
      var rollPartner = null;
      var rollEdge = null;
      if (handle === 'right' || handle === 'left'){
        var laneClips = found.lane.clips.slice().sort(function(a, b){ return a.start - b.start; });
        var myIndex = laneClips.findIndex(function(candidate){ return candidate.id === found.clip.id; });
        if (handle === 'right' && myIndex >= 0 && myIndex < laneClips.length - 1){
          var nextClip = laneClips[myIndex + 1];
          if (Math.abs((found.clip.start + found.clip.duration) - nextClip.start) < 0.0005){
            rollEdge = 'end'; rollPartner = nextClip;
          }
        }
        if (handle === 'left' && myIndex > 0){
          var prevClip = laneClips[myIndex - 1];
          if (Math.abs((prevClip.start + prevClip.duration) - found.clip.start) < 0.0005){
            rollEdge = 'start'; rollPartner = prevClip;
          }
        }
      }
      if (rollEdge && rollPartner){
        state.dragging = {
          type: 'roll',
          clip: found.clip,
          lane: found.lane,
          partner: rollPartner,
          edge: rollEdge,
          startX: event.clientX,
          originalBoundary: rollEdge === 'end' ? found.clip.start + found.clip.duration : found.clip.start,
          moved: false
        };
        event.preventDefault();
        try { clipNode.setPointerCapture(event.pointerId); } catch (error) {}
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey){
        toggleSelection(found.clip.id, true);
      } else if (selectionIds().indexOf(found.clip.id) < 0){
        selectOnly(found.clip.id);
      }
      renderTimeline(); renderInspector();
      var liveNode = null;
      var nodes = tracksEl.querySelectorAll('.clip');
      for (var i=0;i<nodes.length;i++) if (nodes[i].dataset.clipId === found.clip.id) liveNode = nodes[i];
      if (!liveNode) return;
      clipNode = liveNode;
      updateSelectionBox();
      var startX = event.clientX;
      var groupIds = selectionIds().slice();
      // Linked clips ride along with a drag (CapCut-style AV pairs).
      selectionIds().forEach(function(id){
        var member = clipById(id);
        if (!member) return;
        linkedPartnerIds(member).forEach(function(partner){
          if (groupIds.indexOf(partner) < 0) groupIds.push(partner);
        });
      });
      state.dragging = {
        type: handle ? 'trim-' + handle : 'move',
        clip: found.clip,
        lane: found.lane,
        targetLaneId: found.lane.id,
        startX: startX,
        originalStart: found.clip.start,
        originalDuration: found.clip.duration,
        node: clipNode,
        groupIds: groupIds,
        groupBase: groupIds.map(function(id){
          var member = clipById(id);
          return member ? { id:id, start:member.clip.start, laneId:member.lane.id } : null;
        }).filter(Boolean),
        moved: false
      };
      event.preventDefault();
      try { clipNode.setPointerCapture(event.pointerId); } catch (error) {}
    });
    window.addEventListener('pointermove', function(event){
      if (!state.dragging) return;
      if (state.dragging.type === 'scrub'){
        seek(magnetTime((event.clientX - ruler.getBoundingClientRect().left) / pps(), null, event.shiftKey), true);
        return;
      }
      if (state.dragging.type === 'lane-reorder'){
        var reorder = state.dragging;
        if (Math.abs(event.clientY - reorder.startY) > 4) reorder.moved = true;
        if (!reorder.moved) return;
        var laneRows = tracksEl.querySelectorAll('.lane');
        var draggedRow = null;
        for (var li=0;li<laneRows.length;li++){
          laneRows[li].classList.remove('drop-above','drop-below');
          var laneTrack = laneRows[li].querySelector('.lane-track');
          if (laneTrack && laneTrack.dataset.laneId === reorder.laneId) draggedRow = laneRows[li];
        }
        if (!draggedRow) return;
        var midpoints = [];
        for (var ri=0;ri<laneRows.length;ri++){
          var box = laneRows[ri].getBoundingClientRect();
          midpoints.push(box.top + box.height / 2);
        }
        var insertAt = midpoints.length;
        for (var mi=0;mi<midpoints.length;mi++){
          if (event.clientY < midpoints[mi]){ insertAt = mi; break; }
        }
        var draggedIndex = Array.prototype.indexOf.call(laneRows, draggedRow);
        if (insertAt > draggedIndex) insertAt -= 1;
        reorder.targetIndex = insertAt;
        if (insertAt !== draggedIndex){
          var anchor = laneRows[insertAt];
          if (anchor) anchor.classList.add(insertAt < draggedIndex ? 'drop-above' : 'drop-below');
        }
        return;
      }
      if (state.dragging.type === 'marquee'){
        var dragM = state.dragging;
        var inner = el('timeline-inner').getBoundingClientRect();
        var x = event.clientX - inner.left;
        var y = event.clientY - inner.top;
        if (Math.abs(x - dragM.originX) + Math.abs(y - dragM.originY) > 4) dragM.moved = true;
        marquee.style.left = Math.min(x, dragM.originX) + 'px';
        marquee.style.top = Math.min(y, dragM.originY) + 'px';
        marquee.style.width = Math.abs(x - dragM.originX) + 'px';
        marquee.style.height = Math.abs(y - dragM.originY) + 'px';
        return;
      }
      if (state.dragging.type === 'kf-diamond'){
        var kfDrag = state.dragging;
        var kfDelta = (event.clientX - kfDrag.startX) / pps();
        if (Math.abs(kfDelta) > 0.005) kfDrag.moved = true;
        if (!kfDrag.moved) return;
        var kfAbs = Math.max(kfDrag.clip.start, Math.min(kfDrag.clip.start + kfDrag.clip.duration, kfDrag.originAbs + kfDelta));
        kfDrag.previewAbs = kfAbs;
        kfDrag.node.style.left = ((kfAbs - kfDrag.clip.start) * pps()) + 'px';
        showDragTip(fmtTime(kfAbs), event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'marker-retime'){
        var markerDrag = state.dragging;
        var deltaT = (event.clientX - markerDrag.startX) / pps();
        if (Math.abs(deltaT) > 0.02) markerDrag.moved = true;
        if (!markerDrag.moved) return;
        var nextTime = Math.max(0, Math.min(state.model.duration, snap(markerDrag.originTime + deltaT)));
        markerDrag.previewTime = nextTime;
        showDragTip('Marker @ ' + fmtTime(nextTime), event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'roll'){
        var rollDrag = state.dragging;
        var rollDelta = (event.clientX - rollDrag.startX) / pps();
        if (Math.abs(rollDelta) > 0.005) rollDrag.moved = true;
        if (!rollDrag.moved) return;
        var rollBoundary = magnetTime(rollDrag.originalBoundary + rollDelta, rollDrag.clip.id, event.shiftKey);
        rollDrag.previewBoundary = rollBoundary;
        var rateRoll = pps();
        var primaryBlock = tracksEl.querySelector('.clip[data-clip-id="' + rollDrag.clip.id + '"]');
        var partnerBlock = tracksEl.querySelector('.clip[data-clip-id="' + rollDrag.partner.id + '"]');
        if (rollDrag.edge === 'end'){
          if (primaryBlock) primaryBlock.style.width = Math.max(4, (rollBoundary - rollDrag.clip.start) * rateRoll) + 'px';
          if (partnerBlock){
            partnerBlock.style.left = (rollBoundary * rateRoll) + 'px';
            partnerBlock.style.width = Math.max(4, (rollDrag.partner.start + rollDrag.partner.duration - rollBoundary) * rateRoll) + 'px';
          }
          showDragTip(t('Roll · cut at ') + fmtTime(rollBoundary), event.clientX, event.clientY);
        } else {
          if (primaryBlock){
            primaryBlock.style.left = (rollBoundary * rateRoll) + 'px';
            primaryBlock.style.width = Math.max(4, (rollDrag.clip.start + rollDrag.clip.duration - rollBoundary) * rateRoll) + 'px';
          }
          if (partnerBlock) partnerBlock.style.width = Math.max(4, (rollBoundary - rollDrag.partner.start) * rateRoll) + 'px';
          showDragTip(t('Roll · cut at ') + fmtTime(rollBoundary), event.clientX, event.clientY);
        }
        return;
      }
      if (state.dragging.type === 'lane-height'){
        var heightDrag = state.dragging;
        var nextHeight = Math.max(30, Math.min(200, Math.round(heightDrag.originHeight + (event.clientY - heightDrag.startY))));
        if (Math.abs(event.clientY - heightDrag.startY) > 2) heightDrag.moved = true;
        heightDrag.previewHeight = nextHeight;
        heightDrag.node.style.height = nextHeight + 'px';
        showDragTip(t('Lane height ') + nextHeight + 'px', event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'slip'){
        var slipDrag = state.dragging;
        var slipDelta = (event.clientX - slipDrag.startX) / pps();
        if (Math.abs(slipDelta) > 0.005) slipDrag.moved = true;
        if (!slipDrag.moved) return;
        slipDrag.previewDelta = slipDelta;
        var slipIn = Math.max(0, slipDrag.originalSourceIn + slipDelta * (slipDrag.clip.speed || 1));
        showDragTip(t('Slip · source in ') + fmtTime(slipIn), event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'volume-dot'){
        var envDrag = state.dragging;
        var dxPx = event.clientX - envDrag.startX;
        var dyPx = event.clientY - envDrag.startY;
        if (Math.abs(dxPx) + Math.abs(dyPx) > 2) envDrag.moved = true;
        if (!envDrag.moved) return;
        var dt = dxPx / pps();
        var dv = -(dyPx / 26);
        envDrag.previewTime = Math.max(0, Math.min(envDrag.clip.duration, (envDrag.originTime || 0) + dt));
        envDrag.previewValue = Math.max(0, Math.min(2, (envDrag.originValue || 0) + dv));
        envDrag.node.style.left = ((envDrag.previewTime / Math.max(0.001, envDrag.clip.duration)) * 100).toFixed(2) + '%';
        envDrag.node.style.bottom = ((envDrag.previewValue / 2) * 100).toFixed(2) + '%';
        showDragTip('Volume ' + Math.round(envDrag.previewValue * 100) + '% @ ' + envDrag.previewTime.toFixed(2) + 's', event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'volume'){
        var volumeDrag = state.dragging;
        var dyPx = event.clientY - volumeDrag.startY;
        if (Math.abs(dyPx) > 2) volumeDrag.moved = true;
        var nextVolume = Math.max(0, Math.min(2, volumeDrag.original - (dyPx / 26)));
        volumeDrag.previewVolume = Math.round(nextVolume * 100) / 100;
        volumeDrag.line.style.bottom = ((volumeDrag.previewVolume / 2) * 100).toFixed(1) + '%';
        showDragTip('Volume ' + Math.round(volumeDrag.previewVolume * 100) + '%', event.clientX, event.clientY);
        return;
      }
      if (state.dragging.type === 'fade-in' || state.dragging.type === 'fade-out'){
        var fadeDrag = state.dragging;
        var deltaF = (event.clientX - fadeDrag.startX) / pps();
        var value = Math.max(0, fadeDrag.original + (fadeDrag.type === 'fade-in' ? deltaF : -deltaF));
        value = Math.min(value, fadeDrag.clip.duration - 0.01);
        fadeDrag.previewFade = value;
        fadeDrag.moved = true;
        var blockNode = tracksEl.querySelector('.clip[data-clip-id="' + fadeDrag.clip.id + '"]');
        if (blockNode){
          var shade = fadeDrag.type === 'fade-in' ? blockNode.querySelector('.fade-shade') : blockNode.querySelectorAll('.fade-shade')[1];
          if (shade) shade.style.width = (value * pps()) + 'px';
        }
        return;
      }
      var drag = state.dragging;
      var delta = (event.clientX - drag.startX) / pps();
      if (Math.abs(delta) < 0.0001) return;
      drag.moved = true;
      var rate = pps();
      if (drag.type === 'move' || drag.type === 'trim-left' || drag.type === 'trim-right' || drag.type === 'roll' || drag.type === 'slip'){
        ensureAutoScroll(event);
      }
      if (drag.type === 'move' || drag.type === 'trim-left' || drag.type === 'trim-right'){
        if (drag.type === 'move') showDragTip(fmtTime(Math.max(0, drag.originalStart + delta)), event.clientX, event.clientY);
        else if (drag.type === 'trim-left') showDragTip('start ' + fmtTime(Math.max(0, drag.originalStart + delta)), event.clientX, event.clientY);
        else showDragTip('end ' + fmtTime(drag.originalStart + drag.originalDuration + delta), event.clientX, event.clientY);
      }
      if (drag.type === 'move'){
        var rawStart = Math.max(0, drag.originalStart + delta);
        var snapped = magnetMove(rawStart, drag.originalDuration, drag.clip.id, event.shiftKey);
        var newStart = Math.max(0, Math.min(state.model.duration - drag.originalDuration, snapped.start));
        var groupDelta = newStart - drag.originalStart;
        drag.groupBase.forEach(function(member){
          var block = tracksEl.querySelector('.clip[data-clip-id="' + member.id + '"]');
          if (!block) return;
          var memberStart = Math.max(0, member.start + groupDelta);
          block.style.left = (memberStart * rate) + 'px';
        });
        drag.previewStart = newStart;
        drag.groupDelta = groupDelta;
        var under = laneAt(event.clientX, event.clientY);
        if (under && under.dataset.laneId !== drag.targetLaneId && drag.groupBase.length === 1){
          clearDrop();
          under.classList.add('drop-target');
          drag.targetLaneId = under.dataset.laneId;
        }
      } else if (drag.type === 'trim-left'){
        var target = magnetTime(drag.originalStart + delta, drag.clip.id, event.shiftKey);
        var newStart2 = Math.max(0, Math.min(drag.originalStart + drag.originalDuration - 0.001, target));
        // Warn when the trim would pull media from before the source start
        // (the server rejects it — surface the reason at the cursor instead).
        var speedL = drag.clip.speed || 1;
        var newIn = (drag.clip.sourceIn || 0) + (newStart2 - drag.originalStart) * speedL;
        drag.sourceLimited = newIn < -0.001;
        drag.node.style.left = (newStart2 * rate) + 'px';
        drag.node.style.width = Math.max(4, (drag.originalStart + drag.originalDuration - newStart2) * rate) + 'px';
        drag.previewStart = newStart2;
        if (drag.sourceLimited) showDragTip('⚠ ' + t('No media before the source start'), event.clientX, event.clientY);
      } else if (drag.type === 'trim-right'){
        var end = magnetTime(drag.originalStart + drag.originalDuration + delta, drag.clip.id, event.shiftKey);
        var speedR = drag.clip.speed || 1;
        var sourceMax = assetSourceDuration(drag.clip);
        // Clamp the preview at the end of the source media (CapCut's
        // "insufficient footage" boundary) and say so at the cursor.
        if (sourceMax !== null && !drag.clip.freeze && !drag.clip.hasTimeRemap){
          var maxEnd = drag.originalStart + (sourceMax - (drag.clip.sourceIn || 0)) / speedR;
          if (end > maxEnd){ end = maxEnd; drag.sourceLimited = true; }
          else drag.sourceLimited = false;
        } else drag.sourceLimited = false;
        var newDuration = Math.max(0.001, end - drag.originalStart);
        drag.node.style.width = Math.max(4, newDuration * rate) + 'px';
        drag.previewDuration = newDuration;
        if (drag.sourceLimited) showDragTip('⚠ ' + t('End of source media'), event.clientX, event.clientY);
      }
    });
    scroll.addEventListener('pointerdown', function(event){
      if (event.button !== 0) return;
      var label = event.target.closest ? event.target.closest('.lane-label') : null;
      if (!label) return;
      if (event.target.closest('button') || event.target.closest('input')) return;
      var trackNode = label.parentElement && label.parentElement.querySelector('.lane-track');
      if (!trackNode || !trackNode.dataset.laneId) return;
      state.dragging = { type:'lane-reorder', laneId:trackNode.dataset.laneId, startY:event.clientY, moved:false, targetIndex:null };
      event.preventDefault();
    });
    window.addEventListener('pointerup', function(event){
      if (!state.dragging) return;
      var drag = state.dragging;
      state.dragging = null;
      stopAutoScroll();
      clearDrop();
      showSnapGuide(null);
      hideDragTip();
      if (drag.type === 'slip'){
        if (drag.moved && drag.previewDelta){
          edit([{ op:'clip.slip', clipId:drag.clip.id, delta:Number(drag.previewDelta.toFixed(6)) }])
            .then(function(){ toast(t('Source window slipped')); }).catch(function(){});
        } else if (!drag.moved){
          toggleSelection(drag.clip.id, true);
          renderTimeline(); renderInspector();
        }
        return;
      }
      if (drag.type === 'roll'){
        if (!drag.moved || drag.previewBoundary === undefined) return;
        var rollDelta = drag.previewBoundary - drag.originalBoundary;
        edit([{ op:'clip.roll', clipId:drag.clip.id, edge:drag.edge, delta:Number(rollDelta.toFixed(6)) }])
          .catch(function(error){ toast(error.message || 'Roll rejected', true); });
        return;
      }
      if (drag.type === 'lane-height'){
        if (!drag.moved || !drag.previewHeight) return;
        state.laneHeights[drag.laneId] = drag.previewHeight;
        try { localStorage.setItem('vhtml-lane-heights', JSON.stringify(state.laneHeights)); } catch (error) {}
        renderTimeline();
        return;
      }
      if (drag.type === 'lane-reorder'){
        var rows = tracksEl.querySelectorAll('.lane');
        for (var r=0;r<rows.length;r++) rows[r].classList.remove('drop-above','drop-below');
        if (!drag.moved || drag.targetIndex === null) return;
        var ordered = state.model.lanes.slice().sort(function(a,b){ return a.order - b.order; });
        var fromIndex = ordered.findIndex(function(lane){ return lane.id === drag.laneId; });
        if (fromIndex < 0 || fromIndex === drag.targetIndex) return;
        ordered.splice(fromIndex, 1);
        ordered.splice(drag.targetIndex, 0, state.model.lanes.filter(function(lane){ return lane.id === drag.laneId; })[0]);
        var ops = [];
        ordered.forEach(function(lane, index){
          if (lane.order !== index + 1) ops.push({ op:'track.set', trackId:lane.id, props:{ order:index + 1 } });
        });
        if (ops.length) edit(ops).then(function(){ toast(t('Lane order updated')); }).catch(function(){});
        return;
      }
      if (drag.type === 'marquee'){
        marquee.style.display = 'none';
        if (!drag.moved){
          selectOnly(null);
          clearElementSelection();
          renderTimeline(); renderInspector(); updateSelectionBox();
          return;
        }
        var rectM = marquee.getBoundingClientRect();
        var ids = [];
        var nodesM = tracksEl.querySelectorAll('.clip');
        for (var m=0;m<nodesM.length;m++){
          var box = nodesM[m].getBoundingClientRect();
          var overlapX = Math.min(rectM.right, box.right) - Math.max(rectM.left, box.left);
          var overlapY = Math.min(rectM.bottom, box.bottom) - Math.max(rectM.top, box.top);
          if (overlapX > 2 && overlapY > 2) ids.push(nodesM[m].dataset.clipId);
        }
        state.selection = ids;
        state.selected = ids.length ? ids[ids.length - 1] : null;
        renderTimeline(); renderInspector();
        return;
      }
      if (drag.type === 'kf-diamond'){
        if (!drag.moved || drag.previewAbs === undefined) return;
        var nextAnimations = drag.clip.animations.map(function(candidate){
          if (candidate.id !== drag.animId) return candidate;
          var copy = JSON.parse(JSON.stringify(candidate));
          var kf = copy.keyframes[drag.kfIndex];
          if (!kf) return candidate;
          var local = drag.timeBase === 'project'
            ? drag.previewAbs - copy.start
            : drag.previewAbs - drag.clip.start - copy.start;
          kf.time = Math.max(0, Number(local.toFixed(6)));
          copy.keyframes.sort(function(a,b){ return a.time - b.time; });
          return copy;
        });
        edit([{ op:'clip.set', clipId:drag.clip.id, props:{ animations:nextAnimations } }])
          .then(function(){ toast('Keyframe moved to ' + fmtTime(drag.previewAbs)); }).catch(function(){});
        return;
      }
      if (drag.type === 'marker-retime'){
        if (!drag.moved || drag.previewTime === undefined || drag.previewTime === drag.originTime) return;
        edit([
          { op:'marker.remove', timelineId:markerTimelineId(), markerId:drag.marker.id },
          { op:'marker.add', timelineId:markerTimelineId(), marker:{ id:drag.marker.id, time:drag.previewTime, name:drag.marker.name, type:drag.marker.type } },
        ]).then(function(){ toast('Marker moved to ' + fmtTime(drag.previewTime)); }).catch(function(){});
        return;
      }
      if (drag.type === 'volume-dot'){
        if (!drag.moved || drag.previewValue === undefined) return;
        setVolumeKeyframe(drag.clip, drag.animId, drag.kfIndex, drag.previewTime, drag.previewValue)
          .then(function(){ toast(t('Volume point updated')); }).catch(function(){});
        return;
      }
      if (drag.type === 'volume'){
        drag.line.classList.remove('dragging');
        if (!drag.moved) return;
        edit([{ op:'clip.set', clipId:drag.clip.id, props:{ volume:drag.previewVolume } }])
          .then(function(){ toast('Volume ' + Math.round(drag.previewVolume * 100) + '%'); }).catch(function(){});
        return;
      }
      if (drag.type === 'fade-in' || drag.type === 'fade-out'){
        if (!drag.moved) return;
        var props = {};
        props[drag.type === 'fade-in' ? 'fadeIn' : 'fadeOut'] = drag.previewFade > 0.001 ? Number(drag.previewFade.toFixed(4)) : null;
        edit([{ op:'clip.set', clipId:drag.clip.id, props:props }]).catch(function(){});
        return;
      }
      if (drag.type === 'scrub' || !drag.moved) return;
      if (drag.type === 'move'){
        // Alt+drag duplicates the selection and drops the copies at the
        // preview position (CapCut-style quick copy).
        if (event.altKey && drag.groupDelta){
          var dupOps = drag.groupBase.map(function(member){
            return { op:'clip.duplicate', clipId:member.id, start:Math.max(0, Number((member.start + drag.groupDelta).toFixed(6))) };
          });
          edit(dupOps).then(function(){ toast('Duplicated ' + dupOps.length + ' clip(s)'); }).catch(function(){});
          return;
        }
        if (drag.groupBase.length > 1){
          var ops = drag.groupBase.map(function(member){
            return { op:'clip.move', clipId:member.id, start:Math.max(0, Number((member.start + drag.groupDelta).toFixed(6))) };
          });
          edit(ops).catch(function(){});
          return;
        }
        var op = { op:'clip.move', clipId:drag.clip.id, start:drag.previewStart };
        if (drag.targetLaneId && drag.targetLaneId !== drag.lane.id) op.trackId = drag.targetLaneId;
        edit([op]);
      } else if (drag.type === 'trim-left'){
        edit([{ op:'clip.trim', clipId:drag.clip.id, start:drag.previewStart }]);
      } else {
        edit([{ op:'clip.trim', clipId:drag.clip.id, duration:drag.previewDuration }]);
      }
    });
  }

  function fitTimeline(){ state.zoom = 1; el('zoom').value = '1'; renderTimeline(); }
  function setupZoom(){
    el('zoom').addEventListener('input', function(){
      state.zoom = parseFloat(el('zoom').value);
      el('zoomlabel').textContent = state.zoom.toFixed(1) + '×';
      renderTimeline();
    });
    // Ctrl/Cmd + wheel zooms the timeline anchored at the pointer (CapCut-style).
    var scroll = el('timeline-scroll');
    scroll.addEventListener('wheel', function(event){
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      var factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom(state.zoom * factor, event.clientX);
    }, { passive:false });
  }

  function resizeStage(){
    if (!state.model) return;
    var shell = el('stage-shell');
    var pad = 18;
    var scale = Math.min((shell.clientWidth - pad) / state.model.width, (shell.clientHeight - pad) / state.model.height);
    scale = Math.max(0.05, Math.min(scale, 1.6));
    stage.style.width = state.model.width + 'px';
    stage.style.height = state.model.height + 'px';
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = Math.max(0, (shell.clientWidth - state.model.width * scale) / 2) + 'px';
    stage.style.top = Math.max(0, (shell.clientHeight - state.model.height * scale) / 2) + 'px';
    setTimeout(function(){ updateSelectionBox(); updateElementBox(); }, 20);
  }

  function openExport(){
    var modal = el('export-modal');
    modal.classList.add('open');
    el('exp-delivery').value = '';
    el('exp-width').value = state.model.width;
    el('exp-height').value = state.model.height;
    el('exp-width').disabled = false;
    el('exp-height').disabled = false;
    el('exp-duration').value = state.model.duration.toFixed(3);
    el('exp-start').value = '0';
    el('exp-burn').checked = false;
    el('exp-vtt').checked = false;
    el('exp-report').checked = false;
    el('exp-batch').checked = false;
    el('exp-loudness').value = '';
    el('exp-progress').style.width = '0%';
    el('exp-result').textContent = '';
  }
  function closeExport(){ el('export-modal').classList.remove('open'); }
  function runOneExport(payload){
    return new Promise(function(resolve, reject){
      api('/api/export', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) })
        .then(function(body){
          state.exportJob = body.jobId;
          pollExport();
          var timer = setInterval(function(){
            api('/api/job/' + encodeURIComponent(state.exportJob)).then(function(job){
              el('exp-progress').style.width = (job.percent || 0) + '%';
              el('exp-result').textContent = job.phase + (job.message ? ' · ' + job.message : '');
              if (job.status === 'succeeded' || job.status === 'failed'){
                clearInterval(timer);
                if (job.status === 'failed') reject(new Error(job.error || 'export failed'));
                else resolve(job);
              }
            }).catch(reject);
          }, 600);
        })
        .catch(reject);
    });
  }
  function startExport(){
    var presetId = el('exp-delivery').value;
    var payload = {
      format: el('exp-format').value,
      width: Number(el('exp-width').value),
      height: Number(el('exp-height').value),
      crf: Number(el('exp-crf').value),
      start: Number(el('exp-start').value),
      duration: Number(el('exp-duration').value)
    };
    if (presetId) payload.delivery = presetId;
    if (el('exp-burn').checked) payload.burnCaptions = true;
    if (el('exp-vtt').checked) payload.captions = true;
    if (el('exp-report').checked) payload.report = true;
    var loudness = parseFloat(el('exp-loudness').value);
    if (isFinite(loudness)) payload.loudness = loudness;
    if (el('exp-batch').checked && state.presets.length){
      (async function(){
        try {
          var done = 0;
          for (var i = 0; i < state.presets.length; i++){
            var preset = state.presets[i];
            el('exp-progress').style.width = Math.round((i / state.presets.length) * 100) + '%';
            el('exp-result').textContent = '[' + (i + 1) + '/' + state.presets.length + '] ' + preset.label + '…';
            var job = await runOneExport({
              delivery: preset.id,
              start: payload.start,
              duration: payload.duration,
              burnCaptions: payload.burnCaptions,
              captions: payload.captions,
              report: payload.report,
              loudness: payload.loudness
            });
            done += 1;
            void job;
          }
          el('exp-progress').style.width = '100%';
          el('exp-result').textContent = 'Batch complete · ' + done + ' file(s) in renders/';
          toast('Batch export complete (' + done + ' presets)');
        } catch (error) {
          el('exp-result').textContent = 'Failed: ' + error.message;
          toast(error.message, true);
        }
      })();
      return;
    }
    el('exp-result').textContent = 'Starting…';
    el('exp-progress').style.width = '2%';
    api('/api/export', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) })
      .then(function(body){ state.exportJob = body.jobId; pollExport(); })
      .catch(function(error){ el('exp-result').textContent = error.message; toast(error.message, true); });
  }
  function pollExport(){
    if (!state.exportJob) return;
    api('/api/job/' + encodeURIComponent(state.exportJob)).then(function(job){
      el('exp-progress').style.width = (job.percent || 0) + '%';
      el('exp-result').textContent = job.phase + (job.message ? ' · ' + job.message : '');
      if (job.status === 'succeeded'){
        state.exportJob = null;
        el('exp-progress').style.width = '100%';
        var links = 'Complete · <a href="' + job.url + '" download>open ' + escapeHtml(job.file) + '</a> (' + (job.sizeBytes/1048576).toFixed(2) + ' MiB)';
        if (job.captions) links += ' · <a href="' + job.captions + '" download>captions</a>';
        if (job.report) links += ' · <a href="' + job.report + '" download>report</a>';
        el('exp-result').innerHTML = links;
        toast(t('Export complete'));
      } else if (job.status === 'failed'){
        state.exportJob = null;
        el('exp-result').textContent = 'Failed: ' + job.error;
        toast(job.error, true);
      } else {
        setTimeout(pollExport, 600);
      }
    }).catch(function(error){ state.exportJob = null; toast(error.message, true); });
  }

  function setupKeys(){
    document.addEventListener('keydown', function(event){
      var tag = (event.target.tagName || '').toLowerCase();
      var modalOpen = el('export-modal').classList.contains('open') || el('transition-modal').classList.contains('open') || el('settings-modal').classList.contains('open') || el('help-modal').classList.contains('open') || el('mixer-modal').classList.contains('open');
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
      if (event.key === '?' || (event.shiftKey && (event.key === '/' || event.code === 'Slash'))){ event.preventDefault(); toggleHelp(); return; }
      if (event.key === 'Escape'){
        if (el('ctx-menu').style.display === 'block'){ closeContextMenu(); return; }
        if (el('help-modal').classList.contains('open')){ toggleHelp(false); return; }
        if (el('settings-modal').classList.contains('open')){ el('settings-modal').classList.remove('open'); return; }
        if (el('export-modal').classList.contains('open')){ closeExport(); return; }
        if (el('transition-modal').classList.contains('open')){ el('transition-modal').classList.remove('open'); state.trDraft = null; return; }
        if (el('mixer-modal').classList.contains('open')){ closeMixer(); return; }
        if (state.wysiwyg){
          state.wysiwyg.layer.style.transform = transformString(state.wysiwyg.original);
          state.wysiwyg = null;
          updateSelectionBox();
          return;
        }
        if (state.pickElement){ setPickMode(false); return; }
        if (state.replaceArmed){ state.replaceArmed = null; renderInspector(); return; }
        if (state.element){
          clearElementSelection();
          state.tab = 'props';
          renderInspector();
          updateSelectionBox();
          return;
        }
        selectOnly(null);
        renderTimeline(); renderInspector(); updateSelectionBox();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.element && state.tab === 'element') return;
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')){
        event.preventDefault();
        var all = [];
        state.model.lanes.forEach(function(lane){ if (!lane.locked) lane.clips.forEach(function(clip){ all.push(clip.id); }); });
        state.selection = all;
        state.selected = all.length ? all[all.length - 1] : null;
        renderTimeline(); renderInspector();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')){
        event.preventDefault();
        duplicateSelection(selectionIds());
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')){ event.preventDefault(); copySelected(false); return; }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'x' || event.key === 'X')){ event.preventDefault(); copySelected(true); return; }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')){ event.preventDefault(); pasteClipboard(); return; }
      if (event.key === '?' || (event.shiftKey && (event.key === '/' || event.key === '?'))){ event.preventDefault(); document.getElementById('shortcuts-modal').classList.toggle('open'); return; }
      if (event.shiftKey && event.key === ','){ event.preventDefault(); seekNearestMarker(-1); return; }
      if (event.shiftKey && event.key === '.'){ event.preventDefault(); seekNearestMarker(1); return; }
      if (event.key === 'Escape'){ document.getElementById('shortcuts-modal').classList.remove('open'); }
      if (modalOpen) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')){ event.preventDefault(); setZoom(state.zoom * 1.25); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === '-'){ event.preventDefault(); setZoom(state.zoom / 1.25); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === '0'){ event.preventDefault(); fitTimeline(); return; }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')){
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')){ event.preventDefault(); redo(); return; }
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === 'e' || event.key === 'E'){ setPickMode(!state.pickElement); return; }
      if (event.code === 'Space'){
        event.preventDefault();
        if (event.shiftKey && state.inPoint !== null){ seek(state.inPoint, true); if (!state.playing) playPause(); }
        else playPause();
      }
      else if (event.key === 'i' || event.key === 'I'){ setInPoint(); }
      else if (event.key === 'o' || event.key === 'O'){ setOutPoint(); }
      else if (event.key === 'm' || event.key === 'M'){ addMarker(); }
      else if (event.key === 'd' || event.key === 'D'){ duplicateSelection(selectionIds()); }
      else if (event.key === 'g' || event.key === 'G'){ toggleGuides(); }
      else if (event.key === 'f' || event.key === 'F'){ toggleFullscreen(); }
      else if (event.key === 'z' || event.key === 'Z'){ zoomToSelection(); }
      else if (event.key === 's' || event.key === 'S'){ splitSelected(); }
      else if (event.key === 't' || event.key === 'T'){ addTransition(); }
      else if (event.key === 'c' || event.key === 'C'){ addCaptionAtPlayhead(); }
      else if (event.key === 'j' || event.key === 'J'){ event.preventDefault(); nudgeShuttle(-1); }
      else if (event.key === 'k' || event.key === 'K'){ pausePlayback(); }
      else if (event.key === 'l' || event.key === 'L'){ event.preventDefault(); nudgeShuttle(1); }
      else if (event.key === 'Home'){ event.preventDefault(); seek(0, true); }
      else if (event.key === 'End'){ event.preventDefault(); seek(state.model.duration, true); }
      else if (event.key === 'PageUp'){ event.preventDefault(); seek(Math.max(0, state.time - 1), true); }
      else if (event.key === 'PageDown'){ event.preventDefault(); seek(Math.min(state.model.duration, state.time + 1), true); }
      else if (event.altKey && event.key === 'ArrowLeft'){ event.preventDefault(); nudgeSelection(-1); return; }
      else if (event.altKey && event.key === 'ArrowRight'){ event.preventDefault(); nudgeSelection(1); return; }
      else if (event.key === 'ArrowUp'){ event.preventDefault(); selectNeighbourClip(-1); }
      else if (event.key === 'ArrowDown'){ event.preventDefault(); selectNeighbourClip(1); }
      else if (event.key === 'ArrowLeft' && event.shiftKey){ event.preventDefault(); seek(Math.max(0, state.time - 1), true); }
      else if (event.key === 'ArrowRight' && event.shiftKey){ event.preventDefault(); seek(Math.min(state.model.duration, state.time + 1), true); }
      else if (event.key === 'Delete' || event.key === 'Backspace'){ removeSelected(event.shiftKey); }
      else if (event.key === 'ArrowLeft'){ event.preventDefault(); step(-1); }
      else if (event.key === 'ArrowRight'){ event.preventDefault(); step(1); }
    });
  }

  if (EMBED){
    window.addEventListener('message', function(event){
      var data = event.data;
      if (!data || data.source !== 'vhtml-host' || data.type !== 'vhtml:command' || !data.command) return;
      try {
        var payload = data.payload || {};
        if (data.command === 'applyOps'){
          edit(payload.operations || []);
        } else if (data.command === 'save'){
          edit([]);
        } else if (data.command === 'export'){
          openExport();
        } else if (data.command === 'play'){
          if (!state.playing) playPause();
        } else if (data.command === 'pause'){
          if (state.playing) playPause();
        } else if (data.command === 'setTime'){
          state.time = Math.max(0, Math.min(state.model.duration, Number(payload.time) || 0));
          updatePlayhead();
          bridgePost('stateChanged', { time: state.time });
        } else if (data.command === 'getState'){
          bridgePost('state', { revision: state.revision, time: state.time, playing: state.playing, selected: state.selected, duration: state.model.duration });
        }
      } catch (error) {
        bridgePost('error', { message: String(error) });
      }
    });
  }

  document.addEventListener('click', function(event){
    var modal = document.getElementById('shortcuts-modal');
    if (modal && modal.classList.contains('open') && event.target === modal) modal.classList.remove('open');
  });

  function loadPresets(){
    return api('/api/presets').then(function(body){
      state.presets = body.presets || [];
      var select = el('exp-delivery');
      state.presets.forEach(function(preset){
        var option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label + ' · ' + preset.width + '×' + preset.height + ' · ' + preset.format.toUpperCase();
        select.appendChild(option);
      });
    }).catch(function(){ /* presets stay unavailable; custom export still works */ });
  }

  function bind(){
    el('play').onclick = playPause;
    el('prev').onclick = function(){ step(-1); };
    el('next').onclick = function(){ step(1); };
    el('reload').onclick = reloadProject;
    el('undo').onclick = undo;
    el('redo').onclick = redo;
    el('split').onclick = splitSelected;
    if (EMBED) document.body.classList.add('embed');
    if (window.matchMedia('(max-width:880px)').matches) document.body.classList.add('insp-hidden');
    var inspToggle = function(){
      var hidden = document.body.classList.toggle('insp-hidden');
      if (!hidden) document.body.classList.add('insp-open');
      else document.body.classList.remove('insp-open');
      renderTimeline();
    };
    el('insp-toggle').onclick = inspToggle;
    el('insp-backdrop').onclick = function(){ document.body.classList.remove('insp-open'); };
    try { window.localStorage.getItem('vhtml-insp') === 'hidden' && document.body.classList.add('insp-hidden'); } catch (e) { /* storage blocked */ }
    fetch('/api/autosave').then(function(r){ return r.json(); }).then(function(data){
      if (!data.available) return;
      var banner = document.getElementById('recover-banner');
      banner.classList.add('show');
      document.getElementById('recover-restore').onclick = function(){
        api('/api/autosave/restore', { method:'POST' }).then(function(body){
          if (!body.ok) return toast(body.error || 'Restore failed', true);
          banner.classList.remove('show');
          applyProjectResponse(body);
          toast(t('Checkpoint restored'));
        });
      };
      document.getElementById('recover-discard').onclick = function(){
        api('/api/autosave/discard', { method:'POST' }).then(function(){ banner.classList.remove('show'); });
      };
    }).catch(function(){ /* autosave endpoints unavailable in old hosts */ });
    el('paste').onclick = function(){ pasteClipboard(); };
    el('proxy').onclick = function(){
      PROXY = !PROXY;
      try { window.localStorage.setItem('vhtml-proxy', PROXY ? '1' : '0'); } catch (e) { /* private mode */ }
      el('proxy').classList.toggle('on', PROXY);
      fetch('/api/proxy-mode', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ enabled: PROXY }) })
        .then(function(){ return loadStage(); })
        .then(function(){ toast(PROXY ? 'Proxy preview on (360p media)' : 'Proxy preview off'); });
    };
    if (PROXY) el('proxy').classList.add('on');
    el('generate').onclick = function(){
      var button = document.getElementById('generate');
      if (button) { button.disabled = true; }
      api('/api/generate', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' }).then(function(body){
        if (button) button.disabled = false;
        if (!body.ok){
          toast('Generation failed: ' + ((body.failed || []).map(function(f){ return f.taskId; }).join(', ') || body.message), true);
          return;
        }
        applyProjectResponse(body);
        toast('Generated: ' + (body.ran || []).join(', ') + ((body.skipped || []).length ? ' (skipped ' + body.skipped.length + ')' : ''));
      }).catch(function(error){
        if (button) button.disabled = false;
        toast(error.message, true);
      });
    };
    el('duplicate').onclick = function(){ duplicateSelection(selectionIds()); };
    el('detach').onclick = function(){
      var found = selectedClip();
      if (!found) return toast(t('Select a video clip to detach audio'), true);
      edit([{ op:'clip.detachAudio', clipId:found.clip.id }]).then(function(body){
        renderTimeline(); renderInspector();
      });
    };
    el('delete').onclick = function(){ removeSelected(false); };
    el('ripple').onclick = function(){ removeSelected(true); };
    el('canvas-settings').onclick = openSettings;
    el('timeline-back').onclick = function(){ selectEditingTimeline(null, false); };
    el('settings-close').onclick = function(){ el('settings-modal').classList.remove('open'); };
    el('settings-cancel').onclick = function(){ el('settings-modal').classList.remove('open'); };
    el('settings-save').onclick = saveSettings;
    var ratioButtons = el('ratio-grid').querySelectorAll('button');
    for (var rb=0;rb<ratioButtons.length;rb++){
      ratioButtons[rb].onclick = function(){
        el('set-width').value = this.dataset.w;
        el('set-height').value = this.dataset.h;
        var buttons = el('ratio-grid').querySelectorAll('button');
        for (var bi=0;bi<buttons.length;bi++) buttons[bi].classList.toggle('active', buttons[bi] === this);
      };
    }
    el('help').onclick = function(){ toggleHelp(); };
    el('help-close').onclick = function(){ toggleHelp(false); };
    el('transition').onclick = addTransition;
    el('add-caption').onclick = addCaptionAtPlayhead;
    el('add-marker').onclick = function(){ addMarker(); };
    el('add-lane').onchange = function(){
      var type = el('add-lane').value;
      el('add-lane').value = '';
      if (type) addLane(type);
    };
    el('snap').onclick = function(){
      state.snapping = !state.snapping;
      el('snap').classList.toggle('active', state.snapping);
      toast('Snapping ' + (state.snapping ? 'on' : 'off'));
    };
    el('mixer').onclick = function(){ openMixer(); };
    el('mixer-close').onclick = closeMixer;
    el('mixer-done').onclick = closeMixer;
    el('loop').onclick = function(){
      state.loop = !state.loop;
      document.body.classList.toggle('looping', state.loop);
      el('loop').classList.toggle('active', state.loop);
      var hasRange = state.inPoint !== null && state.outPoint !== null && state.outPoint > state.inPoint;
      toast(state.loop
        ? (hasRange ? 'Looping the In→Out range' : 'Looping the whole timeline')
        : 'Loop off');
    };
    el('element-mode').onclick = function(){ setPickMode(!state.pickElement); };
    el('fit').onclick = fitTimeline;
    el('guides-btn').onclick = toggleGuides;
    el('fullscreen').onclick = toggleFullscreen;
    el('snapshot').onclick = snapshotFrame;
    el('time').onclick = openTimeEdit;
    el('time-input').addEventListener('keydown', function(event){
      if (event.key === 'Enter'){ event.preventDefault(); closeTimeEdit(true); }
      else if (event.key === 'Escape'){ event.preventDefault(); closeTimeEdit(false); }
      event.stopPropagation();
    });
    el('time-input').addEventListener('blur', function(){ closeTimeEdit(false); });
    el('tr-close').onclick = function(){ el('transition-modal').classList.remove('open'); state.trDraft = null; };
    el('tr-save').onclick = saveTransitionDialog;
    el('tr-remove').onclick = function(){
      if (state.trDraft && state.trDraft.transitionId){
        edit([{ op:'transition.remove', transitionId:state.trDraft.transitionId }]).catch(function(){});
      }
      el('transition-modal').classList.remove('open');
      state.trDraft = null;
    };
    el('export').onclick = openExport;
    el('export-close').onclick = closeExport;
    el('export-cancel').onclick = closeExport;
    el('export-start').onclick = startExport;
    el('exp-delivery').onchange = function(){
      var presetId = el('exp-delivery').value;
      if (!presetId){
        el('exp-width').disabled = false;
        el('exp-height').disabled = false;
        el('exp-width').value = state.model.width;
        el('exp-height').value = state.model.height;
        return;
      }
      var preset = state.presets.filter(function(item){ return item.id === presetId; })[0];
      if (!preset) return;
      el('exp-format').value = preset.format;
      el('exp-width').value = preset.width;
      el('exp-height').value = preset.height;
      el('exp-width').disabled = true;
      el('exp-height').disabled = true;
    };
    el('exp-inout').onclick = function(){
      if (state.inPoint === null || state.outPoint === null || state.outPoint <= state.inPoint){
        return toast('Set In (I) and Out (O) points first', true);
      }
      el('exp-start').value = state.inPoint.toFixed(3);
      el('exp-duration').value = (state.outPoint - state.inPoint).toFixed(3);
    };
    el('asset-file').onchange = function(event){ uploadAssets(event.target.files); event.target.value = ''; };
    el('timeline-scroll').addEventListener('wheel', function(event){
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(state.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX);
    }, { passive:false });
    document.addEventListener('click', function(event){
      var menu = el('ctx-menu');
      if (menu.style.display === 'block' && !menu.contains(event.target)) closeContextMenu();
    });
    document.addEventListener('contextmenu', function(event){
      if (event.target.closest && (event.target.closest('.lane-track') || event.target.closest('.ruler') || event.target.closest('.lane-label'))) return;
      closeContextMenu();
    });
    ruler.addEventListener('contextmenu', function(event){
      event.preventDefault();
      openContextMenu(event, { type:'timeline' });
    });
    ruler.addEventListener('dblclick', function(event){
      var flag = event.target.closest ? event.target.closest('.marker-flag') : null;
      if (flag) return;
      addMarker(magnetTime(timeFromClientX(event.clientX), null, event.shiftKey));
    });
    window.addEventListener('resize', function(){ resizeStage(); renderTimeline(); });
    document.addEventListener('visibilitychange', function(){ if (document.hidden) pausePlayback(); });
    setupTabs(); setupDrag(); setupWysiwyg(); setupZoom(); setupKeys();
    el('lang').textContent = LANG === 'zh-CN' ? 'EN' : '中文';
    el('lang').onclick = function(){
      var next = LANG === 'zh-CN' ? 'en' : 'zh-CN';
      try { window.localStorage.setItem('vhtml-lang', next); } catch (e) { /* storage blocked */ }
      location.reload();
    };
    applyStaticI18n();
    loadPresets();
    buildGuides();
  }

  try {
    bind();
  } catch (error) {
    // A single missing control must never brick the whole Studio shell.
    console.error('Studio bind failed', error);
  }
  loadProject().then(function(){ resizeStage(); });
})();
</script>
</body>
</html>`;
