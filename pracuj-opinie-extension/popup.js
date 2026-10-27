document.addEventListener("DOMContentLoaded", async () => {
  const currentYear = new Date().getFullYear();

  // Wypełnienie listy lat
  const yearSelect = document.getElementById("form-year");
  for (let i = 0; i < 5; i++) {
    const y = currentYear - i;
    const opt = document.createElement("option");
    opt.value = y;
    opt.innerText = y;
    yearSelect.appendChild(opt);
  }

  // Dane testowe
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

  // Pobranie nazwy firmy z aktywnej karty przeglądarki (URL lub Tytuł)
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      let employerName = "Pracodawca";

      // 1. Sprawdzenie URL /company/
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const companyIndex = pathSegments.indexOf('company');
      if (companyIndex !== -1 && pathSegments[companyIndex + 1]) {
        let urlSlug = pathSegments[companyIndex + 1];
        employerName = urlSlug.replace(/-/g, ' ');
      } else if (tabs[0].title) {
        // 2. Tytuł strony
        const parts = tabs[0].title.split(/[-–|]/).map(p => p.trim());
        employerName = parts.length >= 2 ? parts[1] : parts[0];
      }

      employerName = employerName.replace(/O firmie/gi, "").trim();
      if (employerName.length > 0) {
        employerName = employerName.charAt(0).toUpperCase() + employerName.slice(1);
      }
      
      document.getElementById("employer-name-label").innerText = employerName || "Pracodawca";
    }
  } catch (e) {
    document.getElementById("employer-name-label").innerText = "Pracodawca";
  }

  const listContainer = document.getElementById("opinie-list");
  const badge = document.getElementById("opinie-badge");

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

  // Obsługa formularza
  const addBtn = document.getElementById("opinie-add-btn");
  const formContainer = document.getElementById("opinie-form-container");
  const footer = document.getElementById("opinie-footer");
  const cancelBtn = document.getElementById("form-cancel-btn");
  const submitBtn = document.getElementById("form-submit-btn");

  const inputPos = document.getElementById("form-position");
  const inputTime = document.getElementById("form-time");
  const inputYear = document.getElementById("form-year");
  const inputOffered = document.getElementById("form-offered");
  const inputFeedback = document.getElementById("form-feedback");

  addBtn.addEventListener("click", () => {
    formContainer.style.display = "block";
    listContainer.style.display = "none";
    footer.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    resetForm();
    formContainer.style.display = "none";
    listContainer.style.display = "block";
    footer.style.display = "flex";
  });

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
  });

  function resetForm() {
    inputPos.value = "";
    inputTime.value = "";
    inputYear.value = "";
    inputOffered.value = "";
    inputFeedback.value = "";
    submitBtn.disabled = true;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  renderReviews();
});