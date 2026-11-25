import { strToU8, zipSync } from 'fflate';

import type { ActivityRow } from './activity-export';
import type { useLanguage } from './language';

type Copy = ReturnType<typeof useLanguage>['t'];
const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const mimePrefix = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
export const xlsxMimeType = `${mimePrefix}sheet`;

function xml(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
}

export function activityWorkbook(rows: ActivityRow[], t: Copy, title: string) {
  const counts = (kind: ActivityRow['kind']) => {
    const selected = rows.filter((row) => row.kind === kind);
    return `${selected.filter((row) => row.status !== 'exportPending').length} / ${selected.length}`;
  };
  const headings = [t.exportDate, t.exportMove, t.exportGroup, t.exportLoad, t.exportTarget, t.planRest, t.exportStatus, t.exportActual, t.workoutNotes];
  const summary = `${t.exportGroupFormal} ${counts('strength')}  ·  ${t.exportGroupWarmup} ${counts('warmup')}  ·  ${t.runTitle} ${counts('run')}`;
  const cells = [[title], [summary], headings, ...rows.map((row) => [
    row.day, row.name, row.group, row.load, row.target, row.rest, t[row.status], row.actual, row.notes,
  ])];
  const sheetData = cells.map((row, index) => `<row r="${index + 1}"${index < 3 ? ` ht="${index === 0 ? 30 : 24}" customHeight="1"` : ''}>${row.map((value, col) =>
    `<c r="${String.fromCharCode(65 + col)}${index + 1}" s="${index < 3 ? index + 1 : index % 2 ? 0 : 4}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  ).join('')}</row>`).join('');
  const cols = [15, 24, 15, 15, 18, 15, 15, 29, 34].map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${mimePrefix}sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${mimePrefix}worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${mimePrefix}styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<Relationships xmlns="${packageRels}"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<workbook xmlns="${spreadsheet}" xmlns:r="${relationships}"><sheets><sheet name="${xml(t.exportDetails)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="${packageRels}"><Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relationships}/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<styleSheet xmlns="${spreadsheet}">
      <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
      <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
        ${['FF152A1C', 'FF345343', 'FFF1F6EF'].map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}
      </fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="5">${[[0,0],[1,2],[0,4],[2,3],[0,4]].map(([font,fill]) =>
        `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${spreadsheet}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols>${cols}</cols><sheetData>${sheetData}</sheetData><autoFilter ref="A3:I${cells.length}"/><mergeCells count="2"><mergeCell ref="A1:I1"/><mergeCell ref="A2:I2"/></mergeCells></worksheet>`),
  });
}
