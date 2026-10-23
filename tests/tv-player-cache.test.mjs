import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const wrapper = await readFile(new URL('../public/web/tv-player.html', import.meta.url), 'utf8');

test('TV reuses the versioned player document from browser cache', () => {
  assert.match(wrapper, /player\.html\?v=tv-wifi-20261023-7e19cff/);
  assert.match(wrapper, /cache:'force-cache'/);
  assert.match(wrapper, /aumente o token quando player\.html mudar/);
  assert.doesNotMatch(wrapper, /player\.html\?v=tv-wifi-20261021/);
});
