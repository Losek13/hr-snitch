(function () {
  'use strict';

  try {
    // 1. Ignoruj stronę główną portalu
    if (location.hostname === "www.pracuj.pl" && (location.pathname === "/" || location.pathname === "")) {
      return;
    }

    // Funkcja pobierająca wyłącznie nazwę pracodawcy
    function getEmployerName() {
      let rawName = "";

      // A. Dedykowany atrybut na stronie oferty
      const elAttr = document.querySelector('[data-scroll-id="employer-name"]');
      if (elAttr && elAttr.innerText.trim()) {
        rawName = elAttr.innerText;
      }

      // B. Odczyt ze ścieżki URL (np. /company/nazwa-firmy/...)
      if (!rawName || rawName.trim().length <= 1) {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        const companyIndex = pathSegments.indexOf('company');
        if (companyIndex !== -1 && pathSegments[companyIndex + 1]) {
          let urlSlug = pathSegments[companyIndex + 1];
          rawName = urlSlug.replace(/-/g, ' ');
        }
      }

      // C. Odczyt z tytułu strony (druga część po myślniku, pomijając stanowisko)
      if (!rawName || rawName.trim().length <= 1) {
        const titleText = document.title;
        if (titleText) {
          const parts = titleText.split(/[-–|]/).map(p => p.trim());
          if (parts.length >= 2) {
            rawName = parts[1];
          } else if (parts.length === 1) {
            rawName = parts[0];
          }
        }
      }

      let cleaned = (rawName || "Pracodawca").replace(/O firmie/gi, "").trim();
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      
      return cleaned || "Pracodawca";
    }

    function init() {
      if (document.getElementById("pracuj-opinie-widget")) return;
      const employerName = getEmployerName();
      createWidgetUI(employerName);
    }

    function createWidgetUI(employerName) {
      if (document.getElementById("pracuj-opinie-widget")) return;

      const currentYear = new Date().getFullYear();

      let mockReviews = [
        {
          id: 1,
          position: "Frontend Developer",
          time: "2-4 tygodnie",
          year: currentYear,
          offered: "tak - zaakceptowałem",
          feedback: "Bardzo miła atmosfera, pytania głównie z doświadczenia i zadań praktycznych.",
          score: 3,
          userVote: null,
          hidden: false
        },
        {
          id: 2,
          position: "",
          time: "1-2 miesiące",
          year: currentYear - 1,
          offered: "Wolę nie odpowiadać",
          feedback: "Proces bardzo długi, 3 etapy rekrutacji. Na koniec otrzymałem jednak szczegółowy feedback.",
          score: -1,
          userVote: null,
          hidden: false
        }
      ];

      const widget = document.createElement("div");
      widget.id = "pracuj-opinie-widget";
      widget.className = "widget-expanded";

      // Nagłówek (tylko słowo Opinie i nazwa firmy)
      const header = document.createElement("div");
      header.className = "opinie-header";
      header.id = "opinie-toggle-header";

      const headerLeft = document.createElement("div");
      headerLeft.className = "opinie-header-left";
      const titleSpan = document.createElement("span");
      titleSpan.className = "opinie-title";
      titleSpan.innerHTML = `Opinie: <strong>${escapeHtml(employerName)}</strong>`;
      headerLeft.appendChild(titleSpan);

      const headerRight = document.createElement("div");
      headerRight.className = "opinie-header-right";

      const badge = document.createElement("span");
      badge.id = "opinie-badge";
      badge.className = "opinie-badge";
      badge.innerText = mockReviews.length;

      const minBtn = document.createElement("button");
      minBtn.id = "opinie-minimize-btn";
      minBtn.title = "Zwiń / Rozwiń";
      minBtn.innerText = "▾";

      headerRight.appendChild(badge);
      headerRight.appendChild(minBtn);
      header.appendChild(headerLeft);
      header.appendChild(headerRight);
      widget.appendChild(header);

      // Ciało widgetu
      const body = document.createElement("div");
      body.id = "opinie-body";
      body.className = "opinie-body";

      const listContainer = document.createElement("div");
      listContainer.id = "opinie-list";
      listContainer.className = "opinie-list";
      body.appendChild(listContainer);

      // Formularz
      const formContainer = document.createElement("div");
      formContainer.id = "opinie-form-container";
      formContainer.className = "opinie-form-container";
      formContainer.style.display = "none";

      formContainer.innerHTML = `
        <h4>Dodaj opinię o rekrutacji</h4>
        <label>Nazwa stanowiska (opcjonalnie):</label>
        <input type="text" id="form-position" class="form-input" placeholder="To pole może zostać puste" />

        <label>Czas rekrutacji: *</label>
        <select id="form-time" class="form-input">
          <option value="">-- Wybierz --</option>
          <option value="poniżej 1 tygodnia">poniżej 1 tygodnia</option>
          <option value="2-4 tygodnie">2-4 tygodnie</option>
          <option value="1-2 miesiące">1-2 miesiące</option>
          <option value="powyżej 2 miesięcy">powyżej 2 miesięcy</option>
        </select>

        <label>Rok rekrutacji: *</label>
        <select id="form-year" class="form-input">
          <option value="">-- Wybierz rok --</option>
          <option value="${currentYear}">${currentYear}</option>
          <option value="${currentYear-1}">${currentYear-1}</option>
          <option value="${currentYear-2}">${currentYear-2}</option>
          <option value="${currentYear-3}">${currentYear-3}</option>
          <option value="${currentYear-4}">${currentYear-4}</option>
        </select>

        <label>Czy zaoferowano pracę? *</label>
        <select id="form-offered" class="form-input">
          <option value="">-- Wybierz --</option>
          <option value="tak - zaakceptowałem">tak - zaakceptowałem</option>
          <option value="tak - odrzuciłem">tak - odrzuciłem</option>
          <option value="nie zaoferowano">nie zaoferowano</option>
          <option value="brak odpowiedzi">brak odpowiedzi</option>
          <option value="Wolę nie odpowiadać">Wolę nie odpowiadać</option>
        </select>

        <label>Jakie wrażenia: *</label>
        <textarea id="form-feedback" class="form-input" rows="3" placeholder="Opisz swoje wrażenia z rekrutacji..."></textarea>

        <div class="form-actions">
          <button id="form-cancel-btn" type="button">Anuluj</button>
          <button id="form-submit-btn" type="button" disabled>WYŚLIJ</button>
        </div>
      `;
      body.appendChild(formContainer);

      const footer = document.createElement("div");
      footer.id = "opinie-footer";
      footer.className = "opinie-footer";
      const addBtn = document.createElement("button");
      addBtn.id = "opinie-add-btn";
      addBtn.className = "opinie-add-btn";
      addBtn.title = "Dodaj opinię";
      addBtn.innerText = "Dodaj opinię +";
      footer.appendChild(addBtn);
      body.appendChild(footer);

      widget.appendChild(body);
      document.body.appendChild(widget);

      function renderReviews() {
        listContainer.innerHTML = "";
        badge.innerText = mockReviews.length;

        if (mockReviews.length === 0) {
          const empty = document.createElement("div");
          empty.className = "opinie-empty";
          empty.innerText = "Brak opinii dla tej firmy. Bądź pierwszy!";
          listContainer.appendChild(empty);
          return;
        }

        mockReviews.forEach((rev) => {
          if (rev.hidden) {
            const placeholder = document.createElement("div");
            placeholder.className = "opinie-item-hidden-bar";
            placeholder.title = "Kliknij, aby ponownie wyświetlić opinię";
            placeholder.addEventListener("click", () => {
              rev.hidden = false;
              renderReviews();
            });
            listContainer.appendChild(placeholder);
            return;
          }

          const item = document.createElement("div");
          item.className = "opinie-item";

          const posHtml = rev.position ? `<div class="opinie-item-pos">Stanowisko: <strong>${escapeHtml(rev.position)}</strong></div>` : "";
          const scoreFormatted = rev.score > 0 ? `+${rev.score}` : `${rev.score}`;
          const plusActiveClass = rev.userVote === 'plus' ? 'vote-active' : '';
          const minusActiveClass = rev.userVote === 'minus' ? 'vote-active' : '';

          item.innerHTML = `
            <div class="opinie-item-header">
              <div class="opinie-item-meta">
                <span class="meta-element">📅 <strong>${rev.year}</strong></span> 
                <span class="meta-element">⏱ <strong>${escapeHtml(rev.time)}</strong></span>
              </div>
              <div class="opinie-flag-container">
                <button class="opinie-flag-btn" title="Opcje opinii">🏳</button>
                <div class="opinie-flag-dropdown" style="display: none;">
                  <div class="flag-option flag-report">Zgłoś</div>
                  <div class="flag-option flag-hide">Ukryj dla mnie</div>
                </div>
              </div>
            </div>
            ${posHtml}
            <div class="opinie-item-status">Oferta: <strong>${escapeHtml(rev.offered)}</strong></div>
            <div class="opinie-item-text">${escapeHtml(rev.feedback)}</div>
            <div class="opinie-item-footer">
              <div class="opinie-score ${rev.score < 0 ? 'score-negative' : (rev.score > 0 ? 'score-positive' : '')}">
                Ocena: <span class="score-val">${scoreFormatted}</span>
              </div>
              <div class="opinie-vote-btns">
                <button class="btn-vote vote-plus ${plusActiveClass}" title="Głosuj na plus">+</button>
                <button class="btn-vote vote-minus ${minusActiveClass}" title="Głosuj na minus">-</button>
              </div>
            </div>
          `;

          const flagBtn = item.querySelector(".opinie-flag-btn");
          const dropdown = item.querySelector(".opinie-flag-dropdown");
          flagBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const disp = dropdown.style.display;
            document.querySelectorAll(".opinie-flag-dropdown").forEach(el => el.style.display = "none");
            dropdown.style.display = disp === "none" ? "block" : "none";
          });

          item.querySelector(".flag-report").addEventListener("click", () => {
            dropdown.style.display = "none";
            alert("Dziękujemy! Zgłoszenie zostało wysłane do weryfikacji.");
          });

          item.querySelector(".flag-hide").addEventListener("click", () => {
            dropdown.style.display = "none";
            rev.hidden = true;
            renderReviews();
          });

          item.querySelector(".vote-plus").addEventListener("click", () => {
            if (rev.userVote === 'plus') { rev.score -= 1; rev.userVote = null; }
            else if (rev.userVote === 'minus') { rev.score += 2; rev.userVote = 'plus'; }
            else { rev.score += 1; rev.userVote = 'plus'; }
            renderReviews();
          });

          item.querySelector(".vote-minus").addEventListener("click", () => {
            if (rev.userVote === 'minus') { rev.score += 1; rev.userVote = null; }
            else if (rev.userVote === 'plus') { rev.score -= 2; rev.userVote = 'minus'; }
            else { rev.score -= 1; rev.userVote = 'minus'; }
            renderReviews();
          });

          listContainer.appendChild(item);
        });
      }

      document.addEventListener("click", () => {
        document.querySelectorAll(".opinie-flag-dropdown").forEach(el => el.style.display = "none");
      });

      // Zwijanie / rozwijanie z podmianą eleganckiej strzałki
      header.addEventListener("click", () => {
        if (widget.classList.contains("widget-collapsed")) {
          widget.classList.remove("widget-collapsed");
          widget.classList.add("widget-expanded");
          minBtn.innerText = "▾";
        } else {
          widget.classList.remove("widget-expanded");
          widget.classList.add("widget-collapsed");
          minBtn.innerText = "▴";
        }
      });

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        formContainer.style.display = "block";
        listContainer.style.display = "none";
        footer.style.display = "none";
        widget.style.maxHeight = "620px"; // Powiększenie okna dla formularza
      });

      const cancelBtn = document.getElementById("form-cancel-btn");
      cancelBtn.addEventListener("click", () => {
        resetForm();
        formContainer.style.display = "none";
        listContainer.style.display = "block";
        footer.style.display = "flex";
        widget.style.maxHeight = "520px"; // Przywrócenie rozmiaru dla listy
      });

      const submitBtn = document.getElementById("form-submit-btn");
      const inputPos = document.getElementById("form-position");
      const inputTime = document.getElementById("form-time");
      const inputYear = document.getElementById("form-year");
      const inputOffered = document.getElementById("form-offered");
      const inputFeedback = document.getElementById("form-feedback");

      function validateForm() {
        const isValid = inputTime.value !== "" && inputYear.value !== "" && inputOffered.value !== "" && inputFeedback.value.trim() !== "";
        submitBtn.disabled = !isValid;
      }

      [inputTime, inputYear, inputOffered, inputFeedback].forEach(el => {
        el.addEventListener("input", validateForm);
        el.addEventListener("change", validateForm);
      });

      submitBtn.addEventListener("click", () => {
        if (submitBtn.disabled) return;
        const newReview = {
          id: Date.now(),
          position: inputPos.value.trim(),
          time: inputTime.value,
          year: parseInt(inputYear.value),
          offered: inputOffered.value,
          feedback: inputFeedback.value.trim(),
          score: 0,
          userVote: null,
          hidden: false
        };
        mockReviews.unshift(newReview);
        resetForm();
        renderReviews();
        formContainer.style.display = "none";
        listContainer.style.display = "block";
        footer.style.display = "flex";
        widget.style.maxHeight = "520px"; // Przywrócenie rozmiaru po wysłaniu
      });

      function resetForm() {
        inputPos.value = "";
        inputTime.value = "";
        inputYear.value = "";
        inputOffered.value = "";
        inputFeedback.value = "";
        submitBtn.disabled = true;
      }

      renderReviews();
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Obsługa przełączania stron SPA
    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const old = document.getElementById("pracuj-opinie-widget");
        if (old) old.remove();

        if (location.hostname === "www.pracuj.pl" && (location.pathname === "/" || location.pathname === "")) {
          return;
        }
        setTimeout(init, 500);
      }
    });

    observer.observe(document, { subtree: true, childList: true });
    setTimeout(init, 400);

  } catch (err) {
    console.error("Błąd we wtyczce Pracuj Opinie:", err);
  }
})();