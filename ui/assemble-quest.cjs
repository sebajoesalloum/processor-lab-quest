/* Assemble the editable Quest interface around the complete original lab.
   Requires only Node.js standard libraries; no network or package installation. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const generated = path.join(root, '.quest-build');
const interfaceSource = fs.readFileSync(path.join(__dirname, 'quest-interface.html'), 'utf8');
const legacy = fs.readFileSync(path.join(generated, 'legacy-content.html'), 'utf8');
const marker = '<!-- LEGACY_CONTENT -->';
if (interfaceSource.split(marker).length !== 2) {
  throw new Error('The editable interface must contain exactly one legacy content marker');
}
const fragment = interfaceSource.replace(marker, () => legacy);
const video = fs.readFileSync(path.join(generated, 'original-intro-base64.txt'), 'utf8');
const offlineFragment = fragment.replace(
  /(<script id="intro-video-b64" type="text\/plain">)[\s\S]*?(<\/script>)/,
  (_, open, close) => open + video + close
);
// Optional browser-local notebook persistence. Corrupt or unavailable browser
// storage must never prevent opening or using the simulator.
const fallback = `<script>
(function(){
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('processor-quest-state') || 'null'); } catch(e) {}
  window.openai = {
    widgetState: saved,
    setWidgetState: function(state) {
      this.widgetState = state;
      try { localStorage.setItem('processor-quest-state', JSON.stringify(state)); } catch(e) {}
      return Promise.resolve();
    }
  };
})();
</script>`;
const standalone = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Processor Lab Quest</title><style>:root{color-scheme:light dark}body{margin:0;background:light-dark(#eeeaf4,#11101b);padding:20px;font-family:Segoe UI,Arial,sans-serif}#processor-quest{max-width:1280px;margin:0 auto}button,summary,select{cursor:pointer}button:disabled{cursor:default}@media(max-width:600px){body{padding:0}#processor-quest .pq-app{border-radius:0;border:0}}@media print{body{padding:0}}</style></head><body>'
  + fallback + offlineFragment + '</body></html>';
fs.writeFileSync(path.join(root, 'processor-lab.html'), standalone);
console.log('Built processor-lab.html with the Quest interface and complete original lab (' + Buffer.byteLength(standalone).toLocaleString() + ' bytes).');
