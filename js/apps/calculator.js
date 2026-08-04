/* ═══════════════════════════════════════════════════════════
   WINSTEM — Calculator
   A functional standard calculator.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function create(win, content) {
    content.innerHTML =
      '<div class="calc">' +
        '<div class="calc-display">' +
          '<div class="calc-expr" id="calc-expr"></div>' +
          '<div class="calc-result" id="calc-result">0</div>' +
        '</div>' +
        '<div class="calc-grid">' +
          '<button class="calc-key fn" data-k="AC">AC</button>' +
          '<button class="calc-key fn" data-k="DEL">DEL</button>' +
          '<button class="calc-key fn" data-k="%">%</button>' +
          '<button class="calc-key op" data-k="/">÷</button>' +
          '<button class="calc-key" data-k="7">7</button>' +
          '<button class="calc-key" data-k="8">8</button>' +
          '<button class="calc-key" data-k="9">9</button>' +
          '<button class="calc-key op" data-k="*">×</button>' +
          '<button class="calc-key" data-k="4">4</button>' +
          '<button class="calc-key" data-k="5">5</button>' +
          '<button class="calc-key" data-k="6">6</button>' +
          '<button class="calc-key op" data-k="-">−</button>' +
          '<button class="calc-key" data-k="1">1</button>' +
          '<button class="calc-key" data-k="2">2</button>' +
          '<button class="calc-key" data-k="3">3</button>' +
          '<button class="calc-key op" data-k="+">+</button>' +
          '<button class="calc-key zero" data-k="0">0</button>' +
          '<button class="calc-key" data-k=".">.</button>' +
          '<button class="calc-key eq" data-k="=">=</button>' +
        '</div>' +
      '</div>';

    const exprEl = content.querySelector("#calc-expr");
    const resultEl = content.querySelector("#calc-result");
    let expr = "";
    let result = "0";
    let justEvaluated = false;

    function render() {
      resultEl.textContent = result;
      exprEl.textContent = expr;
      resultEl.classList.toggle("calc-overflow", result.length > 12);
    }

    function safeEval(e) {
      /* evaluate only a constrained grammar — never eval() */
      try {
        const tokens = e.match(/(\d+\.?\d*|\.\d+|[+\-*/%])/g);
        if (!tokens || tokens.join("").replace(/\s/g, "") !== e.replace(/\s/g, "")) return null;
        const stack = [];
        const apply = function (a, b, op) {
          if (op === "+") return a + b;
          if (op === "-") return a - b;
          if (op === "*") return a * b;
          if (op === "/") return b === 0 ? null : a / b;
          if (op === "%") return b === 0 ? null : a % b;
          return null;
        };
        const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
        const values = [], ops = [];
        for (const t of tokens) {
          if (/^[+\-*/%]$/.test(t)) {
            while (ops.length && precedence[ops[ops.length - 1]] >= precedence[t]) {
              const b = values.pop(), a = values.pop(), op = ops.pop();
              const r = apply(a, b, op);
              if (r === null) return null;
              values.push(r);
            }
            ops.push(t);
          } else {
            values.push(parseFloat(t));
          }
        }
        while (ops.length) {
          const b = values.pop(), a = values.pop(), op = ops.pop();
          const r = apply(a, b, op);
          if (r === null) return null;
          values.push(r);
        }
        return values[0];
      } catch (e2) { return null; }
    }

    function evaluate() {
      if (!expr) return;
      const v = safeEval(expr);
      if (v === null || !isFinite(v)) {
        result = "Error";
      } else {
        result = String(Math.round(v * 1e10) / 1e10);
      }
      expr = "";
      justEvaluated = true;
      render();
    }

    content.querySelectorAll(".calc-key").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const k = btn.getAttribute("data-k");
        if (k === "AC") {
          expr = ""; result = "0"; justEvaluated = false;
        } else if (k === "DEL") {
          if (justEvaluated) { expr = ""; result = "0"; justEvaluated = false; }
          else expr = expr.slice(0, -1);
        } else if (k === "=") {
          evaluate();
        } else if (/^[+\-*/%]$/.test(k)) {
          if (justEvaluated) { expr = result; justEvaluated = false; }
          if (!expr && k === "-") expr = "-";
          else if (expr && !/[+\-*/%]$/.test(expr)) expr += k;
        } else {
          if (justEvaluated) { expr = ""; result = "0"; justEvaluated = false; }
          if (k === "." && /\.\d*$/.test(expr.split(/[+\-*/%]/).pop() || "")) return;
          if (expr.length > 40) return;
          expr += k;
        }
        render();
      });
    });

    /* keyboard support */
    win._keyboard = function (e) {
      const map = { "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", ".": ".", "+": "+", "-": "-", "*": "*", "/": "/", "%": "%", "Enter": "=", "=": "=", "Backspace": "DEL", "Escape": "AC" };
      if (map[e.key] !== undefined) {
        e.preventDefault();
        const k = map[e.key];
        const btn = content.querySelector('.calc-key[data-k="' + k + '"]');
        if (btn) btn.click();
      }
    };
    content.addEventListener("keydown", win._keyboard);
    win.onClose = function () {
      content.removeEventListener("keydown", win._keyboard);
    };
  }

  Winstem.Apps.register({
    id: "calculator",
    name: "Calculator",
    icon: "bi-calculator",
    description: "A standard calculator",
    category: "Utilities",
    tags: ["calculator", "math", "compute"],
    width: 340,
    height: 520,
    create: create
  });
})();
