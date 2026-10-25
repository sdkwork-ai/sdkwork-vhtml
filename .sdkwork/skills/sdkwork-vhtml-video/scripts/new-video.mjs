#!/usr/bin/env node
/**
 * new-video.mjs — scaffold a VHTML 1.1 video project from a blueprint.
 *
 * Skill: sdkwork-vhtml-video (.sdkwork/skills/sdkwork-vhtml-video)
 *
 * Usage (run from anywhere; paths are plain Node, no dependencies):
 *
 *   node new-video.mjs --list
 *   node new-video.mjs --dir <dir> [--blueprint hello|promo|vertical|ppt|data|storyboard]
 *                     [--id <project-id>] [--title <title>] [--accent <css-color>]
 *                     [--fps <rate>] [--duration <time>] [--force]
 *
 * Creates <dir>/ with vhtml.json, video.vhtml (a valid, validated blueprint
 * document), the standard asset directories, renders/ and .vhtml/cache/.
 * Deterministic: same arguments produce the same bytes. Refuses to overwrite
 * an existing non-empty directory without --force.
 *
 * Exit codes: 0 created, 1 failed, 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Blueprint documents. Placeholders: __ID__ __TITLE__ __ACCENT__ __FPS__.
// Timings are intentional (transition overlaps are real); see
// references/video-blueprints.md before re-timing.
// ---------------------------------------------------------------------------

const HELLO = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>__TITLE__</title>
    <style>
      html, body { margin: 0; background: #070c16; }
      .stage { position: absolute; inset: 0; display: grid; place-items: center;
               color: #fff; font-family: system-ui, sans-serif; text-align: center; }
      .eyebrow { font-size: 26px; letter-spacing: .42em; color: __ACCENT__; font-weight: 700; }
      h1 { font-size: 136px; letter-spacing: -5px; margin: 18px 0 0; }
      p { font-size: 34px; color: #93a9cc; margin-top: 26px; }
    </style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="__ID__" version="1.1" title="__TITLE__">
        <settings>
          <composition width="1920" height="1080" frame-rate="__FPS__" duration="__DURATION__" background="#070c16" />
        </settings>
        <scenes>
          <scene id="hello" duration="__DURATION__">
            <div class="stage">
              <div>
                <div class="eyebrow">VHTML 1.1</div>
                <h1>Hello, video.</h1>
                <p>HTML and CSS on a real timeline, rendered deterministically.</p>
              </div>
            </div>
          </scene>
        </scenes>
        <timelines>
          <timeline id="main" duration="__DURATION__">
            <lane id="visual" type="video">
              <clip id="hello-clip" ref="scene:hello" start="0s" duration="__DURATION__">
                <animate property="opacity" from="0" to="1" duration="0.8s" easing="ease-out" />
                <animate property="scale" from="1.04" to="1" duration="__DURATION__" easing="ease-out" />
              </clip>
            </lane>
            <lane id="captions" type="caption" caption-style="font-size:30px;bottom:8%">
              <cue id="cue-1" start="0.8s" duration="3.4s" text="Code is the source of truth." />
            </lane>
          </timeline>
        </timelines>
        <outputs>
          <output id="mp4" format="mp4" width="1920" height="1080" frame-rate="__FPS__" path="renders/video.mp4" />
        </outputs>
      </project>
    </vhtml>
  </body>
</html>
`;

const PROMO = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>__TITLE__</title>
    <style>
      :root { --accent: __ACCENT__; --ink: #f3f7ff; --muted: #91a7ca; }
      html, body { margin: 0; background: #050914; }
      .card { position: absolute; inset: 0; display: flex; flex-direction: column;
              justify-content: center; padding: 0 9%; }
      .eyebrow { font-size: 20px; letter-spacing: .44em; color: var(--accent);
                 font-weight: 700; margin-bottom: 22px; }
      .title { font-size: 92px; line-height: .98; letter-spacing: -3px; font-weight: 800;
               margin: 0; color: var(--ink); }
      .title em { font-style: normal; color: var(--accent); }
      .copy { font-size: 26px; color: var(--muted); margin-top: 26px; max-width: 760px; line-height: 1.5; }
      .chips { display: flex; gap: 14px; margin-top: 34px; }
      .chip { padding: 9px 16px; border: 1px solid rgba(140, 180, 255, .35); border-radius: 99px;
              color: #cfeeff; font-size: 15px; background: rgba(10, 25, 40, .55); }
      .grid { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 26px;
              padding: 110px 9%; align-content: center; }
      .feature { padding: 26px; border: 1px solid rgba(140, 180, 255, .22); border-radius: 16px;
                 background: linear-gradient(150deg, rgba(18, 38, 64, .8), rgba(8, 16, 30, .6)); }
      .feature b { display: block; font-size: 22px; color: #fff; margin-bottom: 10px; }
      .feature span { font-size: 17px; color: var(--muted); line-height: 1.45; }
      .feature i { display: block; width: 34px; height: 3px; background: var(--accent);
                   margin-bottom: 18px; border-radius: 2px; }
      .outro { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
      .outro .title { font-size: 64px; }
      @keyframes rise { from { opacity: 0; transform: translateY(46px); } to { opacity: 1; transform: none; } }
      .card > * { animation: rise .9s cubic-bezier(.2, .8, .2, 1) both; }
      .grid .feature { animation: rise .7s cubic-bezier(.2, .8, .2, 1) both; }
      .grid .feature:nth-child(2) { animation-delay: .08s; }
      .grid .feature:nth-child(3) { animation-delay: .16s; }
      .grid .feature:nth-child(4) { animation-delay: .24s; }
    </style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="__ID__" version="1.1" title="__TITLE__">
        <settings>
          <composition width="1280" height="720" frame-rate="__FPS__" duration="8s"
                       sample-rate="48000" channels="2" background="#050914" seed="7" />
        </settings>
        <scenes>
          <scene id="hero" duration="4.5s">
            <div class="card">
              <div class="eyebrow">YOUR PRODUCT</div>
              <h1 class="title">Say the one thing<br /><em>that matters.</em></h1>
              <p class="copy">Replace this paragraph with the hero promise from the brief. Keep it under two lines.</p>
              <div class="chips"><span class="chip">Benefit one</span><span class="chip">Benefit two</span><span class="chip">Benefit three</span></div>
            </div>
          </scene>
          <scene id="features" duration="4s">
            <div class="grid">
              <div class="feature"><i></i><b>Feature one</b><span>One sentence of proof.</span></div>
              <div class="feature"><i></i><b>Feature two</b><span>One sentence of proof.</span></div>
              <div class="feature"><i></i><b>Feature three</b><span>One sentence of proof.</span></div>
              <div class="feature"><i></i><b>Feature four</b><span>One sentence of proof.</span></div>
            </div>
          </scene>
          <scene id="outro" duration="3s">
            <div class="outro">
              <div>
                <h1 class="title">End with the action.</h1>
                <p class="copy">URL, tagline or call to action.</p>
              </div>
            </div>
          </scene>
        </scenes>
        <generations>
          <generate id="bg" kind="video" provider="procedural">
            <prompt>deep blue cinematic gradient with soft drifting light, abstract product film background</prompt>
            <constraints duration="8s" width="1280" height="720" frame-rate="30"></constraints>
          </generate>
          <generate id="cover" kind="image" provider="procedural">
            <prompt>abstract product cover art with soft glass shapes on midnight blue</prompt>
            <constraints width="1280" height="720"></constraints>
          </generate>
          <generate id="music" kind="music" provider="procedural">
            <prompt>warm minimal electronic underscore, slow build, soft chord pad</prompt>
            <constraints duration="8s" sample-rate="48000" channels="2"></constraints>
          </generate>
        </generations>
        <timelines>
          <timeline id="main" duration="8s">
            <lane id="background" type="video" order="0">
              <clip id="bg-clip" ref="gen:bg" start="0s" duration="8s" out="8s">
                <effect id="fx-vignette-1" type="vignette" amount="0.5"></effect>
                <effect id="fx-grain-2" type="grain" opacity="0.06"></effect>
              </clip>
            </lane>
            <lane id="story" type="video" order="1">
              <clip id="hero-clip" ref="scene:hero" start="0.4s" duration="4.1s"></clip>
              <clip id="features-clip" ref="scene:features" start="4s" duration="3.5s"></clip>
              <clip id="outro-clip" ref="scene:outro" start="7s" duration="1s"></clip>
              <transition id="transition-story-1" from="hero-clip" to="features-clip" type="crossfade" duration="0.5s"></transition>
              <transition id="transition-story-2" from="features-clip" to="outro-clip" type="fade" duration="0.5s"></transition>
            </lane>
            <lane id="cover-overlay" type="overlay" order="2">
              <clip id="cover-clip" ref="gen:cover" start="3.1s" duration="2.4s" opacity="0.32" blend="screen">
                <animate property="scale" from="1.04" to="1" duration="2.4s" easing="ease-out" />
              </clip>
            </lane>
            <lane id="music-lane" type="audio" order="3">
              <clip id="music-clip" ref="gen:music" start="0s" duration="8s" out="8s" volume="0.7" fade-in="1.2s" fade-out="1.6s"></clip>
            </lane>
            <lane id="captions" type="caption" order="4" caption-style="font-size:28px;bottom:7%;color:#eaf7ff">
              <cue id="cue-1" start="0.9s" duration="3s" text="Hero promise goes here."></cue>
              <cue id="cue-2" start="4.2s" duration="2.8s" text="Proof, not adjectives."></cue>
              <cue id="cue-3" start="7.1s" duration="0.8s" text="Call to action."></cue>
            </lane>
          </timeline>
        </timelines>
        <outputs>
          <output id="mp4" format="mp4" width="1280" height="720" frame-rate="__FPS__"
                  video-codec="libx264" audio-codec="aac" crf="20" path="renders/video.mp4"></output>
        </outputs>
      </project>
    </vhtml>
  </body>
</html>
`;

const VERTICAL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>__TITLE__</title>
    <style>
      :root { --accent: __ACCENT__; --ink: #f5f9ff; --muted: #9fb3d1; }
      html, body { margin: 0; background: #060911; }
      /* Platform UI safe area: keep content inside 6% left/right, above 18% bottom. */
      .panel { position: absolute; inset: 0; display: flex; flex-direction: column;
               justify-content: center; padding: 0 12%; text-align: left;
               font-family: system-ui, sans-serif; }
      .hook { background: radial-gradient(120% 90% at 20% 10%, #14243f 0%, #060911 70%); }
      .value { background: linear-gradient(160deg, #0b1526 0%, #060911 80%); }
      .cta  { background: radial-gradient(120% 100% at 80% 90%, #1a1030 0%, #060911 75%); }
      .kicker { font-size: 30px; letter-spacing: .4em; color: var(--accent); font-weight: 700; }
      h1 { font-size: 110px; line-height: 1.02; letter-spacing: -4px; font-weight: 800;
           color: var(--ink); margin: 20px 0 0; }
      h1 em { font-style: normal; color: var(--accent); }
      p { font-size: 40px; color: var(--muted); margin-top: 26px; line-height: 1.4; }
      .steps { display: grid; gap: 22px; margin-top: 34px; }
      .step { display: flex; gap: 18px; align-items: baseline; font-size: 40px; color: var(--ink); }
      .step i { font-style: normal; color: var(--accent); font-weight: 800; }
      @keyframes pop { from { opacity: 0; transform: translateY(60px) scale(.98); }
                       to { opacity: 1; transform: none; } }
      .panel > * { animation: pop .8s cubic-bezier(.2, .8, .2, 1) both; }
      .panel > *:nth-child(2) { animation-delay: .12s; }
      .panel > *:nth-child(3) { animation-delay: .26s; }
    </style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="__ID__" version="1.1" title="__TITLE__">
        <settings>
          <composition width="1080" height="1920" frame-rate="__FPS__" duration="8s"
                       sample-rate="48000" channels="2" background="#060911" seed="5" />
        </settings>
        <scenes>
          <scene id="hook" duration="2.5s">
            <div class="panel hook">
              <div class="kicker">STOP SCROLLING</div>
              <h1>One bold<br /><em>first frame.</em></h1>
            </div>
          </scene>
          <scene id="value" duration="3s">
            <div class="panel value">
              <h1>Three beats,<br /><em>fast.</em></h1>
              <div class="steps">
                <div class="step"><i>01</i> Beat one in six words</div>
                <div class="step"><i>02</i> Beat two in six words</div>
                <div class="step"><i>03</i> Beat three in six words</div>
              </div>
            </div>
          </scene>
          <scene id="cta" duration="3.2s">
            <div class="panel cta">
              <div class="kicker">NOW</div>
              <h1>Follow for<br /><em>part two.</em></h1>
              <p>@yourhandle</p>
            </div>
          </scene>
        </scenes>
        <generations>
          <generate id="music" kind="music" provider="procedural">
            <prompt>bright minimal pop loop, tight drums, confident</prompt>
            <constraints duration="8s" sample-rate="48000" channels="2"></constraints>
          </generate>
        </generations>
        <timelines>
          <timeline id="main" duration="8s">
            <lane id="story" type="video" order="0">
              <clip id="hook-clip" ref="scene:hook" start="0s" duration="2.5s"></clip>
              <clip id="value-clip" ref="scene:value" start="2.2s" duration="3s"></clip>
              <clip id="cta-clip" ref="scene:cta" start="4.8s" duration="3.2s"></clip>
              <transition id="t1" from="hook-clip" to="value-clip" type="slide" duration="0.3s" direction="up"></transition>
              <transition id="t2" from="value-clip" to="cta-clip" type="zoom" duration="0.4s"></transition>
            </lane>
            <lane id="music-lane" type="audio" order="1">
              <clip id="music-clip" ref="gen:music" start="0s" duration="8s" out="8s"
                    volume="0.75" fade-in="0.4s" fade-out="1.2s"></clip>
            </lane>
            <lane id="captions" type="caption" order="2"
                  caption-style="font-size:44px;bottom:22%;color:#ffffff;text-align:center">
              <cue id="cue-1" start="0.3s" duration="1.9s" text="Hook line here"></cue>
              <cue id="cue-2" start="2.6s" duration="2.2s" text="Value line here"></cue>
              <cue id="cue-3" start="5.2s" duration="2.4s" text="Call to action"></cue>
            </lane>
          </timeline>
        </timelines>
        <outputs>
          <output id="mp4" format="mp4" width="1080" height="1920" frame-rate="__FPS__"
                  video-codec="libx264" audio-codec="aac" crf="20" path="renders/video.mp4"></output>
        </outputs>
      </project>
    </vhtml>
  </body>
</html>
`;

const STORYBOARD = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>__TITLE__</title>
    <style>
      :root { --accent: __ACCENT__; --ink: #eef6ff; --muted: #8fa9c9; }
      html, body { margin: 0; background: #04070e; font-family: system-ui, sans-serif; }
      .title-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
      .title-card .eyebrow { font-size: 24px; letter-spacing: .5em; color: var(--accent); font-weight: 700; }
      .title-card h1 { font-size: 120px; letter-spacing: -4px; margin: 22px 0 0; color: var(--ink); }
      .title-card p { font-size: 30px; color: var(--muted); margin-top: 24px; }
      .end-card { position: absolute; inset: 0; display: grid; place-items: center; }
      .end-card h1 { font-size: 88px; color: var(--ink); letter-spacing: -3px; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .title-card > div, .end-card > div { animation: fadeIn 1s ease-out both; }
    </style>
  </head>
  <body>
    <vhtml version="1.1">
      <project id="__ID__" version="1.1" title="__TITLE__">
        <settings>
          <composition width="1280" height="720" frame-rate="__FPS__" duration="12s"
                       sample-rate="48000" channels="2" background="#04070e" seed="9" />
        </settings>
        <scenes>
          <scene id="title" duration="2.5s">
            <div class="title-card">
              <div>
                <div class="eyebrow">AI STORYBOARD</div>
                <h1>Your film.</h1>
                <p>Shot list planned as data, rendered as video.</p>
              </div>
            </div>
          </scene>
          <scene id="end" duration="3s">
            <div class="end-card"><div><h1>Built shot by shot.</h1></div></div>
          </scene>
        </scenes>
        <generations>
          <generate id="cover" kind="image" provider="procedural">
            <prompt>cinematic establishing frame, golden hour skyline, wide, film grain</prompt>
            <constraints width="1280" height="720"></constraints>
          </generate>
          <generate id="shot-1" kind="video" provider="procedural">
            <prompt>slow push in over the skyline toward the sun</prompt>
            <gen-input ref="gen:cover" role="first-frame"></gen-input>
            <constraints duration="4s" width="1280" height="720" frame-rate="30"></constraints>
          </generate>
          <generate id="shot-2" kind="video" provider="procedural">
            <prompt>gentle orbit across rooftops, light drifting</prompt>
            <gen-input ref="gen:shot-1" role="first-frame"></gen-input>
            <constraints duration="4s" width="1280" height="720" frame-rate="30"></constraints>
          </generate>
          <generate id="music" kind="music" provider="procedural">
            <prompt>hopeful cinematic underscore with strings</prompt>
            <direction>{"music":{"bpm":96,"mood":"hopeful","vocals":"none","loop":false}}</direction>
            <constraints duration="12s" sample-rate="48000" channels="2"></constraints>
          </generate>
          <generate id="whoosh" kind="sfx" provider="procedural">
            <prompt>soft cinematic transition whoosh</prompt>
            <direction>{"sfx":{"category":"whoosh","environment":"outdoor","intensity":"medium","loop":false}}</direction>
            <constraints duration="0.6s" sample-rate="48000" channels="2"></constraints>
          </generate>
        </generations>
        <timelines>
          <timeline id="main" duration="12s">
            <lane id="story" type="video" order="0">
              <clip id="title-clip" ref="scene:title" start="0s" duration="2.5s"></clip>
              <clip id="shot-1-clip" ref="gen:shot-1" start="2s" duration="4s"></clip>
              <clip id="shot-2-clip" ref="gen:shot-2" start="5.5s" duration="4s"></clip>
              <clip id="end-clip" ref="scene:end" start="9s" duration="3s"></clip>
              <transition id="t1" from="title-clip" to="shot-1-clip" type="crossfade" duration="0.5s"></transition>
              <transition id="t2" from="shot-1-clip" to="shot-2-clip" type="crossfade" duration="0.5s"></transition>
              <transition id="t3" from="shot-2-clip" to="end-clip" type="fade" duration="0.5s"></transition>
            </lane>
            <lane id="music-lane" type="audio" order="1">
              <clip id="music-clip" ref="gen:music" start="0s" duration="12s" out="12s" volume="0.7" fade-in="1s" fade-out="1.5s">
                <audio-effect id="duck-1" type="ducking" sidechain-track="sfx" threshold="-24"
                              reduction="0.2" attack="0.05" release="0.4" hold="0.2"></audio-effect>
              </clip>
            </lane>
            <lane id="sfx" type="audio" order="2">
              <clip id="whoosh-clip" ref="gen:whoosh" start="1.9s" duration="0.6s" volume="0.9"></clip>
            </lane>
            <lane id="captions" type="caption" order="3" caption-style="font-size:28px;bottom:7%;color:#eaf4ff">
              <cue id="cue-1" start="0.4s" duration="1.8s" text="Every film starts as a plan."></cue>
              <cue id="cue-2" start="2.6s" duration="3.2s" text="Shots are generation tasks with direction."></cue>
              <cue id="cue-3" start="6.1s" duration="2.6s" text="Chained first frames keep continuity."></cue>
              <cue id="cue-4" start="9.4s" duration="2.2s" text="Assemble. Export. Ship."></cue>
            </lane>
          </timeline>
        </timelines>
        <outputs>
          <output id="mp4" format="mp4" width="1280" height="720" frame-rate="__FPS__"
                  video-codec="libx264" audio-codec="aac" crf="20" path="renders/video.mp4"></output>
        </outputs>
      </project>
    </vhtml>
  </body>
</html>
`;

// Program documents: the skeleton declares composition + lanes; the inline
// program builds scenes/clips/cues from the JSON data block. Keep program code
// synchronous, dependency-free and string-concatenation style.
const PPT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>__TITLE__</title>
</head>
<body>
<vhtml version="1.1">
<project id="__ID__" version="1.1" title="__TITLE__">
  <settings>
    <composition width="1920" height="1080" frame-rate="__FPS__" duration="12s" background="#0a0f1c" seed="3"></composition>
  </settings>
  <timelines>
    <timeline id="main" duration="12s">
      <lane id="visual" type="video"></lane>
      <lane id="captions" type="caption" caption-style="font-size:26px;bottom:6%;color:#dfe9f7"></lane>
    </timeline>
  </timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
// Slide deck built from the "slides" data block. Edit the data, not the code.
var OVERLAP = 0.5;
var slides = vhtml.data.get('slides');

vhtml.addStyle('html, body { margin: 0; background: #0a0f1c; font-family: system-ui, sans-serif; }');
vhtml.addStyle('.slide { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 10%; }');
vhtml.addStyle('.slide .kicker { font-size: 22px; letter-spacing: .44em; font-weight: 700; margin-bottom: 26px; }');
vhtml.addStyle('.slide h1 { font-size: 96px; letter-spacing: -3px; font-weight: 800; color: #f2f7ff; margin: 0; }');
vhtml.addStyle('.slide ul { list-style: none; padding: 0; margin: 34px 0 0; display: grid; gap: 20px; }');
vhtml.addStyle('.slide li { font-size: 34px; color: #9db1cf; padding-left: 34px; position: relative; }');
vhtml.addStyle('.slide li::before { content: ""; position: absolute; left: 0; top: .55em; width: 18px; height: 4px; border-radius: 2px; }');
vhtml.addStyle('@keyframes slideIn { from { opacity: 0; transform: translateY(44px); } to { opacity: 1; transform: none; } }');
vhtml.addStyle('.slide > * { animation: slideIn .8s cubic-bezier(.2, .8, .2, 1) both; }');
vhtml.addStyle('.slide > *:nth-child(2) { animation-delay: .1s; } .slide > *:nth-child(3) { animation-delay: .2s; }');

var types = ['fade', 'slide', 'wipe'];
var clipIds = [];
var cursor = 0;
for (var i = 0; i < slides.length; i++) {
  var slide = slides[i];
  var sceneId = 'slide-' + slide.id;
  var bullets = (slide.bullets || []).map(function (b) { return '<li>' + b + '</li>'; }).join('');
  var bulletCss = (slide.bullets || []).length
    ? '.slide li::before { background: ' + slide.accent + '; }'
    : '';
  vhtml.addScene({
    id: sceneId,
    duration: slide.duration,
    css: '.slide .kicker { color: ' + slide.accent + '; } ' + bulletCss,
    html: '<div class="slide"><div class="kicker">' + slide.kicker + '</div>'
      + '<h1>' + slide.title + '</h1>'
      + (bullets ? '<ul>' + bullets + '</ul>' : '')
      + '</div>',
  });
  var clipId = 'slide-clip-' + slide.id;
  var start = i === 0 ? 0 : cursor - OVERLAP;
  vhtml.addClip('visual', { id: clipId, ref: 'scene:' + sceneId, start: start, duration: slide.duration });
  var cueLength = slide.duration - 0.4 < 2.5 ? slide.duration - 0.4 : 2.5;
  vhtml.addCue({ text: slide.kicker + ' - ' + slide.title, start: start + 0.2, duration: cueLength });
  clipIds.push(clipId);
  cursor = start + slide.duration;
  if (i > 0) {
    var transitionType = types[(i - 1) % types.length];
    var transitionSpec = {
      fromClipId: clipIds[i - 1],
      toClipId: clipIds[i],
      type: transitionType,
      duration: OVERLAP,
    };
    if (transitionType === 'slide') transitionSpec.direction = 'left';
    vhtml.addTransition('visual', transitionSpec);
  }
}
vhtml.setDuration(cursor);
// The parser already injects a default output with id "mp4"; use a distinct id.
vhtml.addOutput({ id: 'main-mp4', format: 'mp4', width: 1920, height: 1080, path: 'renders/video.mp4' });
vhtml.info('built ' + slides.length + ' slides, total ' + cursor + 's');
</script>
<script type="application/json" id="slides">
[
  { "id": "intro",    "kicker": "01 OVERVIEW",  "title": "One deck, one file",   "accent": "#6ee7ff", "duration": 2.5, "bullets": ["Slides are HTML scenes", "Timing is a timeline", "Export is deterministic"] },
  { "id": "problem",  "kicker": "02 PROBLEM",   "title": "Video tools fight agents", "accent": "#9d7bff", "duration": 2.5, "bullets": ["Binary timelines do not diff", "UI automation is brittle", "Rendering is not repeatable"] },
  { "id": "solution", "kicker": "03 APPROACH",  "title": "Write the video as code",  "accent": "#ffd166", "duration": 2.5, "bullets": ["HTML/CSS render the visuals", "The model owns time", "Edits are operations"] },
  { "id": "close",    "kicker": "04 NEXT",      "title": "Build yours today",    "accent": "#7cf5c4", "duration": 2.0, "bullets": ["vhtml init my-deck", "Edit the data block", "Export to MP4"] }
]
</script>
</vhtml>
</body>
</html>
`;

const DATA = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>__TITLE__</title>
</head>
<body>
<vhtml version="1.1">
<project id="__ID__" version="1.1" title="__TITLE__">
  <settings>
    <composition width="1280" height="720" frame-rate="__FPS__" duration="4s" background="#070b14" seed="11"></composition>
  </settings>
  <timelines>
    <timeline id="main" duration="4s">
      <lane id="visual" type="video"></lane>
      <lane id="captions" type="caption" caption-style="font-size:26px;bottom:6%;color:#e6eef9"></lane>
    </timeline>
  </timelines>
</project>
<script type="application/vnd.vhtml.program+javascript">
// One card per data row. Keep "at" strictly increasing; each card shows 1s.
var rows = vhtml.data.get('rows').slice().sort(function (a, b) { return a.at - b.at; });

vhtml.addStyle('html, body { margin: 0; background: #070b14; font-family: system-ui, sans-serif; }');
vhtml.addStyle('.card { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 10%; }');
vhtml.addStyle('.card .label { font-size: 24px; letter-spacing: .4em; font-weight: 700; margin-bottom: 18px; }');
vhtml.addStyle('.card h1 { font-size: 84px; letter-spacing: -3px; color: #f2f7ff; margin: 0; font-weight: 800; }');
vhtml.addStyle('.card .value { font-size: 56px; font-weight: 800; margin-top: 30px; }');
vhtml.addStyle('.card .track { margin-top: 18px; height: 14px; border-radius: 7px; background: rgba(140, 170, 220, .18); overflow: hidden; }');
vhtml.addStyle('.card .bar { height: 100%; border-radius: 7px; transform-origin: left center; }');
vhtml.addStyle('@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }');
vhtml.addStyle('.card .bar { animation: grow .7s cubic-bezier(.2, .8, .2, 1) both; }');
vhtml.addStyle('@keyframes rise { from { opacity: 0; transform: translateY(36px); } to { opacity: 1; transform: none; } }');
vhtml.addStyle('.card > * { animation: rise .6s ease-out both; }');

for (var i = 0; i < rows.length; i++) {
  var row = rows[i];
  // Sandbox Math exposes only the seeded random(); use plain arithmetic.
  var pct = ((row.value / row.max) * 100 + 0.5) | 0;
  if (pct < 0) pct = 0; else if (pct > 100) pct = 100;
  vhtml.addScene({
    id: 'row-' + row.id,
    duration: 1,
    css: '.card .label { color: ' + row.accent + '; } .card .value { color: ' + row.accent + '; } .card .bar { background: ' + row.accent + '; }',
    html: '<div class="card">'
      + '<div class="label">' + row.label + '</div>'
      + '<h1>' + row.title + '</h1>'
      + '<div class="value">' + row.value + '</div>'
      + '<div class="track"><div class="bar" style="width: ' + pct + '%"></div></div>'
      + '</div>',
  });
  vhtml.addClip('visual', { id: 'row-clip-' + row.id, ref: 'scene:row-' + row.id, start: row.at, duration: 1 });
  vhtml.addCue({ text: row.title + ': ' + row.value, start: row.at + 0.1, duration: 0.8 });
}
var total = rows.length ? rows[rows.length - 1].at + 1 : 1;
vhtml.setDuration(total);
// The parser already injects a default output with id "mp4"; use a distinct id.
vhtml.addOutput({ id: 'main-mp4', format: 'mp4', width: 1280, height: 720, path: 'renders/video.mp4' });
vhtml.info('built ' + rows.length + ' data cards, total ' + total + 's');
</script>
<script type="application/json" id="rows">
[
  { "id": "r1", "label": "Q1 REVENUE", "title": "Product line A", "value": 128, "max": 200, "accent": "#6ee7ff", "at": 0 },
  { "id": "r2", "label": "Q2 REVENUE", "title": "Product line B", "value": 164, "max": 200, "accent": "#9d7bff", "at": 1 },
  { "id": "r3", "label": "Q3 REVENUE", "title": "Product line C", "value": 187, "max": 200, "accent": "#ffd166", "at": 2 },
  { "id": "r4", "label": "Q4 REVENUE", "title": "Product line D", "value": 199, "max": 200, "accent": "#7cf5c4", "at": 3 }
]
</script>
</vhtml>
</body>
</html>
`;

const BLUEPRINTS = {
  hello: {
    description: 'Minimal 1920x1080 title card: one scene, animations, one caption (examples/01)',
    accent: '#6ee7ff',
    duration: '5s',
    durationEditable: true,
    document: HELLO,
  },
  promo: {
    description: 'Landscape product promo: hero/features/outro, generated background + cover + music, crossfades, captions (examples/02)',
    accent: '#6ee7ff',
    duration: '8s',
    document: PROMO,
  },
  vertical: {
    description: 'Native 1080x1920 social teaser: hook/value/cta, safe-area captions, slide/zoom transitions, music (examples/05)',
    accent: '#ff5c8a',
    duration: '8s',
    document: VERTICAL,
  },
  ppt: {
    description: '1920x1080 slide deck as a single-file program document: slides from a JSON data block, alternating transitions (examples/07)',
    accent: '#6ee7ff',
    duration: '11s',
    document: PPT,
  },
  data: {
    description: 'Data-driven chart cards as a program document: scenes/clips/cues generated from a JSON rows block (examples/03, 08)',
    accent: '#6ee7ff',
    duration: '4s',
    document: DATA,
  },
  storyboard: {
    description: 'AI storyboard film: cover image feeding two chained first-frame video shots, music + sfx with ducking, captions (examples/06)',
    accent: '#ffc46e',
    duration: '12s',
    document: STORYBOARD,
  },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage:
  node new-video.mjs --list
  node new-video.mjs --dir <dir> [--blueprint <name>] [--id <id>] [--title <title>]
                    [--accent <css-color>] [--fps <rate>] [--duration <time>] [--force]

blueprints: ${Object.keys(BLUEPRINTS).join(', ')} (default: hello)`;

function fail(message, code) {
  console.error(`error: ${message}`);
  console.error(USAGE);
  process.exit(code ?? 2);
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { options._.push(arg); continue; }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1
      ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true)
      : arg.slice(eq + 1);
    options[name] = value;
  }
  return options;
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-video';
const escapeCssComment = (value) => String(value).replace(/\*\//g, '*\u2044');

function renderTemplate(template, vars) {
  return template
    .replace(/__ID__/g, escapeAttr(vars.id))
    .replace(/__TITLE__/g, escapeAttr(vars.title))
    .replace(/__ACCENT__/g, String(vars.accent))
    .replace(/__FPS__/g, escapeAttr(vars.fps))
    .replace(/__DURATION__/g, escapeAttr(vars.duration));
}

const MANIFEST = (vars) => JSON.stringify({
  version: '1.1',
  id: vars.id,
  entry: 'video.vhtml',
  paths: {
    assets: 'assets',
    images: 'assets/images',
    video: 'assets/video',
    audio: 'assets/audio',
    fonts: 'assets/fonts',
    scenes: 'scenes',
    generated: 'generated',
    renders: 'renders',
    cache: '.vhtml/cache',
  },
  preview: { port: 4173, open: false },
  export: { outDir: 'renders', format: 'mp4', crf: 20 },
}, null, 2) + '\n';

const PROJECT_README = (vars, blueprintName) => `# ${vars.title}

VHTML 1.1 video project scaffolded from the \`${blueprintName}\` blueprint
(sdkwork-vhtml-video skill). Edit \`video.vhtml\` — it is the source of
truth. For program documents (\`ppt\`, \`data\`), edit the inline program and
JSON data blocks.

## Layout

\`\`\`text
video.vhtml          canonical project document
vhtml.json           manifest (entry / paths / preview / export)
assets/              hand-authored media (images / video / audio / fonts)
scenes/              external Scene fragments (optional: vhtml split)
generated/           provider outputs (do not hand-edit)
renders/             exports
.vhtml/cache/        generation cache (do not hand-edit)
\`\`\`

## Commands

\`\`\`bash
pnpm exec vhtml validate .        # model + asset checks
pnpm exec vhtml preview . --open  # WYSIWYG Studio
pnpm exec vhtml render . --time 1s --out frame.png
pnpm exec vhtml export . --delivery web-1080p --out renders/video.mp4
\`\`\`

\`generated/\` tasks use the offline deterministic \`procedural\` provider.
Swap providers or add AI tasks via the sdkwork-vhtml-video skill.
Keep the project brief next to this file as \`brief.md\`
(see the skill's assets/video-brief.template.md).
`;

const GITIGNORE = `# VHTML local state
.vhtml/cache/
node_modules/
tmp/
`;

function writeProject(target, files, force) {
  if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target);
    if (entries.length && !force) {
      fail(`directory not empty: ${target} (use --force to overwrite)`, 1);
    }
  } else {
    fs.mkdirSync(target, { recursive: true });
  }
  for (const [relativeFile, content] of Object.entries(files)) {
    const absolute = path.join(target, relativeFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  for (const relativeDir of [
    'assets/images', 'assets/video', 'assets/audio', 'assets/fonts', 'assets/data',
    'scenes', 'generated', 'renders', path.join('.vhtml', 'cache'),
  ]) {
    const absolute = path.join(target, relativeDir);
    fs.mkdirSync(absolute, { recursive: true });
    const keep = path.join(absolute, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    console.log('available blueprints:\n');
    for (const [name, blueprint] of Object.entries(BLUEPRINTS)) {
      console.log(`  ${name.padEnd(12)} ${blueprint.description}`);
    }
    return 0;
  }

  const dir = options.dir ?? options._[0];
  if (!dir || typeof dir !== 'string') fail('--dir <dir> is required');
  const blueprintName = typeof options.blueprint === 'string' ? options.blueprint : 'hello';
  const blueprint = BLUEPRINTS[blueprintName];
  if (!blueprint) fail(`unknown blueprint '${blueprintName}' (use --list)`);

  const accent = typeof options.accent === 'string' && options.accent.trim()
    ? options.accent.trim()
    : blueprint.accent;
  if (!/^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(accent)) {
    fail(`--accent must be a CSS color, got '${accent}'`);
  }
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : 'My Video';
  let id = typeof options.id === 'string' && options.id.trim()
    ? slugify(options.id)
    : slugify(path.basename(path.resolve(String(dir))));
  // Global ID rules make the project id collide with any other element id in
  // the document; suffix the project id when it hits a blueprint id.
  const documentIds = new Set(
    [...blueprint.document.matchAll(/ id="((?!__).+?)"/g)].map((match) => match[1]),
  );
  while (documentIds.has(id)) id = `${id}-project`;
  const fps = typeof options.fps === 'string' && options.fps.trim()
    ? options.fps.trim()
    : '30/1';

  let duration = blueprint.duration;
  if (typeof options.duration === 'string' && options.duration.trim()) {
    if (blueprint.durationEditable) {
      duration = options.duration.trim();
    } else if (options.duration.trim() !== blueprint.duration) {
      console.warn(`note: blueprint '${blueprintName}' owns its internal timing; --duration ignored. ` +
        `Edit scene/clip durations in video.vhtml after scaffolding.`);
    }
  }

  const vars = { id, title, accent, fps, duration };
  const files = {
    'vhtml.json': MANIFEST(vars),
    'video.vhtml': renderTemplate(blueprint.document, vars),
    'README.md': PROJECT_README(vars, blueprintName),
    '.gitignore': GITIGNORE,
  };
  writeProject(String(dir), files, Boolean(options.force));

  console.log(`created ${path.resolve(String(dir))} from blueprint '${blueprintName}'`);
  console.log(`  id: ${id}  title: ${title}  accent: ${accent}  fps: ${fps}  duration: ${duration}`);
  console.log('next:');
  console.log('  1. fill brief.md (skill asset video-brief.template.md) and edit video.vhtml');
  console.log(`  2. node .sdkwork/skills/sdkwork-vhtml-video/scripts/check-project.mjs ${dir}`);
  console.log(`  3. vhtml preview ${dir} --open`);
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
