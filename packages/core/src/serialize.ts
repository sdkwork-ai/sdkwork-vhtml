/**
 * Canonical VHTML serialiser.
 *
 * Parsing + serialising is designed to be behaviour preserving and
 * round-trip stable. HTML content subtrees are emitted verbatim; timeline
 * semantics are emitted in exact rational time.
 */

import {
  type Animation,
  type Asset,
  type BibleProfile,
  type Clip,
  type Effect,
  type GenerationTask,
  type Marker,
  type OutputConfig,
  type StoryboardShot,
  type Project,
  type Scene,
  type Timeline,
  type Track,
  type Transition,
  type VhtmlDocument,
} from './model.ts';
import { add, formatRate, formatTime, rat, type Rational } from './time.ts';

export const PROGRAM_SCRIPT_TYPE = 'application/vnd.vhtml.program+javascript';

export interface SerializeOptions {
  /** Include the HTML document shell (default true). */
  document?: boolean;
  /** Indentation unit (default two spaces). */
  indent?: string;
  /** Emit runtime-managed output defaults that were synthesised by the parser. */
  emitDefaults?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(name: string, value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null || value === false) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapeHtml(String(value))}"`;
}

function attrs(pairs: Array<[string, string | number | boolean | undefined | null]>): string {
  return pairs.map(([name, value]) => attr(name, value)).join('');
}

function number(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}

function rationalNumber(value: Rational): string {
  let den = value.den;
  let twos = 0;
  let fives = 0;
  while (den % 2 === 0) { den /= 2; twos += 1; }
  while (den % 5 === 0) { den /= 5; fives += 1; }
  if (den === 1) {
    const digits = Math.max(twos, fives);
    if (digits <= 9) {
      const scale = 10 ** digits;
      const scaled = value.num * (scale / value.den);
      if (Number.isSafeInteger(scaled)) return number(scaled / scale, digits);
    }
  }
  return `${value.num}/${value.den}`;
}

function styleDeclarations(style: Record<string, string> | undefined): string | undefined {
  if (!style) return undefined;
  const entries = Object.entries(style);
  if (!entries.length) return undefined;
  return entries.map(([name, value]) => `${name}:${value}`).join(';');
}

function paramAttrs(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(([name, value]) => attr(name, typeof value === 'number' ? number(value) : value))
    .join('');
}

class Serializer {
  private readonly lines: string[] = [];
  private readonly indentUnit: string;
  private level = 0;

  constructor(indent = '  ') {
    this.indentUnit = indent;
  }

  private line(text = ''): void {
    this.lines.push(this.indentUnit.repeat(this.level) + text);
  }

  /** Emit a verbatim block; only the first line receives structural indentation. */
  private raw(text: string): void {
    const parts = text.split('\n');
    if (!parts.length) return;
    this.lines.push(this.indentUnit.repeat(this.level) + parts[0]);
    for (let index = 1; index < parts.length; index += 1) this.lines.push(parts[index]!);
  }

  private open(text: string): void {
    this.line(text);
    this.level += 1;
  }

  private close(text: string): void {
    this.level = Math.max(0, this.level - 1);
    this.line(text);
  }

  serializeDocument(document: VhtmlDocument, options: SerializeOptions = {}): string {
    const project = document.project;
    const indent = options.indent ?? '  ';
    const withShell = options.document ?? true;
    if (!withShell) return this.serializeProject(project, options);
    const writer = new Serializer(indent);
    writer.line('<!doctype html>');
    writer.line(`<html lang="${escapeHtml(project.lang ?? 'en')}">`);
    writer.level += 1;
    writer.line('<head>');
    writer.level += 1;
    writer.line('<meta charset="utf-8" />');
    writer.line(`<meta name="viewport" content="width=device-width, initial-scale=1" />`);
    writer.line(`<title>${escapeHtml(project.title ?? project.id)}</title>`);
    for (const href of project.stylesheets ?? []) {
      writer.line(`<link rel="stylesheet" href="${escapeHtml(href)}" />`);
    }
    for (const css of project.styles) {
      writer.line('<style>');
      writer.level += 1;
      writer.raw(css);
      writer.level -= 1;
      writer.line('</style>');
    }
    writer.level -= 1;
    writer.line('</head>');
    writer.line('<body>');
    writer.level += 1;
    writer.line('<vhtml version="1.1">');
    writer.level += 1;
    writer.line(`<project${this.projectAttrs(project)}>`);
    writer.level += 1;
    writer.writeProjectBody(project, options);
    writer.level -= 1;
    writer.line('</project>');
    writer.level -= 1;
    writer.line('</vhtml>');
    if (document.program?.code.trim()) {
      const program = document.program;
      const paramJson = program.params && Object.keys(program.params).length ? JSON.stringify(program.params) : undefined;
      const code = program.code.replace(/<\/(script)/gi, '<\\/$1');
      writer.line(
        `<script type="${PROGRAM_SCRIPT_TYPE}"${attrs([
          ['seed', program.seed],
          ['params', paramJson],
        ])}>`,
      );
      for (const codeLine of code.split('\n')) writer.raw(codeLine);
      writer.line('</script>');
    }
    for (const block of document.dataBlocks ?? []) {
      if (block.src) {
        writer.line(`<data${attrs([['id', block.id], ['type', block.mimeType !== 'application/json' ? block.mimeType : undefined], ['src', block.src]])}></data>`);
        continue;
      }
      const value = typeof block.value === 'string' ? block.value : JSON.stringify(block.value, null, 2);
      writer.line(`<data${attrs([['id', block.id], ['type', block.mimeType]])}>${escapeHtml(value)}</data>`);
    }
    for (const script of project.scripts ?? []) {
      for (const scriptLine of script.split('\n')) writer.line(scriptLine);
    }
    writer.level -= 1;
    writer.line('</body>');
    writer.level -= 1;
    writer.line('</html>');
    return writer.lines.join('\n') + '\n';
  }

  serializeProject(project: Project, options: SerializeOptions = {}): string {
    const writer = new Serializer(options.indent ?? '  ');
    writer.line(`<project${this.projectAttrs(project)}>`);
    writer.level += 1;
    writer.writeProjectBody(project, options);
    writer.level -= 1;
    writer.line('</project>');
    return writer.lines.join('\n') + '\n';
  }

  private projectAttrs(project: Project): string {
    return attrs([
      ['id', project.id],
      ['version', project.version],
      ['title', project.title],
      ['description', project.description],
      ['lang', project.lang],
      ['main-timeline', project.mainTimeline],
    ]);
  }

  private writeProjectBody(project: Project, options: SerializeOptions): void {
    this.line('<settings>');
    this.level += 1;
    this.line(
      `<composition${attrs([
        ['width', project.composition.width],
        ['height', project.composition.height],
        ['frame-rate', formatRate(project.composition.frameRate)],
        ['duration', formatTime(project.composition.duration)],
        ['sample-rate', project.composition.sampleRate],
        ['channels', project.composition.channels],
        ['background', project.composition.background],
        ['color-space', project.composition.colorSpace],
        ['seed', project.composition.seed],
        ['device-scale-factor', project.composition.deviceScaleFactor !== 1 ? number(project.composition.deviceScaleFactor) : undefined],
      ])}></composition>`,
    );
    this.level -= 1;
    this.line('</settings>');

    if (project.assets.length) {
      this.open('<assets>');
      for (const asset of project.assets) this.writeAsset(asset);
      this.close('</assets>');
    }

    if (project.scenes.length) {
      this.open('<scenes>');
      for (const scene of project.scenes) this.writeScene(scene);
      this.close('</scenes>');
    }

    if (project.generations.length) {
      this.open('<generations>');
      for (const task of project.generations) this.writeGeneration(task);
      this.close('</generations>');
    }

    if (project.bibles?.length) {
      this.open('<characters>');
      for (const bible of project.bibles) this.writeBible(bible);
      this.close('</characters>');
    }

    if (project.storyboard?.length) {
      this.open('<storyboard>');
      project.storyboard.forEach((shot, index) => this.writeStoryboardShot(shot, index));
      this.close('</storyboard>');
    }

    if (project.timelines.length) {
      this.open('<timelines>');
      for (const timeline of project.timelines) this.writeTimeline(timeline);
      this.close('</timelines>');
    }

    if (project.animations.length) {
      this.open('<animations>');
      for (const animation of project.animations) this.writeAnimation(animation, true);
      this.close('</animations>');
    }

    if (project.outputs.length) {
      this.open('<outputs>');
      for (const output of project.outputs) this.writeOutput(output);
      this.close('</outputs>');
    }

    if (Object.keys(project.metadata).length) {
      const meta = Object.entries(project.metadata)
        .map(([name, value]) => attr(name, value))
        .join('');
      this.line(`<metadata${meta}></metadata>`);
    }
    if (project.requirements?.length) {
      this.open('<requirements>');
      for (const feature of project.requirements) this.line(`<requires${attrs([['feature', feature]])}></requires>`);
      this.close('</requirements>');
    }
    if (project.extensions) {
      for (const [name, declaration] of Object.entries(project.extensions)) {
        const params = declaration.params
          ? Object.entries(declaration.params)
            .map(([paramName, value]) => attr(paramName, String(value)))
            .join('')
          : '';
        this.line(
          `<extension${attrs([
            ['name', name],
            ['version', declaration.version],
            ['required', declaration.required ? true : undefined],
            ['kind', declaration.kind],
            ['base', declaration.base],
          ])}>${params ? `<params${params}></params>` : ''}</extension>`,
        );
      }
    }
  }

  /** Serialize a character or style bible (RFC-0014). */
  private writeBible(bible: BibleProfile): void {
    const tag = bible.kind === 'character' ? 'character' : 'style-guide';
    this.open(
      `<${tag}${attrs([
        ['id', bible.id],
        ['version', bible.version],
        ['name', bible.name],
      ])}>`,
    );
    if (bible.description) this.line(`<description>${escapeHtml(bible.description)}</description>`);
    if (bible.negative) this.line(`<negative>${escapeHtml(bible.negative)}</negative>`);
    for (const reference of bible.references) {
      this.line(`<reference${attrs([['ref', reference.ref], ['role', reference.role]])}></reference>`);
    }
    this.close(`</${tag}>`);
  }

  private writeAsset(asset: Asset): void {
    const provenance = asset.provenance;
    this.open(
      `<asset${attrs([
        ['id', asset.id],
        ['type', asset.kind],
        ['src', asset.src],
        ['mime-type', asset.mimeType],
        ['duration', asset.duration ? formatTime(asset.duration) : undefined],
        ['width', asset.width],
        ['height', asset.height],
        ['sample-rate', asset.sampleRate],
        ['channels', asset.channels],
        ['hash', asset.hash],
        ['size', asset.size],
        ['alt', asset.alt],
        ['loop', asset.loop ? true : undefined],
        ['generated-by', asset.generatedBy],
        ['provider', provenance?.provider],
        ['model', provenance?.model],
        ['seed', provenance?.seed],
        ['prompt-hash', provenance?.promptHash],
        ['created-at', provenance?.createdAt],
      ])}>`,
    );
    if (asset.license) {
      this.line(
        `<license${attrs([
          ['name', asset.license.name],
          ['url', asset.license.url],
          ['attribution', asset.license.attribution],
          ['commercial-use', asset.license.commercialUse === undefined ? undefined : asset.license.commercialUse],
        ])}></license>`,
      );
    }
    this.close('</asset>');
  }

  private writeScene(scene: Scene): void {
    this.open(
      `<scene${attrs([
        ['id', scene.id],
        ['name', scene.name],
        ['src', scene.src],
        ['duration', scene.duration ? formatTime(scene.duration) : undefined],
        ['width', scene.width],
        ['height', scene.height],
        ['background', scene.background],
      ])}>`,
    );
    if (!scene.src) {
      if (scene.css) {
        this.line('<style>');
        this.level += 1;
        this.raw(scene.css);
        this.level -= 1;
        this.line('</style>');
      }
      if (scene.html) {
        this.raw(scene.html);
      }
      for (const script of scene.scripts ?? []) {
        this.raw(script);
      }
    }
    this.close('</scene>');
  }

  private writeGeneration(task: GenerationTask): void {
    const constraintEntries: Array<[string, string | number | boolean | undefined]> = [
      ['duration', task.constraints.duration ? formatTime(task.constraints.duration) : undefined],
      ['width', task.constraints.width],
      ['height', task.constraints.height],
      ['aspect-ratio', task.constraints.aspectRatio],
      ['frame-rate', task.constraints.frameRate ? formatRate(task.constraints.frameRate) : undefined],
      ['sample-rate', task.constraints.sampleRate],
      ['channels', task.constraints.channels],
      ['language', task.constraints.language],
      ['seed', task.constraints.seed],
    ];
    for (const [name, value] of Object.entries(task.constraints)) {
      if (['duration', 'width', 'height', 'aspectRatio', 'frameRate', 'sampleRate', 'channels', 'language', 'seed'].includes(name)) continue;
      if (value === undefined) continue;
      constraintEntries.push([name, typeof value === 'number' ? number(value) : String(value)]);
    }
    this.open(
      `<generate${attrs([
        ['id', task.id],
        ['kind', task.kind],
        ['provider', task.provider],
        ['model', task.model],
        ['provider-job-id', task.providerJobId],
      ])}>`,
    );
    this.line(`<prompt>${escapeHtml(task.prompt)}</prompt>`);
    if (task.negativePrompt) this.line(`<negative-prompt>${escapeHtml(task.negativePrompt)}</negative-prompt>`);
    for (const input of task.inputs) {
      this.line(`<gen-input${attrs([['ref', input.ref], ['role', input.role]])}></gen-input>`);
    }
    if (constraintEntries.length) this.line(`<constraints${attrs(constraintEntries)}></constraints>`);
    if (Object.keys(task.params).length) this.line(`<params${paramAttrs(task.params)}></params>`);
    if (task.direction && Object.keys(task.direction).length) {
      this.line(`<direction>${escapeHtml(JSON.stringify(task.direction))}</direction>`);
    }
    if (task.review) {
      this.line(`<review${attrs([
        ['status', task.review.status],
        ['reviewer', task.review.reviewer],
        ['reviewed-at', task.review.reviewedAt],
      ])}>${task.review.notes ? escapeHtml(task.review.notes) : ''}</review>`);
    }
    if (task.rights) {
      this.line(`<rights${attrs([
        ['license', task.rights.license],
        ['consent', task.rights.consent],
        ['likeness', task.rights.likeness],
        ['voice-cloning', task.rights.voiceCloning],
        ['commercial-use', task.rights.commercialUse],
        ['ai-disclosure', task.rights.aiDisclosure],
      ])}></rights>`);
    }
    if (task.safety) {
      this.line(`<safety${attrs([
        ['rating', task.safety.rating],
        ['policy', task.safety.policy],
        ['moderated', task.safety.moderated],
      ])}>${task.safety.notes ? escapeHtml(task.safety.notes) : ''}</safety>`);
    }
    for (const output of task.outputs) {
      this.line(
        `<gen-output${attrs([
          ['id', output.id],
          ['path', output.path],
          ['mime-type', output.mimeType],
          ['role', output.role],
        ])}></gen-output>`,
      );
    }
    if (task.usage) {
      const usage = task.usage;
      const extras = Object.entries(usage)
        .filter(([key, value]) => !['cost', 'currency', 'tokens', 'credits', 'computeSeconds', 'outputBytes', 'recordedAt'].includes(key) && typeof value !== 'object')
        .map(([key, value]) => attr(key, String(value)));
      this.line(
        `<usage${attrs([
          ['cost', usage.cost],
          ['currency', usage.currency],
          ['tokens', usage.tokens],
          ['credits', usage.credits],
          ['compute-seconds', usage.computeSeconds],
          ['output-bytes', usage.outputBytes],
          ['recorded-at', usage.recordedAt],
        ])}${extras.join('')}></usage>`,
      );
    }
    this.close('</generate>');
  }

  private writeStoryboardShot(shot: StoryboardShot, index: number): void {
    this.open(
      `<shot${attrs([
        ['id', shot.id],
        ['order', index + 1],
        ['title', shot.title],
        ['scene', shot.scene],
        ['generation', shot.generation],
        ['asset', shot.asset],
        ['duration', shot.duration ? formatTime(shot.duration) : undefined],
        ['status', shot.status],
        ['tags', shot.tags?.length ? shot.tags.join(',') : undefined],
      ])}>`,
    );
    if (shot.description) this.line(`<description>${escapeHtml(shot.description)}</description>`);
    if (shot.prompt) this.line(`<prompt>${escapeHtml(shot.prompt)}</prompt>`);
    if (shot.direction && Object.keys(shot.direction).length) {
      this.line(`<direction>${escapeHtml(JSON.stringify(shot.direction))}</direction>`);
    }
    if (shot.notes) this.line(`<notes>${escapeHtml(shot.notes)}</notes>`);
    this.close('</shot>');
  }

  private writeTimeline(timeline: Timeline): void {
    this.open(
      `<timeline${attrs([
        ['id', timeline.id],
        ['name', timeline.name],
        ['duration', formatTime(timeline.duration)],
      ])}>`,
    );
    for (const track of timeline.tracks) this.writeTrack(timeline, track);
    for (const marker of timeline.markers) this.writeMarker(marker);
    this.close('</timeline>');
  }

  private writeTrack(timeline: Timeline, track: Track): void {
    this.open(
      `<lane${attrs([
        ['id', track.id],
        ['type', track.type],
        ['name', track.name],
        ['order', track.order],
        ['enabled', track.enabled ? undefined : false],
        ['muted', track.muted ? true : undefined],
        ['solo', track.solo ? true : undefined],
        ['locked', track.locked ? true : undefined],
        ['volume', track.volume !== 1 ? number(track.volume) : undefined],
        ['pan', track.pan !== 0 ? number(track.pan) : undefined],
        ['opacity', track.opacity !== 1 ? number(track.opacity) : undefined],
        ['blend', track.blend !== 'normal' ? track.blend : undefined],
        ['caption-style', track.captionStyle],
      ])}>`,
    );
    for (const clip of track.clips) this.writeClip(clip);
    for (const transition of track.transitions) this.writeTransition(transition);
    this.close('</lane>');
  }

  private writeClip(clip: Clip): void {
    const common: Array<[string, string | number | boolean | undefined]> = [
      ['id', clip.id],
      ['kind', clip.kind === 'caption' ? undefined : clip.kind],
      ['ref', clip.ref],
      ['name', clip.name],
      ['class', clip.className],
      ['start', formatTime(clip.start)],
      ['duration', formatTime(clip.duration)],
      ['in', clip.sourceIn.num !== 0 ? formatTime(clip.sourceIn) : undefined],
      ['out', clip.sourceOut ? formatTime(clip.sourceOut) : undefined],
      ['speed', clip.speed.num !== clip.speed.den ? rationalNumber({ num: clip.speed.num, den: clip.speed.den }) : undefined],
      ['reverse', clip.reverse ? true : undefined],
      ['freeze', clip.freeze ? formatTime(clip.freeze) : undefined],
      ['enabled', clip.enabled ? undefined : false],
      ['z-index', clip.z !== 0 ? clip.z : undefined],
      ['opacity', clip.opacity !== 1 ? number(clip.opacity) : undefined],
      ['blend', clip.blend !== 'normal' ? clip.blend : undefined],
      ['fit', clip.fit !== 'cover' ? clip.fit : undefined],
      ['volume', clip.volume !== 1 ? number(clip.volume) : undefined],
      ['pan', clip.pan !== 0 ? number(clip.pan) : undefined],
      ['fade-in', clip.fadeIn ? formatTime(clip.fadeIn) : undefined],
      ['fade-out', clip.fadeOut ? formatTime(clip.fadeOut) : undefined],
      ['audio-offset', clip.audioOffset && (clip.audioOffset.num !== 0) ? formatTime(clip.audioOffset) : undefined],
    ];
    if (clip.kind === 'scene') {
      common.push(['loop', clip.loop ? true : undefined]);
    }
    if (clip.kind === 'timeline') {
      common.push(['loop', clip.loop ? true : undefined]);
    }
    if (clip.kind === 'caption') {
      common.push(
        ['speaker', clip.speaker],
        ['text', clip.text],
        ['style', styleDeclarations(clip.style)],
      );
    }
    if (clip.kind === 'data') {
      common.push(['value', clip.value]);
    }
    if (clip.kind === 'video' || clip.kind === 'audio') {
      common.push(['muted', clip.muted ? true : undefined]);
    }
    const tag = clip.kind === 'caption' ? 'cue' : 'clip';
    this.open(`<${tag}${attrs(common)}>`);
    this.writeTransform(clip);
    if (clip.timeRemap?.keyframes.length) {
      this.open(
        `<timeremap${attrs([['easing', clip.timeRemap.easing !== 'linear' ? clip.timeRemap.easing : undefined]])}>`,
      );
      for (const keyframe of clip.timeRemap.keyframes) {
        this.line(
          `<remap${attrs([
            ['at', formatTime(keyframe.at)],
            ['source', formatTime(keyframe.source)],
            ['easing', keyframe.easing],
          ])}></remap>`,
        );
      }
      this.close('</timeremap>');
    }
    if (clip.crop) {
      this.line(
        `<crop${attrs([
          ['left', `${number(clip.crop.left * 100, 3)}%`],
          ['right', `${number(clip.crop.right * 100, 3)}%`],
          ['top', `${number(clip.crop.top * 100, 3)}%`],
          ['bottom', `${number(clip.crop.bottom * 100, 3)}%`],
        ])}></crop>`,
      );
    }
    for (const effect of clip.effects) this.writeEffect(effect, 'effect');
    for (const effect of clip.audioEffects) this.writeEffect(effect, 'audio-effect');
    for (const animation of clip.animations) this.writeAnimation(animation, false);
    this.close(`</${tag}>`);
  }

  private writeTransform(clip: Clip): void {
    const t = clip.transform;
    const changed =
      t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotate !== 0 ||
      t.anchorX !== 0.5 || t.anchorY !== 0.5 || t.perspective !== undefined;
    if (!changed) return;
    this.line(
      `<transform${attrs([
        ['x', t.x !== 0 ? number(t.x) : undefined],
        ['y', t.y !== 0 ? number(t.y) : undefined],
        ['scale-x', t.scaleX !== 1 ? number(t.scaleX) : undefined],
        ['scale-y', t.scaleY !== 1 ? number(t.scaleY) : undefined],
        ['rotate', t.rotate !== 0 ? `${number(t.rotate)}deg` : undefined],
        ['anchor-x', t.anchorX !== 0.5 ? `${number(t.anchorX * 100, 3)}%` : undefined],
        ['anchor-y', t.anchorY !== 0.5 ? `${number(t.anchorY * 100, 3)}%` : undefined],
        ['perspective', t.perspective !== undefined ? number(t.perspective) : undefined],
      ])}></transform>`,
    );
  }

  private writeEffect(effect: Effect, tag: 'effect' | 'audio-effect'): void {
    this.line(
      `<${tag}${attrs([
        ['id', effect.id],
        ['type', effect.type],
        ['enabled', effect.enabled ? undefined : false],
      ])}${paramAttrs(effect.params)}></${tag}>`,
    );
  }

  private writeAnimation(animation: Animation, projectLevel: boolean): void {
    const targetAttrs: Array<[string, string | number | boolean | undefined]> = [];
    if (projectLevel) {
      if (animation.clipId) targetAttrs.push(['clip', animation.clipId]);
      if (animation.selector) targetAttrs.push(['target', animation.selector]);
    } else if (animation.selector) {
      targetAttrs.push(['target', animation.selector]);
    }
    this.open(
      `<animate${attrs([
        ['id', animation.id],
        ...targetAttrs,
        ['property', animation.property],
        ['start', formatTime(animation.start)],
        ['duration', formatTime(animation.duration)],
        ['time-base', animation.timeBase],
        ['easing', animation.easing],
        ['iterations', animation.iterations === 'infinite' ? 'infinite' : animation.iterations !== 1 ? number(animation.iterations) : undefined],
        ['direction', animation.direction !== 'normal' ? animation.direction : undefined],
        ['fill', animation.fill !== 'both' ? animation.fill : undefined],
        ['compose', animation.compose !== 'replace' ? animation.compose : undefined],
        ['enabled', animation.enabled ? undefined : false],
      ])}>`,
    );
    for (const keyframe of animation.keyframes) {
      this.line(
        `<keyframe${attrs([
          ['at', formatTime(keyframe.time)],
          ['value', keyframe.value],
          ['easing', keyframe.easing],
        ])}></keyframe>`,
      );
    }
    this.close('</animate>');
  }

  private writeTransition(transition: Transition): void {
    this.line(
      `<transition${attrs([
        ['id', transition.id],
        ['from', transition.fromClipId],
        ['to', transition.toClipId],
        ['type', transition.type],
        ['duration', formatTime(transition.duration)],
        ['easing', transition.easing !== 'ease-in-out' ? transition.easing : undefined],
        ['direction', transition.direction !== 'left' ? transition.direction : undefined],
        ['color', transition.color !== '#000000' ? transition.color : undefined],
      ])}${paramAttrs(transition.params)}></transition>`,
    );
  }

  private writeMarker(marker: Marker): void {
    this.line(
      `<marker${attrs([
        ['id', marker.id],
        ['at', formatTime(marker.time)],
        ['name', marker.name],
        ['type', marker.type !== 'marker' ? marker.type : undefined],
        ['color', marker.color],
      ])}></marker>`,
    );
  }

  private writeOutput(output: OutputConfig): void {
    this.line(
      `<output${attrs([
        ['id', output.id],
        ['format', output.format],
        ['timeline', output.timeline],
        ['width', output.width],
        ['height', output.height],
        ['frame-rate', formatRate(output.frameRate)],
        ['fit', output.fit],
        ['start', output.rangeStart ? formatTime(output.rangeStart) : undefined],
        ['duration', output.rangeDuration ? formatTime(output.rangeDuration) : undefined],
        ['video-codec', output.videoCodec],
        ['audio-codec', output.audioCodec],
        ['video-bitrate', output.videoBitrate],
        ['crf', output.crf],
        ['preset', output.preset],
        ['audio-bitrate', output.audioBitrate],
        ['sample-rate', output.sampleRate],
        ['channels', output.channels],
        ['pixel-format', output.pixelFormat !== 'yuv420p' ? output.pixelFormat : undefined],
        ['burn-captions', output.burnCaptions ? true : undefined],
        ['captions-path', output.captionsPath],
        ['path', output.path],
      ])}></output>`,
    );
  }
}

export function serializeDocument(document: VhtmlDocument, options: SerializeOptions = {}): string {
  return new Serializer(options.indent).serializeDocument(document, options);
}

export function serializeProject(project: Project, options: SerializeOptions = {}): string {
  return new Serializer(options.indent).serializeProject(project, options);
}

/** Count frames for a serialised project range; useful for CLI summaries. */
export function outputEnd(output: OutputConfig, timeline: Timeline): Rational {
  return output.rangeDuration
    ? add(output.rangeStart ?? rat(0), output.rangeDuration)
    : timeline.duration;
}
