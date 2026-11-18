<script type="module" src="js/app.js"></script>
<script
  src="js/harness-ai.js"
  defer
  data-app-id="app/healthcare/appts"
  data-folder="appts"
  data-parent="healthcare"
  data-app="Appts"
  data-position="bl"
  data-autohide
  data-role="supplementary"
  data-input="Use AI to add or organize visits and highlight clinically significant findings."
  data-ask="Ask it to add or organize visits in the signed-in account's document at `storage/data/<username>.json.php` (conditions, entries, types, and tags), or to highlight clinically significant findings with the `clinical-significance` skill (`.agents/skills/clinical-significance`). Reload to see the change."
  data-asks='[{"id":"print-contrast","title":"Make a high-contrast print copy","summary":"Uses Ghostscript at 300 dpi, converts to grayscale, darkens levels, cleans up specks, and thickens strokes, then saves a new “(print, black)” copy. The original is never changed.","ask":"Use the print-contrast-fix skill (`.agents/skills/print-contrast-fix/SKILL.md`) to make a high-contrast print copy of &lt;file&gt;."}]'
></script>
</body>
</html>
