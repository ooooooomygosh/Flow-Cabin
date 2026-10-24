import test from 'node:test';
import assert from 'node:assert/strict';
import { ankiHeaders, cleanAnkiField, defaultColumns, detectImportFormat, importRows, parseDelimited } from './import-parser.mjs';
import { previewWordImport } from './word-books.mjs';

test('CSV keeps quoted commas, doubled quotes and line breaks inside one field', () => {
  assert.deepEqual(parseDelimited('word,meaning\r\n"hello, world","说 ""你好""\n第二行"\nplain,值\n\n'), [['word', 'meaning'], ['hello, world', '说 "你好"\n第二行'], ['plain', '值']]);
  assert.deepEqual(parseDelimited('﻿a,b'), [['a', 'b']], 'a BOM from Excel is dropped');
  assert.deepEqual(parseDelimited('a,,c'), [['a', '', 'c']]);
  assert.deepEqual(parseDelimited(''), []);
});

test('the format is guessed from the name and the first line', () => {
  assert.equal(detectImportFormat('[{"front":"a","back":"b"}]', 'x.txt'), 'json');
  assert.equal(detectImportFormat('word,meaning', 'list.csv'), 'csv');
  assert.equal(detectImportFormat('word,meaning\nhi,你好', 'paste'), 'csv');
  assert.equal(detectImportFormat('word\tmeaning', 'list.txt'), 'tsv');
  assert.equal(detectImportFormat('#separator:tab\n#html:true\nfront\tback', 'Anki.txt'), 'anki');
  assert.equal(detectImportFormat('a, b', 'notes.txt'), 'tsv', 'a .txt file stays tab-separated unless Anki headers say otherwise');
});

test('Anki plain-text exports: headers, HTML fields, sounds and bookkeeping columns', () => {
  const file = '#separator:tab\n#html:true\n#guid column:1\n#notetype column:2\n#deck column:3\n#tags column:6\nAb12\tBasic\t英语\t<b>serene</b>[sound:serene.mp3]\tadj. 宁静的<br>平和的 &amp; 安详\tvocab\n';
  assert.deepEqual(ankiHeaders(file), { separator: '\t', html: true, columns: [], meta: [0, 1, 2, 5] });
  assert.deepEqual(defaultColumns(file, 'anki'), { frontColumn: 3, backColumn: 4 });
  const { rows } = importRows(file, 'anki');
  assert.deepEqual(rows[0].slice(3, 5), ['serene', 'adj. 宁静的 / 平和的 & 安详']);
  assert.equal(cleanAnkiField('<div>a</div><div>b&#x4E2D;&#25991;</div><img src="x.png">'), 'a / b中文');
  assert.deepEqual(ankiHeaders('#separator:Comma\nx').separator, ',');
  assert.deepEqual(defaultColumns('#columns:Front\tBack\tTags\n', 'anki'), { frontColumn: 0, backColumn: 1 });
  assert.deepEqual(defaultColumns('x', 'csv'), { frontColumn: 0, backColumn: 1 });
});

test('previews import CSV and Anki files with the usual duplicate and error rules', () => {
  const csv = previewWordImport('word,meaning,source\n"ripple","n. 涟漪, 波纹",自编\nRipple,重复\n,没有正面\n', { format: 'csv', header: true });
  assert.deepEqual(csv.cards, [{ front: 'ripple', back: 'n. 涟漪, 波纹', source: '自编' }]);
  assert.equal(csv.duplicates, 1); assert.equal(csv.errors, 1);
  const semi = previewWordImport('apple;苹果\npear;梨\n', { format: 'csv' });
  assert.deepEqual(semi.cards.map((card) => card.back), ['苹果', '梨'], 'semicolon CSV from European spreadsheets');
  const anki = previewWordImport('#separator:tab\n#html:true\nserene\t宁静的<br>平和的\nwindow\t窗户\n', { format: 'anki' }, [{ front: 'WINDOW' }]);
  assert.deepEqual(anki.cards, [{ front: 'serene', back: '宁静的 / 平和的' }]);
  assert.equal(anki.duplicates, 1, 'an existing card is not added twice');
  assert.equal(previewWordImport('a\tb', { format: 'tsv' }).cards.length, 1, 'TSV keeps working as before');
});
