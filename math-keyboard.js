/*!
 * math-keyboard-field.js
 * -----------------------------------------------------------------------
 * רכיב עצמאי לשימוש חוזר: שדה קלט לכתיב מתמטי + סרגל כלים לחזקות, שברים,
 * שורשים וסוגריים. מבוסס על ספריית MathLive (בקוד פתוח, בלי מפתח/שרת),
 * שדואגת לכך שהביטוי ייראה כמו בספר לימוד אמיתי - שבר עם קו שבר אמיתי,
 * שורש עם קו עליון שמתארך לפי מה שמתחתיו, סוגריים שמתגבהים לפי התוכן וכו'.
 *
 * שימוש:
 *   <script src="math-keyboard.js"></script>
 *   <math-keyboard-field placeholder="הזן ביטוי"></math-keyboard-field>
 *
 *   const field = document.querySelector('math-keyboard-field');
 *   field.value                      // LaTeX, למשל "\\frac{1}{2}"
 *   field.getValue('ascii-math')      // ייצוג טקסטואלי, למשל "1/2"
 *   field.addEventListener('mkf-change', e => console.log(e.detail.latex));
 *
 * דרישת רשת: הרכיב טוען את MathLive מ-CDN (jsDelivr) בפעם הראשונה שהוא
 * נוצר בעמוד. נדרש חיבור אינטרנט לטעינה הראשונית.
 * -----------------------------------------------------------------------
 */
(function () {
  if (window.customElements && window.customElements.get('math-keyboard-field')) {
    return; // כבר נטען פעם אחת בעמוד - לא צריך להגדיר מחדש
  }

  // --- טעינת MathLive פעם אחת בלבד, גם אם יש כמה רכיבים בעמוד ---
  let mathLiveReady = null;
  function loadMathLive() {
    if (!mathLiveReady) {
      mathLiveReady = import('https://cdn.jsdelivr.net/npm/mathlive/+esm').catch((err) => {
        mathLiveReady = null; // מאפשר ניסיון חוזר אם הטעינה נכשלה
        throw err;
      });
    }
    return mathLiveReady;
  }

  // --- כפתורי סרגל הכלים: כל כפתור מכניס תבנית LaTeX עם "placeholder" ---
  // \placeholder{} יוצר "חור" מקווקו שהתלמיד יכול לעבור אליו עם Tab/חצים.
  // הערה: הרכיב מסתיר את המקלדת הווירטואלית המובנית של MathLive (ראו
  // mathVirtualKeyboardPolicy='manual' למטה), ולכן זהו מקור הקלט היחיד
  // לתלמיד במכשיר מגע ללא מקלדת פיזית - חובה לכלול ספרות, סימני פעולה
  // ואותיות משתנה נפוצות, לא רק סימנים מבניים (שברים/שורשים/וכו').
  const KEYBOARD_GROUPS = [
    {
      title: 'מספרים',
      className: 'mkf-group-numbers',
      buttons: [
        { label: '7', title: '7', insert: '7' },
        { label: '8', title: '8', insert: '8' },
        { label: '9', title: '9', insert: '9' },
        { label: '4', title: '4', insert: '4' },
        { label: '5', title: '5', insert: '5' },
        { label: '6', title: '6', insert: '6' },
        { label: '1', title: '1', insert: '1' },
        { label: '2', title: '2', insert: '2' },
        { label: '3', title: '3', insert: '3' },
        { label: '0', title: '0', insert: '0', wide: true },
      ]
    },
    {
      title: 'פעולות',
      className: 'mkf-group-operations',
      buttons: [
        { label: '+', title: 'פלוס', insert: '+' },
        { label: '−', title: 'מינוס', insert: '-' },
        { label: '×', title: 'כפול', insert: '\\times ' },
        { label: '÷', title: 'חלקי', insert: '\\div ' },
        { label: '=', title: 'שווה', insert: '=' },
        { label: 'a/b', title: 'שבר', insert: '\\frac{\\placeholder{}}{\\placeholder{}}' },
        { label: 'xⁿ', title: 'חזקה (כל מעריך)', insert: '^{\\placeholder{}}' },
        { label: 'xₙ', title: 'אינדקס תחתון', insert: '_{\\placeholder{}}' },
        { label: '√', title: 'שורש ריבועי', insert: '\\sqrt{\\placeholder{}}' },
        { label: 'ⁿ√', title: 'שורש מסדר n', insert: '\\sqrt[\\placeholder{}]{\\placeholder{}}' },
        { label: '( )', title: 'סוגריים', insert: '(\\placeholder{})' },
        { label: '|x|', title: 'ערך מוחלט', insert: '\\left|\\placeholder{}\\right|' },
        { label: '±', title: 'פלוס-מינוס', insert: '\\pm' },
        { label: 'π', title: 'פאי', insert: '\\pi' },
      ]
    },
    {
      title: 'אותיות',
      className: 'mkf-group-letters',
      buttons: [
        { label: 'x', title: 'איקס', insert: 'x' },
        { label: 'y', title: 'וואי', insert: 'y' },
        { label: 'a', title: 'איי', insert: 'a' },
        { label: 'b', title: 'בי', insert: 'b' },
      ]
    },
    {
      title: 'עריכה וניווט',
      className: 'mkf-group-edit',
      buttons: [
        { label: '◂', title: 'סמן שמאלה', command: 'moveToPreviousChar' },
        { label: '▸', title: 'סמן ימינה', command: 'moveToNextChar' },
        { label: '⌫', title: 'מחיקה', command: 'deleteBackward' },
        { label: 'נקה', title: 'ניקוי השדה', clear: true },
      ]
    }
  ];

  const STYLE = `
    :host {
      display: inline-block;
      width: 100%;
      --mkf-border: #d1d5db;
      --mkf-border-focus: #2563eb;
      --mkf-bg: #ffffff;
      --mkf-radius: 14px;
      --mkf-btn-bg: #f8fafc;
      --mkf-btn-bg-hover: #eef2f7;
      --mkf-btn-bg-active: #dbeafe;
      --mkf-btn-fg: #1f2a3d;
      --mkf-gap: 10px;
      font-family: 'Heebo', system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    }
    .mkf-wrap {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
    }
    .mkf-field-box {
      direction: ltr;
      unicode-bidi: isolate;
      border: 2px solid var(--mkf-border);
      border-radius: var(--mkf-radius);
      background: var(--mkf-bg);
      padding: 10px 14px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .mkf-field-box.mkf-focused {
      border-color: var(--mkf-border-focus);
      box-shadow: 0 0 0 3px rgba(37,99,235,.08);
    }
    math-field {
      display: block;
      width: 100%;
      min-height: 2.4em;
      font-size: 1.28rem;
      border: none;
      --caret-color: var(--mkf-border-focus, #2563eb);
    }
    math-field::part(virtual-keyboard-toggle) {
      display: none; /* אנחנו מציגים סרגל משלנו במקום המקלדת המובנית */
    }
    .mkf-toolbar {
      display: grid;
      grid-template-columns: minmax(210px, .92fr) minmax(0, 1.35fr);
      grid-template-areas:
        'numbers operations'
        'letters edit';
      gap: 12px;
      align-items: stretch;
      direction: ltr;
    }
    .mkf-group {
      border: 1px solid #dbe3ee;
      border-radius: 14px;
      background: #f8fafc;
      padding: 12px;
      box-shadow: 0 2px 8px rgba(27,58,107,.05);
      min-width: 0;
    }
    .mkf-group-numbers { grid-area: numbers; }
    .mkf-group-operations { grid-area: operations; }
    .mkf-group-letters { grid-area: letters; }
    .mkf-group-edit { grid-area: edit; }
    .mkf-group-title {
      font-size: .82rem;
      font-weight: 800;
      color: #5b6b82;
      margin-bottom: 10px;
      text-align: right;
      direction: rtl;
    }
    .mkf-group-buttons {
      display: grid;
      gap: 8px;
      direction: ltr;
    }
    .mkf-group-numbers .mkf-group-buttons {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .mkf-group-operations .mkf-group-buttons {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .mkf-group-letters .mkf-group-buttons,
    .mkf-group-edit .mkf-group-buttons {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .mkf-btn {
      min-width: 0;
      height: 46px;
      padding: 0 10px;
      border: 1px solid var(--mkf-border);
      border-radius: 10px;
      background: var(--mkf-btn-bg);
      color: var(--mkf-btn-fg);
      font-size: 1.04rem;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      direction: ltr;
      unicode-bidi: isolate;
      user-select: none;
      touch-action: manipulation;
      transition: background .15s ease, border-color .15s ease, transform .08s ease;
    }
    .mkf-btn.wide {
      grid-column: span 2;
    }
    .mkf-group-numbers .mkf-btn.wide {
      grid-column: span 3;
    }
    .mkf-btn.compact {
      letter-spacing: -0.02em;
      font-size: 1rem;
      padding-inline: 0;
    }
    @media (max-width: 760px) {
      .mkf-toolbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          'numbers operations'
          'letters edit';
        gap: 10px;
      }
      .mkf-group {
        padding: 10px;
      }
      .mkf-btn {
        height: 44px;
      }
    }
    @media (max-width: 560px) {
      .mkf-toolbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          'numbers operations'
          'letters edit';
        gap: 10px;
      }
      .mkf-group {
        padding: 9px;
      }
      .mkf-group-title {
        margin-bottom: 8px;
        font-size: .78rem;
      }
      .mkf-btn {
        height: 40px;
        font-size: .96rem;
        padding: 0 6px;
      }
      .mkf-btn.compact {
        font-size: .94rem;
      }
    }
    @media (max-width: 380px) {
      .mkf-toolbar {
        grid-template-columns: 1fr;
        grid-template-areas:
          'numbers'
          'operations'
          'letters'
          'edit';
      }
      .mkf-group-operations .mkf-group-buttons,
      .mkf-group-numbers .mkf-group-buttons,
      .mkf-group-letters .mkf-group-buttons,
      .mkf-group-edit .mkf-group-buttons {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .mkf-btn.wide,
      .mkf-group-numbers .mkf-btn.wide {
        grid-column: span 3;
      }
      .mkf-btn {
        height: 42px;
        font-size: .98rem;
      }
    }
    .mkf-btn:hover {
      background: var(--mkf-btn-bg-hover);
      border-color: #bfd0e6;
    }
    .mkf-btn:active {
      background: var(--mkf-btn-bg-active);
      transform: scale(.98);
    }
    .mkf-btn:focus-visible {
      outline: 2px solid var(--mkf-border-focus);
      outline-offset: 1px;
    }
  `;

  class MathKeyboardField extends HTMLElement {
    static get observedAttributes() {
      return ['placeholder', 'readonly', 'value'];
    }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._built = false;
      this._pendingValue = null;
    }

    connectedCallback() {
      if (!this._built) {
        this._built = true;
        this._build();
      }
    }

    async _build() {
      const style = document.createElement('style');
      style.textContent = STYLE;

      const wrap = document.createElement('div');
      wrap.className = 'mkf-wrap';

      const fieldBox = document.createElement('div');
      fieldBox.className = 'mkf-field-box';

      const field = document.createElement('math-field');
      field.setAttribute('dir', 'ltr');
      fieldBox.appendChild(field);

      const toolbar = document.createElement('div');
      toolbar.className = 'mkf-toolbar';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'סרגל כתיב מתמטי');

      KEYBOARD_GROUPS.forEach((groupDef) => {
        const group = document.createElement('section');
        group.className = `mkf-group ${groupDef.className || ''}`.trim();

        const title = document.createElement('div');
        title.className = 'mkf-group-title';
        title.textContent = groupDef.title;
        group.appendChild(title);

        const buttons = document.createElement('div');
        buttons.className = 'mkf-group-buttons';

        groupDef.buttons.forEach((def) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'mkf-btn' + (def.wide ? ' wide' : '') + (def.compact ? ' compact' : '');
          btn.textContent = def.label;
          btn.title = def.title;
          btn.setAttribute('aria-label', def.title);
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            this._handleToolbarAction(def);
          });
          buttons.appendChild(btn);
        });

        group.appendChild(buttons);
        toolbar.appendChild(group);
      });

      wrap.appendChild(fieldBox);
      wrap.appendChild(toolbar);
      this._root.replaceChildren(style, wrap);

      this._field = field;
      this._fieldBox = fieldBox;

      // תמיכה בתוכן ראשוני: תכונת value, אחרת טקסט פנימי של התג
      const initialValue =
        this._pendingValue != null
          ? this._pendingValue
          : this.getAttribute('value') != null
          ? this.getAttribute('value')
          : this.textContent.trim();

      try {
        await loadMathLive();
      } catch (err) {
        fieldBox.textContent =
          'לא ניתן לטעון את ספריית הכתיב המתמטי (MathLive). יש לבדוק חיבור לאינטרנט.';
        console.error('math-keyboard-field: failed to load MathLive', err);
        return;
      }

      // הגדרות עריכה: סוגריים/מוחלט חכמים שמתגבהים לפי התוכן,
      // ויציאה אוטומטית מחזקה כשמקלידים ספרה אחרי מספר.
      field.smartFence = true;
      field.smartSuperscript = true;
      field.removeExtraneousParentheses = true;
      field.mathVirtualKeyboardPolicy = 'manual'; // מבטל את המקלדת המובנית של MathLive

      if (initialValue) field.value = initialValue;
      if (this.hasAttribute('placeholder')) {
        field.setAttribute('placeholder', '\\text{' + this.getAttribute('placeholder') + '}');
      }
      if (this.hasAttribute('readonly')) {
        field.readOnly = true;
      }

      field.addEventListener('focusin', () => fieldBox.classList.add('mkf-focused'));
      field.addEventListener('focusout', () => fieldBox.classList.remove('mkf-focused'));

      const forward = (type) => (ev) => {
        this.dispatchEvent(
          new CustomEvent('mkf-' + type, {
            bubbles: true,
            composed: true,
            detail: { latex: field.value },
          })
        );
      };
      field.addEventListener('input', forward('input'));
      field.addEventListener('change', forward('change'));

      this.dispatchEvent(new CustomEvent('mkf-ready', { bubbles: true, composed: true }));
    }

    _handleToolbarAction(def) {
      if (!this._field) return;
      this._field.focus();
      if (def.clear) {
        this._field.value = '';
      } else if (def.command) {
        this._field.executeCommand(def.command);
      } else if (def.insert) {
        this._field.insert(def.insert, { selectionMode: 'placeholder' });
      }
      // ה-input/change של MathLive מטופלים כבר דרך המאזינים שהוגדרו למעלה
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._field) {
        if (name === 'value') this._pendingValue = newVal;
        return;
      }
      if (name === 'value' && newVal != null && newVal !== this._field.value) {
        this._field.value = newVal;
      } else if (name === 'placeholder' && newVal != null) {
        this._field.setAttribute('placeholder', '\\text{' + newVal + '}');
      } else if (name === 'readonly') {
        this._field.readOnly = this.hasAttribute('readonly');
      }
    }

    /** LaTeX הנוכחי בשדה */
    get value() {
      return this._field ? this._field.value : this._pendingValue || '';
    }
    set value(v) {
      if (this._field) this._field.value = v;
      else this._pendingValue = v;
    }

    /** ייצוג בפורמט אחר, למשל getValue('ascii-math') */
    getValue(format) {
      return this._field ? this._field.getValue(format) : '';
    }

    focus() {
      if (this._field) this._field.focus();
    }

    /** מחזיר true אם השדה ריק */
    isEmpty() {
      return !this.value || this.value.trim() === '';
    }
  }

  customElements.define('math-keyboard-field', MathKeyboardField);
})();
