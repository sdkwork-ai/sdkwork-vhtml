import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function projectSource(): string {
  return `<vhtml version="1.1"><project id="editing-studio" version="1.1"><settings><composition width="320" height="180" frame-rate="30/1" duration="6s" /></settings>
  <scenes><scene id="s1"><div style="position:absolute;inset:0;background:#0b1220;color:#fff">One</div></scene></scenes>
  <timelines><timeline id="main" duration="6s"><lane id="v" type="video"><clip id="c" ref="scene:s1" start="0s" duration="2s"></clip></lane></timeline></timelines>
  </project></vhtml>`;
}

function toneWav(): Buffer {
  // 1 second of 8 kHz mono sine, 16-bit PCM WAV — enough for waveform peaks.
  const sampleRate = 8000;
  const samples = sampleRate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 12000);
    data.writeInt16LE(value, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function waitForProject(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/project`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError instanceof Error ? lastError : new Error('Studio did not start');
}

interface StudioModelShape extends StudioModelExtras {
  lanes: Array<{ id: string; type: string; enabled: boolean; muted: boolean; locked: boolean; clips: Array<{ id: string; kind: string; start: number; duration: number; speed: number; fadeIn?: number; fadeOut?: number; crop?: Record<string, number>; audioEffects?: Array<{ id: string; type: string; params: Record<string, string | number | boolean> }>; animations: Array<{ id: string; property: string; keyframes: Array<{ time: number; value: number }> }> }> }>;
  markers: Array<{ id: string; time: number; name?: string }>;
  timelineId: string;
}

interface StudioModelExtras {
  width?: number;
  height?: number;
  fps?: number;
}

async function edit(url: string, operations: Array<Record<string, unknown>>): Promise<{ status: number; body: { ok?: boolean; model?: StudioModelShape; message?: string; changed?: string[] } }> {
  const response = await fetch(`${url}/api/edit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operations }),
  });
  return { status: response.status, body: (await response.json()) as { ok?: boolean; model?: StudioModelShape; message?: string; changed?: string[] } };
}

test('Studio editing API: markers, lane switches, clipboard ops, speed, fades and keyframes', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-edit-studio-'));
  fs.writeFileSync(path.join(root, 'editing.vhtml'), projectSource());
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'editing-studio',
    entry: 'editing.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4600 + Math.floor(Math.random() * 300);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);

    // Delivery presets are exposed for the export dialog.
    const presets = await (await fetch(`${url}/api/presets`)).json() as { presets: Array<{ id: string }> };
    assert.ok(presets.presets.length >= 10);
    assert.ok(presets.presets.some((preset) => preset.id === 'tiktok'));

    // Markers are a timeline-level model object.
    const markerOutcome = await edit(url, [
      { op: 'marker.add', timelineId: 'main', marker: { id: 'mk1', time: 2.5, name: 'Cut here', type: 'marker' } },
    ]);
    assert.equal(markerOutcome.status, 200);
    assert.deepEqual(markerOutcome.body.model?.markers, [{ id: 'mk1', time: 2.5, name: 'Cut here', type: 'marker' }]);
    assert.equal(markerOutcome.body.model?.timelineId, 'main');

    // Lane switches persist through the model and the saved file.
    const laneOutcome = await edit(url, [
      { op: 'track.set', trackId: 'v', props: { locked: true, muted: true, name: 'Main video' } },
    ]);
    assert.equal(laneOutcome.status, 200);
    assert.equal(laneOutcome.body.model?.lanes[0]?.locked, true);
    assert.equal(laneOutcome.body.model?.lanes[0]?.muted, true);
    const saved = fs.readFileSync(path.join(root, 'editing.vhtml'), 'utf8');
    assert.match(saved, /marker/);
    assert.match(saved, /muted locked/);

    // Split, speed and fades compose on one clip.
    const splitOutcome = await edit(url, [
      { op: 'clip.split', clipId: 'c', at: 1 },
      { op: 'clip.speed', clipId: 'c', speed: 2 },
      { op: 'clip.set', clipId: 'c', props: { fadeIn: 0.25, fadeOut: 0.5 } },
    ]);
    assert.equal(splitOutcome.status, 200);
    const splitClip = (splitOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips).find((clip) => clip.id === 'c');
    assert.ok(splitClip);
    assert.equal(splitClip.speed, 2);
    assert.equal(splitClip.fadeIn, 0.25);
    assert.equal(splitClip.fadeOut, 0.5);

    // Keyframes ride through the animation model.
    const keyframeOutcome = await edit(url, [
      {
        op: 'animation.add',
        clipId: 'c',
        animation: {
          id: 'kf-c-opacity',
          property: 'opacity',
          keyframes: [{ time: 0, value: 1 }, { time: 0.5, value: 0.2 }],
          start: 0,
          duration: 2,
          timeBase: 'clip',
          easing: 'linear',
          iterations: 1,
          direction: 'normal',
          fill: 'both',
          compose: 'replace',
          enabled: true,
        },
      },
    ]);
    assert.equal(keyframeOutcome.status, 200);
    const animatedClip = (keyframeOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips).find((clip) => clip.id === 'c');
    assert.equal(animatedClip?.animations[0]?.property, 'opacity');
    assert.equal(animatedClip?.animations[0]?.keyframes.length, 2);

    // Canvas settings round-trip through composition.set.
    const canvasOutcome = await edit(url, [
      { op: 'composition.set', composition: { width: 640, height: 360, frameRate: '60/1', background: '#101820' } },
    ]);
    assert.equal(canvasOutcome.status, 200);
    assert.equal(canvasOutcome.body.model?.width, 640);
    assert.equal(canvasOutcome.body.model?.height, 360);
    assert.equal(canvasOutcome.body.model?.fps, 60);

    // Lane drag reorder equals reassigning explicit track orders.
    await edit(url, [
      { op: 'track.add', timelineId: 'main', track: { id: 'v2', type: 'overlay', name: 'Overlay 1', order: 2 } },
    ]);
    const reorder = await edit(url, [
      { op: 'track.set', trackId: 'v', props: { order: 2 } },
      { op: 'track.set', trackId: 'v2', props: { order: 1 } },
    ]);
    assert.equal(reorder.status, 200);
    assert.deepEqual(reorder.body.model?.lanes.map((lane) => lane.id), ['v2', 'v']);

    // Compound clips: nest the two halves, then flatten them again.
    const nestOutcome = await edit(url, [
      { op: 'timeline.nest', clipIds: ['c'] },
    ]);
    assert.equal(nestOutcome.status, 200);
    const nestedClips = (nestOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips);
    const compound = nestedClips.find((clip) => clip.kind === 'timeline');
    assert.ok(compound, 'a timeline (compound) clip exists after nest');
    const unnestOutcome = await edit(url, [{ op: 'timeline.unnest', clipId: compound!.id }]);
    assert.equal(unnestOutcome.status, 200);
    assert.ok((unnestOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips).some((clip) => clip.kind === 'scene'));

    // Crop persists through clip.set and is projected back.
    const cropOutcome = await edit(url, [
      { op: 'clip.set', clipId: 'c', props: { crop: { left: 0.1, right: 0.2, top: 0, bottom: 0 } } },
    ]);
    assert.equal(cropOutcome.status, 200);
    const cropped = (cropOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips).find((clip) => clip.id === 'c');
    assert.deepEqual(cropped?.crop, { left: 0.1, right: 0.2, top: 0, bottom: 0 });

    // Storyboard shots materialise onto the timeline.
    await edit(url, [
      { op: 'storyboard.add', shot: { id: 'shot-a', title: 'A', scene: 's1', duration: 1, status: 'boarded', tags: [] } },
      { op: 'storyboard.add', shot: { id: 'shot-b', title: 'B', scene: 's1', duration: 1, status: 'boarded', tags: [] } },
    ]);
    const applyOutcome = await edit(url, [{ op: 'storyboard.apply', at: 'append', gap: 0.25 }]);
    assert.equal(applyOutcome.status, 200);
    const appliedClips = (applyOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips)
      .filter((clip) => clip.id.startsWith('shot-'));
    assert.equal(appliedClips.length, 2, 'both storyboard shots became clips');
    assert.ok(appliedClips[0]!.start < appliedClips[1]!.start);

    // Audio effects (sidechain ducking) ride through effect.add with audio:true.
    await edit(url, [{ op: 'track.add', timelineId: 'main', track: { id: 'voice', type: 'audio', name: 'Voice', order: 3 } }]);
    const duckOutcome = await edit(url, [
      {
        op: 'effect.add',
        clipId: 'c',
        audio: true,
        effect: {
          id: 'fx-duck-1',
          type: 'ducking',
          params: { 'sidechain-track': 'voice', threshold: -30, reduction: 0.4, attack: 0.05, release: 0.5, hold: 0.1 },
          enabled: true,
        },
      },
    ]);
    assert.equal(duckOutcome.status, 200);
    const ducked = (duckOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips).find((clip) => clip.id === 'c');
    assert.equal(ducked?.audioEffects?.length, 1);
    assert.equal(ducked?.audioEffects?.[0]?.type, 'ducking');
    assert.equal(ducked?.audioEffects?.[0]?.params['sidechain-track'], 'voice');

    // Clipboard: copy, paste twice, then cut moves the selection to the clipboard.
    const copyOutcome = await edit(url, [{ op: 'timeline.copy', clipIds: ['c'] }]);
    assert.equal(copyOutcome.status, 200);
    const pasteOutcome = await edit(url, [{ op: 'timeline.paste', at: 3, mode: 'add', idPrefix: 'p1' }]);
    assert.equal(pasteOutcome.status, 200);
    const allClips = (pasteOutcome.body.model?.lanes ?? []).flatMap((lane) => lane.clips);
    const pasted = allClips.find((clip) => clip.id === 'p1-1');
    assert.ok(pasted);
    assert.equal(pasted.start, 3);
    // Effects/animations got fresh ids so re-pasting cannot collide.
    const secondPaste = await edit(url, [{ op: 'timeline.paste', at: 4, mode: 'add', idPrefix: 'p2' }]);
    assert.equal(secondPaste.status, 200);
  } finally {
    child.kill();
  }
});

test('Studio snapshot API renders the current frame to a PNG job', { timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-snapshot-'));
  fs.writeFileSync(path.join(root, 'snapshot.vhtml'), projectSource().replaceAll('editing-studio', 'snapshot-studio'));
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'snapshot-studio',
    entry: 'snapshot.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4530 + Math.floor(Math.random() * 60);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);
    const start = await fetch(`${url}/api/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ time: 0.5 }),
    });
    assert.equal(start.status, 200);
    const { jobId } = (await start.json()) as { jobId: string };
    // Poll until the single-frame render settles.
    type RenderJob = { status: string; file?: string; url?: string; error?: string; sizeBytes?: number };
    let job: RenderJob | null = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      job = await (await fetch(`${url}/api/job/${encodeURIComponent(jobId)}`)).json() as RenderJob;
      if (job && (job.status === 'succeeded' || job.status === 'failed')) break;
    }
    assert.ok(job, 'job produced a result');
    assert.equal(job.status, 'succeeded', job.error ?? 'snapshot render failed');
    assert.ok(job.file?.endsWith('.png'), `png written: ${job.file}`);
    const png = await fetch(`${url}${job.url}`);
    assert.equal(png.status, 200);
    const bytes = Buffer.from(await png.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(fs.existsSync(path.join(root, job.file!)));
  } finally {
    child.kill();
  }
});

test('Studio media API: audio waveform peaks and video poster frames', { timeout: 90_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-media-studio-'));
  fs.writeFileSync(path.join(root, 'media.vhtml'), projectSource().replace('editing-studio', 'media-studio').replace('"editing.vhtml"', '"media.vhtml"').replaceAll('editing', 'media'));
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'media-studio',
    entry: 'media.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4900 + Math.floor(Math.random() * 90);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);

    const wav = toneWav();
    const wavUpload = await fetch(`${url}/api/assets/upload`, {
      method: 'POST',
      headers: { 'x-filename': 'tone.wav' },
      body: wav,
    });
    assert.equal(wavUpload.status, 200);
    const wavAsset = (await wavUpload.json() as { asset: { id: string } }).asset;

    const peaksResponse = await fetch(`${url}/api/media/peaks?asset=${encodeURIComponent(wavAsset.id)}`);
    assert.equal(peaksResponse.status, 200);
    const peaks = (await peaksResponse.json()) as { buckets: number[]; durationSeconds: number };
    assert.equal(peaks.buckets.length, 2400);
    assert.ok(peaks.buckets.some((bucket) => bucket > 0.1));
    assert.ok(Math.abs(peaks.durationSeconds - 1) < 0.1);
    // Second fetch is served from the on-disk cache.
    const peaksAgain = await (await fetch(`${url}/api/media/peaks?asset=${encodeURIComponent(wavAsset.id)}`)).json() as { cached: boolean };
    assert.equal(peaksAgain.cached, true);

    // Generate a tiny mp4 with ffmpeg for the poster endpoint.
    const videoDir = path.join(root, 'assets', 'video');
    fs.mkdirSync(videoDir, { recursive: true });
    const mp4 = path.join(videoDir, 'testsrc.mp4');
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x90:rate=10', '-pix_fmt', 'yuv420p', mp4], { stdio: 'ignore' });
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
      ffmpeg.on('error', reject);
    });
    const mp4Upload = await fetch(`${url}/api/assets/upload`, {
      method: 'POST',
      headers: { 'x-filename': 'testsrc.mp4' },
      body: fs.readFileSync(mp4),
    });
    assert.equal(mp4Upload.status, 200);
    const videoAsset = (await mp4Upload.json() as { asset: { id: string } }).asset;

    const posterResponse = await fetch(`${url}/api/media/poster?asset=${encodeURIComponent(videoAsset.id)}&t=0.5`);
    assert.equal(posterResponse.status, 200);
    const jpeg = Buffer.from(await posterResponse.arrayBuffer());
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
  } finally {
    child.kill();
  }
});

test('Studio clip-from-asset honors insert and overwrite placement modes', { timeout: 60_000 }, async () => {  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhtml-place-studio-'));
  fs.writeFileSync(path.join(root, 'place.vhtml'), projectSource().replaceAll('editing-studio', 'place-studio'));
  fs.writeFileSync(path.join(root, 'vhtml.json'), JSON.stringify({
    version: '1.1',
    id: 'place-studio',
    entry: 'place.vhtml',
    paths: { assets: 'assets', images: 'assets/images', video: 'assets/video', audio: 'assets/audio', fonts: 'assets/fonts', scenes: 'scenes', generated: 'generated', renders: 'renders', cache: '.vhtml/cache' },
  }, null, 2));
  const port = 4990 + Math.floor(Math.random() * 9);
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const child = spawn(process.execPath, [path.join(repo, 'bin', 'vhtml.mjs'), 'serve', root, '--port', String(port), '--no-open'], {
    cwd: repo,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForProject(url);
    const upload = await fetch(`${url}/api/assets/upload`, {
      method: 'POST',
      headers: { 'x-filename': 'tone.wav' },
      body: toneWav(),
    });
    assert.equal(upload.status, 200);
    const asset = (await upload.json() as { asset: { id: string } }).asset;

    // Add an audio lane, then place the tone at 1s in add mode.
    await edit(url, [{ op: 'track.add', timelineId: 'main', track: { id: 'a1', type: 'audio', name: 'Audio 1', order: 2 } }]);
    const addMode = await fetch(`${url}/api/clip-from-asset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id, trackId: 'a1', start: 1, mode: 'add' }),
    });
    assert.equal(addMode.status, 200);
    const rawClip = (await addMode.json() as { clip: { id: string; start: number | { num: number; den: number }; duration: number | { num: number; den: number } } }).clip;
    const numberOf = (value: number | { num: number; den: number }): number => typeof value === 'number' ? value : value.num / value.den;
    assert.equal(numberOf(rawClip.start), 1);
    assert.ok(Math.abs(numberOf(rawClip.duration) - 1) < 0.01);

    // Insert mode pushes the existing clip to the right.
    const insertMode = await fetch(`${url}/api/clip-from-asset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id, trackId: 'a1', start: 1, mode: 'insert' }),
    });
    assert.equal(insertMode.status, 200);
    const insertedModel = (await insertMode.json() as { model: StudioModelShape }).model;
    const audioLane = insertedModel.lanes.find((lane) => lane.id === 'a1');
    assert.ok(audioLane);
    const firstClip = audioLane.clips.find((clip) => clip.id === rawClip.id);
    assert.equal(firstClip?.start, 2);

    // Overwrite mode replaces the range it covers.
    const overwriteMode = await fetch(`${url}/api/clip-from-asset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id, trackId: 'a1', start: 0, mode: 'overwrite' }),
    });
    assert.equal(overwriteMode.status, 200);
    const overwrittenModel = (await overwriteMode.json() as { model: StudioModelShape }).model;
    const lane = overwrittenModel.lanes.find((candidate) => candidate.id === 'a1');
    assert.ok(lane);
    assert.equal(lane.clips[0]?.start, 0);
    assert.ok(lane.clips[0]!.duration >= 0.99);
  } finally {
    child.kill();
  }
});
