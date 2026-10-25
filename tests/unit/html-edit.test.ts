import test from 'node:test';
import assert from 'node:assert/strict';
import { patchHtmlElement } from '../../packages/studio/src/html-edit.ts';

test('patches a leaf element without disturbing style/script siblings', () => {
  const html = '<style>.a{color:red}</style><div class="hero"><p class="a">Hi</p><img src="x.png" alt="x"></div><script>console.log(1)</script>';
  const next = patchHtmlElement(html, [0, 0], {
    attributes: { class: 'b', id: 'title' },
    style: 'color: blue',
    text: 'Hello',
  });
  assert.match(next, /<p class="b" id="title" style="color: blue">Hello<\/p>/);
  assert.ok(next.startsWith('<style>'));
  assert.ok(next.endsWith('</script>'));
});

test('removes an attribute and preserves the others', () => {
  const next = patchHtmlElement('<div><img src="x.png" alt="x" /></div>', [0, 0], {
    attributes: { src: 'y.png', alt: null },
  });
  assert.match(next, /<img src="y.png">/);
  assert.doesNotMatch(next, /alt=/);
});

test('content paths ignore style and script elements', () => {
  const html = '<style>p{}</style><section><p>one</p><script>x()</script><p>two</p></section>';
  const next = patchHtmlElement(html, [0, 1], { text: 'two!' });
  assert.match(next, /<p>one<\/p>/);
  assert.match(next, /<p>two!<\/p>/);
});

test('rejects text replacement on a container', () => {
  assert.throws(
    () => patchHtmlElement('<div><span>child</span></div>', [0], { text: 'nope' }),
    /container with child elements/,
  );
});

test('replaces inner HTML on a container', () => {
  const next = patchHtmlElement('<div class="hero"><span>old</span></div>', [0], {
    innerHTML: '<h1>New</h1><p>Body</p>',
  });
  assert.match(next, /<h1>New<\/h1><p>Body<\/p>/);
  assert.doesNotMatch(next, /old/);
});

test('rejects invalid paths and attribute names', () => {
  assert.throws(() => patchHtmlElement('<div></div>', [3], { text: 'x' }), /does not exist/);
  assert.throws(() => patchHtmlElement('<div></div>', [0], { attributes: { 'bad name': 'x' } }), /invalid attribute/);
  assert.throws(() => patchHtmlElement('<div></div>', [], { text: 'x' }), /Scene child element/);
});
